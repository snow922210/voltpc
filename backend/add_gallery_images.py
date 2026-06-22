# -*- coding: utf-8 -*-
"""Ajoute des images de GALERIE (-2.jpg … -N.jpg) à des produits existants,
sans toucher à l'image principale (-1.jpg) ni au mapping product_images.py.

Entrée : _gallery_ids.json  =  { "<nom produit>": ["<id Amazon>", ...], ... }
  Les ids sont les VUES SECONDAIRES (la principale -1 reste celle déjà validée).

Sortie : frontend/images/<slug>-2.jpg … <slug>-(1+len).jpg  (carré blanc 800x800)

Le frontend affiche automatiquement -1..-5 et retire les vignettes qui ne
chargent pas : aucune autre modification nécessaire.

Usage :  python add_gallery_images.py
"""
import json
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

from gen_images import slug, http_get, to_white_square, OUT

HERE = Path(__file__).resolve().parent
ID_URL = "https://m.media-amazon.com/images/I/%s._AC_SL1500_.jpg"
MAX_EXTRA = 4  # 1 principale (-1) + 4 secondaires = 5 max, comme le frontend


def main():
    data = json.loads((HERE / "_gallery_ids.json").read_text(encoding="utf-8"))
    total = 0
    for name, ids in data.items():
        s = slug(name)
        # dédoublonne en gardant l'ordre
        seen, uniq = set(), []
        for i in ids:
            i = (i or "").strip()
            if i and i not in seen:
                seen.add(i)
                uniq.append(i)
        uniq = uniq[:MAX_EXTRA]
        n = 0
        for i in uniq:
            dest = OUT / f"{s}-{n + 2}.jpg"  # commence à -2
            if dest.exists() and "--force" not in sys.argv:
                n += 1
                continue
            try:
                dest.write_bytes(to_white_square(http_get(ID_URL % i, timeout=40)))
                n += 1
                total += 1
            except Exception as e:
                print(f"  ! {name} img-{n + 2}: {e}")
        print(f"{'✓' if n else '✗'} {name}  (+{n} secondaires)")
    print(f"\nTerminé : {total} images de galerie ajoutées.")


if __name__ == "__main__":
    main()
