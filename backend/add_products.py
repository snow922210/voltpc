# -*- coding: utf-8 -*-
"""Insère dans la base les produits de seed.py qui n'y figurent pas
encore (comparaison par nom). N'altère ni les produits existants,
ni les comptes, ni les commandes.

Fonctionne en local (SQLite) ET en production (PostgreSQL / Neon) :
la connexion suit la même logique que main.py — si DATABASE_URL pointe
vers Postgres, l'insertion s'y applique ; sinon on cible voltpc.db.

Usage :  python add_products.py
"""
import json
import sqlite3
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

from seed import SEED_PRODUCTS
from database import IS_PG, connect as db_connect

DB_PATH = Path(__file__).resolve().parent / "voltpc.db"


def open_conn():
    """Ouvre la base, Postgres en prod (DATABASE_URL) ou SQLite en local."""
    if IS_PG:
        return db_connect()
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


conn = open_conn()
target = "PostgreSQL" if IS_PG else f"SQLite ({DB_PATH.name})"
print(f"Base cible : {target}\n")

existing = {row[0] for row in conn.execute("SELECT name FROM products")}

added = 0
for p in SEED_PRODUCTS:
    if p["name"] in existing:
        continue
    conn.execute(
        """INSERT INTO products
           (name, brand, category, price, old_price, stock, rating,
            rating_count, featured, badge, description, specs)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?)""",
        (
            p["name"], p["brand"], p["category"], p["price"],
            p["old_price"], p["stock"], p["rating"], 0,
            int(p["featured"]), p["badge"], p["description"],
            json.dumps(p["specs"], ensure_ascii=False),
        ),
    )
    added += 1
    print(f"+ {p['brand']} {p['name']} ({p['category']})")

conn.commit()
total = conn.execute("SELECT COUNT(*) FROM products").fetchone()[0]
print(f"\n{added} produits ajoutés — total en base : {total}")
conn.close()
