# -*- coding: utf-8 -*-
"""VOLT PC — Intégration des paiements Stripe (Checkout + Webhooks).

Module volontairement isolé du reste de l'API pour rester modulaire. Il expose
un APIRouter monté par main.py.  Trois routes :

    POST /api/create-checkout-session   crée la commande + la session Stripe
    POST /api/webhook                   reçoit et VÉRIFIE les événements Stripe
    GET  /api/checkout/status           filet de sécurité pour le dev local

Variables d'environnement attendues (fichier backend/.env, voir .env.example) :
    STRIPE_SECRET_KEY       clé secrète serveur        (sk_test_… / sk_live_…)
    STRIPE_WEBHOOK_SECRET   secret de signature webhook (whsec_…)
    PUBLIC_BASE_URL         URL publique du site (déf. http://127.0.0.1:8000)

⚠️  Aucune clé n'est jamais codée en dur : tout passe par os.environ.
"""
from __future__ import annotations

import logging
import os
import sqlite3
import time

from fastapi import APIRouter, Depends, HTTPException, Request

# Le SDK Stripe est optionnel : l'application doit pouvoir démarrer même s'il
# n'est pas installé (les routes renverront alors une 503 explicite).
try:
    import stripe
except ImportError:  # pragma: no cover
    stripe = None

# Import des outils partagés. Sûr car main.py n'importe ce module qu'en toute
# fin de fichier, une fois ces symboles définis (cf. commentaire dans main.py).
from main import (
    OrderIn,
    compute_order,
    create_pending_order,
    current_user,
    db,
    finalize_order_paid,
)

log = logging.getLogger("voltpc.payments")
router = APIRouter(prefix="/api", tags=["paiement"])

CURRENCY = "eur"


# ─── Helpers de configuration ────────────────────────────────────────

def _stripe():
    """Renvoie le SDK Stripe configuré, ou lève une 503 claire si indisponible."""
    if stripe is None:
        raise HTTPException(503, "Module 'stripe' absent — exécutez : pip install stripe")
    key = os.environ.get("STRIPE_SECRET_KEY")
    if not key:
        raise HTTPException(503, "STRIPE_SECRET_KEY manquante — paiement indisponible")
    stripe.api_key = key
    return stripe


def _base_url() -> str:
    return os.environ.get("PUBLIC_BASE_URL", "http://127.0.0.1:8000").rstrip("/")


def _field(obj, key):
    """Lecture sûre d'un champ d'objet Stripe.

    Le SDK Stripe v15 expose des objets qui N'ONT PAS de méthode .get() :
    on lit donc par indexation obj["clé"] et on renvoie None si absent.
    """
    try:
        return obj[key]
    except (KeyError, TypeError):
        return None


def _checkout_line_items(computed: dict) -> list[dict]:
    """Construit les lignes Stripe avec la remise deja integree aux prix.

    Cela evite un appel API Stripe supplementaire pour creer un coupon a chaque
    paiement avec code promo, tout en conservant un total identique au calcul
    serveur.
    """
    lines = computed["lines"]
    discount_cents = int(round((computed.get("discount") or 0) * 100))
    subtotal_cents = sum(int(round(p["price"] * 100)) * qty for p, qty in lines)
    out: list[dict] = []
    remaining_discount = min(discount_cents, subtotal_cents)

    for idx, (p, qty) in enumerate(lines):
        unit_cents = int(round(p["price"] * 100))
        gross_cents = unit_cents * qty
        if remaining_discount > 0 and subtotal_cents > 0:
            if idx == len(lines) - 1:
                line_discount = remaining_discount
            else:
                line_discount = round(discount_cents * gross_cents / subtotal_cents)
                line_discount = min(line_discount, remaining_discount, gross_cents)
            remaining_discount -= line_discount
        else:
            line_discount = 0

        discounted_total = max(0, gross_cents - line_discount)
        base_unit = max(1, discounted_total // qty)
        extra_units = max(0, discounted_total - (base_unit * qty))
        name = p["name"] + (" (remise incluse)" if discount_cents else "")

        def add_item(amount: int, quantity: int) -> None:
            if quantity <= 0:
                return
            out.append({
                "price_data": {
                    "currency": CURRENCY,
                    "product_data": {"name": name},
                    "unit_amount": amount,
                },
                "quantity": quantity,
            })

        add_item(base_unit, qty - extra_units)
        add_item(base_unit + 1, extra_units)

    return out


# ─── 1. Création de la session de paiement ───────────────────────────

@router.post("/create-checkout-session")
def create_checkout_session(body: OrderIn, user: sqlite3.Row = Depends(current_user)):
    """Reçoit le panier, VÉRIFIE les prix en base, crée la commande (en attente)
    puis la session Stripe Checkout. Renvoie l'URL de redirection sécurisée.
    """
    sk = _stripe()
    try:
        # (a) Validation + calcul des montants côté serveur, et création de la
        #     commande « en attente de paiement » (aucun stock décrémenté).
        with db() as conn:
            computed = compute_order(conn, body.items, body.promo_code)
            order_id = create_pending_order(conn, user, body, computed)
            if body.save_address:
                has_any = conn.execute(
                    "SELECT 1 FROM addresses WHERE user_id = ? LIMIT 1",
                    (user["id"],),
                ).fetchone()
                conn.execute(
                    "INSERT INTO addresses (user_id, label, ship_name, ship_address,"
                    " ship_city, ship_zip, is_default, created_at) VALUES (?,?,?,?,?,?,?,?)",
                    (
                        user["id"], "Livraison", body.ship_name, body.ship_address,
                        body.ship_city, body.ship_zip, 0 if has_any else 1, time.time(),
                    ),
                )

        # (b) Lignes Stripe construites à partir des PRIX VÉRIFIÉS EN BASE,
        #     jamais à partir de valeurs envoyées par le client.
        line_items = _checkout_line_items(computed)

        params = dict(
            mode="payment",
            line_items=line_items,
            customer_email=user["email"],
            client_reference_id=str(order_id),
            # metadata = lien commande ↔ session, relu tel quel dans le webhook.
            metadata={"order_id": str(order_id), "user_id": str(user["id"])},
            success_url=f"{_base_url()}/#/commande/succes?session_id={{CHECKOUT_SESSION_ID}}",
            cancel_url=f"{_base_url()}/#/commande/annulee?order_id={order_id}",
        )

        # Moyens de paiement : par défaut, on laisse Stripe afficher ceux ACTIVÉS
        # dans le Dashboard (carte + Apple/Google Pay automatiques ; PayPal s'il
        # est activé). Imposer une liste en dur faisait échouer la session quand
        # un moyen (ex. PayPal) n'était pas activé en mode live. Pour forcer une
        # liste précise : variable STRIPE_PAYMENT_METHODS="card,paypal".
        methods = os.environ.get("STRIPE_PAYMENT_METHODS", "").strip()
        if methods:
            params["payment_method_types"] = [m.strip() for m in methods.split(",") if m.strip()]

        # Frais de port (montant fixe) côté Stripe.
        if computed["shipping"] > 0:
            params["shipping_options"] = [
                {
                    "shipping_rate_data": {
                        "type": "fixed_amount",
                        "fixed_amount": {
                            "amount": int(round(computed["shipping"] * 100)),
                            "currency": CURRENCY,
                        },
                        "display_name": "Livraison",
                    }
                }
            ]

        session = sk.checkout.Session.create(**params)

        # (c) On relie la session Stripe à la commande pour le suivi.
        with db() as conn:
            conn.execute(
                "UPDATE orders SET stripe_session_id = ? WHERE id = ?",
                (session.id, order_id),
            )

        log.info(
            "Session Checkout %s créée — commande %s — total %.2f €",
            session.id, order_id, computed["total"],
        )
        return {"url": session.url, "order_id": order_id}

    except HTTPException:
        raise  # erreurs métier déjà formatées (stock, promo, config…)
    except Exception as exc:  # erreurs réseau / API Stripe inattendues
        # Cas fréquent et actionnable : clé Stripe invalide ou expirée. On le
        # signale clairement dans les logs (sans noyer le gérant sous une trace).
        if exc.__class__.__name__ == "AuthenticationError":
            log.error(
                "Stripe : clé API invalide ou expirée — mettez à jour"
                " STRIPE_SECRET_KEY (Dashboard Stripe ▸ Développeurs ▸ Clés API). %s",
                exc,
            )
        else:
            log.exception("Échec de la création de la session Checkout")
        raise HTTPException(502, "Impossible d'initialiser le paiement, réessayez plus tard.")


# ─── 2. Webhook Stripe (source de vérité du paiement) ────────────────

@router.post("/webhook")
async def stripe_webhook(request: Request):
    """Reçoit les événements Stripe. La SIGNATURE est obligatoirement vérifiée :
    sans elle, n'importe qui pourrait simuler un « paiement réussi ».
    """
    sk = _stripe()
    secret = os.environ.get("STRIPE_WEBHOOK_SECRET")
    if not secret:
        log.error("STRIPE_WEBHOOK_SECRET manquante — webhook rejeté")
        raise HTTPException(503, "Webhook non configuré")

    # Le CORPS BRUT (bytes non parsés) est indispensable à la vérification de
    # signature : ne jamais utiliser request.json() ici.
    payload = await request.body()
    sig_header = request.headers.get("stripe-signature", "")

    try:
        event = sk.Webhook.construct_event(payload, sig_header, secret)
    except ValueError:
        log.warning("Webhook : corps illisible")
        raise HTTPException(400, "Payload invalide")
    except sk.error.SignatureVerificationError:
        log.warning("Webhook : SIGNATURE INVALIDE — requête rejetée")
        raise HTTPException(400, "Signature invalide")

    # On ne traite que l'événement utile à la logique post-paiement.
    if event["type"] == "checkout.session.completed":
        session = event["data"]["object"]
        session_id = _field(session, "id")
        if _field(session, "payment_status") == "paid":
            meta = _field(session, "metadata")
            order_id = (_field(meta, "order_id") if meta else None) \
                or _field(session, "client_reference_id")
            if order_id:
                # → marque « payée » + décrémente le stock (idempotent).
                finalize_order_paid(int(order_id), session_id)
            else:
                log.error("Webhook : order_id absent de la session %s", session_id)
    else:
        log.info("Webhook : événement « %s » ignoré", event["type"])

    # Toujours répondre 200 rapidement : Stripe cesse alors ses relances.
    return {"received": True}


# ─── 3. Filet de sécurité pour le développement local ────────────────

@router.get("/checkout/status")
def checkout_status(session_id: str):
    """Consulté par la page de succès. En production le webhook fait foi ; en
    local (sans tunnel Stripe), cette route finalise la commande en secours.
    """
    sk = _stripe()
    try:
        session = sk.checkout.Session.retrieve(session_id)
    except Exception:
        raise HTTPException(404, "Session introuvable")

    meta = _field(session, "metadata")
    order_id = (_field(meta, "order_id") if meta else None) \
        or _field(session, "client_reference_id")
    payment_status = _field(session, "payment_status")

    # Filet de sécurité idempotent : si payé mais webhook non reçu, on finalise.
    if payment_status == "paid" and order_id:
        finalize_order_paid(int(order_id), session_id)

    return {
        "order_id": int(order_id) if order_id else None,
        "payment_status": payment_status,
        "amount_total": (_field(session, "amount_total") or 0) / 100,
    }
