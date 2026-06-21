# -*- coding: utf-8 -*-
"""Resynchronise la base sur le catalogue de seed.py, SANS perdre les
comptes ni les commandes.

Pour chaque produit (comparaison par NOM) :
  • présent dans seed + en base   -> mise à jour des champs (l'id est conservé,
    donc commandes/favoris/panier restent valides) ; rating conservé.
  • présent dans seed, absent      -> insertion.
  • en base mais absent de seed    -> suppression s'il n'est lié à aucune
    commande / favori / panier ; sinon laissé mais mis en rupture (stock 0).

Les avis de seed sont ajoutés uniquement aux produits qui n'en ont aucun
(évite les doublons sur plusieurs exécutions).

Fonctionne en local (SQLite) ET en production (PostgreSQL / Neon) : la
connexion suit la même logique que main.py (DATABASE_URL -> Postgres).

Usage :  python resync_catalog.py
"""
import json
import sqlite3
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

from seed import SEED_PRODUCTS, SEED_REVIEWS
from database import IS_PG, connect as db_connect

try:
    from product_images import PRODUCT_IMAGES  # {nom: "/images/<slug>.jpg"}
except Exception:
    PRODUCT_IMAGES = {}

DB_PATH = Path(__file__).resolve().parent / "voltpc.db"


def open_conn():
    if IS_PG:
        return db_connect()
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def main():
    conn = open_conn()
    target = "PostgreSQL" if IS_PG else f"SQLite ({DB_PATH.name})"
    print(f"Base cible : {target}\n")

    seed_by_name = {p["name"]: p for p in SEED_PRODUCTS}

    # id -> name des produits actuellement en base
    existing = {row[1]: row[0] for row in
                conn.execute("SELECT id, name FROM products")}  # {name: id}

    # Produits référencés par une COMMANDE : à ne jamais supprimer (historique
    # + contrainte FK). Les favoris / paniers / avis, eux, sont nettoyables.
    referenced = set()
    try:
        for row in conn.execute("SELECT DISTINCT product_id FROM order_items"):
            referenced.add(row[0])
    except Exception:
        pass  # table absente -> ignorée

    inserted = updated = deleted = retired = 0

    # 1) Insertion / mise à jour
    for name, p in seed_by_name.items():
        specs = json.dumps(p["specs"], ensure_ascii=False)
        img = PRODUCT_IMAGES.get(name)
        if name in existing:
            conn.execute(
                """UPDATE products SET brand=?, category=?, price=?, old_price=?,
                   stock=?, featured=?, badge=?, description=?, specs=? WHERE name=?""",
                (p["brand"], p["category"], p["price"], p["old_price"], p["stock"],
                 int(p["featured"]), p["badge"], p["description"], specs, name),
            )
            # N'écrase l'image que si on en a une (préserve une URL définie en admin).
            if img:
                conn.execute("UPDATE products SET image_url=? WHERE name=?", (img, name))
            updated += 1
        else:
            conn.execute(
                """INSERT INTO products
                   (name, brand, category, price, old_price, stock, rating,
                    rating_count, featured, badge, description, specs, image_url)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                (name, p["brand"], p["category"], p["price"], p["old_price"],
                 p["stock"], p["rating"], 0, int(p["featured"]), p["badge"],
                 p["description"], specs, img),
            )
            inserted += 1
            print(f"+ {p['brand']} {name} ({p['category']})")

    # 2) Anciens produits absents du catalogue
    for name, pid in existing.items():
        if name in seed_by_name:
            continue
        if pid in referenced:
            conn.execute("UPDATE products SET stock=0 WHERE id=?", (pid,))
            retired += 1
            print(f"~ rupture (lié à une commande) : {name}")
        else:
            # Nettoie d'abord les dépendances (FK) avant de supprimer le produit.
            for table in ("reviews", "favorites", "cart_items"):
                try:
                    conn.execute(f"DELETE FROM {table} WHERE product_id=?", (pid,))
                except Exception:
                    pass
            conn.execute("DELETE FROM products WHERE id=?", (pid,))
            deleted += 1
            print(f"- {name}")

    # 3) Avis : ajoutés uniquement aux produits qui n'avaient AUCUN avis au
    #    départ (fige l'état initial -> permet plusieurs avis par produit neuf
    #    sans en re-créer lors d'une exécution ultérieure).
    reviews_added = 0
    import time
    with_reviews = {row[0] for row in conn.execute("SELECT DISTINCT product_id FROM reviews")}
    for product_name, author, rating, comment in SEED_REVIEWS:
        row = conn.execute("SELECT id FROM products WHERE name=?", (product_name,)).fetchone()
        if not row:
            continue
        pid = row[0]
        if pid in with_reviews:
            continue
        conn.execute(
            "INSERT INTO reviews (product_id, author, rating, comment, created_at) VALUES (?,?,?,?,?)",
            (pid, author, rating, comment, time.time()),
        )
        reviews_added += 1

    # Recalcule les compteurs d'avis
    conn.execute(
        "UPDATE products SET rating_count = "
        "(SELECT COUNT(*) FROM reviews WHERE reviews.product_id = products.id)"
    )

    conn.commit()
    total = conn.execute("SELECT COUNT(*) FROM products").fetchone()[0]
    cats = conn.execute("SELECT COUNT(DISTINCT category) FROM products").fetchone()[0]
    print(
        f"\nResync terminé :"
        f"\n  + {inserted} insérés"
        f"\n  ~ {updated} mis à jour"
        f"\n  - {deleted} supprimés"
        f"\n  ⏸ {retired} mis en rupture (commandés)"
        f"\n  ★ {reviews_added} avis ajoutés"
        f"\n  → {total} produits en base, {cats} catégories"
    )
    conn.close()


if __name__ == "__main__":
    main()
