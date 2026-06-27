# -*- coding: utf-8 -*-
"""VoltCore — Envoi d'emails transactionnels (confirmation de commande) via SMTP.

Module isolé, sans dépendance externe (smtplib de la stdlib).

Configuration par variables d'environnement (backend/.env) :
    SMTP_HOST       ex. smtp.gmail.com
    SMTP_PORT       ex. 587  (STARTTLS)
    SMTP_USER       login SMTP / adresse d'envoi
    SMTP_PASSWORD   mot de passe d'application (JAMAIS le mot de passe du compte)
    MAIL_FROM       expéditeur affiché (déf. = SMTP_USER)
    SHOP_NAME       nom affiché de la boutique (déf. « VoltCore »)

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
        "shop": os.environ.get("SHOP_NAME", "VoltCore"),
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


# ─── Gabarit d'email partagé ─────────────────────────────────────────
# Tous les emails transactionnels partagent la même enveloppe (en-tête de
# marque, liseré accent, pied de page contact) pour un rendu cohérent et
# soigné. Mise en page par tables + styles inline = compatibilité maximale
# (Gmail, Outlook, Apple Mail, clients mobiles).

ACCENT = "#e0700f"
INK = "#16161d"
TEXT = "#2b303a"
MUTED = "#8a909c"


def _email_shell(cfg: dict, eyebrow: str, inner: str, preheader: str = "") -> str:
    shop = cfg["shop"]
    return f"""<!doctype html><html lang="fr"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light">
</head>
<body style="margin:0;padding:0;background:#0e0e12;-webkit-text-size-adjust:100%">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">{preheader}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0e0e12;padding:30px 14px">
 <tr><td align="center">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:18px;overflow:hidden;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
   <tr><td style="background:{INK};padding:24px 34px">
    <table role="presentation" width="100%"><tr>
     <td style="font-size:21px;font-weight:800;letter-spacing:.5px;color:#ffffff">&#9889; {shop.upper()}</td>
     <td align="right" style="font-size:11px;font-weight:700;letter-spacing:1.6px;text-transform:uppercase;color:{ACCENT}">{eyebrow}</td>
    </tr></table>
   </td></tr>
   <tr><td style="height:4px;background:{ACCENT}"></td></tr>
   <tr><td style="padding:34px 34px 30px;color:{TEXT};font-size:15px;line-height:1.6">{inner}</td></tr>
   <tr><td style="padding:22px 34px;background:#fafafb;border-top:1px solid #ececf1;color:{MUTED};font-size:12px;line-height:1.7;text-align:center">
    <strong style="color:{INK}">{shop}</strong> — Composants PC haute performance<br>
    Une question ? <a href="mailto:support@voltcore.fr" style="color:{ACCENT};text-decoration:none">support@voltcore.fr</a><br>
    <span style="color:#b9bdc6">Site en cours de développement — aucun paiement réel, aucune livraison.</span>
   </td></tr>
  </table>
 </td></tr>
</table>
</body></html>"""


def _btn(href: str, label: str) -> str:
    return (
        f'<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0 6px">'
        f'<tr><td style="border-radius:10px;background:{ACCENT}">'
        f'<a href="{href}" style="display:inline-block;padding:13px 26px;color:#ffffff;'
        f'font-size:14px;font-weight:700;text-decoration:none;border-radius:10px">{label}</a>'
        f'</td></tr></table>'
    )


def _code_box(code: str) -> str:
    return (
        f'<div style="font-size:34px;font-weight:800;letter-spacing:10px;color:{INK};'
        f'background:#f5f5f8;border:1px solid #e6e6ec;border-radius:12px;'
        f'padding:18px;margin:22px 0;text-align:center">{code}</div>'
    )


def _build_message(cfg: dict, order: dict, items: list[dict]) -> EmailMessage:
    shop = cfg["shop"]
    # Numéro affiché au client : son propre compteur (1, 2, 3…), pas l'id global.
    oid = order.get("user_seq") or order["id"]

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

Merci pour votre commande chez {shop}. Votre paiement a bien été reçu et
votre commande est en cours de préparation.

Commande n°{oid}
------------------------------------------
{lignes_txt}{remise_txt}
Livraison : {port_txt}
Total réglé : {_eur(order['total'])}

Adresse de livraison :
{order['ship_name']}
{order['ship_address']}
{order['ship_zip']} {order['ship_city']}

Vous pouvez suivre votre commande depuis votre espace « Mon compte ».

Cordialement,
L'équipe {shop}
"""

    remise_row = (
        f"<tr><td style='padding:6px 0;color:#1a9d63'>Remise ({order['promo_code']})</td>"
        f"<td style='padding:6px 0;text-align:right;color:#1a9d63'>-{_eur(order['discount'])}</td></tr>"
        if order.get("discount") else ""
    )

    inner = f"""
      <p style="margin:0 0 4px">Bonjour <strong>{order['customer_name']}</strong>,</p>
      <p style="margin:0 0 24px;color:{TEXT}">Merci pour votre commande ! Votre paiement a bien été reçu et votre commande est en cours de préparation.</p>

      <div style="font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:{MUTED};margin-bottom:10px">Commande n°{oid}</div>
      <table role="presentation" style="width:100%;border-collapse:collapse;font-size:14px;color:{TEXT}">{lignes_html}
        {remise_row}
        <tr><td style="padding:10px 0 0;color:{MUTED}">Livraison</td><td style="padding:10px 0 0;text-align:right;color:{MUTED}">{port_txt}</td></tr>
        <tr><td style="padding:14px 0 0;font-weight:800;font-size:17px;color:{INK};border-top:2px solid #efeff3">Total réglé</td>
            <td style="padding:14px 0 0;text-align:right;font-weight:800;font-size:17px;color:{ACCENT};border-top:2px solid #efeff3">{_eur(order['total'])}</td></tr>
      </table>

      <div style="margin-top:26px;background:#f7f7fa;border-radius:12px;padding:18px 20px">
        <div style="font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:{MUTED};margin-bottom:8px">Adresse de livraison</div>
        <div style="font-size:14px;line-height:1.6;color:{TEXT}">{order['ship_name']}<br>{order['ship_address']}<br>{order['ship_zip']} {order['ship_city']}</div>
      </div>

      <p style="color:{MUTED};font-size:13px;line-height:1.6;margin:24px 0 0">Suivez votre commande à tout moment depuis votre espace « Mon compte ».</p>"""
    html = _email_shell(cfg, "Confirmation de commande", inner,
                        preheader=f"Commande n°{oid} confirmée — {_eur(order['total'])}")

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

    sec = f"font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:{MUTED};margin:24px 0 8px"
    inner = f"""
      <p style="margin:0 0 4px;font-size:16px;font-weight:700;color:{INK}">Nouvelle commande n°{oid}</p>
      <p style="margin:0;color:{MUTED};font-size:14px">Montant : <strong style="color:{ACCENT};font-size:16px">{_eur(order['total'])}</strong></p>

      <div style="{sec}">Client</div>
      <p style="font-size:14px;margin:0;color:{TEXT}">{order['customer_name']}<br>
        <a href="mailto:{order['customer_email']}" style="color:{ACCENT};text-decoration:none">{order['customer_email']}</a></p>

      <div style="{sec}">Articles</div>
      <table role="presentation" style="width:100%;border-collapse:collapse;font-size:14px;color:{TEXT}">{lignes_html}
        <tr><td style="padding:12px 0 0;font-weight:800;color:{INK};border-top:2px solid #efeff3">Total</td>
            <td style="padding:12px 0 0;text-align:right;font-weight:800;color:{INK};border-top:2px solid #efeff3">{_eur(order['total'])}</td></tr>
      </table>

      <div style="{sec}">À expédier à</div>
      <div style="background:#f7f7fa;border-radius:12px;padding:16px 20px;font-size:14px;line-height:1.6;color:{TEXT}">
        {order['ship_name']}<br>{order['ship_address']}<br>{order['ship_zip']} {order['ship_city']}</div>

      <p style="color:{MUTED};font-size:13px;margin:22px 0 0">Détail complet dans l'espace admin du site.</p>"""
    html = _email_shell(cfg, "Nouvelle commande", inner,
                        preheader=f"Commande n°{oid} — {_eur(order['total'])} à expédier")

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
            f"<div style='background:#f7f7fa;border:1px solid #e6e6ec;border-radius:12px;padding:16px 20px;margin:20px 0'>"
            f"<p style='margin:0 0 6px;color:{MUTED};font-size:13px'>Transporteur : <strong style='color:{INK}'>{carrier or 'Non précisé'}</strong></p>"
            f"<p style='margin:0;color:{MUTED};font-size:13px'>Numéro de suivi : <strong style='color:{ACCENT};font-size:16px;letter-spacing:.5px'>{tracking}</strong></p></div>"
        )
    inner = f"""
      <p style="margin:0 0 4px;font-size:17px;font-weight:800;color:{INK}">Votre commande est en route &#128230;</p>
      <p style="margin:0 0 18px;color:{TEXT}">Bonjour <strong>{order.get('customer_name', '')}</strong>, votre commande <strong>n°{oid}</strong> vient d'être expédiée !</p>
      {suivi_html}
      <div style="font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:{MUTED};margin:22px 0 8px">Adresse de livraison</div>
      <div style="background:#f7f7fa;border-radius:12px;padding:16px 20px;font-size:14px;line-height:1.6;color:{TEXT}">
        {order['ship_name']}<br>{order['ship_address']}<br>{order['ship_zip']} {order['ship_city']}</div>
      <p style="margin:22px 0 0;color:{TEXT}">Merci de votre confiance.</p>"""
    html = _email_shell(cfg, "Commande expédiée", inner,
                        preheader=f"Votre commande n°{oid} a été expédiée")
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
    inner = f"""
      <p style="margin:0 0 6px">Bonjour <strong>{name}</strong>,</p>
      <p style="margin:0 0 4px;color:{TEXT}">Bienvenue chez {shop} ! Voici votre code de vérification pour activer votre compte :</p>
      {_code_box(code)}
      <p style="color:{MUTED};font-size:13px;margin:0;text-align:center">Valable 15 minutes.</p>
      <p style="color:#b9bdc6;font-size:12px;margin:18px 0 0;text-align:center">Si vous n'êtes pas à l'origine de cette inscription, ignorez cet email.</p>"""
    html = _email_shell(cfg, "Vérification du compte", inner,
                        preheader=f"Votre code de vérification : {code}")

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
    inner = f"""
      <p style="margin:0 0 6px">Bonjour <strong>{name}</strong>,</p>
      <p style="margin:0 0 4px;color:{TEXT}">Vous avez demandé à réinitialiser votre mot de passe {shop}. Voici votre code :</p>
      {_code_box(code)}
      <p style="color:{MUTED};font-size:13px;margin:0;text-align:center">Valable 15 minutes. Saisissez-le avec votre nouveau mot de passe.</p>
      <p style="color:#b9bdc6;font-size:12px;margin:18px 0 0;text-align:center">Si vous n'êtes pas à l'origine de cette demande, ignorez cet email : votre mot de passe reste inchangé.</p>"""
    html = _email_shell(cfg, "Réinitialisation du mot de passe", inner,
                        preheader=f"Votre code de réinitialisation : {code}")

    msg = EmailMessage()
    msg["Subject"] = f"Réinitialisation de votre mot de passe {shop} : {code}"
    msg["From"] = cfg["from"]
    msg["To"] = to_email
    msg.set_content(texte)
    msg.add_alternative(html, subtype="html")
    return _deliver(cfg, msg, f"Réinitialisation mot de passe ({to_email})")
