# -*- coding: utf-8 -*-
"""Couche d'accès base de données — SQLite (local) ou PostgreSQL (production).

L'application est écrite en SQL « SQLite » (placeholders `?`, `cur.lastrowid`,
`INSERT OR IGNORE`). Lorsque la variable d'environnement DATABASE_URL pointe
vers PostgreSQL, un wrapper léger traduit ces requêtes à la volée :

  • `?`                  → `%s`            (paramètres psycopg)
  • ` LIKE `             → ` ILIKE `       (parité de casse avec SQLite)
  • `INSERT OR IGNORE`   → `INSERT … ON CONFLICT DO NOTHING`
  • INSERT dans une table à `id`          → ajout de `RETURNING id` (émule lastrowid)

Les lignes renvoyées (`Row`) s'utilisent par nom (`row["col"]`) ET par position
(`row[0]`), exactement comme `sqlite3.Row`, et acceptent `dict(row)`.

Sans DATABASE_URL : aucun import de psycopg, comportement SQLite strictement
inchangé (zéro régression sur l'existant).
"""
from __future__ import annotations

import os
import re

DATABASE_URL = os.environ.get("DATABASE_URL", "").strip()
IS_PG = DATABASE_URL.startswith(("postgres://", "postgresql://"))

# Tables dotées d'une clé primaire `id` auto-incrémentée (pour émuler lastrowid).
_ID_TABLES = {"users", "products", "reviews", "orders", "order_items", "addresses"}

# Schéma PostgreSQL complet (toutes les colonnes, y compris celles ajoutées au
# fil des « migrations » SQLite) — une base neuve n'a donc aucun ALTER à jouer.
PG_SCHEMA = [
    """CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        salt TEXT NOT NULL,
        created_at DOUBLE PRECISION NOT NULL,
        email_verified INTEGER NOT NULL DEFAULT 0,
        verif_code_hash TEXT,
        verif_expires DOUBLE PRECISION,
        reset_code_hash TEXT,
        reset_expires DOUBLE PRECISION,
        verif_attempts INTEGER NOT NULL DEFAULT 0,
        reset_attempts INTEGER NOT NULL DEFAULT 0,
        login_attempts INTEGER NOT NULL DEFAULT 0,
        login_lock_until DOUBLE PRECISION
    )""",
    """CREATE TABLE IF NOT EXISTS products (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        brand TEXT NOT NULL,
        category TEXT NOT NULL,
        price DOUBLE PRECISION NOT NULL,
        old_price DOUBLE PRECISION,
        stock INTEGER NOT NULL DEFAULT 0,
        rating DOUBLE PRECISION NOT NULL DEFAULT 0,
        rating_count INTEGER NOT NULL DEFAULT 0,
        featured INTEGER NOT NULL DEFAULT 0,
        badge TEXT,
        description TEXT NOT NULL,
        specs TEXT NOT NULL,
        image_url TEXT
    )""",
    """CREATE TABLE IF NOT EXISTS reviews (
        id SERIAL PRIMARY KEY,
        product_id INTEGER NOT NULL REFERENCES products(id),
        author TEXT NOT NULL,
        rating INTEGER NOT NULL,
        comment TEXT NOT NULL,
        created_at DOUBLE PRECISION NOT NULL,
        user_id INTEGER,
        verified INTEGER NOT NULL DEFAULT 0,
        updated_at DOUBLE PRECISION
    )""",
    """CREATE TABLE IF NOT EXISTS orders (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id),
        subtotal DOUBLE PRECISION NOT NULL,
        discount DOUBLE PRECISION NOT NULL,
        shipping DOUBLE PRECISION NOT NULL,
        total DOUBLE PRECISION NOT NULL,
        promo_code TEXT,
        ship_name TEXT NOT NULL,
        ship_address TEXT NOT NULL,
        ship_city TEXT NOT NULL,
        ship_zip TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'confirmée',
        created_at DOUBLE PRECISION NOT NULL,
        stripe_session_id TEXT,
        paid_at DOUBLE PRECISION,
        tracking_number TEXT,
        carrier TEXT,
        stock_reserved INTEGER NOT NULL DEFAULT 0,
        stock_restored INTEGER NOT NULL DEFAULT 0,
        checkout_return_token TEXT,
        user_seq INTEGER
    )""",
    """CREATE TABLE IF NOT EXISTS order_items (
        id SERIAL PRIMARY KEY,
        order_id INTEGER NOT NULL REFERENCES orders(id),
        product_id INTEGER NOT NULL REFERENCES products(id),
        product_name TEXT NOT NULL,
        unit_price DOUBLE PRECISION NOT NULL,
        quantity INTEGER NOT NULL
    )""",
    """CREATE TABLE IF NOT EXISTS addresses (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id),
        label TEXT,
        ship_name TEXT NOT NULL,
        ship_address TEXT NOT NULL,
        ship_city TEXT NOT NULL,
        ship_zip TEXT NOT NULL,
        is_default INTEGER NOT NULL DEFAULT 0,
        created_at DOUBLE PRECISION NOT NULL
    )""",
    """CREATE TABLE IF NOT EXISTS favorites (
        user_id INTEGER NOT NULL REFERENCES users(id),
        product_id INTEGER NOT NULL REFERENCES products(id),
        created_at DOUBLE PRECISION NOT NULL,
        PRIMARY KEY (user_id, product_id)
    )""",
    """CREATE TABLE IF NOT EXISTS cart_items (
        user_id INTEGER NOT NULL REFERENCES users(id),
        product_id INTEGER NOT NULL REFERENCES products(id),
        quantity INTEGER NOT NULL,
        PRIMARY KEY (user_id, product_id)
    )""",
]


class Row(dict):
    """Ligne accessible par nom (row["x"]) ET par position (row[0]), comme sqlite3.Row."""
    __slots__ = ()

    def __getitem__(self, key):
        if isinstance(key, int):
            return list(self.values())[key]
        return super().__getitem__(key)


def translate(sql: str):
    """Traduit une requête SQLite vers PostgreSQL.

    Renvoie (sql_traduit, returning) où `returning` indique qu'un `RETURNING id`
    a été ajouté (→ il faudra lire l'id pour alimenter lastrowid).
    """
    s = sql
    returning = False
    if re.match(r"\s*INSERT\s+OR\s+IGNORE", s, re.I):
        s = re.sub(r"INSERT\s+OR\s+IGNORE", "INSERT", s, count=1, flags=re.I)
        s = s.rstrip().rstrip(";") + " ON CONFLICT DO NOTHING"
    m = re.match(r"\s*INSERT\s+INTO\s+([A-Za-z_][A-Za-z0-9_]*)", s, re.I)
    if (m and m.group(1).lower() in _ID_TABLES
            and "RETURNING" not in s.upper() and "ON CONFLICT" not in s.upper()):
        s = s.rstrip().rstrip(";") + " RETURNING id"
        returning = True
    s = re.sub(r"\bLIKE\b", "ILIKE", s)
    s = s.replace("?", "%s")
    return s, returning


if IS_PG:
    import psycopg
    from psycopg_pool import ConnectionPool

    _POOL_MIN = int(os.environ.get("DB_POOL_MIN", "1"))
    _POOL_MAX = int(os.environ.get("DB_POOL_MAX", "5"))
    _PG_POOL = ConnectionPool(
        conninfo=DATABASE_URL,
        min_size=_POOL_MIN,
        max_size=_POOL_MAX,
        timeout=float(os.environ.get("DB_POOL_TIMEOUT", "10")),
        max_idle=float(os.environ.get("DB_POOL_MAX_IDLE", "300")),
        max_lifetime=float(os.environ.get("DB_POOL_MAX_LIFETIME", "1800")),
        open=True,
    )

    def _pg_row_factory(cursor):
        cols = [c.name for c in cursor.description] if cursor.description else []

        def make(values):
            return Row(zip(cols, values))

        return make

    class _Result:
        """Résultat d'une requête : itérable + fetchone/fetchall + lastrowid."""

        def __init__(self, cur, lastrowid=None):
            self._cur = cur
            self.lastrowid = lastrowid

        def __iter__(self):
            return iter(self._cur)

        def fetchone(self):
            return self._cur.fetchone()

        def fetchall(self):
            return self._cur.fetchall()

    class PGConnection:
        """Adaptateur minimal exposant l'API sqlite3 utilisée par l'application."""

        def __init__(self, conn, pool=None):
            self._conn = conn
            self._pool = pool

        def execute(self, sql, params=()):
            sql2, returning = translate(sql)
            cur = self._conn.cursor(row_factory=_pg_row_factory)
            cur.execute(sql2, tuple(params))
            last = None
            if returning:
                try:
                    row = cur.fetchone()
                    last = row[0] if row else None
                except Exception:
                    last = None
            return _Result(cur, last)

        def executemany(self, sql, seq):
            sql2, _ = translate(sql)
            cur = self._conn.cursor()
            cur.executemany(sql2, [tuple(p) for p in seq])
            return _Result(cur)

        def commit(self):
            self._conn.commit()

        def rollback(self):
            self._conn.rollback()

        def close(self):
            if self._pool is not None:
                self._pool.putconn(self._conn)
            else:
                self._conn.close()

    def connect():
        """Ouvre une connexion PostgreSQL enveloppée."""
        return PGConnection(_PG_POOL.getconn(), _PG_POOL)

else:  # pragma: no cover - chemin SQLite (défaut)
    def connect():
        raise RuntimeError("connect() PostgreSQL appelé sans DATABASE_URL Postgres")
