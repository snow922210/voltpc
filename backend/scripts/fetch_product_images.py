# -*- coding: utf-8 -*-
"""Télécharge plusieurs images par produit (rendu type Amazon) → galerie.

Pour chaque produit de la base, interroge la recherche d'images DuckDuckGo,
écarte les banques d'images (risque de facture), garde les meilleures (résolution
et ratio raisonnables) et les enregistre dans :

    frontend/images/{id}-1.jpg, {id}-2.jpg, …

Le frontend affiche automatiquement celles qui existent (galerie), et retombe sur
le visuel SVG si aucune image. AUCUN changement de base : tout passe par le nom
de fichier.

⚠️  Usage DÉMO uniquement : ces images sont sous copyright fabricant/revendeur.
    À remplacer par des images sous licence avant une exploitation commerciale.

Usage :
    python fetch_product_images.py                 # tous les produits, 4 images
    python fetch_product_images.py --limit 5       # 5 premiers produits (test)
    python fetch_product_images.py --per 3         # 3 images par produit
    python fetch_product_images.py --only-missing  # ignore les produits déjà faits
"""
from __future__ import annotations

import argparse
import http.cookiejar
import json
import re
import sqlite3
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from io import BytesIO
from pathlib import Path

try:
    from PIL import Image
except ImportError:                       # pragma: no cover
    Image = None                          # sans Pillow : images gardées telles quelles

MAX_SIDE = 900        # côté le plus long, en pixels (suffisant pour une fiche produit)
JPEG_QUALITY = 82

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

BACKEND = Path(__file__).resolve().parent.parent
DB_PATH = BACKEND / "voltpc.db"
OUT = BACKEND.parent / "frontend" / "images"
OUT.mkdir(parents=True, exist_ok=True)

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"

# Banques d'images à EXCLURE (c'est là que partent les demandes de paiement).
BLOCK_DOMAINS = (
    "gettyimages", "shutterstock", "alamy", "istockphoto", "123rf",
    "dreamstime", "depositphotos", "stock.adobe", "adobestock",
    "stockphoto", "watermark", "lookaside",
)
MIN_W, MIN_H = 350, 350         # on veut des images nettes
MIN_BYTES = 6_000               # rejette les vignettes minuscules


# Opener partagé avec gestion des cookies (nécessaire pour l'API d'images DDG).
_OPENER = urllib.request.build_opener(
    urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar())
)


def _get(url: str, referer: str = "", timeout: int = 20, json_api: bool = False) -> bytes:
    headers = {"User-Agent": UA, "Accept-Language": "en-US,en;q=0.9"}
    if json_api:
        # En-têtes attendus par l'endpoint i.js, sinon 403 (anti-scraping).
        headers.update({
            "Accept": "application/json, text/javascript, */*; q=0.01",
            "X-Requested-With": "XMLHttpRequest",
            "Sec-Fetch-Dest": "empty", "Sec-Fetch-Mode": "cors",
            "Sec-Fetch-Site": "same-origin",
        })
    else:
        headers["Accept"] = "*/*"
    if referer:
        headers["Referer"] = referer
    with _OPENER.open(urllib.request.Request(url, headers=headers), timeout=timeout) as r:
        return r.read()


def _vqd(query: str) -> str | None:
    """Récupère le jeton vqd nécessaire à l'API d'images DuckDuckGo."""
    html = _get("https://duckduckgo.com/?q=" + urllib.parse.quote(query) + "&iax=images&ia=images").decode("utf-8", "replace")
    for pat in (r'vqd="([\d-]+)"', r"vqd='([\d-]+)'", r"vqd=([\d-]+)&"):
        m = re.search(pat, html)
        if m:
            return m.group(1)
    return None


def search_images(query: str, want: int = 12) -> list[dict]:
    """Renvoie une liste de résultats {image,width,height} pour la requête."""
    vqd = _vqd(query)
    if not vqd:
        return []
    time.sleep(0.6)
    url = ("https://duckduckgo.com/i.js?l=us-en&o=json&q="
           + urllib.parse.quote(query) + "&vqd=" + vqd + "&f=,,,,,&p=1")
    try:
        data = json.loads(_get(url, referer="https://duckduckgo.com/", json_api=True).decode("utf-8", "replace"))
    except Exception:
        return []
    return data.get("results", [])[:want]


def _ok_domain(u: str) -> bool:
    low = u.lower()
    return not any(b in low for b in BLOCK_DOMAINS)


def _is_image(b: bytes) -> bool:
    return (b[:3] == b"\xff\xd8\xff"            # JPEG
            or b[:8] == b"\x89PNG\r\n\x1a\n"     # PNG
            or b[:4] == b"RIFF" and b[8:12] == b"WEBP")  # WEBP


def _optimize(raw: bytes) -> bytes | None:
    """Aplatit la transparence sur fond blanc, redimensionne et recompresse en
    JPEG léger. Renvoie None si l'image est illisible."""
    if Image is None:
        return raw
    try:
        im = Image.open(BytesIO(raw)); im.load()
    except Exception:
        return None
    if im.mode in ("RGBA", "LA", "P"):       # fond transparent → blanc (rendu propre)
        im = im.convert("RGBA")
        bg = Image.new("RGB", im.size, (255, 255, 255))
        bg.paste(im, mask=im.split()[-1])
        im = bg
    else:
        im = im.convert("RGB")
    w, h = im.size
    if max(w, h) > MAX_SIDE:
        s = MAX_SIDE / max(w, h)
        im = im.resize((round(w * s), round(h * s)), Image.LANCZOS)
    out = BytesIO()
    im.save(out, format="JPEG", quality=JPEG_QUALITY, optimize=True)
    return out.getvalue()


def fetch_for_product(pid: int, query: str, per: int, brand: str = "") -> int:
    """Télécharge jusqu'à `per` images pour le produit. Renvoie le nb réussi."""
    results = search_images(query, want=per * 6)
    # Filtre : domaine autorisé + taille minimale, en gardant l'ordre de pertinence.
    candidates = [
        r for r in results
        if r.get("image") and _ok_domain(r["image"])
        and (r.get("width") or 0) >= MIN_W and (r.get("height") or 0) >= MIN_H
        and 0.5 <= (r.get("width", 1) / max(r.get("height", 1), 1)) <= 1.9
    ]
    # On privilégie les images hébergées par le FABRICANT (rendu propre, risque
    # juridique le plus faible) : on les place en tête sans casser l'ordre du reste.
    brand_l = re.sub(r"[^a-z0-9]", "", brand.lower())
    if brand_l:
        official = [r for r in candidates if brand_l in re.sub(r"[^a-z0-9]", "", r["image"].lower())]
        others = [r for r in candidates if r not in official]
        candidates = official + others
    saved = 0
    for r in candidates:
        if saved >= per:
            break
        try:
            img = _get(r["image"], referer="https://duckduckgo.com/", timeout=20)
            if len(img) < MIN_BYTES or not _is_image(img):
                continue
            opt = _optimize(img)
            if not opt or len(opt) < 3_000:
                continue
            (OUT / f"{pid}-{saved + 1}.jpg").write_bytes(opt)
            saved += 1
            time.sleep(0.3)
        except Exception:
            continue
    return saved


def build_query(name: str, brand: str, category: str) -> str:
    """Construit une requête propre (retire le préfixe catégorie FR redondant)."""
    q = name
    # Les noms commencent souvent par le libellé FR de catégorie : on l'enlève.
    for prefix in ("Carte graphique ", "Processeur ", "Carte mère ", "Mémoire ",
                   "Stockage ", "Alimentation ", "Boîtier ", "Refroidissement ",
                   "Écran ", "Clavier ", "Souris ", "Casque "):
        if q.startswith(prefix):
            q = q[len(prefix):]
            break
    return q.strip()


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=0, help="nb de produits (0 = tous)")
    ap.add_argument("--per", type=int, default=4, help="images par produit")
    ap.add_argument("--only-missing", action="store_true", help="ignore les produits déjà traités")
    args = ap.parse_args()

    conn = sqlite3.connect(DB_PATH)
    rows = conn.execute("SELECT id, name, brand, category FROM products ORDER BY id").fetchall()
    if args.limit:
        rows = rows[: args.limit]

    total_ok = 0
    for i, (pid, name, brand, category) in enumerate(rows, 1):
        if args.only_missing and (OUT / f"{pid}-1.jpg").exists():
            continue
        query = build_query(name, brand, category)
        n = fetch_for_product(pid, query, args.per, brand)
        total_ok += n
        print(f"[{i}/{len(rows)}] #{pid} « {query[:45]} » → {n} image(s)")
        time.sleep(1.2)  # politesse (évite le blocage)

    print(f"\nTerminé : {total_ok} images téléchargées dans {OUT}")


if __name__ == "__main__":
    main()
