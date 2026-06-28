# ⚡ VOLT PC — E-commerce de composants PC

Site de vente de composants PC complet : **FastAPI + SQLite** côté backend, **SPA vanilla JS** au design dark premium côté frontend.

## Lancement

```powershell
cd voltpc\backend
pip install -r requirements.txt
uvicorn main:app --reload
```

Puis ouvrir **http://127.0.0.1:8000** — le frontend est servi par le backend, aucune autre étape n'est nécessaire. La base SQLite (`voltpc.db`) est créée et remplie automatiquement au premier démarrage (280+ produits, avis, compte démo).

> Déploiement en production : voir **[docs/deploiement.md](docs/deploiement.md)** (Docker, HTTPS, Stripe live).

Ou simplement : double-cliquer sur `start.bat`.

## 📚 Documentation

Toute la doc projet est regroupée dans **[`docs/`](docs/INDEX.md)** :

| Document | Contenu |
|---|---|
| [docs/INDEX.md](docs/INDEX.md) | Sommaire de la documentation |
| [docs/deploiement.md](docs/deploiement.md) | Mise en production (Docker, HTTPS, Stripe live) |
| [docs/roadmap.md](docs/roadmap.md) | Feuille de route et suivi |
| [docs/a-faire.md](docs/a-faire.md) | Améliorations à venir, par priorité |
| [docs/campagne-images.md](docs/campagne-images.md) | Pipeline images/descriptions produit + état d'avancement |

> Fichiers d'outillage (ne pas déplacer) : `CLAUDE.md`, `AGENTS.md`, et le skill `.claude/skills/run-voltcore/`.

## Paiement Stripe

Le paiement passe par **Stripe Checkout** (redirection) avec confirmation par **webhook signé**. Tant qu'aucune clé n'est configurée, le bouton « Payer » renvoie une erreur claire (503) et rien d'autre n'est affecté.

**1. Configurer les clés** (jamais en dur dans le code) :

```powershell
cd voltpc\backend
copy .env.example .env   # puis renseigner STRIPE_SECRET_KEY et STRIPE_WEBHOOK_SECRET
```

**2. En développement local**, relayer les webhooks avec la CLI Stripe :

```powershell
stripe login
stripe listen --forward-to http://127.0.0.1:8000/api/webhook
# copier le secret « whsec_… » affiché dans STRIPE_WEBHOOK_SECRET
```

**3. Flux & sécurité**

| Étape | Route | Sécurité |
|---|---|---|
| Création session | `POST /api/create-checkout-session` | Prix **recalculés en base** (anti-fraude), commande créée « en attente de paiement », **stock non décrémenté** |
| Redirection | → page Stripe hébergée | Les coordonnées bancaires ne transitent jamais par le serveur |
| Confirmation | `POST /api/webhook` | **Signature vérifiée** ; sur `checkout.session.completed` : stock décrémenté + commande « payée » (**idempotent**) |
| Retour client | `#/commande/succes` · `#/commande/annulee` | La page de succès confirme l'état réel via `GET /api/checkout/status` |

Carte de test Stripe : `4242 4242 4242 4242`, date future, CVC libre.

## Configuration (`.env`)

Tout se règle dans `backend/.env` (copié depuis `.env.example`). Chaque bloc est **optionnel** : si non configuré, la fonctionnalité se désactive proprement sans casser le reste.

| Variable | Rôle |
|---|---|
| `STRIPE_SECRET_KEY` · `STRIPE_WEBHOOK_SECRET` | Paiement Stripe |
| `ADMIN_EMAILS` | Emails (séparés par virgule) ayant accès à l'espace admin |
| `CORS_ORIGINS` | Origines autorisées (séparées par virgule) ; `*` par défaut, à restreindre en production |
| `ENABLE_HSTS` | Mettre à `1` en production HTTPS pour activer l'en-tête HSTS |
| `SMTP_HOST` · `SMTP_PORT` · `SMTP_USER` · `SMTP_PASSWORD` · `MAIL_FROM` | Envoi des emails (confirmation, expédition, code de vérification, notif gérant) |
| `SHOP_NAME` · `SHOP_ADDRESS` · `SHOP_SIRET` · `SHOP_VAT` · `SHOP_EMAIL` | Mentions légales des factures PDF (TVA 20% si `SHOP_VAT` rempli, sinon « TVA non applicable, art. 293 B du CGI ») |

⚠️ Le `.env` n'est lu **qu'au démarrage** : après toute modification, **redémarrer** le serveur.

## Comptes & codes de test

| Quoi | Valeur |
|---|---|
| Compte démo | `demo@voltcore.fr` / `demo1234` |
| Codes promo | `VOLT10` (-10 %) · `GAMER15` (-15 %) · `SUMMER20` (-20 %) |
| Carte de test | `4242 4242 4242 4242`, date future, CVC libre |

## Fonctionnalités

**Boutique**
- Catalogue de 280+ composants réels 2026 (RTX 50, Ryzen 9000X3D, Core Ultra 200, DDR5, NVMe Gen5…)
- Recherche, filtres (catégorie, marque, prix), tri, **pagination**, fiches produit détaillées avec specs
- Avis clients avec notes : **un avis par client**, **modification/suppression** de son avis, badge **« achat vérifié »**
- **Favoris** (liste de souhaits) et **comparateur** de produits (jusqu'à 4 en parallèle)
- Panier latéral lié au compte client et sauvegardé côté serveur, codes promo, livraison offerte dès 50 €
- Checkout complet : **réservation de stock dès la commande** (anti-survente), purge automatique des paniers abandonnés

**Configurateur PC**
- Sélection guidée des 8 composants
- Vérification de compatibilité en temps réel : socket CPU/carte mère/ventirad, type de RAM, longueur GPU vs boîtier, puissance d'alimentation vs consommation estimée
- Ajout de la configuration complète au panier en un clic

**Compte**
- Inscription / connexion (mots de passe hachés scrypt, jetons signés HMAC, 7 jours)
- Comptes, paniers, favoris, adresses et commandes persistés en base serveur (PostgreSQL sur Render via `DATABASE_URL`, SQLite locale en développement)
- **Vérification d'email obligatoire** à l'inscription (code à 6 chiffres, valable 15 min)
- **Sécurité anti-bruteforce** : code invalidé après 5 essais, compte verrouillé 15 min après 5 mots de passe erronés, rate-limiting par IP sur toutes les routes d'authentification
- **Mot de passe oublié** (réinitialisation par code email) et **changement de mot de passe**
- **Modification du profil** et **carnet d'adresses** (pré-remplissage au checkout)
- Historique des commandes avec **suivi de livraison** (Payée ▸ Préparée ▸ Expédiée ▸ Livrée), n° de suivi et **téléchargement de la facture PDF**
- **Annulation de commande** par le client tant qu'elle n'est pas expédiée (stock restitué)

**Paiement & emails**
- Stripe Checkout + webhook signé (voir section Paiement Stripe)
- Emails transactionnels : confirmation de commande (avec facture PDF jointe), expédition (avec n° de suivi), code de vérification, notification au gérant à chaque vente

**Espace admin** (réservé aux `ADMIN_EMAILS`)
- **Tableau de bord** : CA total & du jour, panier moyen, meilleures ventes, alertes stock bas, commandes par statut
- Toutes les commandes : client, adresse de livraison, articles, total, filtres par statut et **recherche** (nom, e-mail, n° de commande)
- Changement de statut + saisie du n° de suivi/transporteur (email d'expédition auto au client)
- Gestion du catalogue : modifier prix & stock, créer/supprimer des produits (suppression refusée si le produit figure dans une commande)

**Factures PDF**
- Générées automatiquement à chaque commande payée (jointes à l'email)
- Téléchargeables côté client (ses commandes) et admin (toutes), mentions légales société configurables

## API

| Méthode | Route | Description |
|---|---|---|
| GET | `/api/products` | Catalogue (filtres : `category`, `search`, `brand`, `min_price`, `max_price`, `sort`) |
| GET | `/api/products/{id}` | Fiche produit |
| GET/POST/PATCH/DELETE | `/api/products/{id}/reviews` | Avis : lecture publique ; publier/modifier/supprimer authentifié (1 par client) |
| GET | `/api/categories` | Catégories avec compteurs |
| POST | `/api/auth/register` · `/api/auth/login` | Authentification (renvoie un code à vérifier si non vérifié) |
| POST | `/api/auth/verify` · `/api/auth/resend-code` | Vérification d'email (code à 6 chiffres) |
| POST | `/api/auth/forgot-password` · `/api/auth/reset-password` | Mot de passe oublié (code email) |
| PATCH/POST | `/api/auth/profile` · `/api/auth/change-password` | Modifier le profil / changer le mot de passe |
| GET | `/api/auth/me` | Profil courant (dont `is_admin`) |
| GET/POST/DELETE | `/api/addresses` · `/api/addresses/{id}` | Carnet d'adresses |
| GET/POST/DELETE | `/api/favorites` · `/api/favorites/{id}` | Liste de souhaits |
| POST | `/api/promo/validate` | Validation d'un code promo |
| GET | `/api/orders` | Lister ses commandes |
| POST | `/api/orders/{id}/cancel` | Annuler sa commande (stock restitué) |
| GET | `/api/orders/{id}/invoice` | Facture PDF (propriétaire ou admin) |
| POST | `/api/create-checkout-session` · `/api/webhook` · `/api/checkout/status` | Paiement Stripe |
| GET | `/api/admin/stats` | Indicateurs du tableau de bord (admin) |
| GET | `/api/admin/orders` | Toutes les commandes — filtres `status`, `q` (admin) |
| POST | `/api/admin/orders/{id}/status` | Changer statut + suivi (admin) |
| PATCH/POST/DELETE | `/api/admin/products` · `/api/admin/products/{id}` | Gérer le catalogue (admin) |

Documentation interactive : **http://127.0.0.1:8000/docs**

## Structure

```
voltpc/
├── backend/
│   ├── main.py        # API FastAPI + SQLite (stdlib) + service du frontend
│   ├── payments.py    # Stripe Checkout + webhooks
│   ├── mailer.py      # Emails transactionnels (SMTP)
│   ├── invoice.py     # Génération des factures PDF (fpdf2)
│   ├── perf.py        # Score de performance (tri « performance »)
│   ├── seed*.py       # Catalogue, avis et codes promo de démarrage
│   ├── scripts/       # Utilitaires de maintenance ponctuelle (voir scripts/README.md)
│   ├── requirements.txt
│   └── .env.example   # Modèle de configuration (Stripe, SMTP, admin, société)
├── frontend/
│   ├── index.html
│   ├── css/style.css   # Design system dark néon
│   └── js/app.js       # SPA : routeur, panier, auth, favoris, comparateur, admin
├── docs/               # 📚 Documentation projet (voir docs/INDEX.md)
├── Dockerfile · .dockerignore
└── start.bat
```
