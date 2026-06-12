# -*- coding: utf-8 -*-
"""Renomme tous les produits de la base au format :
   "<Catégorie> <nom actuel> <marque>"

Exemple : "24MP400 24\" IPS 75 Hz" (LG, monitor) ->
          "Écran 24MP400 24\" IPS 75 Hz LG"

Idempotent : si le nom commence déjà par le libellé de catégorie,
le produit est ignoré (évite les doubles préfixes en cas de réexécution).

Usage :  python rename_products.py
"""
import sqlite3
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

DB_PATH = Path(__file__).resolve().parent.parent / "voltpc.db"

CATEGORY_LABELS = {
    "gpu": "Carte graphique",
    "cpu": "Processeur",
    "case": "Boîtier",
    "ram": "Mémoire RAM",
    "storage": "Stockage",
    "psu": "Alimentation",
    "cooling": "Refroidissement",
    "monitor": "Écran",
}

conn = sqlite3.connect(DB_PATH)
rows = conn.execute("SELECT id, name, brand, category FROM products").fetchall()

updated = 0
skipped = 0
unknown_categories = set()

for product_id, name, brand, category in rows:
    label = CATEGORY_LABELS.get(category)
    if not label:
        unknown_categories.add(category)
        continue

    # Déjà renommé ?
    if name.startswith(label + " "):
        skipped += 1
        continue

    new_name = f"{label} {name} {brand}".strip()

    conn.execute("UPDATE products SET name = ? WHERE id = ?", (new_name, product_id))
    updated += 1
    print(f"#{product_id}: {name!r} -> {new_name!r}")

conn.commit()
conn.close()

print(f"\n{updated} produits renommés, {skipped} déjà au bon format.")
if unknown_categories:
    print(f"Catégories non mappées (ignorées) : {sorted(unknown_categories)}")
