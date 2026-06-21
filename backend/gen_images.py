# -*- coding: utf-8 -*-
"""Génère les visuels produit sur fond BLANC pour un rendu pro.

Pipeline :
  1. Source de l'image, par ordre de priorité :
       a) URL officielle fournie dans product_image_sources.py (OVERRIDES)
       b) recherche Wikimedia Commons par nom (repli, libre de droits)
  2. Téléchargement.
  3. Normalisation : composition sur un CARRÉ BLANC (gère la transparence),
     centrage + marge, redimensionnement (TARGET px), export JPG.
  4. Enregistrement dans frontend/images/<slug>.jpg (slug stable du nom).
  5. Écriture du mapping nom -> "/images/<slug>.jpg" dans product_images.py,
     lu par le seed / add_products / resync pour renseigner products.image_url.

Détourage : les photos officielles sont déjà sur fond blanc -> rien à retirer.
Pour une vraie suppression de fond sur photo quelconque, installer `rembg`
(optionnel) : s'il est présent, il est utilisé avant la composition blanche.

Usage :
  python gen_images.py            # tous les produits sans image
  python gen_images.py --only "Ryzen 7 9800X3D" "GeForce RTX 5090 SUPRIM Liquid 32G"
  python gen_images.py --force    # régénère même si le fichier existe
"""
import io
import json
import re
import sys
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

from PIL import Image

from seed import SEED_PRODUCTS

try:
    from product_image_sources import OVERRIDES  # {nom produit: URL image}
except Exception:
    OVERRIDES = {}

OUT = Path(__file__).resolve().parent.parent / "frontend" / "images"
OUT.mkdir(exist_ok=True)
MAPPING_FILE = Path(__file__).resolve().parent / "product_images.py"

TARGET = 800          # côté du carré final (px)
PAD = 0.08            # marge autour du produit (8 %)
UA = {"User-Agent": "Mozilla/5.0 (VoltCore catalog image tool)"}
PAUSE = 1.2           # pause anti rate-limit Commons


def slug(name: str) -> str:
    s = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode()
    s = re.sub(r"[^a-zA-Z0-9]+", "-", s).strip("-").lower()
    return s or "produit"


def normalize_amazon(url: str) -> str:
    """Reconstruit la pleine résolution d'une URL image Amazon (m.media-amazon).
    Ex: .../I/71KAMVAMlPL._AC_SX679_.jpg -> .../I/71KAMVAMlPL._AC_SL1500_.jpg"""
    m = re.match(r"(https://m\.media-amazon\.com/images/I/[A-Za-z0-9+-]+)\.", url)
    if m:
        return m.group(1) + "._AC_SL1500_.jpg"
    return url


def http_get(url: str, timeout: int = 30) -> bytes:
    for attempt in range(4):
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            if e.code == 429 and attempt < 3:
                time.sleep(10 * (attempt + 1))
                continue
            raise
    raise RuntimeError("trop de tentatives")


def commons_search(query: str):
    """Renvoie l'URL d'une image Commons pertinente pour `query`, ou None."""
    time.sleep(PAUSE)
    api = "https://commons.wikimedia.org/w/api.php?" + urllib.parse.urlencode({
        "action": "query", "format": "json", "list": "search",
        "srnamespace": 6, "srlimit": 6, "srsearch": f"{query} filetype:bitmap",
    })
    hits = json.loads(http_get(api)).get("query", {}).get("search", [])
    for hit in hits:
        title = hit["title"]
        if not title.lower().endswith((".jpg", ".jpeg", ".png")):
            continue
        time.sleep(PAUSE)
        info = "https://commons.wikimedia.org/w/api.php?" + urllib.parse.urlencode({
            "action": "query", "format": "json", "titles": title,
            "prop": "imageinfo", "iiprop": "url|size", "iiurlwidth": 1000,
        })
        for page in json.loads(http_get(info))["query"]["pages"].values():
            ii = (page.get("imageinfo") or [{}])[0]
            if ii.get("thumburl") and ii.get("width", 0) >= 500:
                return ii["thumburl"]
    return None


def to_white_square(data: bytes) -> bytes:
    """Place l'image sur un carré blanc (gère transparence), centrée + marge."""
    img = Image.open(io.BytesIO(data))

    # Détourage optionnel si rembg est installé (photo à fond non blanc).
    try:
        from rembg import remove
        img = Image.open(io.BytesIO(remove(data)))
    except Exception:
        pass

    img = img.convert("RGBA")
    # Rogne sur le contenu non transparent si possible.
    bbox = img.getbbox()
    if bbox:
        img = img.crop(bbox)

    inner = int(TARGET * (1 - 2 * PAD))
    img.thumbnail((inner, inner), Image.LANCZOS)

    canvas = Image.new("RGBA", (TARGET, TARGET), (255, 255, 255, 255))
    x = (TARGET - img.width) // 2
    y = (TARGET - img.height) // 2
    canvas.paste(img, (x, y), img)

    out = io.BytesIO()
    canvas.convert("RGB").save(out, "JPEG", quality=88, optimize=True)
    return out.getvalue()


def main():
    args = sys.argv[1:]
    force = "--force" in args
    only = None
    if "--only" in args:
        i = args.index("--only")
        only = set(args[i + 1:])

    mapping = {}
    if MAPPING_FILE.exists():
        try:
            from product_images import PRODUCT_IMAGES as existing
            mapping.update(existing)
        except Exception:
            pass

    done = skipped = failed = 0
    for p in SEED_PRODUCTS:
        name = p["name"]
        if only and name not in only:
            continue
        dest = OUT / f"{slug(name)}.jpg"
        if dest.exists() and not force:
            mapping[name] = f"/images/{slug(name)}.jpg"
            skipped += 1
            continue

        src_url = OVERRIDES.get(name)
        origin = "officielle"
        if src_url and "m.media-amazon.com" in src_url:
            src_url = normalize_amazon(src_url)
        if not src_url:
            origin = "Commons"
            try:
                src_url = commons_search(f"{p['brand']} {name}") or commons_search(name)
            except Exception as e:
                print(f"✗ {name}: recherche échouée ({e})")
        if not src_url:
            failed += 1
            print(f"✗ {name}: aucune source")
            continue

        try:
            raw = http_get(src_url, timeout=40)
            dest.write_bytes(to_white_square(raw))
            mapping[name] = f"/images/{slug(name)}.jpg"
            done += 1
            print(f"✓ {name}  [{origin}]  -> {dest.name}")
        except Exception as e:
            failed += 1
            print(f"✗ {name}: {e}")

    # Écrit le mapping (trié) consommé par seed/add_products/resync.
    lines = ["# -*- coding: utf-8 -*-",
             '"""Mapping nom de produit -> chemin image (généré par gen_images.py)."""',
             "PRODUCT_IMAGES = {"]
    for k in sorted(mapping):
        lines.append(f"    {k!r}: {mapping[k]!r},")
    lines.append("}")
    MAPPING_FILE.write_text("\n".join(lines) + "\n", encoding="utf-8")

    print(f"\nTerminé : {done} générées, {skipped} déjà présentes, {failed} sans image."
          f"\nMapping : {len(mapping)} entrées -> {MAPPING_FILE.name}")


if __name__ == "__main__":
    main()
