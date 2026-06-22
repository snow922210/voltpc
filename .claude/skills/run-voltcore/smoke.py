#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Driver de lancement + smoke-test pour VoltCore.

VoltCore est une app FastAPI (uvicorn) qui sert à la fois l'API JSON et le
frontend statique (SPA) sur un seul port. Ce script :

  1. lance le serveur (python -m uvicorn main:app) depuis backend/,
  2. attend qu'il réponde (poll de "/"),
  3. vérifie les endpoints clés (frontend, statique, API, promo),
  4. arrête proprement le serveur et renvoie un code de sortie 0/1.

C'est le HARNESS de référence : un agent (ou un humain) qui veut savoir si
l'app démarre et fonctionne lance ce fichier, sans rien d'autre à installer
que les deps de backend/requirements.txt.

Usage :
  python .claude/skills/run-voltcore/smoke.py            # port 8050 par défaut
  python .claude/skills/run-voltcore/smoke.py --port 8123
  python .claude/skills/run-voltcore/smoke.py --keep     # laisse le serveur tourner

Dépendances : uniquement la lib standard Python (urllib). Aucune install en plus.
"""
import argparse
import json
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

# voltcore/.claude/skills/run-voltcore/smoke.py -> parents[3] = voltcore/
ROOT = Path(__file__).resolve().parents[3]
BACKEND = ROOT / "backend"


def _get(url, method="GET", body=None, timeout=10):
    data = None
    headers = {}
    if body is not None:
        data = json.dumps(body).encode()
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.status, r.read()


def wait_up(base, timeout=40):
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            status, _ = _get(base + "/", timeout=3)
            if status == 200:
                return True
        except (urllib.error.URLError, ConnectionError, OSError):
            pass
        time.sleep(1)
    return False


def run_checks(base):
    """Renvoie (passed, total) après avoir loggé chaque vérification."""
    checks = []

    def check(label, fn):
        try:
            ok, detail = fn()
        except Exception as e:  # noqa: BLE001 - on veut tout attraper en smoke
            ok, detail = False, f"exception: {e}"
        checks.append(ok)
        print(f"  [{'OK ' if ok else 'ECHEC'}] {label} — {detail}")

    def home():
        s, b = _get(base + "/")
        return s == 200 and b"<html" in b.lower(), f"HTTP {s}, {len(b)} octets"

    def appjs():
        s, b = _get(base + "/js/app.js")
        return s == 200 and len(b) > 1000, f"HTTP {s}, {len(b)} octets"

    def categories():
        s, b = _get(base + "/api/categories")
        d = json.loads(b)
        return s == 200 and len(d) > 0, f"HTTP {s}, {len(d)} catégories"

    products_holder = {}

    def products():
        s, b = _get(base + "/api/products")
        d = json.loads(b)
        if d:
            products_holder["first"] = d[0]
        return s == 200 and len(d) >= 200, f"HTTP {s}, {len(d)} produits"

    def product_detail():
        p = products_holder.get("first")
        if not p:
            return False, "aucun produit listé"
        s, b = _get(f"{base}/api/products/{p['id']}")
        d = json.loads(b)
        return s == 200 and d["id"] == p["id"], f"HTTP {s}, '{d.get('name', '?')[:40]}'"

    def static_image():
        # image de galerie générée par add_gallery_images.py (peut être absente
        # sur un checkout neuf) -> on accepte 200 OU 404 propre, pas une 500.
        try:
            s, b = _get(base + "/images/990-pro-2-to-1.jpg")
        except urllib.error.HTTPError as e:
            s, b = e.code, b""
        return s in (200, 404), f"HTTP {s} (image principale)"

    def promo():
        s, b = _get(base + "/api/promo/validate", method="POST",
                    body={"code": "VOLT10", "subtotal": 1000})
        d = json.loads(b)
        return s == 200 and d.get("percent") == 10, f"HTTP {s}, {d.get('label', '?')}"

    check("Frontend  GET /", home)
    check("Statique  GET /js/app.js", appjs)
    check("API       GET /api/categories", categories)
    check("API       GET /api/products", products)
    check("API       GET /api/products/{id}", product_detail)
    check("Statique  GET /images/<slug>-1.jpg", static_image)
    check("API       POST /api/promo/validate", promo)

    return sum(checks), len(checks)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8050)
    ap.add_argument("--keep", action="store_true", help="laisser le serveur tourner")
    args = ap.parse_args()
    base = f"http://127.0.0.1:{args.port}"

    print(f"VoltCore smoke-test — uvicorn sur {base}\n  racine projet : {ROOT}")
    proc = subprocess.Popen(
        [sys.executable, "-m", "uvicorn", "main:app",
         "--host", "127.0.0.1", "--port", str(args.port), "--log-level", "warning"],
        cwd=str(BACKEND),
    )
    try:
        if not wait_up(base):
            print("ECHEC : le serveur n'a pas répondu dans le délai imparti.")
            return 1
        print("Serveur prêt. Vérifications :")
        passed, total = run_checks(base)
        print(f"\nRésultat : {passed}/{total} vérifications réussies.")
        if args.keep:
            print(f"Serveur laissé en marche sur {base} (--keep). Ctrl-C pour arrêter.")
            proc.wait()
        return 0 if passed == total else 1
    finally:
        if not args.keep:
            proc.terminate()
            try:
                proc.wait(timeout=10)
            except subprocess.TimeoutExpired:
                proc.kill()


if __name__ == "__main__":
    sys.exit(main())
