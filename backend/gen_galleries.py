# -*- coding: utf-8 -*-
"""Génère la GALERIE multi-images par produit, sur fond blanc.

Entrée :
  _to_fetch.json  : ordre des produits [{name, q}, ...]
  _gallery.txt    : une ligne par produit (même ordre), ids image Amazon
                    séparés par '|' (ex: 71abc|81def|...). Ligne vide = aucun.

Sortie :
  frontend/images/<slug>-1.jpg ... <slug>-N.jpg  (carré blanc 800x800)
  product_images.py : mapping nom -> "/images/<slug>-1.jpg" (image principale)

Repli : si une ligne est vide, on tente l'URL unique de product_image_sources.
"""
import json
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

from gen_images import slug, http_get, to_white_square, OUT, MAPPING_FILE

try:
    from product_image_sources import OVERRIDES
except Exception:
    OVERRIDES = {}

HERE = Path(__file__).resolve().parent
ID_URL = "https://m.media-amazon.com/images/I/%s._AC_SL1500_.jpg"
MAX_PER_PRODUCT = 5


def main():
    items = json.loads((HERE / "_to_fetch.json").read_text(encoding="utf-8"))
    lines = (HERE / "_gallery.txt").read_text(encoding="utf-8").split("\n")
    # garde l'alignement : autant de lignes que de produits
    lines = lines[:len(items)]
    while len(lines) < len(items):
        lines.append("")

    mapping = {}
    total_imgs = 0
    no_img = []
    for it, line in zip(items, lines):
        name = it["name"]
        s = slug(name)
        ids = [x for x in line.strip().split("|") if x and x not in ("NA", "ERR")]
        # dédoublonne en gardant l'ordre
        seen = set(); uniq = []
        for i in ids:
            if i not in seen:
                seen.add(i); uniq.append(i)
        urls = [ID_URL % i for i in uniq[:MAX_PER_PRODUCT]]
        if not urls and name in OVERRIDES:
            urls = [OVERRIDES[name]]  # repli image unique

        n = 0
        for url in urls:
            dest = OUT / f"{s}-{n+1}.jpg"
            try:
                dest.write_bytes(to_white_square(http_get(url, timeout=40)))
                n += 1
                total_imgs += 1
            except Exception as e:
                print(f"  ! {name} img{n+1}: {e}")
        if n:
            mapping[name] = f"/images/{s}-1.jpg"
            print(f"✓ {name}  ({n} img)")
        else:
            no_img.append(name)
            print(f"✗ {name} : aucune image")

    # Écrit le mapping image_url (image principale = -1)
    out = ["# -*- coding: utf-8 -*-",
           '"""Mapping nom de produit -> image principale (genere par gen_galleries.py)."""',
           "PRODUCT_IMAGES = {"]
    for k in sorted(mapping):
        out.append(f"    {k!r}: {mapping[k]!r},")
    out.append("}")
    MAPPING_FILE.write_text("\n".join(out) + "\n", encoding="utf-8")

    print(f"\nTerminé : {total_imgs} images, {len(mapping)} produits avec galerie, "
          f"{len(no_img)} sans image {no_img or ''}")


if __name__ == "__main__":
    main()
