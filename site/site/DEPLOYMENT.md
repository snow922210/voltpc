# Déploiement — VOLT PC

## Option A — Docker Compose + HTTPS automatique (recommandé)

Déploiement complet (app + reverse proxy Caddy + TLS Let's Encrypt) en une commande.

**Prérequis** : un serveur avec Docker, un nom de domaine dont le DNS (A/AAAA)
pointe vers ce serveur, et les ports 80/443 ouverts.

```bash
# 1. Variables du proxy (domaine + email Let's Encrypt)
cp deploy.env.example .env          # puis éditer DOMAIN et ACME_EMAIL

# 2. Config applicative en mode PROD (voir checklist ci-dessous)
nano backend/.env                   # DEV_SHOW_CODES vide, CORS_ORIGINS, clés Stripe live…

# 3. Build + lancement
docker compose up -d --build
```

Caddy obtient et renouvelle automatiquement le certificat TLS. Le site est alors
servi en HTTPS sur votre domaine.

- `voltpc-data` (volume) conserve la base SQLite **et** le secret de signature →
  les sessions/commandes survivent aux redéploiements. **Sans persistance, tout
  est perdu** à chaque recréation du conteneur.
- `caddy-data` (volume) conserve les certificats TLS (évite de re-solliciter
  Let's Encrypt à chaque redémarrage — attention aux quotas).

Commandes utiles : `docker compose logs -f` · `docker compose down` ·
sauvegarde : `docker run --rm -v voltpc_voltpc-data:/d -v $PWD:/b alpine tar czf /b/backup.tgz -C /d .`

## Option B — Docker seul (reverse proxy géré à part)

```bash
docker build -t voltpc .
docker run -d -p 8000:8000 \
  --env-file backend/.env \
  -e VOLTPC_DATA_DIR=/data \
  -v voltpc-data:/data \
  --name voltpc voltpc
```

`VOLTPC_DATA_DIR=/data` place la base + le secret dans le volume sans masquer le
code de l'application. Placez ensuite votre propre proxy HTTPS devant le port 8000.

## Option C — sans Docker

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000
```

## Checklist production

- [ ] **HTTPS obligatoire** : placer un reverse proxy (Caddy, Nginx, Traefik)
      devant l'app. Apple Pay / Google Pay sur Stripe exigent un domaine HTTPS vérifié.
- [ ] **`PUBLIC_BASE_URL`** = l'URL publique HTTPS réelle (sert aux `success_url` /
      `cancel_url` Stripe). Par défaut `http://127.0.0.1:8000` (dev uniquement).
- [ ] **`CORS_ORIGINS`** = le(s) domaine(s) réel(s) (ex. `https://voltcore.fr`).
      Par défaut `*` (à ne PAS laisser en production).
- [ ] **`ENABLE_HSTS=1`** une fois le site servi en HTTPS (active l'en-tête HSTS).
- [ ] **Clés Stripe `live`** + webhook pointant vers `https://<domaine>/api/webhook`
      (récupérer le `whsec_…` dans le Dashboard Stripe, pas via `stripe listen`).
- [ ] **Email transactionnel** renseigné et fonctionnel (`BREVO_API_KEY` recommandé
      sur Render, ou SMTP complet). Les codes de vérification/réinitialisation ne
      sont jamais affichés en production si l'email échoue.
- [ ] **`ADMIN_EMAILS`** = les comptes autorisés à l'espace admin et notifiés lors
      des nouvelles commandes.
- [ ] **Sauvegarde** régulière du volume (`voltpc.db`).
- [ ] **Un seul worker uvicorn** : SQLite, le thread de purge ET le rate-limiting
      en mémoire ne sont pas compatibles multi-process. Pour scaler, migrer vers
      PostgreSQL et déporter le rate-limiting (Redis).

## Sécurité intégrée

L'application applique déjà côté serveur :
- **En-têtes de sécurité** sur toutes les réponses : `Content-Security-Policy`,
  `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`
  (+ `Strict-Transport-Security` si `ENABLE_HSTS=1`).
- **Anti-bruteforce** : le code de vérification/réinitialisation est invalidé après
  5 essais erronés ; le compte est verrouillé 15 min après 5 mots de passe erronés.
- **Rate-limiting par IP** sur `/auth/login`, `/auth/register`, `/auth/resend-code`,
  `/auth/forgot-password`, `/auth/verify`, `/auth/reset-password`.

> Le rate-limiting et le compteur d'IP sont en mémoire (mono-worker). Derrière
> plusieurs instances, déporter ces compteurs dans Redis. Un reverse proxy peut
> en complément ajouter ses propres en-têtes et limites.
