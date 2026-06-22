---
name: run-voltcore
description: Build, launch, smoke-test and screenshot the VoltCore shop (FastAPI + static frontend). Use when asked to run, start, serve, test, or screenshot VoltCore, or to verify the app boots and its API works.
---

# Run VoltCore

VoltCore is a single FastAPI app (uvicorn) that serves **both** the JSON API
and the static frontend SPA on one port (default `8000`). The database is
SQLite, **seeded automatically at startup** from `backend/seed.py` — no manual
DB step. There is no separate frontend build (plain HTML/CSS/JS in `frontend/`).

**Drive it with the committed driver:** `.claude/skills/run-voltcore/smoke.py`
launches the server, waits for it, asserts the key endpoints, and tears it down.
That is the agent path — run it first to know the app is healthy.

All paths below are relative to the unit root `voltcore/`. Commands were
verified on Windows 11 (Git Bash + PowerShell, Python 3.14).

## Prerequisites

Python 3.11+ and the pinned deps:

```bash
python -m pip install -r backend/requirements.txt
```

(`uvicorn`, `fastapi`, `stripe`, `fpdf2`, `psycopg`, `pytest`.) No Node build is
needed — the frontend is static and served by the backend.

## Run — agent path (driver)

```bash
python .claude/skills/run-voltcore/smoke.py --port 8050
```

Launches uvicorn on its own port, runs 7 checks, prints a `passed/total`
summary, stops the server, exits `0` (all pass) or `1`. Verified output:

```
  [OK ] Frontend  GET / — HTTP 200, 14249 octets
  [OK ] Statique  GET /js/app.js — HTTP 200, 174217 octets
  [OK ] API       GET /api/categories — HTTP 200, 19 catégories
  [OK ] API       GET /api/products — HTTP 200, 245 produits
  [OK ] API       GET /api/products/{id} — HTTP 200, 'GeForce RTX 5090 SUPRIM Liquid 32G'
  [OK ] Statique  GET /images/<slug>-1.jpg — HTTP 200 (image principale)
  [OK ] API       POST /api/promo/validate — HTTP 200, -10% sur tout le site
Résultat : 7/7 vérifications réussies.
```

To keep the server up (e.g. to open it in a browser or screenshot it):

```bash
python .claude/skills/run-voltcore/smoke.py --port 8050 --keep
```

Then visit `http://127.0.0.1:8050/`. For a screenshot, point a browser /
screenshot tool at that URL (no `chromium-cli` on this machine — use the
connected Chrome, or any headless browser).

## Run — human path

```bash
# from voltcore/
cd backend && python -m uvicorn main:app --host 127.0.0.1 --port 8000
```

Then open `http://127.0.0.1:8000/`. On Windows, `start.bat` does the same
(double-click). Ctrl-C to stop.

## Direct invocation (no server)

The catalogue and DB logic are importable from `backend/`:

```bash
cd backend
python -c "from seed import SEED_PRODUCTS; print(len(SEED_PRODUCTS), 'produits')"
python -c "import main; main.init_db()"          # crée + seed voltpc.db
RESYNC_ON_BOOT=1 python -c "import resync_catalog; resync_catalog.main()"  # resync sur base existante
```

Product descriptions are enriched at import time by `backend/enrich_descriptions.py`
(the short hand-written lead in `seed.py` + spec-derived sentences). Gallery
images are added by `backend/add_gallery_images.py` (reads `_gallery_ids.json`,
writes `frontend/images/<slug>-2.jpg…`); `backend/set_full_gallery.py` rewrites
a full gallery including `-1` (used to fix wrong main images, e.g. RAM).

## Test

```bash
cd backend
mkdir -p .pytmp && python -m pytest tests -q -p no:cacheprovider --basetemp=.pytmp
```

5 tests (critical flows: registration code, stock reservation, paid-order
idempotency, stock rejection). Verified: `5 passed`.

## Gotchas

- **pytest crashes with `PermissionError: [WinError 5]` on `pytest-of-<user>`**
  in the default temp dir. Always pass `--basetemp=.pytmp` (a repo-local temp),
  as in the Test section. Without it the run errors before any test executes.
- **"Base de données SQLite … NON persistant" WARNING at boot is expected**
  locally — it only matters on ephemeral hosting (the prod path uses
  `DATABASE_URL` → PostgreSQL). Not a failure.
- **One port serves everything.** API under `/api/...`; everything else falls
  through a catch-all route that serves `frontend/` files, with `index.html`
  for SPA routes. There is no second dev server.
- **Accented log/console output shows mojibake** (`�`) in the Windows console
  (cp1252). Cosmetic — the HTTP responses are correct UTF-8.
- **Gallery thumbnails `-2.jpg…-5.jpg` exist only for processed products.**
  The product page tries `<slug>-1..-5.jpg` and auto-removes thumbnails that
  404, so missing ones are harmless (the driver's image check accepts 200/404).
- **Re-seeding an existing DB:** edits to `seed.py` don't reach an already-built
  `voltpc.db` on normal boot. Set `RESYNC_ON_BOOT=1` (or delete `voltpc.db` and
  let startup re-seed).

## Troubleshooting

- `ModuleNotFoundError: fastapi` (or uvicorn) → run the Prerequisites
  `pip install -r backend/requirements.txt`.
- `[Errno 10048]` / port already in use → pass a free `--port` to `smoke.py`,
  or pick another port for the human-path uvicorn command.
- `smoke.py` prints "le serveur n'a pas répondu" → a previous uvicorn is still
  holding the port, or an import error crashed startup; run the human-path
  uvicorn command directly to see the traceback.
