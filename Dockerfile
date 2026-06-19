# ─── VOLT PC — image de production ───────────────────────────────────
# Build :  docker build -t voltpc .
# Run   :  docker run -p 8000:8000 --env-file backend/.env -v voltpc-data:/app/backend voltpc
#
# Contexte de build = racine du dépôt. Depuis la réorganisation, le backend
# vit à la racine (backend/) tandis que le frontend vit dans site/frontend/.
# main.py sert le frontend depuis ../frontend : on copie donc site/frontend/
# vers /app/frontend pour rétablir la structure backend/ + frontend/ attendue.
FROM python:3.13-slim

# Pas de .pyc, sortie non bufferisée (logs immédiats).
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# 1) Dépendances d'abord (cache Docker tant que requirements ne change pas).
COPY backend/requirements.txt backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt

# 2) Code applicatif : backend à la racine, frontend depuis site/frontend/.
COPY backend/ backend/
COPY site/frontend/ frontend/

# La base SQLite, le secret de signature et le .env vivent dans backend/ :
# monter un volume sur /app/backend pour les conserver entre redémarrages.
WORKDIR /app/backend

EXPOSE 8000

# Un seul worker : SQLite + le thread de purge ne supportent pas le multi-process.
# Le port est paramétrable via $PORT (Render/Heroku l'imposent) ; 8000 par défaut.
# Forme « shell » pour que ${PORT} soit bien substitué.
CMD uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}
