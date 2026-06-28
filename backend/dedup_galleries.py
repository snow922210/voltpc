# -*- coding: utf-8 -*-
"""Détecte (et supprime, avec --apply) les images de galerie quasi identiques.

Problème : pour certains produits, les fichiers `<slug>-1.jpg … -N.jpg` sont la
MÊME photo à un zoom différent (fond blanc, objet plus ou moins gros). On veut
n'en garder qu'une.

Méthode robuste au zoom :
  1. rogner le fond ~blanc (bbox du contenu) → annule l'effet « dézoomé » ;
  2. normaliser (gris, carré 32×32) puis calculer un dHash 64 bits ;
  3. dans chaque groupe (même slug), supprimer les images dont le hash est à une
     distance de Hamming ≤ SEUIL d'une image déjà gardée (on garde la 1re, c.-à-d.
     l'image principale -1, puis par ordre croissant).

Par défaut : DRY-RUN (n'efface rien, affiche ce qui serait supprimé).
Avec --apply : supprime réellement les fichiers doublons.
"""
from __future__ import annotations

import re
import sys
from collections import defaultdict
from pathlib import Path

from PIL import Image, ImageChops

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

IMAGES_DIR = Path(__file__).resolve().parents[1] / "frontend" / "images"
THRESHOLD = 200  # distance de Hamming max (hash 1024 bits) pour « même image »
WHITE_CUTOFF = 248  # un pixel ≥ cette valeur sur les 3 canaux est « fond blanc »

_NAME_RE = re.compile(r"^(.*)-(\d+)\.jpg$", re.IGNORECASE)


def content_bbox(im: Image.Image):
    """Boîte englobante du contenu non-blanc (annule les marges/zoom)."""
    rgb = im.convert("RGB")
    bg = Image.new("RGB", rgb.size, (255, 255, 255))
    diff = ImageChops.difference(rgb, bg).convert("L")
    # seuil : tout ce qui s'écarte nettement du blanc compte comme contenu
    mask = diff.point(lambda p: 255 if p > (255 - WHITE_CUTOFF) else 0)
    return mask.getbbox()


def dhash(im: Image.Image, size: int = 32) -> int:
    """dHash : contenu rogné → carré gris → comparaison de pixels adjacents."""
    bbox = content_bbox(im)
    if bbox:
        im = im.crop(bbox)
    small = im.convert("L").resize((size + 1, size), Image.LANCZOS)
    px = small.load()
    bits = 0
    for y in range(size):
        for x in range(size):
            bits = (bits << 1) | (1 if px[x, y] < px[x + 1, y] else 0)
    return bits


def hamming(a: int, b: int) -> int:
    return bin(a ^ b).count("1")


def groups():
    """Regroupe les fichiers galerie par slug → liste triée par numéro."""
    g = defaultdict(list)
    for f in IMAGES_DIR.glob("*.jpg"):
        m = _NAME_RE.match(f.name)
        if m:
            g[m.group(1)].append((int(m.group(2)), f))
    for slug in g:
        g[slug].sort(key=lambda t: t[0])
    return g


def main(apply: bool) -> None:
    to_delete = []
    for slug, items in sorted(groups().items()):
        if len(items) < 2:
            continue
        kept = []  # (num, hash)
        for num, f in items:
            try:
                h = dhash(Image.open(f))
            except Exception as e:
                print(f"  ⚠ illisible {f.name}: {e}")
                continue
            dup_of = next((kn for kn, kh in kept if hamming(h, kh) <= THRESHOLD), None)
            if dup_of is not None:
                to_delete.append((f, slug, dup_of, num))
            else:
                kept.append((num, h))

    by_slug = defaultdict(list)
    for f, slug, dup_of, num in to_delete:
        by_slug[slug].append((num, dup_of))
    for slug in sorted(by_slug):
        pairs = ", ".join(f"-{n}≈-{d}" for n, d in sorted(by_slug[slug]))
        print(f"{slug}: {pairs}")

    print(f"\n{'SUPPRIMÉS' if apply else 'À supprimer (dry-run)'} : "
          f"{len(to_delete)} fichier(s) sur {sum(len(v) for v in groups().values())} dans {len(by_slug)} produit(s)")

    if apply:
        for f, *_ in to_delete:
            f.unlink(missing_ok=True)
        print("Suppression effectuée.")


if __name__ == "__main__":
    main(apply="--apply" in sys.argv)
