# -*- coding: utf-8 -*-
"""VOLT PC — Envoi d'emails transactionnels (confirmation de commande) via SMTP.

Module isolé, sans dépendance externe (smtplib de la stdlib).

Configuration par variables d'environnement (backend/.env) :
    SMTP_HOST       ex. smtp.gmail.com
    SMTP_PORT       ex. 587  (STARTTLS)
    SMTP_USER       login SMTP / adresse d'envoi
    SMTP_PASSWORD   mot de passe d'application (JAMAIS le mot de passe du compte)
    MAIL_FROM       expéditeur affiché (déf. = SMTP_USER)
    SHOP_NAME       nom affiché de la boutique (déf. « VOLT PC »)

⚠️  Robustesse : si la config est absente ou si l'envoi échoue, on journalise et
on renvoie False — JAMAIS d'exception remontée à l'appelant. Un email raté ne
doit pas empêcher une commande payée d'être finalisée.
"""
from __future__ import annotations

import base64
import json
import logging
import os
import re
import smtplib
import ssl
import urllib.error
import urllib.request
from email.message import EmailMessage

log = logging.getLogger("voltpc.mailer")


def smtp_configured() -> bool:
    """Vrai si l'envoi d'emails est opérationnel (Brevo API OU SMTP renseigné).

    Sert au repli « mode dev » : tant qu'aucun transport n'est configuré, les
    codes de vérification / réinitialisation ne peuvent pas partir par email, et
    l'API les renvoie alors directement pour permettre les tests en local.
    """
    return _config() is not None


def _config():
    """Réglages d'envoi + transports disponibles, ou None si aucun n'est prêt.

    Deux transports possibles, essayés dans cet ordre par `_deliver` :
      • Brevo (API HTTP)  → `BREVO_API_KEY` (recommandé sur Render : SMTP bloqué)
      • SMTP classique    → `SMTP_HOST` + `SMTP_USER` + `SMTP_PASSWORD`
    L'expéditeur (`MAIL_FROM`, sinon `SMTP_USER`) doit être renseigné dans tous
    les cas — et vérifié côté Brevo.
    """
    smtp_host = os.environ.get("SMTP_HOST")
    smtp_user = os.environ.get("SMTP_USER")
    smtp_pwd = os.environ.get("SMTP_PASSWORD")
    brevo_key = os.environ.get("BREVO_API_KEY")
    sender = os.environ.get("MAIL_FROM") or smtp_user

    has_smtp = bool(smtp_host and smtp_user and smtp_pwd)
    has_brevo = bool(brevo_key and sender)
    if not (has_smtp or has_brevo):
        return None
    return {
        "from": sender,
        "shop": os.environ.get("SHOP_NAME", "VOLT PC"),
        "brevo_key": brevo_key if has_brevo else None,
        "smtp": {
            "host": smtp_host,
            "port": int(os.environ.get("SMTP_PORT", "587")),
            "user": smtp_user,
            "password": smtp_pwd,
        } if has_smtp else None,
    }


def _eur(n: float) -> str:
    return f"{n:.2f} €".replace(".", ",")


def _build_message(cfg: dict, order: dict, items: list[dict]) -> EmailMessage:
    shop = cfg["shop"]
    oid = order["id"]

    lignes_txt = "\n".join(
        f"  - {i['quantity']} × {i['product_name']} : {_eur(i['unit_price'] * i['quantity'])}"
        for i in items
    )
    lignes_html = "".join(
        f"<tr><td style='padding:6px 0'>{i['quantity']} × {i['product_name']}</td>"
        f"<td style='padding:6px 0;text-align:right'>{_eur(i['unit_price'] * i['quantity'])}</td></tr>"
        for i in items
    )

    remise_txt = f"\nRemise ({order['promo_code']}) : -{_eur(order['discount'])}" if order.get("discount") else ""
    port_txt = _eur(order["shipping"]) if order.get("shipping") else "Offerte"

    texte = f"""Bonjour {order['customer_name']},

Merci pour votre commande chez {shop} ! Votre paiement a bien été reçu.

──────────────────────────────────────────
Commande n°{oid}
──────────────────────────────────────────
{lignes_txt}
{remise_txt}
Livraison : {port_txt}
TOTAL réglé : {_eur(order['total'])}

Adresse de livraison :
{order['ship_name']}
{order['ship_address']}
{order['ship_zip']} {order['ship_city']}

Votre commande sera expédiée sous 24 h. Vous pouvez suivre son statut
dans votre espace « Mon compte ».

À bientôt,
L'équipe {shop} ⚡
"""

    html = f"""<!doctype html><html><body style="font-family:Arial,Helvetica,sans-serif;background:#f4f4f7;color:#1f2430;margin:0;padding:24px">
  <div style="max-width:560px;margin:auto;background:#ffffff;border-radius:14px;padding:28px;border:1px solid #e3e3ea">
    <h1 style="margin:0 0 4px;font-size:22px;color:#16161d">⚡ {shop}</h1>
    <p style="color:#e0700f;font-weight:bold;margin:0 0 20px">Confirmation de commande</p>
    <p style="color:#333a48">Bonjour <strong>{order['customer_name']}</strong>,<br>
    Merci pour votre commande ! Votre paiement a bien été reçu. 🎉</p>
    <h2 style="font-size:16px;color:#16161d;border-bottom:2px solid #f0f0f4;padding-bottom:8px">Commande n°{oid}</h2>
    <table style="width:100%;border-collapse:collapse;font-size:14px;color:#333a48">{lignes_html}
      {f"<tr><td style='padding:6px 0;color:#1a9d63'>Remise ({order['promo_code']})</td><td style='padding:6px 0;text-align:right;color:#1a9d63'>-{_eur(order['discount'])}</td></tr>" if order.get('discount') else ""}
      <tr><td style="padding:6px 0">Livraison</td><td style="padding:6px 0;text-align:right">{port_txt}</td></tr>
      <tr><td style="padding:10px 0;font-weight:bold;color:#16161d;border-top:2px solid #f0f0f4">Total réglé</td>
          <td style="padding:10px 0;text-align:right;font-weight:bold;color:#16161d;border-top:2px solid #f0f0f4">{_eur(order['total'])}</td></tr>
    </table>
    <h2 style="font-size:16px;color:#16161d;border-bottom:2px solid #f0f0f4;padding-bottom:8px;margin-top:24px">📦 Livraison</h2>
    <p style="font-size:14px;line-height:1.6;margin:0;color:#333a48">
      {order['ship_name']}<br>{order['ship_address']}<br>{order['ship_zip']} {order['ship_city']}</p>
    <p style="color:#6b7280;font-size:13px;margin-top:24px">Expédition sous 24 h. Suivi disponible dans « Mon compte ».</p>
    <p style="margin-top:18px;color:#333a48">À bientôt,<br>L'équipe {shop} ⚡</p>
  </div>
</body></html>"""

    msg = EmailMessage()
    msg["Subject"] = f"Confirmation de votre commande {shop} n°{oid}"
    msg["From"] = cfg["from"]
    msg["To"] = order["customer_email"]
    msg.set_content(texte)
    msg.add_alternative(html, subtype="html")
    return msg


def _build_admin_message(cfg: dict, order: dict, items: list[dict], recipients: list[str]) -> EmailMessage:
    """Notification interne au gérant : nouvelle commande payée à expédier."""
    shop = cfg["shop"]
    oid = order["id"]
    lignes_txt = "\n".join(
        f"  - {i['quantity']} × {i['product_name']} : {_eur(i['unit_price'] * i['quantity'])}"
        for i in items
    )
    lignes_html = "".join(
        f"<tr><td style='padding:6px 0'>{i['quantity']} × {i['product_name']}</td>"
        f"<td style='padding:6px 0;text-align:right'>{_eur(i['unit_price'] * i['quantity'])}</td></tr>"
        for i in items
    )

    texte = f"""🔔 NOUVELLE COMMANDE — {shop}

Commande n°{oid} — total {_eur(order['total'])}

Client : {order['customer_name']} <{order['customer_email']}>

Articles :
{lignes_txt}

Adresse de livraison :
{order['ship_name']}
{order['ship_address']}
{order['ship_zip']} {order['ship_city']}

→ Détail complet dans l'espace admin du site.
"""

    html = f"""<!doctype html><html><body style="font-family:Arial,Helvetica,sans-serif;background:#f4f4f7;color:#1f2430;margin:0;padding:24px">
  <div style="max-width:560px;margin:auto;background:#ffffff;border-radius:14px;padding:28px;border:1px solid #e3e3ea">
    <h1 style="margin:0 0 4px;font-size:20px;color:#16161d">🔔 Nouvelle commande — {shop}</h1>
    <p style="color:#6b7280;margin:0 0 18px">Commande n°{oid} · <strong style="color:#1a9d63">{_eur(order['total'])}</strong></p>
    <h2 style="font-size:15px;color:#16161d;border-bottom:2px solid #f0f0f4;padding-bottom:6px">👤 Client</h2>
    <p style="font-size:14px;margin:6px 0 16px;color:#333a48">{order['customer_name']}<br>
      <a href="mailto:{order['customer_email']}" style="color:#2563eb">{order['customer_email']}</a></p>
    <h2 style="font-size:15px;color:#16161d;border-bottom:2px solid #f0f0f4;padding-bottom:6px">🛒 Articles</h2>
    <table style="width:100%;border-collapse:collapse;font-size:14px;color:#333a48">{lignes_html}
      <tr><td style="padding:10px 0;font-weight:bold;color:#16161d;border-top:2px solid #f0f0f4">Total</td>
          <td style="padding:10px 0;text-align:right;font-weight:bold;color:#16161d;border-top:2px solid #f0f0f4">{_eur(order['total'])}</td></tr>
    </table>
    <h2 style="font-size:15px;color:#16161d;border-bottom:2px solid #f0f0f4;padding-bottom:6px;margin-top:22px">📦 À expédier à</h2>
    <p style="font-size:14px;line-height:1.6;margin:6px 0;color:#333a48">
      {order['ship_name']}<br>{order['ship_address']}<br>{order['ship_zip']} {order['ship_city']}</p>
    <p style="color:#6b7280;font-size:13px;margin-top:20px">Détail complet dans l'espace admin du site.</p>
  </div>
</body></html>"""

    msg = EmailMessage()
    msg["Subject"] = f"🔔 Nouvelle commande {shop} n°{oid} — {_eur(order['total'])}"
    msg["From"] = cfg["from"]
    msg["To"] = ", ".join(recipients)
    msg.set_content(texte)
    msg.add_alternative(html, subtype="html")
    return msg


def _sender_email(value: str) -> str:
    """Extrait l'adresse d'un expéditeur « Nom <email> » ou « email »."""
    m = re.search(r"<([^>]+)>", value or "")
    return m.group(1).strip() if m else (value or "").strip()


def _brevo_deliver(cfg: dict, msg: EmailMessage, what: str) -> bool:
    """Envoi via l'API HTTP transactionnelle de Brevo (non bloquée par Render).

    On reconstitue le payload Brevo à partir de l'EmailMessage déjà construit
    (sujet, destinataires, corps texte/HTML, pièces jointes éventuelles).
    """
    try:
        text_part = html_part = None
        attachments = []
        for part in msg.walk():
            if part.get_content_maintype() == "multipart":
                continue
            if part.get_content_disposition() == "attachment":
                attachments.append({
                    "name": part.get_filename() or "fichier",
                    "content": base64.b64encode(part.get_payload(decode=True)).decode(),
                })
            elif part.get_content_type() == "text/plain" and text_part is None:
                text_part = part.get_content()
            elif part.get_content_type() == "text/html" and html_part is None:
                html_part = part.get_content()

        to_list = [{"email": e.strip()} for e in str(msg["To"]).split(",") if e.strip()]
        payload = {
            "sender": {"email": _sender_email(cfg["from"]), "name": cfg["shop"]},
            "to": to_list,
            "subject": str(msg["Subject"]),
        }
        if html_part:
            payload["htmlContent"] = html_part
        if text_part:
            payload["textContent"] = text_part
        if not html_part and not text_part:
            payload["textContent"] = " "
        if attachments:
            payload["attachment"] = attachments

        req = urllib.request.Request(
            "https://api.brevo.com/v3/smtp/email",
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "api-key": cfg["brevo_key"],
                "content-type": "application/json",
                "accept": "application/json",
            },
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=15) as resp:
            if not (200 <= resp.status < 300):
                raise RuntimeError(f"HTTP {resp.status}")
        log.info("%s — envoyé via Brevo à %s", what, msg["To"])
        return True
    except urllib.error.HTTPError as exc:
        body = ""
        try:
            body = exc.read().decode("utf-8", errors="replace")
        except Exception:
            body = "<réponse illisible>"
        log.error("Échec Brevo — %s — HTTP %s — %s", what, exc.code, body)
        return False
    except Exception:
        log.exception("Échec Brevo — %s", what)
        return False


def _smtp_deliver(cfg: dict, msg: EmailMessage, what: str) -> bool:
    """Connexion SMTP + envoi. Ne lève jamais : journalise et renvoie un booléen."""
    smtp = cfg["smtp"]
    try:
        context = ssl.create_default_context()
        with smtplib.SMTP(smtp["host"], smtp["port"], timeout=15) as server:
            server.starttls(context=context)
            server.login(smtp["user"], smtp["password"])
            server.send_message(msg)
        log.info("%s — envoyé via SMTP à %s", what, msg["To"])
        return True
    except Exception:
        log.exception("Échec SMTP — %s", what)
        return False


def _deliver(cfg: dict, msg: EmailMessage, what: str) -> bool:
    """Envoie via Brevo en priorité (si configuré), avec repli SMTP. Ne lève jamais."""
    if cfg.get("brevo_key") and _brevo_deliver(cfg, msg, what):
        return True
    if cfg.get("smtp"):
        return _smtp_deliver(cfg, msg, what)
    return False


def send_order_confirmation(order: dict, items: list[dict], invoice_pdf: bytes | None = None) -> bool:
    """Envoie la confirmation de commande au CLIENT. Renvoie True si envoyé.

    Si `invoice_pdf` est fourni, la facture PDF est jointe à l'email.
    """
    cfg = _config()
    if cfg is None:
        log.info("SMTP non configuré — confirmation client ignorée (commande %s)", order.get("id"))
        return False
    if not order.get("customer_email"):
        log.warning("Pas d'email client pour la commande %s", order.get("id"))
        return False
    msg = _build_message(cfg, order, items)
    if invoice_pdf:
        msg.add_attachment(
            invoice_pdf, maintype="application", subtype="pdf",
            filename=f"facture-{order['id']}.pdf",
        )
    return _deliver(cfg, msg, f"Confirmation client (commande {order['id']})")


def send_admin_notification(order: dict, items: list[dict], recipients: list[str]) -> bool:
    """Notifie le(s) GÉRANT(s) d'une nouvelle commande. Renvoie True si envoyé."""
    cfg = _config()
    if cfg is None:
        log.info("SMTP non configuré — notif admin ignorée (commande %s)", order.get("id"))
        return False
    recipients = [r for r in (recipients or []) if r]
    if not recipients:
        log.info("Aucun destinataire admin — notif ignorée (commande %s)", order.get("id"))
        return False
    msg = _build_admin_message(cfg, order, items, recipients)
    return _deliver(cfg, msg, f"Notif admin (commande {order['id']})")


def send_shipping_notification(order: dict) -> bool:
    """Prévient le client que sa commande a été expédiée (avec n° de suivi)."""
    cfg = _config()
    if cfg is None:
        log.info("SMTP non configuré — email d'expédition ignoré (commande %s)", order.get("id"))
        return False
    if not order.get("customer_email"):
        return False
    shop = cfg["shop"]
    oid = order["id"]
    tracking = order.get("tracking_number")
    carrier = order.get("carrier")
    suivi_txt = ""
    if tracking:
        suivi_txt = f"\nTransporteur : {carrier or 'Non précisé'}\nNuméro de suivi : {tracking}\n"
    texte = f"""Bonjour {order.get('customer_name', '')},

Bonne nouvelle — votre commande {shop} n°{oid} vient d'être expédiée ! 📦
{suivi_txt}
Adresse de livraison :
{order['ship_name']}
{order['ship_address']}
{order['ship_zip']} {order['ship_city']}

Merci de votre confiance,
L'équipe {shop} ⚡
"""
    suivi_html = ""
    if tracking:
        suivi_html = (
            f"<div style='background:#f4f4f7;border:2px solid #e3e3ea;border-radius:10px;padding:16px;margin:18px 0'>"
            f"<p style='margin:0 0 4px;color:#6b7280;font-size:13px'>Transporteur : <strong style='color:#16161d'>{carrier or 'Non précisé'}</strong></p>"
            f"<p style='margin:0;color:#6b7280;font-size:13px'>Numéro de suivi : <strong style='color:#16161d;font-size:16px'>{tracking}</strong></p></div>"
        )
    html = f"""<!doctype html><html><body style="font-family:Arial,Helvetica,sans-serif;background:#f4f4f7;color:#1f2430;margin:0;padding:24px">
  <div style="max-width:520px;margin:auto;background:#ffffff;border-radius:14px;padding:28px;border:1px solid #e3e3ea">
    <h1 style="margin:0 0 4px;font-size:22px;color:#16161d">⚡ {shop}</h1>
    <p style="color:#e0700f;font-weight:bold;margin:0 0 20px">📦 Votre commande est en route</p>
    <p style="color:#333a48">Bonjour <strong>{order.get('customer_name', '')}</strong>,<br>
    Votre commande <strong>n°{oid}</strong> vient d'être expédiée !</p>
    {suivi_html}
    <h2 style="font-size:15px;color:#16161d;border-bottom:2px solid #f0f0f4;padding-bottom:6px">Adresse de livraison</h2>
    <p style="font-size:14px;line-height:1.6;margin:6px 0;color:#333a48">
      {order['ship_name']}<br>{order['ship_address']}<br>{order['ship_zip']} {order['ship_city']}</p>
    <p style="margin-top:18px;color:#333a48">Merci de votre confiance,<br>L'équipe {shop} ⚡</p>
  </div>
</body></html>"""
    msg = EmailMessage()
    msg["Subject"] = f"📦 Votre commande {shop} n°{oid} a été expédiée"
    msg["From"] = cfg["from"]
    msg["To"] = order["customer_email"]
    msg.set_content(texte)
    msg.add_alternative(html, subtype="html")
    return _deliver(cfg, msg, f"Expédition (commande {oid})")


def send_verification_code(to_email: str, name: str, code: str) -> bool:
    """Envoie le code de vérification de compte (6 chiffres) à l'inscription."""
    cfg = _config()
    if cfg is None:
        log.info("SMTP non configuré — code de vérification non envoyé (%s)", to_email)
        return False
    shop = cfg["shop"]
    texte = f"""Bonjour {name},

Bienvenue chez {shop} ! Votre code de vérification est :

    {code}

Saisissez-le sur le site pour activer votre compte. Ce code est valable 15 minutes.

Si vous n'êtes pas à l'origine de cette inscription, ignorez simplement cet email.

L'équipe {shop} ⚡
"""
    html = f"""<!doctype html><html><body style="font-family:Arial,Helvetica,sans-serif;background:#f4f4f7;color:#1f2430;margin:0;padding:24px">
  <div style="max-width:480px;margin:auto;background:#ffffff;border-radius:14px;padding:28px;border:1px solid #e3e3ea;text-align:center">
    <h1 style="margin:0 0 4px;font-size:22px;color:#16161d">⚡ {shop}</h1>
    <p style="color:#e0700f;font-weight:bold;margin:0 0 22px">Vérification de votre compte</p>
    <p style="font-size:14px;margin:0 0 18px;color:#333a48">Bonjour <strong>{name}</strong>, voici votre code de vérification :</p>
    <div style="font-size:34px;font-weight:bold;letter-spacing:10px;color:#16161d;background:#f4f4f7;border:2px solid #e3e3ea;border-radius:10px;padding:18px;margin:0 0 18px">{code}</div>
    <p style="color:#6b7280;font-size:13px;margin:0">Valable 15 minutes. Saisissez-le sur le site pour activer votre compte.</p>
    <p style="color:#9aa0ab;font-size:12px;margin-top:20px">Si vous n'êtes pas à l'origine de cette inscription, ignorez cet email.</p>
  </div>
</body></html>"""

    msg = EmailMessage()
    msg["Subject"] = f"Votre code de vérification {shop} : {code}"
    msg["From"] = cfg["from"]
    msg["To"] = to_email
    msg.set_content(texte)
    msg.add_alternative(html, subtype="html")
    return _deliver(cfg, msg, f"Code de vérification ({to_email})")


def send_password_reset(to_email: str, name: str, code: str) -> bool:
    """Envoie le code de réinitialisation du mot de passe (6 chiffres)."""
    cfg = _config()
    if cfg is None:
        log.info("SMTP non configuré — code de réinitialisation non envoyé (%s)", to_email)
        return False
    shop = cfg["shop"]
    texte = f"""Bonjour {name},

Vous avez demandé à réinitialiser votre mot de passe {shop}. Votre code est :

    {code}

Saisissez-le sur le site avec votre nouveau mot de passe. Ce code est valable 15 minutes.

Si vous n'êtes pas à l'origine de cette demande, ignorez cet email : votre mot de passe reste inchangé.

L'équipe {shop} ⚡
"""
    html = f"""<!doctype html><html><body style="font-family:Arial,Helvetica,sans-serif;background:#f4f4f7;color:#1f2430;margin:0;padding:24px">
  <div style="max-width:480px;margin:auto;background:#ffffff;border-radius:14px;padding:28px;border:1px solid #e3e3ea;text-align:center">
    <h1 style="margin:0 0 4px;font-size:22px;color:#16161d">⚡ {shop}</h1>
    <p style="color:#e0700f;font-weight:bold;margin:0 0 22px">Réinitialisation du mot de passe</p>
    <p style="font-size:14px;margin:0 0 18px;color:#333a48">Bonjour <strong>{name}</strong>, voici votre code de réinitialisation :</p>
    <div style="font-size:34px;font-weight:bold;letter-spacing:10px;color:#16161d;background:#f4f4f7;border:2px solid #e3e3ea;border-radius:10px;padding:18px;margin:0 0 18px">{code}</div>
    <p style="color:#6b7280;font-size:13px;margin:0">Valable 15 minutes. Saisissez-le avec votre nouveau mot de passe.</p>
    <p style="color:#9aa0ab;font-size:12px;margin-top:20px">Si vous n'êtes pas à l'origine de cette demande, ignorez cet email.</p>
  </div>
</body></html>"""

    msg = EmailMessage()
    msg["Subject"] = f"Réinitialisation de votre mot de passe {shop} : {code}"
    msg["From"] = cfg["from"]
    msg["To"] = to_email
    msg.set_content(texte)
    msg.add_alternative(html, subtype="html")
    return _deliver(cfg, msg, f"Réinitialisation mot de passe ({to_email})")
