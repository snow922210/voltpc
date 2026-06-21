# -*- coding: utf-8 -*-
"""VOLT PC — API e-commerce de composants PC.

Lancement :  uvicorn main:app --reload  (depuis le dossier backend)
Le frontend est servi automatiquement sur http://127.0.0.1:8000
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import html
import json
import logging
import os
import secrets
import sqlite3
import threading
import time
from contextlib import asynccontextmanager, contextmanager
from pathlib import Path
from typing import Optional

from fastapi import Cookie, Depends, FastAPI, Header, HTTPException, Query, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from database import IS_PG, PG_SCHEMA, connect as db_connect
from invoice import generate_invoice_pdf
from perf import perf_score
from mailer import (
    send_admin_notification,
    send_order_confirmation,
    send_password_reset,
    send_shipping_notification,
    send_verification_code,
)
from seed import PROMO_CODES, SEED_PRODUCTS, SEED_REVIEWS

BASE = Path(__file__).resolve().parent
FRONTEND = BASE.parent / "frontend"
# Données persistantes (base SQLite + secret de signature des jetons). Par défaut
# dans backend/ ; surchargeable via VOLTPC_DATA_DIR pour pointer vers un volume
# monté (Docker) et ainsi survivre aux redéploiements sans masquer le code.
DATA_DIR = Path(os.environ.get("VOLTPC_DATA_DIR") or BASE)
DATA_DIR.mkdir(parents=True, exist_ok=True)
DB_PATH = DATA_DIR / "voltpc.db"
SECRET_PATH = DATA_DIR / ".secret"
PRODUCT_CACHE_TTL = 15.0
_product_cache = {}
_product_cache_lock = threading.Lock()

TOKEN_TTL = 60 * 60 * 24 * 7  # 7 jours
FREE_SHIPPING_FROM = 50.0
SHIPPING_FEE = 5.99

# Anti-bruteforce
MAX_CODE_ATTEMPTS = 5          # essais max sur un code (vérif / reset) avant invalidation
MAX_LOGIN_ATTEMPTS = 5         # échecs de mot de passe avant verrouillage temporaire
LOGIN_LOCK_SECONDS = 15 * 60   # durée du verrouillage du compte après trop d'échecs

# ─── Journalisation (logs clairs pour le suivi des paiements) ────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s — %(message)s",
)
log = logging.getLogger("voltpc")


def load_env() -> None:
    """Charge backend/.env dans os.environ (sans dépendance externe).

    On utilise setdefault : une vraie variable d'environnement définie par
    le système (ex. en production) a toujours la priorité sur le fichier.
    """
    env_path = BASE / ".env"
    if not env_path.exists():
        return
    for raw in env_path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, val = line.partition("=")
        os.environ.setdefault(key.strip(), val.strip().strip('"').strip("'"))

# ─── Base de données ─────────────────────────────────────────────────


@contextmanager
def db():
    # PostgreSQL si DATABASE_URL est défini (production), sinon SQLite (local).
    if IS_PG:
        conn = db_connect()
    else:
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
    try:
        yield conn
        conn.commit()
    except Exception:
        try:
            conn.rollback()
        except Exception:
            pass
        raise
    finally:
        conn.close()


def init_db() -> None:
    # PostgreSQL : schéma complet créé en une fois, puis seeding partagé.
    if IS_PG:
        _init_db_pg()
        return
    with db() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT UNIQUE NOT NULL,
                name TEXT NOT NULL,
                password_hash TEXT NOT NULL,
                salt TEXT NOT NULL,
                created_at REAL NOT NULL
            );
            CREATE TABLE IF NOT EXISTS products (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                brand TEXT NOT NULL,
                category TEXT NOT NULL,
                price REAL NOT NULL,
                old_price REAL,
                stock INTEGER NOT NULL DEFAULT 0,
                rating REAL NOT NULL DEFAULT 0,
                rating_count INTEGER NOT NULL DEFAULT 0,
                featured INTEGER NOT NULL DEFAULT 0,
                badge TEXT,
                description TEXT NOT NULL,
                specs TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS reviews (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                product_id INTEGER NOT NULL REFERENCES products(id),
                author TEXT NOT NULL,
                rating INTEGER NOT NULL,
                comment TEXT NOT NULL,
                created_at REAL NOT NULL
            );
            CREATE TABLE IF NOT EXISTS orders (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL REFERENCES users(id),
                subtotal REAL NOT NULL,
                discount REAL NOT NULL,
                shipping REAL NOT NULL,
                total REAL NOT NULL,
                promo_code TEXT,
                ship_name TEXT NOT NULL,
                ship_address TEXT NOT NULL,
                ship_city TEXT NOT NULL,
                ship_zip TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'confirmée',
                created_at REAL NOT NULL
            );
            CREATE TABLE IF NOT EXISTS order_items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                order_id INTEGER NOT NULL REFERENCES orders(id),
                product_id INTEGER NOT NULL REFERENCES products(id),
                product_name TEXT NOT NULL,
                unit_price REAL NOT NULL,
                quantity INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS addresses (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL REFERENCES users(id),
                label TEXT,
                ship_name TEXT NOT NULL,
                ship_address TEXT NOT NULL,
                ship_city TEXT NOT NULL,
                ship_zip TEXT NOT NULL,
                is_default INTEGER NOT NULL DEFAULT 0,
                created_at REAL NOT NULL
            );
            CREATE TABLE IF NOT EXISTS favorites (
                user_id INTEGER NOT NULL REFERENCES users(id),
                product_id INTEGER NOT NULL REFERENCES products(id),
                created_at REAL NOT NULL,
                PRIMARY KEY (user_id, product_id)
            );
            CREATE TABLE IF NOT EXISTS cart_items (
                user_id INTEGER NOT NULL REFERENCES users(id),
                product_id INTEGER NOT NULL REFERENCES products(id),
                quantity INTEGER NOT NULL,
                PRIMARY KEY (user_id, product_id)
            );
            """
        )
        # ─ Migration : colonnes ajoutées pour le suivi des paiements Stripe ─
        # (idempotent : on n'ajoute la colonne que si elle n'existe pas déjà)
        order_cols = {r["name"] for r in conn.execute("PRAGMA table_info(orders)")}
        if "stripe_session_id" not in order_cols:
            conn.execute("ALTER TABLE orders ADD COLUMN stripe_session_id TEXT")
        if "paid_at" not in order_cols:
            conn.execute("ALTER TABLE orders ADD COLUMN paid_at REAL")
        # ─ Migration : suivi de commande (n° de suivi + transporteur) ─
        if "tracking_number" not in order_cols:
            conn.execute("ALTER TABLE orders ADD COLUMN tracking_number TEXT")
        if "carrier" not in order_cols:
            conn.execute("ALTER TABLE orders ADD COLUMN carrier TEXT")
        # ─ Migration : réservation du stock dès la création de la commande ─
        # (anti-survente : le stock est décrémenté à la création « en attente »
        #  puis restitué si la commande est annulée ou expire sans paiement).
        if "stock_reserved" not in order_cols:
            conn.execute("ALTER TABLE orders ADD COLUMN stock_reserved INTEGER NOT NULL DEFAULT 0")
        if "stock_restored" not in order_cols:
            conn.execute("ALTER TABLE orders ADD COLUMN stock_restored INTEGER NOT NULL DEFAULT 0")
        if "checkout_return_token" not in order_cols:
            conn.execute("ALTER TABLE orders ADD COLUMN checkout_return_token TEXT")
        # ─ Migration : URL d'image personnalisée par produit ─
        product_cols = {r["name"] for r in conn.execute("PRAGMA table_info(products)")}
        if "image_url" not in product_cols:
            conn.execute("ALTER TABLE products ADD COLUMN image_url TEXT")
        # ─ Migration : vérification d'email à l'inscription ─
        user_cols = {r["name"] for r in conn.execute("PRAGMA table_info(users)")}
        if "email_verified" not in user_cols:
            conn.execute("ALTER TABLE users ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 0")
            # Les comptes DÉJÀ existants sont considérés vérifiés (pas de blocage
            # rétroactif). Seules les nouvelles inscriptions devront se vérifier.
            conn.execute("UPDATE users SET email_verified = 1")
        if "verif_code_hash" not in user_cols:
            conn.execute("ALTER TABLE users ADD COLUMN verif_code_hash TEXT")
        if "verif_expires" not in user_cols:
            conn.execute("ALTER TABLE users ADD COLUMN verif_expires REAL")
        # ─ Migration : réinitialisation du mot de passe (code à usage unique) ─
        if "reset_code_hash" not in user_cols:
            conn.execute("ALTER TABLE users ADD COLUMN reset_code_hash TEXT")
        if "reset_expires" not in user_cols:
            conn.execute("ALTER TABLE users ADD COLUMN reset_expires REAL")
        # ─ Migration : compteurs anti-bruteforce (codes + connexion) ─
        if "verif_attempts" not in user_cols:
            conn.execute("ALTER TABLE users ADD COLUMN verif_attempts INTEGER NOT NULL DEFAULT 0")
        if "reset_attempts" not in user_cols:
            conn.execute("ALTER TABLE users ADD COLUMN reset_attempts INTEGER NOT NULL DEFAULT 0")
        if "login_attempts" not in user_cols:
            conn.execute("ALTER TABLE users ADD COLUMN login_attempts INTEGER NOT NULL DEFAULT 0")
        if "login_lock_until" not in user_cols:
            conn.execute("ALTER TABLE users ADD COLUMN login_lock_until REAL")
        # ─ Migration : avis enrichis (auteur lié au compte, achat vérifié) ─
        review_cols = {r["name"] for r in conn.execute("PRAGMA table_info(reviews)")}
        if "user_id" not in review_cols:
            conn.execute("ALTER TABLE reviews ADD COLUMN user_id INTEGER")
        if "verified" not in review_cols:
            conn.execute("ALTER TABLE reviews ADD COLUMN verified INTEGER NOT NULL DEFAULT 0")
        if "updated_at" not in review_cols:
            conn.execute("ALTER TABLE reviews ADD COLUMN updated_at REAL")
        _seed_db(conn)


def _init_db_pg() -> None:
    """Création du schéma PostgreSQL (toutes colonnes) puis seeding partagé."""
    with db() as conn:
        for stmt in PG_SCHEMA:
            conn.execute(stmt)
        conn.execute("ALTER TABLE orders ADD COLUMN IF NOT EXISTS checkout_return_token TEXT")
        _seed_db(conn)


def _seed_db(conn) -> None:
    """Insertion initiale (produits, avis, compte démo). Portable SQLite / PostgreSQL."""
    if conn.execute("SELECT COUNT(*) FROM products").fetchone()[0] == 0:
        for p in SEED_PRODUCTS:
            conn.execute(
                """INSERT INTO products
                   (name, brand, category, price, old_price, stock, rating,
                    rating_count, featured, badge, description, specs)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?,?)""",
                (
                    p["name"], p["brand"], p["category"], p["price"],
                    p["old_price"], p["stock"], p["rating"], 0,
                    1 if p["featured"] else 0, p["badge"],
                    p["description"], json.dumps(p["specs"], ensure_ascii=False),
                ),
            )
        for product_name, author, rating, comment in SEED_REVIEWS:
            row = conn.execute(
                "SELECT id FROM products WHERE name = ?", (product_name,)
            ).fetchone()
            if row:
                conn.execute(
                    "INSERT INTO reviews (product_id, author, rating, comment, created_at)"
                    " VALUES (?,?,?,?,?)",
                    (row["id"], author, rating, comment, time.time()),
                )
        conn.execute(
            "UPDATE products SET rating_count ="
            " (SELECT COUNT(*) FROM reviews WHERE reviews.product_id = products.id)"
        )
    if conn.execute("SELECT 1 FROM users WHERE email = 'demo@voltpc.fr'").fetchone() is None:
        salt = secrets.token_bytes(16)
        conn.execute(
            "INSERT INTO users (email, name, password_hash, salt, created_at, email_verified)"
            " VALUES (?,?,?,?,?,1)",
            ("demo@voltpc.fr", "Client Démo",
             hash_password("demo1234", salt), salt.hex(), time.time()),
        )


# ─── Sécurité ────────────────────────────────────────────────────────


def get_secret() -> bytes:
    # Priorité à VOLTPC_SECRET (variable d'env) : indispensable sur un hébergement
    # au disque éphémère (ex. Render gratuit) pour que la clé de signature — donc
    # les sessions — reste stable entre les redémarrages. On en dérive 32 octets.
    env = os.environ.get("VOLTPC_SECRET")
    if env:
        return hashlib.sha256(env.encode()).digest()
    if SECRET_PATH.exists():
        return SECRET_PATH.read_bytes()
    secret = secrets.token_bytes(32)
    SECRET_PATH.write_bytes(secret)
    return secret


SECRET = None  # initialisé au démarrage


def hash_password(password: str, salt: bytes) -> str:
    return hashlib.scrypt(password.encode(), salt=salt, n=2**14, r=8, p=1).hex()


def make_token(user_id: int) -> str:
    payload = f"{user_id}:{int(time.time()) + TOKEN_TTL}".encode()
    sig = hmac.new(SECRET, payload, hashlib.sha256).hexdigest()
    return base64.urlsafe_b64encode(payload).decode() + "." + sig


def parse_token(token: str) -> Optional[int]:
    try:
        payload_b64, sig = token.split(".")
        payload = base64.urlsafe_b64decode(payload_b64.encode())
        expected = hmac.new(SECRET, payload, hashlib.sha256).hexdigest()
        if not hmac.compare_digest(sig, expected):
            return None
        user_id, expiry = payload.decode().split(":")
        if int(expiry) < time.time():
            return None
        return int(user_id)
    except Exception:
        return None


# ─── Session par cookie HttpOnly ─────────────────────────────────────
# Le jeton de session est posé dans un cookie HttpOnly : inaccessible au
# JavaScript, il échappe au vol par injection (XSS) — contrairement à un
# stockage localStorage. SameSite=Lax bloque l'envoi en contexte cross-site
# (anti-CSRF). Secure (cookie envoyé uniquement en HTTPS) est activé en prod
# via le même signal qu'HSTS ; désactivé en dev HTTP local sinon le navigateur
# n'enverrait jamais le cookie.
SESSION_COOKIE = "volt_session"


def _cookie_secure() -> bool:
    return bool(os.environ.get("ENABLE_HSTS"))


def set_session_cookie(resp: Response, token: str) -> None:
    resp.set_cookie(
        key=SESSION_COOKIE,
        value=token,
        max_age=TOKEN_TTL,
        httponly=True,
        samesite="lax",
        secure=_cookie_secure(),
        path="/",
    )


def clear_session_cookie(resp: Response) -> None:
    resp.delete_cookie(SESSION_COOKIE, path="/")


# ─── Rate-limiting (en mémoire, par IP) ──────────────────────────────
# Fenêtre glissante simple, suffisante pour un seul worker. Pour plusieurs
# workers/instances, déporter ce compteur dans Redis.
_rate_lock = threading.Lock()
_rate_hits: dict[str, list[float]] = {}


def _client_ip(request: Request) -> str:
    """IP du client, en tenant compte d'un éventuel reverse proxy."""
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _rate_limit(request: Request, bucket: str, max_hits: int, window: float) -> None:
    """Lève 429 si l'IP dépasse `max_hits` requêtes sur `window` secondes."""
    ip = _client_ip(request)
    key = f"{bucket}:{ip}"
    now = time.time()
    with _rate_lock:
        hits = [t for t in _rate_hits.get(key, []) if now - t < window]
        if len(hits) >= max_hits:
            retry = int(window - (now - hits[0])) + 1
            raise HTTPException(
                429, f"Trop de tentatives, réessayez dans {retry} s.",
                headers={"Retry-After": str(retry)},
            )
        hits.append(now)
        _rate_hits[key] = hits
        # Nettoyage opportuniste des clés vides (évite la croissance mémoire).
        if len(_rate_hits) > 4096:
            for k in [k for k, v in _rate_hits.items() if not v]:
                _rate_hits.pop(k, None)


def rl_login(request: Request) -> None:
    """Connexion : 10 tentatives / minute / IP (en plus du verrouillage de compte)."""
    _rate_limit(request, "login", 10, 60)


def rl_register(request: Request) -> None:
    """Inscription : 5 / 10 min / IP (limite la création de comptes en masse)."""
    _rate_limit(request, "register", 5, 600)


def rl_code(request: Request) -> None:
    """Envoi d'un code par email (resend / forgot) : 5 / 10 min / IP (anti-spam)."""
    _rate_limit(request, "code", 5, 600)


def rl_verify(request: Request) -> None:
    """Vérification d'un code : 15 / 5 min / IP (laisse de la marge aux fautes de frappe)."""
    _rate_limit(request, "verify", 15, 300)


# ─── Vérification d'email (code à usage unique) ──────────────────────

VERIF_TTL = 15 * 60  # le code de vérification est valable 15 minutes


def gen_verification_code() -> str:
    """Code numérique à 6 chiffres, tiré de façon cryptographiquement sûre."""
    return f"{secrets.randbelow(1_000_000):06d}"


def hash_code(code: str) -> str:
    """On ne stocke jamais le code en clair : seulement son HMAC."""
    return hmac.new(SECRET, code.encode(), hashlib.sha256).hexdigest()


def issue_verification_code(conn: sqlite3.Connection, user_id: int) -> str:
    """Génère un nouveau code, stocke son hash + expiration, renvoie le code clair."""
    code = gen_verification_code()
    conn.execute(
        "UPDATE users SET verif_code_hash = ?, verif_expires = ?, verif_attempts = 0 WHERE id = ?",
        (hash_code(code), time.time() + VERIF_TTL, user_id),
    )
    return code


def current_user(
    authorization: str = Header(default=""),
    volt_session: str = Cookie(default=""),
) -> sqlite3.Row:
    # Priorité à l'en-tête Authorization (clients API, rétro-compatibilité),
    # sinon repli sur le cookie de session HttpOnly (navigateur).
    if authorization.startswith("Bearer "):
        token = authorization[7:]
    elif volt_session:
        token = volt_session
    else:
        raise HTTPException(401, "Authentification requise")
    user_id = parse_token(token)
    if user_id is None:
        raise HTTPException(401, "Session expirée, reconnectez-vous")
    with db() as conn:
        user = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    if user is None:
        raise HTTPException(401, "Compte introuvable")
    return user


# ─── Administration ──────────────────────────────────────────────────
# Les comptes administrateurs sont désignés par leur e-mail via la variable
# d'environnement ADMIN_EMAILS (liste séparée par des virgules, dans .env).
# Aucun rôle stocké en base : il suffit d'ajouter/retirer un e-mail.

def admin_emails() -> set[str]:
    raw = os.environ.get("ADMIN_EMAILS", "")
    return {e.strip().lower() for e in raw.split(",") if e.strip()}


def is_admin_email(email: str) -> bool:
    return email.strip().lower() in admin_emails()


def current_admin(user: sqlite3.Row = Depends(current_user)) -> sqlite3.Row:
    """Dépendance : exige un utilisateur connecté ET administrateur."""
    if not is_admin_email(user["email"]):
        raise HTTPException(403, "Accès réservé à l'administrateur")
    return user


# ─── Schémas ─────────────────────────────────────────────────────────


class RegisterIn(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    email: str = Field(min_length=5, max_length=120)
    password: str = Field(min_length=8, max_length=128)


class VerifyIn(BaseModel):
    email: str
    code: str = Field(min_length=4, max_length=8)


class ResendIn(BaseModel):
    email: str


class LoginIn(BaseModel):
    email: str
    password: str


class ReviewIn(BaseModel):
    rating: int = Field(ge=1, le=5)
    comment: str = Field(min_length=3, max_length=2000)


class ForgotPasswordIn(BaseModel):
    email: str


class ResetPasswordIn(BaseModel):
    email: str
    code: str = Field(min_length=4, max_length=8)
    password: str = Field(min_length=8, max_length=128)


class ProfileUpdateIn(BaseModel):
    name: str = Field(min_length=2, max_length=80)


class ChangePasswordIn(BaseModel):
    current_password: str = Field(min_length=1, max_length=128)
    new_password: str = Field(min_length=8, max_length=128)


class AddressIn(BaseModel):
    label: Optional[str] = Field(default=None, max_length=60)
    ship_name: str = Field(min_length=2, max_length=120)
    ship_address: str = Field(min_length=4, max_length=200)
    ship_city: str = Field(min_length=2, max_length=80)
    ship_zip: str = Field(min_length=4, max_length=12)
    is_default: bool = False


class CartItemIn(BaseModel):
    product_id: int
    quantity: int = Field(ge=1, le=99)


class CartIn(BaseModel):
    items: list[CartItemIn] = Field(default_factory=list)


class OrderItemIn(BaseModel):
    product_id: int
    quantity: int = Field(ge=1, le=99)


class OrderIn(BaseModel):
    items: list[OrderItemIn] = Field(min_length=1)
    promo_code: Optional[str] = None
    ship_name: str = Field(min_length=2, max_length=120)
    ship_address: str = Field(min_length=4, max_length=200)
    ship_city: str = Field(min_length=2, max_length=80)
    ship_zip: str = Field(min_length=4, max_length=12)
    save_address: bool = False


class PromoIn(BaseModel):
    code: str


# Statuts de suivi qu'un administrateur peut appliquer (workflow post-paiement).
ORDER_STATUSES = ["payée", "préparée", "expédiée", "livrée", "annulée"]


class OrderStatusIn(BaseModel):
    status: str
    tracking_number: Optional[str] = Field(default=None, max_length=80)
    carrier: Optional[str] = Field(default=None, max_length=60)


class ProductUpdateIn(BaseModel):
    """Mise à jour partielle d'un produit (seuls les champs fournis changent)."""
    name: Optional[str] = Field(default=None, min_length=1, max_length=120)
    brand: Optional[str] = Field(default=None, min_length=1, max_length=60)
    category: Optional[str] = Field(default=None, min_length=1, max_length=40)
    price: Optional[float] = Field(default=None, ge=0)
    old_price: Optional[float] = Field(default=None, ge=0)
    stock: Optional[int] = Field(default=None, ge=0)
    badge: Optional[str] = Field(default=None, max_length=40)
    featured: Optional[bool] = None
    description: Optional[str] = Field(default=None, min_length=1, max_length=4000)
    specs: Optional[dict] = None
    image_url: Optional[str] = Field(default=None, max_length=600)


class ProductCreateIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    brand: str = Field(min_length=1, max_length=60)
    category: str = Field(min_length=1, max_length=40)
    price: float = Field(ge=0)
    stock: int = Field(ge=0)
    description: str = Field(min_length=1, max_length=4000)
    old_price: Optional[float] = Field(default=None, ge=0)
    badge: Optional[str] = Field(default=None, max_length=40)
    featured: bool = False
    specs: dict = Field(default_factory=dict)
    image_url: Optional[str] = Field(default=None, max_length=600)


# ─── Application ─────────────────────────────────────────────────────

# Charge .env dès l'import : la config CORS ci-dessous doit en disposer
# (le middleware est ajouté à l'import, avant l'événement startup).
load_env()

@asynccontextmanager
async def lifespan(app: FastAPI):
    startup()
    yield


app = FastAPI(title="VoltCore API", version="1.0.0", lifespan=lifespan)

# CORS — par défaut permissif (pratique en dev). En PRODUCTION, définir
# CORS_ORIGINS dans .env (origines séparées par des virgules) pour restreindre
# l'API au(x) domaine(s) réel(s).
_cors_env = os.environ.get("CORS_ORIGINS", "*").strip()
_cors_origins = ["*"] if _cors_env == "*" else [o.strip() for o in _cors_env.split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(GZipMiddleware, minimum_size=1024, compresslevel=6)

# En-têtes de sécurité appliqués à TOUTES les réponses (API + frontend statique).
# La CSP autorise les styles/handlers inline (le frontend en utilise) tout en
# verrouillant les sources ; Google Fonts est explicitement autorisé.
_CSP = (
    "default-src 'self'; "
    "img-src 'self' data: https:; "
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
    "font-src 'self' https://fonts.gstatic.com; "
    "script-src 'self' 'unsafe-inline'; "
    "connect-src 'self'; "
    "frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
)


@app.middleware("http")
async def security_headers(request: Request, call_next):
    start = time.perf_counter()
    resp = await call_next(request)
    resp.headers.setdefault("Server-Timing", f"app;dur={(time.perf_counter() - start) * 1000:.1f}")
    resp.headers.setdefault("X-Content-Type-Options", "nosniff")
    resp.headers.setdefault("X-Frame-Options", "DENY")
    resp.headers.setdefault("Referrer-Policy", "no-referrer")
    resp.headers.setdefault("Content-Security-Policy", _CSP)
    # HSTS seulement derrière HTTPS — à activer en prod (ENABLE_HSTS=1 dans .env).
    # Inutile/risqué en local HTTP, donc désactivé par défaut.
    if os.environ.get("ENABLE_HSTS"):
        resp.headers.setdefault("Strict-Transport-Security", "max-age=63072000; includeSubDomains")
    return resp


def startup() -> None:
    global SECRET
    load_env()          # charge les clés Stripe depuis backend/.env
    SECRET = get_secret()
    # Diagnostic explicite du backend de stockage : une base SQLite sur disque
    # éphémère (Render gratuit) PERD les commandes à chaque redémarrage. Ce log
    # permet de vérifier en un coup d'œil que la persistance PostgreSQL est active.
    if IS_PG:
        log.info("Base de données : PostgreSQL (persistant) — commandes conservées.")
    else:
        log.warning(
            "Base de données : SQLite sur %s — NON persistant sur un hébergement "
            "à disque éphémère (les commandes seront perdues au redémarrage). "
            "Définissez DATABASE_URL (PostgreSQL) en production.", DB_PATH,
        )
    init_db()
    # Purge initiale au démarrage, puis périodiquement en arrière-plan.
    purge_expired_orders()
    threading.Thread(target=_purge_loop, daemon=True).start()


def product_out(row: sqlite3.Row) -> dict:
    d = dict(row)
    d["specs"] = json.loads(d["specs"])
    d["featured"] = bool(d["featured"])
    return d


def product_summary_out(row: sqlite3.Row) -> dict:
    d = dict(row)
    d["featured"] = bool(d["featured"])
    return d


def _cache_get(key):
    now = time.time()
    with _product_cache_lock:
        entry = _product_cache.get(key)
        if not entry:
            return None
        if entry["expires_at"] <= now:
            _product_cache.pop(key, None)
            return None
        return entry["value"]


def _cache_set(key, value):
    with _product_cache_lock:
        _product_cache[key] = {"value": value, "expires_at": time.time() + PRODUCT_CACHE_TTL}


def _invalidate_product_cache() -> None:
    with _product_cache_lock:
        _product_cache.clear()


# ─── Catalogue ───────────────────────────────────────────────────────


@app.get("/api/categories")
def list_categories():
    cached = _cache_get(("categories",))
    if cached is not None:
        return cached
    with db() as conn:
        rows = conn.execute(
            "SELECT category, COUNT(*) AS count, MIN(price) AS min_price"
            " FROM products GROUP BY category"
        ).fetchall()
    out = [dict(r) for r in rows]
    _cache_set(("categories",), out)
    return out


@app.get("/api/products")
def list_products(
    category: Optional[str] = None,
    search: Optional[str] = None,
    brand: Optional[str] = None,
    min_price: Optional[float] = None,
    max_price: Optional[float] = None,
    ids: Optional[str] = None,
    compact: bool = False,
    limit: Optional[int] = Query(None, ge=1, le=280),
    sort: str = Query("featured", pattern="^(featured|performance|price_asc|price_desc|rating|name)$"),
):
    cache_key = ("products", category, search, brand, min_price, max_price, ids, compact, limit, sort)
    cached = _cache_get(cache_key)
    if cached is not None:
        return cached
    summary_cols = "id, name, brand, category, price, old_price, stock, rating, rating_count, featured, badge, image_url"
    sql = f"SELECT {'*' if not compact or sort == 'performance' else summary_cols} FROM products WHERE 1=1"
    args: list = []
    id_list = []
    if ids:
        try:
            id_list = [int(x) for x in ids.split(",") if x.strip()]
        except ValueError:
            raise HTTPException(400, "Liste d'identifiants invalide")
        if id_list:
            sql += f" AND id IN ({','.join(['?'] * len(id_list))})"
            args += id_list
    if category:
        sql += " AND category = ?"
        args.append(category)
    if search:
        sql += " AND (name LIKE ? OR brand LIKE ? OR description LIKE ?)"
        like = f"%{search}%"
        args += [like, like, like]
    if brand:
        sql += " AND brand = ?"
        args.append(brand)
    if min_price is not None:
        sql += " AND price >= ?"
        args.append(min_price)
    if max_price is not None:
        sql += " AND price <= ?"
        args.append(max_price)
    # Le tri « performance » se calcule en Python (score dérivé des specs).
    if sort == "performance":
        with db() as conn:
            rows = conn.execute(sql + " ORDER BY featured DESC", args).fetchall()
        out = [product_out(r) for r in rows]
        out.sort(
            key=lambda d: perf_score(d["category"], d["specs"], d["price"], d["name"]),
            reverse=True,
        )
        if limit:
            out = out[:limit]
        if compact:
            out = [{k: v for k, v in p.items() if k != "specs" and k != "description"} for p in out]
        _cache_set(cache_key, out)
        return out

    order = {
        "featured": "featured DESC, rating DESC",
        "price_asc": "price ASC",
        "price_desc": "price DESC",
        "rating": "rating DESC, rating_count DESC",
        "name": "name ASC",
    }[sort]
    sql += f" ORDER BY {order}"
    if limit:
        sql += " LIMIT ?"
        args.append(limit)
    with db() as conn:
        rows = conn.execute(sql, args).fetchall()
    out = [product_summary_out(r) if compact else product_out(r) for r in rows]
    _cache_set(cache_key, out)
    return out


@app.get("/api/products/{product_id}")
def get_product(product_id: int):
    cached = _cache_get(("product", product_id))
    if cached is not None:
        return cached
    with db() as conn:
        row = conn.execute("SELECT * FROM products WHERE id = ?", (product_id,)).fetchone()
    if row is None:
        raise HTTPException(404, "Produit introuvable")
    out = product_out(row)
    _cache_set(("product", product_id), out)
    return out


def _recompute_rating(conn: sqlite3.Connection, product_id: int) -> None:
    """Recalcule la note moyenne + le nombre d'avis d'un produit."""
    agg = conn.execute(
        "SELECT AVG(rating) AS avg, COUNT(*) AS count FROM reviews WHERE product_id = ?",
        (product_id,),
    ).fetchone()
    conn.execute(
        "UPDATE products SET rating = ?, rating_count = ? WHERE id = ?",
        (round(agg["avg"], 1) if agg["avg"] else 0, agg["count"], product_id),
    )
    _invalidate_product_cache()


def _has_purchased(conn: sqlite3.Connection, user_id: int, product_id: int) -> bool:
    """Vrai si l'utilisateur a une commande PAYÉE contenant ce produit."""
    row = conn.execute(
        "SELECT 1 FROM order_items oi JOIN orders o ON o.id = oi.order_id"
        " WHERE o.user_id = ? AND oi.product_id = ?"
        " AND o.status NOT IN ('en attente de paiement', 'annulée') LIMIT 1",
        (user_id, product_id),
    ).fetchone()
    return row is not None


@app.get("/api/products/{product_id}/reviews")
def list_reviews(product_id: int):
    with db() as conn:
        rows = conn.execute(
            "SELECT id, user_id, author, rating, comment, verified, created_at"
            " FROM reviews WHERE product_id = ? ORDER BY verified DESC, created_at DESC",
            (product_id,),
        ).fetchall()
    return [dict(r) for r in rows]


@app.post("/api/products/{product_id}/reviews", status_code=201)
def add_review(product_id: int, body: ReviewIn, user: sqlite3.Row = Depends(current_user)):
    with db() as conn:
        if conn.execute("SELECT 1 FROM products WHERE id = ?", (product_id,)).fetchone() is None:
            raise HTTPException(404, "Produit introuvable")
        # Un seul avis par client et par produit : on modifie plutôt que dupliquer.
        if conn.execute(
            "SELECT 1 FROM reviews WHERE product_id = ? AND user_id = ?",
            (product_id, user["id"]),
        ).fetchone():
            raise HTTPException(409, "Vous avez déjà publié un avis sur ce produit (modifiez-le)")
        verified = 1 if _has_purchased(conn, user["id"], product_id) else 0
        conn.execute(
            "INSERT INTO reviews (product_id, user_id, author, rating, comment, verified, created_at)"
            " VALUES (?,?,?,?,?,?,?)",
            (product_id, user["id"], user["name"], body.rating, body.comment, verified, time.time()),
        )
        _recompute_rating(conn, product_id)
    return {"ok": True, "verified": bool(verified)}


@app.patch("/api/products/{product_id}/reviews")
def update_review(product_id: int, body: ReviewIn, user: sqlite3.Row = Depends(current_user)):
    """Modifie l'avis de l'utilisateur courant sur ce produit."""
    with db() as conn:
        existing = conn.execute(
            "SELECT id FROM reviews WHERE product_id = ? AND user_id = ?",
            (product_id, user["id"]),
        ).fetchone()
        if existing is None:
            raise HTTPException(404, "Aucun avis à modifier")
        conn.execute(
            "UPDATE reviews SET rating = ?, comment = ?, updated_at = ? WHERE id = ?",
            (body.rating, body.comment, time.time(), existing["id"]),
        )
        _recompute_rating(conn, product_id)
    return {"ok": True}


@app.delete("/api/products/{product_id}/reviews")
def delete_review(product_id: int, user: sqlite3.Row = Depends(current_user)):
    """Supprime l'avis de l'utilisateur courant sur ce produit."""
    with db() as conn:
        existing = conn.execute(
            "SELECT id FROM reviews WHERE product_id = ? AND user_id = ?",
            (product_id, user["id"]),
        ).fetchone()
        if existing is None:
            raise HTTPException(404, "Aucun avis à supprimer")
        conn.execute("DELETE FROM reviews WHERE id = ?", (existing["id"],))
        _recompute_rating(conn, product_id)
    return {"ok": True}


# ─── Authentification ────────────────────────────────────────────────


def _auth_payload(user_row_or_id, name=None, email=None) -> dict:
    """Construit la réponse d'authentification (token + profil)."""
    if isinstance(user_row_or_id, int):
        uid, uname, umail = user_row_or_id, name, email
    else:
        uid, uname, umail = user_row_or_id["id"], user_row_or_id["name"], user_row_or_id["email"]
    return {"token": make_token(uid),
            "user": {"id": uid, "name": uname, "email": umail,
                     "is_admin": is_admin_email(umail)}}


def _send_code_bg(send_fn, email: str, name: str, code: str) -> None:
    """Envoie un code (vérification / réinitialisation) en ARRIÈRE-PLAN.

    L'envoi SMTP peut prendre plusieurs secondes (connexion + STARTTLS + login) :
    il ne doit JAMAIS bloquer la réponse HTTP, sous peine de connexions/inscriptions
    très lentes. On le délègue donc à un thread daemon — la réponse est immédiate.
    """
    threading.Thread(target=send_fn, args=(email, name, code), daemon=True).start()


def _dev_show_codes() -> bool:
    """Mode test : renvoyer le code dans la réponse HTTP même si le SMTP a réussi.

    Indispensable pour tester en local avec des adresses non routables (ex. la
    démo `…@voltpc.fr`, domaine sans MX → le mail part puis « bounce ») : le SMTP
    répond OK, donc le repli sur échec ne suffit pas. À n'activer QU'EN DÉV.
    """
    return os.environ.get("DEV_SHOW_CODES", "").strip().lower() in ("1", "true", "yes", "on")


def _with_dev_code(resp: dict, code: str) -> dict:
    """Renvoie le code dans la réponse UNIQUEMENT en mode développement explicite.

    En production, un SMTP/Brevo mal configuré ne doit jamais exposer un code de
    vérification ou de réinitialisation dans le navigateur.
    """
    if _dev_show_codes():
        resp["dev_code"] = code
    return resp


@app.post("/api/auth/register", status_code=201)
def register(body: RegisterIn, _rl: None = Depends(rl_register)):
    email = body.email.strip().lower()
    if "@" not in email or "." not in email.split("@")[-1]:
        raise HTTPException(422, "Adresse e-mail invalide")
    name = body.name.strip()
    salt = secrets.token_bytes(16)
    with db() as conn:
        try:
            cur = conn.execute(
                # email_verified = 0 : compte créé mais NON activé tant que le
                # code reçu par email n'a pas été saisi.
                "INSERT INTO users (email, name, password_hash, salt, created_at, email_verified)"
                " VALUES (?,?,?,?,?,0)",
                (email, name, hash_password(body.password, salt), salt.hex(), time.time()),
            )
        except sqlite3.IntegrityError:
            raise HTTPException(409, "Un compte existe déjà avec cet e-mail")
        user_id = cur.lastrowid
        code = issue_verification_code(conn, user_id)
    _send_code_bg(send_verification_code, email, name, code)
    log.info("Inscription %s — code de vérification (envoi en arrière-plan)", email)
    # Pas de token : le front doit demander la saisie du code.
    return _with_dev_code({"verification_required": True, "email": email}, code)


@app.post("/api/auth/login")
def login(body: LoginIn, response: Response, _rl: None = Depends(rl_login)):
    email = body.email.strip().lower()
    code = None
    with db() as conn:
        user = conn.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
        if user is None:
            raise HTTPException(401, "E-mail ou mot de passe incorrect")
        # Compte verrouillé après trop d'échecs récents ?
        if user["login_lock_until"] and time.time() < user["login_lock_until"]:
            retry = int(user["login_lock_until"] - time.time()) + 1
            raise HTTPException(
                429, f"Compte temporairement verrouillé. Réessayez dans {retry} s.",
                headers={"Retry-After": str(retry)},
            )
        expected = hash_password(body.password, bytes.fromhex(user["salt"]))
        if not hmac.compare_digest(expected, user["password_hash"]):
            attempts = user["login_attempts"] + 1
            if attempts >= MAX_LOGIN_ATTEMPTS:
                lock_until = time.time() + LOGIN_LOCK_SECONDS
                conn.execute(
                    "UPDATE users SET login_attempts = 0, login_lock_until = ? WHERE id = ?",
                    (lock_until, user["id"]))
                conn.commit()
                log.warning("Compte %s verrouillé %d min (≥ %d échecs)",
                            email, LOGIN_LOCK_SECONDS // 60, MAX_LOGIN_ATTEMPTS)
                raise HTTPException(
                    429, f"Trop d'échecs : compte verrouillé {LOGIN_LOCK_SECONDS // 60} minutes.",
                    headers={"Retry-After": str(LOGIN_LOCK_SECONDS)})
            conn.execute("UPDATE users SET login_attempts = ? WHERE id = ?", (attempts, user["id"]))
            conn.commit()
            raise HTTPException(401, "E-mail ou mot de passe incorrect")
        # Succès : on remet à zéro le compteur d'échecs et tout verrou.
        conn.execute(
            "UPDATE users SET login_attempts = 0, login_lock_until = NULL WHERE id = ?",
            (user["id"],))
        # Compte non vérifié : on (re)génère un code et on demande la vérification.
        if not user["email_verified"]:
            code = issue_verification_code(conn, user["id"])

    if not user["email_verified"]:
        _send_code_bg(send_verification_code, email, user["name"], code)
        log.info("Connexion d'un compte non vérifié %s — code en arrière-plan", email)
        return _with_dev_code({"verification_required": True, "email": email}, code)
    payload = _auth_payload(user)
    set_session_cookie(response, payload["token"])
    return payload


@app.post("/api/auth/verify")
def verify_email(body: VerifyIn, response: Response, _rl: None = Depends(rl_verify)):
    """Valide le code reçu par email et active le compte (connexion immédiate).

    Protégé contre le bruteforce : au-delà de MAX_CODE_ATTEMPTS essais erronés, le
    code est invalidé (l'utilisateur doit en redemander un), ce qui rend les
    1 000 000 combinaisons inatteignables dans la fenêtre de validité.
    """
    email = body.email.strip().lower()
    code = body.code.strip()
    with db() as conn:
        user = conn.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
        if user is None:
            raise HTTPException(404, "Compte introuvable")
        if user["email_verified"]:
            raise HTTPException(409, "Compte déjà vérifié, connectez-vous")
        if not user["verif_code_hash"] or not user["verif_expires"]:
            raise HTTPException(400, "Aucun code en attente, demandez-en un nouveau")
        if time.time() > user["verif_expires"]:
            raise HTTPException(400, "Code expiré, demandez-en un nouveau")
        if not hmac.compare_digest(hash_code(code), user["verif_code_hash"]):
            attempts = user["verif_attempts"] + 1
            if attempts >= MAX_CODE_ATTEMPTS:
                conn.execute(
                    "UPDATE users SET verif_code_hash = NULL, verif_expires = NULL,"
                    " verif_attempts = 0 WHERE id = ?", (user["id"],))
                conn.commit()  # persiste l'invalidation malgré l'exception qui suit
                log.warning("Trop d'essais sur le code de vérification de %s — code invalidé", email)
                raise HTTPException(429, "Trop d'essais : ce code est désormais invalide, demandez-en un nouveau.")
            conn.execute("UPDATE users SET verif_attempts = ? WHERE id = ?", (attempts, user["id"]))
            conn.commit()
            raise HTTPException(400, f"Code incorrect — {MAX_CODE_ATTEMPTS - attempts} essai(s) restant(s).")
        conn.execute(
            "UPDATE users SET email_verified = 1, verif_code_hash = NULL,"
            " verif_expires = NULL, verif_attempts = 0 WHERE id = ?",
            (user["id"],),
        )
    log.info("Compte %s vérifié et activé", email)
    payload = _auth_payload(user["id"], user["name"], user["email"])
    set_session_cookie(response, payload["token"])
    return payload


@app.post("/api/auth/resend-code")
def resend_code(body: ResendIn, _rl: None = Depends(rl_code)):
    """Renvoie un nouveau code de vérification. Réponse identique que le compte
    existe ou non (évite de divulguer l'existence d'un email)."""
    email = body.email.strip().lower()
    with db() as conn:
        user = conn.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
        if user and not user["email_verified"]:
            code = issue_verification_code(conn, user["id"])
            _send_code_bg(send_verification_code, email, user["name"], code)
            log.info("Renvoi du code de vérification à %s (arrière-plan)", email)
            return _with_dev_code({"ok": True}, code)
    return {"ok": True}


@app.get("/api/auth/me")
def me(user: sqlite3.Row = Depends(current_user)):
    return {"id": user["id"], "name": user["name"], "email": user["email"],
            "is_admin": is_admin_email(user["email"])}


@app.post("/api/auth/logout")
def logout(response: Response):
    """Efface le cookie de session côté navigateur (déconnexion)."""
    clear_session_cookie(response)
    return {"ok": True}


# ─── Réinitialisation du mot de passe ────────────────────────────────


def issue_reset_code(conn: sqlite3.Connection, user_id: int) -> str:
    """Génère un code de réinitialisation (réutilise le mécanisme de hash + TTL)."""
    code = gen_verification_code()
    conn.execute(
        "UPDATE users SET reset_code_hash = ?, reset_expires = ?, reset_attempts = 0 WHERE id = ?",
        (hash_code(code), time.time() + VERIF_TTL, user_id),
    )
    return code


@app.post("/api/auth/forgot-password")
def forgot_password(body: ForgotPasswordIn, _rl: None = Depends(rl_code)):
    """Envoie un code de réinitialisation. Réponse identique que le compte existe
    ou non (on ne divulgue jamais l'existence d'un email)."""
    email = body.email.strip().lower()
    with db() as conn:
        user = conn.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
        if user:
            code = issue_reset_code(conn, user["id"])
            _send_code_bg(send_password_reset, email, user["name"], code)
            log.info("Code de réinitialisation pour %s (arrière-plan)", email)
            return _with_dev_code({"ok": True}, code)
    return {"ok": True}


@app.post("/api/auth/reset-password")
def reset_password(body: ResetPasswordIn, response: Response, _rl: None = Depends(rl_verify)):
    """Valide le code reçu par email et remplace le mot de passe. Comme pour la
    vérification, le code est invalidé au-delà de MAX_CODE_ATTEMPTS essais."""
    email = body.email.strip().lower()
    code = body.code.strip()
    with db() as conn:
        user = conn.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
        if user is None:
            raise HTTPException(404, "Compte introuvable")
        if not user["reset_code_hash"] or not user["reset_expires"]:
            raise HTTPException(400, "Aucune demande en cours, recommencez")
        if time.time() > user["reset_expires"]:
            raise HTTPException(400, "Code expiré, redemandez-en un")
        if not hmac.compare_digest(hash_code(code), user["reset_code_hash"]):
            attempts = user["reset_attempts"] + 1
            if attempts >= MAX_CODE_ATTEMPTS:
                conn.execute(
                    "UPDATE users SET reset_code_hash = NULL, reset_expires = NULL,"
                    " reset_attempts = 0 WHERE id = ?", (user["id"],))
                conn.commit()
                log.warning("Trop d'essais sur le code de réinitialisation de %s — code invalidé", email)
                raise HTTPException(429, "Trop d'essais : ce code est désormais invalide, redemandez-en un.")
            conn.execute("UPDATE users SET reset_attempts = ? WHERE id = ?", (attempts, user["id"]))
            conn.commit()
            raise HTTPException(400, f"Code incorrect — {MAX_CODE_ATTEMPTS - attempts} essai(s) restant(s).")
        salt = secrets.token_bytes(16)
        conn.execute(
            "UPDATE users SET password_hash = ?, salt = ?, reset_code_hash = NULL,"
            " reset_expires = NULL, reset_attempts = 0, email_verified = 1 WHERE id = ?",
            (hash_password(body.password, salt), salt.hex(), user["id"]),
        )
    log.info("Mot de passe réinitialisé pour %s", email)
    payload = _auth_payload(user["id"], user["name"], user["email"])
    set_session_cookie(response, payload["token"])
    return payload


# ─── Gestion du compte ───────────────────────────────────────────────


@app.patch("/api/auth/profile")
def update_profile(body: ProfileUpdateIn, user: sqlite3.Row = Depends(current_user)):
    """Met à jour le nom affiché du compte."""
    name = body.name.strip()
    with db() as conn:
        conn.execute("UPDATE users SET name = ? WHERE id = ?", (name, user["id"]))
    return {"id": user["id"], "name": name, "email": user["email"],
            "is_admin": is_admin_email(user["email"])}


@app.post("/api/auth/change-password")
def change_password(body: ChangePasswordIn, user: sqlite3.Row = Depends(current_user)):
    """Change le mot de passe après vérification de l'actuel."""
    expected = hash_password(body.current_password, bytes.fromhex(user["salt"]))
    if not hmac.compare_digest(expected, user["password_hash"]):
        raise HTTPException(403, "Mot de passe actuel incorrect")
    salt = secrets.token_bytes(16)
    with db() as conn:
        conn.execute(
            "UPDATE users SET password_hash = ?, salt = ? WHERE id = ?",
            (hash_password(body.new_password, salt), salt.hex(), user["id"]),
        )
    log.info("Mot de passe modifié pour %s", user["email"])
    return {"ok": True}


# ─── Carnet d'adresses ───────────────────────────────────────────────


@app.get("/api/addresses")
def list_addresses(user: sqlite3.Row = Depends(current_user)):
    with db() as conn:
        rows = conn.execute(
            "SELECT * FROM addresses WHERE user_id = ?"
            " ORDER BY is_default DESC, created_at DESC",
            (user["id"],),
        ).fetchall()
    return [dict(r) for r in rows]


@app.post("/api/addresses", status_code=201)
def create_address(body: AddressIn, user: sqlite3.Row = Depends(current_user)):
    with db() as conn:
        # Une seule adresse par défaut : on retire le drapeau des autres.
        if body.is_default:
            conn.execute("UPDATE addresses SET is_default = 0 WHERE user_id = ?", (user["id"],))
        # La première adresse enregistrée devient automatiquement celle par défaut.
        has_any = conn.execute(
            "SELECT 1 FROM addresses WHERE user_id = ? LIMIT 1", (user["id"],)
        ).fetchone()
        is_default = 1 if (body.is_default or not has_any) else 0
        cur = conn.execute(
            "INSERT INTO addresses (user_id, label, ship_name, ship_address,"
            " ship_city, ship_zip, is_default, created_at) VALUES (?,?,?,?,?,?,?,?)",
            (user["id"], (body.label or "").strip() or None, body.ship_name,
             body.ship_address, body.ship_city, body.ship_zip, is_default, time.time()),
        )
        row = conn.execute("SELECT * FROM addresses WHERE id = ?", (cur.lastrowid,)).fetchone()
    return dict(row)


@app.delete("/api/addresses/{address_id}")
def delete_address(address_id: int, user: sqlite3.Row = Depends(current_user)):
    with db() as conn:
        row = conn.execute(
            "SELECT 1 FROM addresses WHERE id = ? AND user_id = ?",
            (address_id, user["id"]),
        ).fetchone()
        if row is None:
            raise HTTPException(404, "Adresse introuvable")
        conn.execute("DELETE FROM addresses WHERE id = ?", (address_id,))
    return {"ok": True}


# ─── Favoris (liste de souhaits) ─────────────────────────────────────


@app.get("/api/favorites")
def list_favorites(user: sqlite3.Row = Depends(current_user)):
    """Renvoie les produits favoris de l'utilisateur (objets produit complets)."""
    with db() as conn:
        rows = conn.execute(
            "SELECT p.* FROM favorites f JOIN products p ON p.id = f.product_id"
            " WHERE f.user_id = ? ORDER BY f.created_at DESC",
            (user["id"],),
        ).fetchall()
    return [product_out(r) for r in rows]


@app.post("/api/favorites/{product_id}", status_code=201)
def add_favorite(product_id: int, user: sqlite3.Row = Depends(current_user)):
    with db() as conn:
        if conn.execute("SELECT 1 FROM products WHERE id = ?", (product_id,)).fetchone() is None:
            raise HTTPException(404, "Produit introuvable")
        conn.execute(
            "INSERT OR IGNORE INTO favorites (user_id, product_id, created_at) VALUES (?,?,?)",
            (user["id"], product_id, time.time()),
        )
    return {"ok": True, "favorite": True}


@app.delete("/api/favorites/{product_id}")
def remove_favorite(product_id: int, user: sqlite3.Row = Depends(current_user)):
    with db() as conn:
        conn.execute(
            "DELETE FROM favorites WHERE user_id = ? AND product_id = ?",
            (user["id"], product_id),
        )
    return {"ok": True, "favorite": False}


# ─── Panier (rattaché au compte, persistant côté serveur) ────────────


def _cart_rows(conn: sqlite3.Connection, user_id: int) -> list[dict]:
    """Lignes du panier d'un utilisateur, enrichies des données produit à jour
    (prix, stock, nom). Le panier suit ainsi le compte, pas le navigateur."""
    rows = conn.execute(
        "SELECT c.product_id AS id, c.quantity AS qty, p.name, p.brand, p.category,"
        " p.price, p.stock FROM cart_items c JOIN products p ON p.id = c.product_id"
        " WHERE c.user_id = ?",
        (user_id,),
    ).fetchall()
    return [dict(r) for r in rows]


@app.get("/api/cart")
def get_cart(user: sqlite3.Row = Depends(current_user)):
    with db() as conn:
        return _cart_rows(conn, user["id"])


@app.put("/api/cart")
def replace_cart(body: CartIn, user: sqlite3.Row = Depends(current_user)):
    """Remplace l'intégralité du panier de l'utilisateur (synchro front → serveur).
    Les produits inexistants sont ignorés ; la quantité est bornée au stock."""
    with db() as conn:
        conn.execute("DELETE FROM cart_items WHERE user_id = ?", (user["id"],))
        # Fusionne d'éventuels doublons d'id puis insère.
        merged: dict[int, int] = {}
        for it in body.items:
            merged[it.product_id] = merged.get(it.product_id, 0) + it.quantity
        for pid, qty in merged.items():
            p = conn.execute("SELECT stock FROM products WHERE id = ?", (pid,)).fetchone()
            if p is None:
                continue
            qty = max(1, min(qty, 99, p["stock"] if p["stock"] > 0 else 99))
            if p["stock"] <= 0:
                continue  # produit en rupture : on ne le conserve pas au panier
            conn.execute(
                "INSERT INTO cart_items (user_id, product_id, quantity) VALUES (?,?,?)",
                (user["id"], pid, qty),
            )
        return _cart_rows(conn, user["id"])


# ─── Promotions ──────────────────────────────────────────────────────


@app.post("/api/promo/validate")
def validate_promo(body: PromoIn):
    promo = PROMO_CODES.get(body.code.strip().upper())
    if promo is None:
        raise HTTPException(404, "Code promo invalide")
    return {"code": body.code.strip().upper(), **promo}


# ─── Commandes ───────────────────────────────────────────────────────


# ⚠️  SÉCURITÉ ANTI-FRAUDE — Toute la logique de prix vit ICI, côté serveur.
# Le front n'envoie QUE des (product_id, quantity). Les prix, remises et frais
# de port sont systématiquement recalculés depuis la base : un client qui
# trafique le panier (« RTX 4090 à 1 € ») n'a aucun effet sur le montant facturé.
def compute_order(conn: sqlite3.Connection, items: list[OrderItemIn],
                  promo_code: Optional[str]) -> dict:
    """Valide le panier et calcule les montants à partir des PRIX EN BASE.

    Ne modifie rien (lecture seule) — le stock n'est décrémenté qu'au paiement
    confirmé (voir finalize_order_paid). Lève une HTTPException si invalide.
    """
    promo = None
    if promo_code:
        promo = PROMO_CODES.get(promo_code.strip().upper())
        if promo is None:
            raise HTTPException(422, "Code promo invalide")

    subtotal = 0.0
    lines = []
    for item in items:
        p = conn.execute(
            "SELECT id, name, price, stock FROM products WHERE id = ?",
            (item.product_id,),
        ).fetchone()
        if p is None:
            raise HTTPException(422, f"Produit {item.product_id} introuvable")
        if p["stock"] < item.quantity:
            raise HTTPException(409, f"Stock insuffisant pour « {p['name']} » ({p['stock']} restant)")
        subtotal += p["price"] * item.quantity          # ← prix de confiance (BDD)
        lines.append((p, item.quantity))

    discount = round(subtotal * promo["percent"] / 100, 2) if promo else 0.0
    shipping = 0.0 if subtotal - discount >= FREE_SHIPPING_FROM else SHIPPING_FEE
    total = round(subtotal - discount + shipping, 2)
    return {
        "lines": lines, "promo": promo,
        "subtotal": round(subtotal, 2), "discount": discount,
        "shipping": shipping, "total": total,
    }


def create_pending_order(conn: sqlite3.Connection, user: sqlite3.Row,
                         body: "OrderIn", computed: dict) -> int:
    """Enregistre la commande au statut « en attente de paiement » et RÉSERVE le
    stock dans la même transaction.

    Le stock est décrémenté immédiatement (réservation), ce qui rend impossible
    la survente même sous commandes concurrentes (SQLite sérialise l'écriture).
    Il est restitué par release_stock() si la commande est annulée ou expire
    sans paiement — voir cancel_order() et purge_expired_orders().
    """
    return_token = secrets.token_urlsafe(32)
    cur = conn.execute(
        """INSERT INTO orders (user_id, subtotal, discount, shipping, total,
           promo_code, ship_name, ship_address, ship_city, ship_zip, status,
           created_at, stock_reserved, checkout_return_token)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,1,?)""",
        (user["id"], computed["subtotal"], computed["discount"],
         computed["shipping"], computed["total"],
         body.promo_code.strip().upper() if computed["promo"] else None,
         body.ship_name, body.ship_address, body.ship_city, body.ship_zip,
         "en attente de paiement", time.time(), return_token),
    )
    order_id = cur.lastrowid
    for p, qty in computed["lines"]:
        conn.execute(
            "INSERT INTO order_items (order_id, product_id, product_name, unit_price, quantity)"
            " VALUES (?,?,?,?,?)",
            (order_id, p["id"], p["name"], p["price"], qty),
        )
        # Réservation effective : on retire la quantité du stock disponible.
        conn.execute(
            "UPDATE products SET stock = stock - ? WHERE id = ?", (qty, p["id"])
        )
    _invalidate_product_cache()
    return order_id


def release_stock(conn: sqlite3.Connection, order_id: int) -> None:
    """Restitue au stock les quantités réservées par une commande (idempotent).

    Ne fait rien si le stock n'avait pas été réservé ou a déjà été restitué :
    un double appel (annulation + purge, par ex.) ne re-crédite jamais deux fois.
    """
    order = conn.execute(
        "SELECT stock_reserved, stock_restored FROM orders WHERE id = ?", (order_id,)
    ).fetchone()
    if order is None or not order["stock_reserved"] or order["stock_restored"]:
        return
    items = conn.execute(
        "SELECT product_id, quantity FROM order_items WHERE order_id = ?", (order_id,)
    ).fetchall()
    for it in items:
        conn.execute(
            "UPDATE products SET stock = stock + ? WHERE id = ?",
            (it["quantity"], it["product_id"]),
        )
    conn.execute("UPDATE orders SET stock_restored = 1 WHERE id = ?", (order_id,))
    _invalidate_product_cache()


# Délai au-delà duquel une commande « en attente de paiement » est considérée
# abandonnée : son stock est restitué et elle est marquée « annulée ».
PENDING_ORDER_TTL = 30 * 60  # 30 minutes


def purge_expired_orders() -> int:
    """Annule les commandes restées « en attente de paiement » trop longtemps et
    restitue leur stock réservé. Renvoie le nombre de commandes traitées."""
    cutoff = time.time() - PENDING_ORDER_TTL
    with db() as conn:
        stale = conn.execute(
            "SELECT id FROM orders WHERE status = 'en attente de paiement'"
            " AND created_at < ?",
            (cutoff,),
        ).fetchall()
        for row in stale:
            release_stock(conn, row["id"])
            conn.execute("UPDATE orders SET status = 'annulée' WHERE id = ?", (row["id"],))
    if stale:
        log.info("Purge : %d commande(s) non payée(s) expirée(s) — stock restitué", len(stale))
    return len(stale)


def _purge_loop() -> None:
    """Boucle de fond : purge périodique des commandes abandonnées."""
    while True:
        time.sleep(PENDING_ORDER_TTL)
        try:
            purge_expired_orders()
        except Exception:
            log.exception("Échec de la purge des commandes expirées")


def _confirmation_with_invoice(email_order: dict, email_items: list) -> None:
    """Génère la facture PDF puis envoie la confirmation client avec en pièce
    jointe. La génération est protégée : un échec n'empêche pas l'email."""
    pdf = None
    try:
        pdf = generate_invoice_pdf(email_order, email_items)
    except Exception:
        log.exception("Génération de la facture échouée (commande %s)", email_order.get("id"))
    send_order_confirmation(email_order, email_items, invoice_pdf=pdf)


def finalize_order_paid(order_id: int, session_id: Optional[str] = None) -> bool:
    """Appelée APRÈS confirmation de paiement (webhook / filet de sécurité).

    Idempotente : un webhook rejoué ou doublé ne marque la commande « payée »
    qu'une seule fois. Le stock a déjà été réservé à la création de la commande
    (voir create_pending_order), il n'est donc PAS décrémenté ici.
    """
    with db() as conn:
        order = conn.execute("SELECT * FROM orders WHERE id = ?", (order_id,)).fetchone()
        if order is None:
            log.error("finalize_order_paid : commande %s introuvable", order_id)
            return False
        if order["status"] == "payée":
            log.info("Commande %s déjà payée — événement ignoré (idempotence)", order_id)
            return True
        if order["status"] == "annulée":
            # La commande a expiré/été annulée (stock restitué) avant l'arrivée du
            # paiement : on alerte plutôt que de livrer une commande sans stock.
            log.critical(
                "Paiement reçu pour la commande %s déjà ANNULÉE — remboursement à prévoir",
                order_id,
            )
            return False

        items = conn.execute(
            "SELECT product_id, product_name, unit_price, quantity"
            " FROM order_items WHERE order_id = ?",
            (order_id,),
        ).fetchall()

        conn.execute(
            "UPDATE orders SET status = 'payée', paid_at = ?,"
            " stripe_session_id = COALESCE(?, stripe_session_id) WHERE id = ?",
            (time.time(), session_id, order_id),
        )
        conn.execute("DELETE FROM cart_items WHERE user_id = ?", (order["user_id"],))

        # Coordonnées client pour l'email de confirmation.
        _invalidate_product_cache()
        customer = conn.execute(
            "SELECT name, email FROM users WHERE id = ?", (order["user_id"],)
        ).fetchone()

    log.info("Commande %s → PAYÉE (stock déjà réservé) ✔", order_id)

    # ── Email de confirmation (en arrière-plan) ──
    # Lancé dans un thread « daemon » : l'envoi SMTP (qui peut prendre quelques
    # secondes) ne ralentit pas la réponse au webhook, et un échec d'email ne
    # peut pas faire échouer la finalisation (mailer ne lève jamais).
    email_order = {
        "id": order_id,
        "customer_name": customer["name"] if customer else order["ship_name"],
        "customer_email": customer["email"] if customer else None,
        "ship_name": order["ship_name"], "ship_address": order["ship_address"],
        "ship_city": order["ship_city"], "ship_zip": order["ship_zip"],
        "discount": order["discount"], "shipping": order["shipping"],
        "total": order["total"], "promo_code": order["promo_code"],
        "created_at": order["created_at"], "paid_at": time.time(),
    }
    email_items = [dict(i) for i in items]
    # Confirmation au client (avec la facture PDF jointe)…
    threading.Thread(
        target=_confirmation_with_invoice, args=(email_order, email_items), daemon=True
    ).start()
    # …et notification au(x) gérant(s) (emails listés dans ADMIN_EMAILS).
    admins = list(admin_emails())
    if admins:
        threading.Thread(
            target=send_admin_notification,
            args=(email_order, email_items, admins), daemon=True,
        ).start()
    return True


@app.get("/api/orders")
def list_orders(user: sqlite3.Row = Depends(current_user)):
    with db() as conn:
        orders = conn.execute(
            "SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC",
            (user["id"],),
        ).fetchall()
        result = []
        for o in orders:
            items = conn.execute(
                "SELECT product_id, product_name, unit_price, quantity"
                " FROM order_items WHERE order_id = ?",
                (o["id"],),
            ).fetchall()
            d = dict(o)
            d["items"] = [dict(i) for i in items]
            result.append(d)
    return result


# Statuts pour lesquels le client peut encore annuler lui-même sa commande
# (avant toute expédition). Le stock réservé est alors restitué.
CANCELLABLE_BY_CUSTOMER = {"en attente de paiement", "payée", "préparée"}


@app.post("/api/orders/{order_id}/cancel")
def cancel_order(order_id: int, user: sqlite3.Row = Depends(current_user)):
    """Annulation d'une commande par son propriétaire, tant qu'elle n'est pas
    expédiée. Le stock réservé est restitué."""
    with db() as conn:
        order = conn.execute("SELECT * FROM orders WHERE id = ?", (order_id,)).fetchone()
        if order is None or order["user_id"] != user["id"]:
            raise HTTPException(404, "Commande introuvable")
        if order["status"] not in CANCELLABLE_BY_CUSTOMER:
            raise HTTPException(
                409,
                f"Cette commande ne peut plus être annulée (statut « {order['status']} »).",
            )
        already_paid = order["status"] in ("payée", "préparée")
        release_stock(conn, order_id)
        conn.execute("UPDATE orders SET status = 'annulée' WHERE id = ?", (order_id,))
    if already_paid:
        # Commande déjà réglée : en production il faut déclencher un remboursement
        # Stripe. On le journalise clairement pour le suivi.
        log.warning("Commande PAYÉE %s annulée par le client — remboursement à traiter", order_id)
    else:
        log.info("Commande %s annulée par le client (stock restitué)", order_id)
    return {"ok": True, "status": "annulée", "refund_pending": already_paid}


# ─── Administration : vue de toutes les commandes ────────────────────


@app.get("/api/admin/stats")
def admin_stats(_: sqlite3.Row = Depends(current_admin)):
    """Indicateurs de pilotage pour le tableau de bord administrateur."""
    paid_statuses = ("payée", "préparée", "expédiée", "livrée")
    placeholders = ",".join("?" * len(paid_statuses))
    day_ago = time.time() - 86400
    with db() as conn:
        revenue = conn.execute(
            f"SELECT COALESCE(SUM(total), 0) FROM orders WHERE status IN ({placeholders})",
            paid_statuses,
        ).fetchone()[0]
        revenue_today = conn.execute(
            f"SELECT COALESCE(SUM(total), 0) FROM orders"
            f" WHERE status IN ({placeholders}) AND created_at >= ?",
            (*paid_statuses, day_ago),
        ).fetchone()[0]
        orders_paid = conn.execute(
            f"SELECT COUNT(*) FROM orders WHERE status IN ({placeholders})", paid_statuses
        ).fetchone()[0]
        orders_today = conn.execute(
            "SELECT COUNT(*) FROM orders WHERE created_at >= ?", (day_ago,)
        ).fetchone()[0]
        by_status = {
            r["status"]: r["n"]
            for r in conn.execute("SELECT status, COUNT(*) AS n FROM orders GROUP BY status")
        }
        top_products = [
            dict(r) for r in conn.execute(
                f"SELECT oi.product_id, oi.product_name,"
                f" SUM(oi.quantity) AS qty, SUM(oi.quantity * oi.unit_price) AS revenue"
                f" FROM order_items oi JOIN orders o ON o.id = oi.order_id"
                f" WHERE o.status IN ({placeholders})"
                # product_name doit figurer dans GROUP BY : PostgreSQL refuse une
                # colonne sélectionnée ni agrégée ni groupée (SQLite la tolérait).
                f" GROUP BY oi.product_id, oi.product_name ORDER BY qty DESC LIMIT 8",
                paid_statuses,
            )
        ]
        low_stock = [
            dict(r) for r in conn.execute(
                "SELECT id, name, category, stock FROM products"
                " WHERE stock <= 5 ORDER BY stock ASC, name LIMIT 20"
            )
        ]
        customers = conn.execute("SELECT COUNT(*) FROM users").fetchone()[0]
        # Commandes réglées mais pas encore expédiées (à préparer / expédier).
        to_ship = conn.execute(
            "SELECT COUNT(*) FROM orders WHERE status IN ('payée', 'préparée')"
        ).fetchone()[0]
        recent_customers = [
            dict(r) for r in conn.execute(
                "SELECT name, email, created_at FROM users"
                " ORDER BY created_at DESC LIMIT 8"
            )
        ]
    avg_basket = round(revenue / orders_paid, 2) if orders_paid else 0
    return {
        "revenue": round(revenue, 2),
        "revenue_today": round(revenue_today, 2),
        "orders_paid": orders_paid,
        "orders_today": orders_today,
        "to_ship": to_ship,
        "avg_basket": avg_basket,
        "customers": customers,
        "recent_customers": recent_customers,
        "by_status": by_status,
        "top_products": top_products,
        "low_stock": low_stock,
    }


@app.get("/api/admin/orders")
def admin_list_orders(
    status: Optional[str] = None,
    q: Optional[str] = None,
    _: sqlite3.Row = Depends(current_admin),  # ← réservé à l'administrateur
):
    """Liste TOUTES les commandes (tous clients), avec coordonnées client et
    adresse de livraison. Filtres optionnels : statut (?status=payée) et
    recherche (?q=) sur le nom/email du client ou le n° de commande.
    """
    with db() as conn:
        sql = (
            "SELECT o.*, u.name AS customer_name, u.email AS customer_email"
            " FROM orders o JOIN users u ON u.id = o.user_id"
        )
        clauses: list = []
        args: list = []
        if status:
            clauses.append("o.status = ?")
            args.append(status)
        if q and q.strip():
            term = q.strip()
            like = f"%{term}%"
            sub = "(u.name LIKE ? OR u.email LIKE ?"
            args += [like, like]
            if term.lstrip("#").isdigit():
                sub += " OR o.id = ?"
                args.append(int(term.lstrip("#")))
            sub += ")"
            clauses.append(sub)
        if clauses:
            sql += " WHERE " + " AND ".join(clauses)
        sql += " ORDER BY o.created_at DESC"
        orders = conn.execute(sql, args).fetchall()
        result = []
        for o in orders:
            items = conn.execute(
                "SELECT product_id, product_name, unit_price, quantity"
                " FROM order_items WHERE order_id = ?",
                (o["id"],),
            ).fetchall()
            d = dict(o)
            d["items"] = [dict(i) for i in items]
            result.append(d)
    return result


@app.post("/api/admin/orders/{order_id}/status")
def admin_update_order_status(
    order_id: int, body: OrderStatusIn,
    _: sqlite3.Row = Depends(current_admin),
):
    """Met à jour le statut de suivi d'une commande (+ n° de suivi / transporteur).
    Si la commande passe à « expédiée », un email est envoyé au client.
    """
    if body.status not in ORDER_STATUSES:
        raise HTTPException(422, f"Statut invalide (autorisés : {', '.join(ORDER_STATUSES)})")
    with db() as conn:
        order = conn.execute(
            "SELECT o.*, u.name AS customer_name, u.email AS customer_email"
            " FROM orders o JOIN users u ON u.id = o.user_id WHERE o.id = ?",
            (order_id,),
        ).fetchone()
        if order is None:
            raise HTTPException(404, "Commande introuvable")
        tracking = (body.tracking_number or "").strip() or None
        carrier = (body.carrier or "").strip() or None
        conn.execute(
            "UPDATE orders SET status = ?, tracking_number = ?, carrier = ? WHERE id = ?",
            (body.status, tracking, carrier, order_id),
        )
        # Notification d'expédition (une fois, au passage à « expédiée »).
        notify = body.status == "expédiée" and order["status"] != "expédiée"
        ship_order = dict(order)

    if notify:
        ship_order.update(status="expédiée", tracking_number=tracking, carrier=carrier)
        threading.Thread(
            target=send_shipping_notification, args=(ship_order,), daemon=True
        ).start()
        log.info("Commande %s expédiée — email de suivi envoyé au client", order_id)
    return {"ok": True, "status": body.status, "tracking_number": tracking, "carrier": carrier}


# ─── Administration : gestion des produits (stock, prix, catalogue) ──


@app.patch("/api/admin/products/{product_id}")
def admin_update_product(
    product_id: int, body: ProductUpdateIn,
    _: sqlite3.Row = Depends(current_admin),
):
    """Met à jour un produit. Seuls les champs réellement fournis sont modifiés."""
    fields = body.model_dump(exclude_unset=True)
    if not fields:
        raise HTTPException(422, "Aucun champ à mettre à jour")
    # Conversions vers le format stocké en base.
    if "specs" in fields:
        fields["specs"] = json.dumps(fields["specs"], ensure_ascii=False)
    if "featured" in fields:
        fields["featured"] = 1 if fields["featured"] else 0
    # Les clés viennent du schéma Pydantic (jeu fixe) → pas d'injection SQL.
    set_clause = ", ".join(f"{k} = ?" for k in fields)
    with db() as conn:
        if conn.execute("SELECT 1 FROM products WHERE id = ?", (product_id,)).fetchone() is None:
            raise HTTPException(404, "Produit introuvable")
        conn.execute(
            f"UPDATE products SET {set_clause} WHERE id = ?",
            (*fields.values(), product_id),
        )
        row = conn.execute("SELECT * FROM products WHERE id = ?", (product_id,)).fetchone()
    log.info("Produit %s mis à jour (%s)", product_id, ", ".join(fields))
    _invalidate_product_cache()
    return product_out(row)


@app.post("/api/admin/products", status_code=201)
def admin_create_product(body: ProductCreateIn, _: sqlite3.Row = Depends(current_admin)):
    """Crée un nouveau produit au catalogue."""
    with db() as conn:
        cur = conn.execute(
            """INSERT INTO products
               (name, brand, category, price, old_price, stock, rating,
                rating_count, featured, badge, description, specs, image_url)
               VALUES (?,?,?,?,?,?,0,0,?,?,?,?,?)""",
            (body.name, body.brand, body.category, body.price, body.old_price,
             body.stock, 1 if body.featured else 0, body.badge, body.description,
             json.dumps(body.specs, ensure_ascii=False), body.image_url),
        )
        row = conn.execute("SELECT * FROM products WHERE id = ?", (cur.lastrowid,)).fetchone()
    log.info("Produit créé : %s (#%s)", body.name, row["id"])
    _invalidate_product_cache()
    return product_out(row)


@app.delete("/api/admin/products/{product_id}")
def admin_delete_product(product_id: int, _: sqlite3.Row = Depends(current_admin)):
    """Supprime un produit — refusé s'il figure déjà dans des commandes."""
    with db() as conn:
        if conn.execute("SELECT 1 FROM products WHERE id = ?", (product_id,)).fetchone() is None:
            raise HTTPException(404, "Produit introuvable")
        refs = conn.execute(
            "SELECT COUNT(*) FROM order_items WHERE product_id = ?", (product_id,)
        ).fetchone()[0]
        if refs:
            raise HTTPException(
                409,
                f"Suppression impossible : ce produit figure dans {refs} commande(s). "
                "Mettez plutôt son stock à 0 pour le retirer de la vente.",
            )
        conn.execute("DELETE FROM reviews WHERE product_id = ?", (product_id,))
        conn.execute("DELETE FROM products WHERE id = ?", (product_id,))
    log.info("Produit %s supprimé", product_id)
    _invalidate_product_cache()
    return {"ok": True}


# ─── Factures PDF ────────────────────────────────────────────────────


@app.get("/api/orders/{order_id}/invoice")
def order_invoice(order_id: int, user: sqlite3.Row = Depends(current_user)):
    """Renvoie la facture PDF d'une commande. Accessible au propriétaire de la
    commande OU à un administrateur. Disponible une fois la commande payée."""
    with db() as conn:
        order = conn.execute(
            "SELECT o.*, u.name AS customer_name, u.email AS customer_email"
            " FROM orders o JOIN users u ON u.id = o.user_id WHERE o.id = ?",
            (order_id,),
        ).fetchone()
        if order is None:
            raise HTTPException(404, "Commande introuvable")
        if order["user_id"] != user["id"] and not is_admin_email(user["email"]):
            raise HTTPException(403, "Accès refusé")
        if order["status"] == "en attente de paiement":
            raise HTTPException(409, "Facture disponible une fois la commande payée")
        items = conn.execute(
            "SELECT product_name, unit_price, quantity FROM order_items WHERE order_id = ?",
            (order_id,),
        ).fetchall()
    pdf = generate_invoice_pdf(dict(order), [dict(i) for i in items])
    return Response(
        content=pdf, media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="facture-{order_id}.pdf"'},
    )


# ─── Paiements Stripe (module séparé) ────────────────────────────────
# Importé ICI, en fin de fichier : à ce stade toutes les fonctions utilisées
# par payments.py (db, current_user, compute_order, …) sont déjà définies,
# ce qui évite tout problème d'import circulaire.
from payments import router as payment_router  # noqa: E402

app.include_router(payment_router)


# ─── SEO : robots.txt + sitemap.xml ──────────────────────────────────
SITE_URL = os.environ.get("SITE_URL", "https://voltcore.fr").rstrip("/")

# Libellés FR des catégories (miroir de CATS côté frontend).
CAT_LABELS = {
    "gpu": "Cartes graphiques", "cpu": "Processeurs", "ram": "Mémoire RAM",
    "storage": "Stockage SSD", "motherboard": "Cartes mères", "psu": "Alimentations",
    "case": "Boîtiers", "cooling": "Refroidissement", "monitor": "Écrans",
    "keyboard": "Claviers", "mouse": "Souris", "headset": "Casques audio",
    "fan": "Ventilateurs", "thermal": "Pâte thermique", "webcam": "Webcams",
    "microphone": "Microphones", "speaker": "Enceintes", "mousepad": "Tapis de souris",
    "chair": "Chaises gaming",
}


@app.get("/robots.txt", include_in_schema=False)
def robots_txt():
    body = (
        "User-agent: *\n"
        "Allow: /\n"
        "Disallow: /api/\n"
        f"Sitemap: {SITE_URL}/sitemap.xml\n"
    )
    return Response(content=body, media_type="text/plain")


@app.get("/sitemap.xml", include_in_schema=False)
def sitemap_xml():
    """Sitemap complet : accueil, catalogue, catégories et toutes les fiches
    produit (URL réelles depuis le Lot 1)."""
    urls = [(f"{SITE_URL}/", "1.0"), (f"{SITE_URL}/catalogue", "0.9"),
            (f"{SITE_URL}/configurateur", "0.5")]
    urls += [(f"{SITE_URL}/catalogue?cat={c}", "0.7") for c in CAT_LABELS]
    with db() as conn:
        for r in conn.execute("SELECT id FROM products ORDER BY id").fetchall():
            urls.append((f"{SITE_URL}/produit/{r['id']}", "0.8"))
    today = time.strftime("%Y-%m-%d")
    out = ['<?xml version="1.0" encoding="UTF-8"?>',
           '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    for loc, prio in urls:
        out.append(
            f"  <url><loc>{html.escape(loc)}</loc><lastmod>{today}</lastmod>"
            f"<priority>{prio}</priority></url>"
        )
    out.append("</urlset>")
    return Response(content="\n".join(out), media_type="application/xml")


# ─── Frontend (SPA) avec rendu serveur SEO ───────────────────────────
# Sert les vrais fichiers (css/js/images) s'ils existent ; sinon renvoie
# index.html. Pour les pages indexables (produit, catégorie, accueil), le
# contenu + les balises <title>/meta/JSON-LD sont injectés côté serveur afin
# que crawlers et moteurs IA voient une vraie page (le JS hydrate ensuite).
FRONTEND_DIR = FRONTEND.resolve()
INDEX_FILE = FRONTEND_DIR / "index.html"

_E = html.escape


def _money(v) -> str:
    return f"{v:,.0f} €".replace(",", " ")  # 1 899 € (espace fine)


def _clip(text: str, n: int = 155) -> str:
    text = " ".join((text or "").split())
    return text if len(text) <= n else text[: n - 1].rstrip() + "…"


def _jsonld(obj: dict) -> str:
    raw = json.dumps(obj, ensure_ascii=False).replace("</", "<\\/")
    return f'<script type="application/ld+json">{raw}</script>\n  '


def _seo_block(title, desc, canonical, og_title, og_desc, image=None) -> str:
    img = (f'  <meta property="og:image" content="{_E(image)}">\n'
           f'  <meta name="twitter:image" content="{_E(image)}">\n') if image else ""
    return (
        f"<title>{_E(title)}</title>\n"
        f'  <meta name="description" content="{_E(desc)}">\n'
        f'  <link rel="canonical" href="{_E(canonical)}">\n'
        f'  <meta property="og:title" content="{_E(og_title)}">\n'
        f'  <meta property="og:description" content="{_E(og_desc)}">\n'
        f'  <meta property="og:url" content="{_E(canonical)}">\n'
        f"{img}"
        f'  <meta name="twitter:title" content="{_E(og_title)}">\n'
        f'  <meta name="twitter:description" content="{_E(og_desc)}">'
    )


def _render(tpl, *, title=None, desc=None, canonical=None, og_title=None,
            og_desc=None, image=None, jsonld="", main="", robots=None) -> str:
    out = tpl
    if title is not None:
        block = _seo_block(title, desc, canonical, og_title or title,
                           og_desc or desc, image)
        i = out.find("<!-- PAGE-SEO:START")
        j = out.find("PAGE-SEO:END -->")
        if i != -1 and j != -1:
            out = out[:i] + block + out[j + len("PAGE-SEO:END -->"):]
    out = out.replace("<!-- PAGE-JSONLD -->", jsonld or "")
    out = out.replace("<!--SSR-->", main or "")
    if robots:
        out = out.replace('content="index, follow"', f'content="{robots}"')
    return out


def _html(content: str, status: int = 200) -> Response:
    return Response(content=content, media_type="text/html; charset=utf-8",
                    status_code=status)


def _abs_img(p) -> str:
    img = p["image_url"] or f"/images/{p['id']}-1.jpg"
    return img if img.startswith("http") else SITE_URL + img


def _product_ssr(p) -> str:
    cat = p["category"]
    label = CAT_LABELS.get(cat, cat)
    try:
        specs = json.loads(p["specs"])
    except Exception:
        specs = {}
    rows = "".join(
        f"<tr><td>{_E(str(k))}</td><td>{_E(str(v))}</td></tr>"
        for k, v in list(specs.items())[:14]
    )
    old = f' <span class="price-old">{_money(p["old_price"])}</span>' if p["old_price"] else ""
    rating = (f' · {p["rating"]:.1f}/5 ({p["rating_count"]} avis)'
              if p["rating_count"] else "")
    stock = "En stock" if p["stock"] > 0 else "Rupture de stock"
    return (
        '<article class="product-page">'
        f'<nav class="breadcrumb"><a href="/">Accueil</a> / '
        f'<a href="/catalogue?cat={cat}">{_E(label)}</a> / {_E(p["name"])}</nav>'
        f'<img class="pimg" src="{_E(_abs_img(p))}" alt="{_E(p["name"])}" width="600" height="600">'
        '<div class="product-page-info">'
        f'<span class="product-brand">{_E(p["brand"])}</span>'
        f'<h1>{_E(p["name"])}</h1>'
        f'<p class="price">{_money(p["price"])}{old} — {stock}{rating}</p>'
        f'<p class="desc">{_E(p["description"])}</p>'
        f'<table class="specs-table"><tbody>{rows}</tbody></table>'
        '</div></article>'
    )


def _product_jsonld(p) -> str:
    cat_label = CAT_LABELS.get(p["category"], p["category"])
    product = {
        "@context": "https://schema.org", "@type": "Product",
        "name": p["name"], "image": _abs_img(p), "description": _clip(p["description"], 300),
        "sku": str(p["id"]), "category": cat_label,
        "brand": {"@type": "Brand", "name": p["brand"]},
        "offers": {
            "@type": "Offer", "url": f"{SITE_URL}/produit/{p['id']}",
            "priceCurrency": "EUR", "price": f'{p["price"]:.2f}',
            "availability": "https://schema.org/InStock" if p["stock"] > 0
            else "https://schema.org/OutOfStock",
        },
    }
    if p["rating_count"]:
        product["aggregateRating"] = {
            "@type": "AggregateRating", "ratingValue": f'{p["rating"]:.1f}',
            "reviewCount": p["rating_count"],
        }
    crumbs = {
        "@context": "https://schema.org", "@type": "BreadcrumbList",
        "itemListElement": [
            {"@type": "ListItem", "position": 1, "name": "Accueil", "item": f"{SITE_URL}/"},
            {"@type": "ListItem", "position": 2, "name": cat_label,
             "item": f"{SITE_URL}/catalogue?cat={p['category']}"},
            {"@type": "ListItem", "position": 3, "name": p["name"],
             "item": f"{SITE_URL}/produit/{p['id']}"},
        ],
    }
    return _jsonld(product) + _jsonld(crumbs)


def _catalog_render(tpl, params) -> Response:
    cat = params.get("cat")
    q = params.get("q")
    promo = params.get("promo") == "1"
    new = params.get("new") == "1"
    sql = ("SELECT id, name, brand, price, old_price FROM products WHERE 1=1")
    args = []
    if cat:
        sql += " AND category = ?"
        args.append(cat)
    if q:
        sql += " AND (name LIKE ? OR brand LIKE ?)"
        args += [f"%{q}%", f"%{q}%"]
    if promo:
        sql += " AND old_price IS NOT NULL"
    sql += " ORDER BY featured DESC, rating DESC LIMIT 60"
    with db() as conn:
        rows = conn.execute(sql, args).fetchall()

    if cat:
        heading = CAT_LABELS.get(cat, "Catalogue")
        canonical = f"{SITE_URL}/catalogue?cat={cat}"
    elif promo:
        heading, canonical = "Promotions", f"{SITE_URL}/catalogue?promo=1"
    elif new:
        heading, canonical = "Nouveautés", f"{SITE_URL}/catalogue?new=1"
    elif q:
        heading, canonical = f"Recherche « {q} »", f"{SITE_URL}/catalogue"
    else:
        heading, canonical = "Catalogue", f"{SITE_URL}/catalogue"

    title = f"{heading} — VoltCore"
    desc = _clip(f"{heading} : {len(rows)} produits PC haute performance au meilleur "
                 "prix chez VoltCore. Livraison 24 h, paiement sécurisé.")
    items = "".join(
        f'<li><a href="/produit/{r["id"]}">{_E(r["name"])}</a> — '
        f'{_E(r["brand"])} — {_money(r["price"])}</li>' for r in rows
    )
    main = (
        '<section><nav class="breadcrumb"><a href="/">Accueil</a> / '
        f'{_E(heading)}</nav><h1>{_E(heading)}</h1>'
        f'<p>{len(rows)} produits disponibles.</p>'
        f'<ul class="ssr-list">{items}</ul></section>'
    )
    item_list = {
        "@context": "https://schema.org", "@type": "ItemList",
        "itemListElement": [
            {"@type": "ListItem", "position": i + 1, "name": r["name"],
             "url": f"{SITE_URL}/produit/{r['id']}"} for i, r in enumerate(rows)
        ],
    }
    return _html(_render(tpl, title=title, desc=desc, canonical=canonical,
                         jsonld=_jsonld(item_list), main=main))


def _home_ssr() -> str:
    links = "".join(
        f'<li><a href="/catalogue?cat={c}">{_E(lbl)}</a></li>'
        for c, lbl in CAT_LABELS.items()
    )
    return (
        '<section><h1>VoltCore — Composants PC haute performance</h1>'
        '<p>Cartes graphiques, processeurs, mémoire, stockage et périphériques '
        'gaming au meilleur prix. Configurateur intelligent, compatibilité vérifiée '
        'et livraison en 24 h.</p>'
        f'<nav aria-label="Catégories"><ul class="ssr-list">{links}</ul></nav>'
        '</section>'
    )


STATIC_PAGES = {
    "qui-sommes-nous": (
        "Qui sommes-nous — VoltCore",
        "VoltCore, boutique française de composants PC : conseil configuration, composants PC, expédition suivie et support client.",
        "Qui sommes-nous",
        "VoltCore est une boutique française de composants PC pensée pour rendre le choix d'une configuration plus clair : catalogue lisible, conseil compatibilité, configurateur PC, paiement sécurisé et livraison suivie.",
    ),
    "mentions-legales": (
        "Mentions légales — VoltCore",
        "Mentions légales de VoltCore : éditeur, contact, hébergement et propriété intellectuelle.",
        "Mentions légales",
        "Informations d'identification, contact, hébergement et propriété intellectuelle de la boutique VoltCore.",
    ),
    "cgv": (
        "Conditions générales de vente — VoltCore",
        "Conditions générales de vente VoltCore : commande, paiement Stripe, rétractation 14 jours, livraison, garanties légales et SAV.",
        "Conditions générales de vente",
        "Résumé des conditions d'achat, de paiement sécurisé Stripe, de livraison suivie, de rétractation, de garanties légales, de SAV et de facturation.",
    ),
    "confidentialite": (
        "Politique de confidentialité — VoltCore",
        "Politique de confidentialité VoltCore : données de compte, commandes, paiement, cookies, sécurité et droits RGPD.",
        "Politique de confidentialité",
        "Les données collectées servent au fonctionnement de la boutique, au suivi des commandes, à la facturation, au support, à la sécurité du compte et au respect des droits RGPD.",
    ),
    "retours-remboursements": (
        "Retours et remboursement — VoltCore",
        "Retours VoltCore : droit de rétractation 14 jours, retour commercial 30 jours, SAV et remboursement.",
        "Retours et remboursement",
        "Le consommateur dispose d'un droit légal de rétractation de 14 jours. Une politique commerciale de retour jusqu'à 30 jours peut s'appliquer aux produits complets et en bon état.",
    ),
}


def _static_page_ssr(heading: str, text: str) -> str:
    return (
        '<section class="content-page">'
        f'<nav class="breadcrumb"><a href="/">Accueil</a> / {_E(heading)}</nav>'
        f'<h1>{_E(heading)}</h1>'
        f'<p>{_E(text)}</p>'
        '</section>'
    )


@app.get("/{full_path:path}", include_in_schema=False)
def spa_fallback(full_path: str, request: Request):
    candidate = (FRONTEND_DIR / full_path).resolve()
    if (
        full_path
        and candidate.is_file()
        and candidate.is_relative_to(FRONTEND_DIR)  # anti path-traversal
    ):
        # Cache :
        #  • assets versionnés (ex. app.js?v=36) → immuables, cache 1 an (le
        #    changement de numéro suffit à forcer le rechargement post-déploiement).
        #  • images (.jpg/.png/.webp…) → cache 30 jours : quasi-stables, ça évite
        #    de les re-télécharger à chaque navigation/visite (gros gain de vitesse).
        #    Remplacement sur place rare → 30 j est un bon compromis fraîcheur/perf.
        #  • autres fichiers sans version → cache court (1 h).
        _IMG_EXT = {".jpg", ".jpeg", ".png", ".webp", ".avif", ".gif", ".svg", ".ico"}
        if request.url.query:
            cache = "public, max-age=31536000, immutable"
        elif candidate.suffix.lower() in _IMG_EXT:
            cache = "public, max-age=2592000"  # 30 jours
        else:
            cache = "public, max-age=3600"
        headers = {"Cache-Control": cache}
        if candidate.suffix.lower() in _IMG_EXT:
            headers["Content-Encoding"] = "identity"
        return FileResponse(candidate, headers=headers)

    tpl = INDEX_FILE.read_text(encoding="utf-8")
    seg = full_path.strip("/")

    if seg in STATIC_PAGES:
        title, desc, heading, text = STATIC_PAGES[seg]
        return _html(_render(
            tpl, title=title, desc=desc, canonical=f"{SITE_URL}/{seg}",
            og_title=title, og_desc=desc, main=_static_page_ssr(heading, text),
        ))

    # Fiche produit ------------------------------------------------------
    if seg.startswith("produit/"):
        try:
            pid = int(seg.split("/")[1])
        except (ValueError, IndexError):
            pid = None
        if pid is not None:
            with db() as conn:
                p = conn.execute("SELECT * FROM products WHERE id = ?", (pid,)).fetchone()
            if p:
                return _html(_render(
                    tpl, title=f'{p["name"]} — VoltCore',
                    desc=_clip(p["description"]),
                    canonical=f"{SITE_URL}/produit/{pid}",
                    og_title=p["name"], og_desc=_clip(p["description"]),
                    image=_abs_img(p),
                    jsonld=_product_jsonld(p), main=_product_ssr(p),
                ))
        return _html(_render(
            tpl, title="Produit introuvable — VoltCore",
            desc="Ce produit n'existe pas ou n'est plus disponible.",
            canonical=f"{SITE_URL}/catalogue", og_title="Produit introuvable",
            og_desc="", robots="noindex, follow",
            main='<section class="empty-state"><h1>Produit introuvable</h1>'
                 '<p><a href="/catalogue">Retour au catalogue</a></p></section>',
        ), status=404)

    # Catalogue / catégorie ---------------------------------------------
    if seg == "catalogue":
        return _catalog_render(tpl, request.query_params)

    # Accueil ------------------------------------------------------------
    if seg == "":
        return _html(_render(tpl, main=_home_ssr()))

    # Autres routes applicatives (configurateur, compte, admin…) :
    # pas d'enjeu SEO → on sert l'app sans contenu pré-rendu.
    return _html(_render(tpl))
