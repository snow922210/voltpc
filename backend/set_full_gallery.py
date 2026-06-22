# -*- coding: utf-8 -*-
"""Écrit une galerie COMPLÈTE (image principale -1 incluse) pour des produits
dont l'image principale pré-existante est erronée (mauvaise variante/couleur).

À utiliser avec parcimonie : contrairement à add_gallery_images.py (qui ne
touche jamais -1), ce script ÉCRASE <slug>-1.jpg. Réservé aux corrections
(ex. RAM « RGB » dont le -1 montrait la version non-RGB).

Entrée : _full_gallery.json = { "<nom>": ["<id principale>", "<id 2>", ...] }
Sortie : frontend/images/<slug>-1.jpg, -2.jpg, …  (carré blanc 800x800)

NB : ne met PAS à jour product_images.py (le mapping pointe déjà sur <slug>-1.jpg).
"""
import json
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

from gen_images import slug, http_get, to_white_square, OUT

HERE = Path(__file__).resolve().parent
ID_URL = "https://m.media-amazon.com/images/I/%s._AC_SL1500_.jpg"
MAX = 5


def main():
    data = json.loads((HERE / "_full_gallery.json").read_text(encoding="utf-8"))
    total = 0
    for name, ids in data.items():
        s = slug(name)
        seen, uniq = set(), []
        for i in ids:
            i = (i or "").strip()
            if i and i not in seen:
                seen.add(i)
                uniq.append(i)
        uniq = uniq[:MAX]
        n = 0
        for i in uniq:
            dest = OUT / f"{s}-{n + 1}.jpg"  # commence à -1 (écrase la principale)
            try:
                dest.write_bytes(to_white_square(http_get(ID_URL % i, timeout=40)))
                n += 1
                total += 1
            except Exception as e:
                print(f"  ! {name} img-{n + 1}: {e}")
        # supprime d'éventuelles vignettes résiduelles au-delà de n
        for k in range(n + 1, MAX + 2):
            old = OUT / f"{s}-{k}.jpg"
            if old.exists():
                old.unlink()
        print(f"{'✓' if n else '✗'} {name}  ({n} images, -1 réécrite)")
    print(f"\nTerminé : {total} images (galeries complètes corrigées).")


if __name__ == "__main__":
    main()
