# -*- coding: utf-8 -*-
"""VOLT PC — Génération de factures PDF (via fpdf2).

Module isolé. La fonction principale `generate_invoice_pdf(order, items)` renvoie
les octets d'un PDF de facture, prêt à être téléchargé ou joint à un email.

Infos société (mentions légales) lues dans les variables d'environnement :
    SHOP_NAME     nom commercial (déf. « VOLT PC »)
    SHOP_ADDRESS  adresse postale
    SHOP_SIRET    numéro SIRET
    SHOP_VAT      n° TVA intracommunautaire (vide = non assujetti à la TVA)
    SHOP_EMAIL    email de contact

Note : on utilise la police standard Helvetica (encodage latin-1). Le texte est
assaini en latin-1 et les montants utilisent « EUR » (le glyphe € n'existe pas
en latin-1). Pour un rendu Unicode complet il faudrait embarquer une police TTF.
"""
from __future__ import annotations

import os
import time

from fpdf import FPDF
from fpdf.enums import XPos, YPos

NEXT = dict(new_x=XPos.LMARGIN, new_y=YPos.NEXT)  # passage à la ligne suivante


def _cfg() -> dict:
    return {
        "name": os.environ.get("SHOP_NAME", "VOLT PC"),
        "address": os.environ.get("SHOP_ADDRESS", ""),
        "siret": os.environ.get("SHOP_SIRET", ""),
        "vat": os.environ.get("SHOP_VAT", ""),
        "email": os.environ.get("SHOP_EMAIL", ""),
    }


def _s(txt) -> str:
    """Assainit une chaîne pour la police latin-1 (remplace les caractères hors jeu)."""
    return str(txt or "").encode("latin-1", "replace").decode("latin-1")


def _eur(n: float) -> str:
    """Formate un montant : 1 234,56 EUR."""
    return f"{n:,.2f}".replace(",", " ").replace(".", ",") + " EUR"


def generate_invoice_pdf(order: dict, items: list[dict]) -> bytes:
    cfg = _cfg()
    pdf = FPDF()
    pdf.set_auto_page_break(auto=True, margin=15)
    pdf.add_page()

    # ── En-tête : société ──
    pdf.set_font("Helvetica", "B", 20)
    pdf.cell(0, 10, _s(cfg["name"]), **NEXT)
    pdf.set_font("Helvetica", "", 9)
    pdf.set_text_color(90, 90, 90)
    for line in [
        cfg["address"],
        f"SIRET : {cfg['siret']}" if cfg["siret"] else "",
        f"TVA : {cfg['vat']}" if cfg["vat"] else "",
        cfg["email"],
    ]:
        if line:
            pdf.cell(0, 5, _s(line), **NEXT)
    pdf.ln(8)

    # ── Titre facture ──
    pdf.set_text_color(0, 0, 0)
    pdf.set_font("Helvetica", "B", 15)
    created = order.get("created_at") or time.time()
    year = time.strftime("%Y", time.localtime(created))
    num = f"{year}-{int(order['id']):05d}"
    pdf.cell(0, 9, _s(f"FACTURE N° {num}"), **NEXT)
    pdf.set_font("Helvetica", "", 10)
    paid = order.get("paid_at") or created
    pdf.cell(0, 6, _s(f"Date : {time.strftime('%d/%m/%Y', time.localtime(paid))}"), **NEXT)
    pdf.ln(5)

    # ── Client / livraison ──
    pdf.set_font("Helvetica", "B", 10)
    pdf.cell(0, 6, _s("Facturé à :"), **NEXT)
    pdf.set_font("Helvetica", "", 10)
    for line in [
        order.get("customer_name", ""),
        order.get("customer_email", ""),
        order.get("ship_address", ""),
        f"{order.get('ship_zip', '')} {order.get('ship_city', '')}".strip(),
    ]:
        if line:
            pdf.cell(0, 5, _s(line), **NEXT)
    pdf.ln(7)

    # ── Tableau des articles ──
    pdf.set_font("Helvetica", "B", 10)
    pdf.set_fill_color(240, 240, 244)
    pdf.cell(95, 8, _s("Article"), fill=True)
    pdf.cell(20, 8, _s("Qté"), align="C", fill=True)
    pdf.cell(35, 8, _s("Prix unit."), align="R", fill=True)
    pdf.cell(35, 8, _s("Total"), align="R", fill=True, **NEXT)
    pdf.set_font("Helvetica", "", 10)
    for it in items:
        line_total = it["unit_price"] * it["quantity"]
        pdf.cell(95, 7, _s(it["product_name"]))
        pdf.cell(20, 7, str(it["quantity"]), align="C")
        pdf.cell(35, 7, _eur(it["unit_price"]), align="R")
        pdf.cell(35, 7, _eur(line_total), align="R", **NEXT)
    pdf.ln(4)

    # ── Totaux ──
    def total_line(label, val, bold=False):
        pdf.set_font("Helvetica", "B" if bold else "", 11 if bold else 10)
        pdf.cell(150, 7, _s(label), align="R")
        pdf.cell(35, 7, _eur(val), align="R", **NEXT)

    if order.get("discount"):
        total_line(f"Remise ({order.get('promo_code', '')})", -order["discount"])
    total_line("Livraison", order.get("shipping") or 0)
    total_line("TOTAL TTC", order["total"], bold=True)

    # ── Mentions TVA ──
    pdf.ln(3)
    pdf.set_font("Helvetica", "", 8)
    pdf.set_text_color(90, 90, 90)
    if cfg["vat"]:
        ttc = order["total"]
        ht = ttc / 1.2
        tva = ttc - ht
        pdf.cell(0, 5, _s(f"Dont TVA 20% : {_eur(tva)}  -  Total HT : {_eur(ht)}"), **NEXT)
    else:
        pdf.cell(0, 5, _s("TVA non applicable, art. 293 B du CGI"), **NEXT)

    # ── Pied de page ──
    pdf.ln(8)
    pdf.set_text_color(120, 120, 120)
    pdf.set_font("Helvetica", "", 8)
    pdf.multi_cell(0, 4, _s(f"Merci de votre confiance. {cfg['name']}"))

    return bytes(pdf.output())
