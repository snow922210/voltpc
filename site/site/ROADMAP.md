# Feuille de route - VOLT PC / VoltCore

> Derniere mise a jour : 18 juin 2026. Document de suivi : coche les cases au fur et a mesure.

---

## Etat apres intervention Codex

### Fait dans le code

- [x] Verifie que l'integration Brevo API existe deja dans `backend/mailer.py`
- [x] Verifie que Brevo est prioritaire sur SMTP quand `BREVO_API_KEY` est configure
- [x] Ajoute des tests critiques dans `backend/tests/test_critical_flows.py`
- [x] Ajoute `pytest` dans `backend/requirements.txt`
- [x] Migre le demarrage FastAPI de `@app.on_event("startup")` vers `lifespan`
- [x] Corrige le README sur la carte Stripe de test
- [x] Remet cette roadmap a jour avec l'etat reel du projet

### Tests ajoutes

- [x] Inscription + verification email avec code a usage unique
- [x] Reservation de stock lors de la creation d'une commande
- [x] Restitution de stock idempotente
- [x] Finalisation de paiement idempotente
- [x] Vidage du panier apres commande payee
- [x] Refus d'une commande quand le stock est insuffisant
- [x] Payload Brevo avec plusieurs destinataires et piece jointe

### Verification effectuee

Commande lancee avec le Python embarque de Codex :

```powershell
python -m pytest backend/tests/test_critical_flows.py -q
```

Resultat :

```text
5 passed
```

Compilation Python verifiee sur :

- `backend/main.py`
- `backend/mailer.py`
- `backend/payments.py`
- `backend/database.py`
- `backend/tests/test_critical_flows.py`

### Impossible a faire automatiquement ici

- [ ] Mettre a jour Graphify : la commande `graphify` n'est pas disponible dans ce terminal
- [ ] Verifier `git diff` / `git status` : la commande `git` n'est pas disponible dans ce terminal
- [ ] Configurer Render : necessite l'acces au dashboard
- [ ] Configurer Brevo : necessite le compte Brevo et la cle API
- [ ] Configurer Stripe live : necessite le dashboard Stripe

### Actions manuelles restantes

1. Dans Brevo :
   - creer ou ouvrir le compte Brevo
   - verifier l'adresse expediteur
   - recuperer la cle API transactionnelle

2. Dans Render -> Environment :
   - ajouter `BREVO_API_KEY`
   - verifier `MAIL_FROM`
   - verifier `SHOP_NAME`
   - laisser `DEV_SHOW_CODES` vide en production reelle
   - definir `VOLTPC_SECRET`
   - definir `DATABASE_URL` si PostgreSQL est active

3. Dans Stripe :
   - passer en cles `live` quand la boutique est prete
   - creer le webhook production vers `/api/webhook`
   - renseigner `STRIPE_WEBHOOK_SECRET`
   - tester un vrai paiement

4. Avant vente reelle :
   - choisir definitivement le nom public : `VOLT PC` ou `VoltCore`
   - renseigner les vraies mentions legales
   - verifier les CGV / confidentialite / retours
   - mettre les vrais prix
   - mettre les vrais stocks
   - decider quoi faire du compte demo et des faux avis

---

## Deja fait

- **Site en ligne** : https://voltpc.onrender.com (Render, plan gratuit)
- **Code sur GitHub** : https://github.com/snow922210/voltpc
- **HTTPS + securite** : en-tetes de securite, anti-bruteforce, verrouillage de compte, codes invalides apres plusieurs essais
- **Paiement Stripe test** : Checkout + webhook signe + verification du statut au retour client
- **Emails transactionnels** : SMTP + Brevo API en priorite quand `BREVO_API_KEY` est configure
- **Boutique** : catalogue, recherche, filtres, filtres par specifications, tri, pagination, favoris, comparateur, configurateur PC
- **Confiance / legal** : page Qui sommes-nous, mentions legales, CGV, confidentialite, retours/remboursement, bandeau cookies, bloc confiance au panier/checkout
- **Comptes** : inscription, verification email, connexion, mot de passe oublie, profil, carnet d'adresses, panier serveur
- **Commandes** : reservation de stock, paiement, historique, annulation client avant expedition, factures PDF
- **Admin** : tableau de bord, commandes, statuts, suivi transporteur, produits, alertes stock bas
- **Configuration production** : Docker, Caddy, Render, PostgreSQL possible via `DATABASE_URL`
- **Tests critiques ajoutes** : auth/email, stock, paiement idempotent, Brevo payload

---

## Priorite 1 - A verifier sur Render

### Emails de production

Le code sait deja utiliser Brevo via HTTP, ce qui contourne le blocage SMTP du plan gratuit Render.

- [ ] Creer / verifier le compte Brevo
- [ ] Verifier l'adresse expediteur utilisee dans `MAIL_FROM`
- [ ] Ajouter `BREVO_API_KEY` dans Render -> Environment
- [ ] Garder `DEV_SHOW_CODES` vide en production reelle
- [ ] Tester une inscription neuve de bout en bout sur le site en ligne
- [ ] Tester le mot de passe oublie sur le site en ligne

Pour une demo sans vrais emails, `DEV_SHOW_CODES=1` reste possible, mais uniquement temporairement.

---

## Priorite 2 - Avant d'ouvrir au public

### Legal et coherence de marque

Les pages existent deja, mais elles contiennent encore des textes a personnaliser.

- [ ] Choisir definitivement le nom public : `VOLT PC` ou `VoltCore`
- [ ] Remplacer les textes provisoires des mentions legales par les vraies informations
- [ ] Renseigner `SHOP_NAME`, `SHOP_ADDRESS`, `SHOP_SIRET`, `SHOP_VAT`, `SHOP_EMAIL`
- [ ] Faire relire les CGV / confidentialite / retours par une personne competente
- [ ] Verifier que les factures PDF affichent les bonnes mentions

### Paiement reel

- [ ] Passer les cles Stripe en `live`
- [ ] Creer le webhook Stripe production vers `https://voltpc.onrender.com/api/webhook`
- [ ] Coller le vrai `STRIPE_WEBHOOK_SECRET` dans Render
- [ ] Tester un vrai paiement de bout en bout
- [ ] Definir la procedure de remboursement Stripe pour les commandes annulees apres paiement

### Donnees reelles

- [ ] Mettre des stocks reels
- [ ] Verifier et ajuster les prix
- [ ] Decider du sort du compte demo
- [ ] Retirer ou assumer clairement les faux avis
- [ ] Verifier les credits/licences des images produits

---

## Priorite 3 - Fiabilite

- [ ] Activer une base persistante en production : PostgreSQL via `DATABASE_URL` ou disque persistant
- [ ] Mettre en place une sauvegarde reguliere de la base
- [ ] Definir `VOLTPC_SECRET` en production pour garder les sessions stables entre redemarrages
- [ ] Restreindre `CORS_ORIGINS` au domaine reel
- [ ] Activer `ENABLE_HSTS=1` uniquement quand le HTTPS final est pret
- [ ] Ajouter un nom de domaine personnalise

---

## Priorite 4 - Qualite technique

- [x] Ajouter des tests critiques de base
- [ ] Elargir les tests API avec un client HTTP FastAPI
- [ ] Tester les webhooks Stripe avec signatures simulees
- [ ] Tester les droits admin
- [ ] Migrer `@app.on_event("startup")` vers un `lifespan` FastAPI
- [ ] Decouper progressivement `backend/main.py` par domaine : auth, catalogue, panier, commandes, admin
- [ ] Decouper progressivement `frontend/js/app.js` par domaine : router, API, auth, panier, catalogue, configurateur, admin

---

## Priorite 5 - Ameliorations boutique

### Achat

- [x] Filtres par specifications principales
- [x] Recommandations produit : compatible avec, alternative moins chere, alternative plus puissante
- [x] Comparateur avec differences importantes mises en avant
- [ ] Fiche produit plus premium : galerie, specs essentielles, avis mieux structures
- [ ] Panier plus rassurant : economie promo, reste avant livraison offerte, stock disponible

### Configurateur PC

- [x] Score par usage et detection de desequilibres
- [x] Profils rapides / configurations preconstruites
- [ ] Export / partage d'une configuration
- [ ] Recommandations automatiques pour completer une configuration incomplete

---

## Aide-memoire

| Quoi | Valeur |
|---|---|
| Site en ligne | https://voltpc.onrender.com |
| Depot GitHub | https://github.com/snow922210/voltpc |
| Render - Logs | https://dashboard.render.com/web/srv-d8m8c33bc2fs738h8u90/logs |
| Render - Variables | https://dashboard.render.com/web/srv-d8m8c33bc2fs738h8u90/env |
| Compte demo | `demo@voltpc.fr` / `demo1234` |
| Lancer en local | double-clic sur `start.bat` puis http://127.0.0.1:8000 |
| Publier une modif | `git add -A && git commit -m "..." && git push` |
| Guide deploiement | voir `DEPLOYMENT.md` |

### Rappels

- Ne jamais publier `backend/.env`.
- Les vraies cles vivent dans Render -> Environment.
- Sur Render gratuit, le disque peut etre ephemere : sans PostgreSQL ou disque persistant, comptes et commandes peuvent disparaitre au redeploiement.
