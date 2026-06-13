# 🗺️ Feuille de route — VOLT PC

> Dernière mise à jour : 13 juin 2026. Document de suivi : coche les cases au fur et à mesure.

---

## ✅ Déjà fait (état actuel)

- **Site en ligne** : https://voltpc.onrender.com (hébergé sur Render, plan gratuit)
- **Code sur GitHub** : https://github.com/snow922210/voltpc (privé/public)
- **HTTPS + sécurité** : en-têtes (CSP, X-Frame-Options…), anti-bruteforce (rate-limiting, verrouillage de compte, codes invalidés après 5 essais)
- **Paiement Stripe test** : fonctionne (carte `4242 4242 4242 4242`)
- **Boutique complète** : 280 produits, favoris, comparateur, pagination, configurateur PC
- **Comptes** : inscription/connexion, mot de passe oublié, profil, carnet d'adresses, panier rattaché au compte
- **Admin** : tableau de bord (CA, top ventes, stock bas), gestion commandes + produits, factures PDF
- **Apparence pro** : mentions « démonstration » retirées
- **Mises à jour auto** : un `git push` → Render redéploie tout seul

---

## 🔴 PRIORITÉ 1 — À régler demain en premier

### Les emails / l'inscription sur le site en ligne
**Problème** : Render gratuit **bloque l'envoi d'emails** (SMTP) depuis sept. 2025.
**Conséquence actuelle** : sur le site en ligne, une **nouvelle inscription est bloquée** (le code ne s'affiche pas ET l'email ne part pas). Le compte démo, lui, marche.

**Choisir UNE option** :
- [ ] **A — Démo (gratuit, 2 min)** : sur Render → Environment → remettre `DEV_SHOW_CODES` = `1`. Le code s'affiche à l'écran, l'inscription remarche. Les emails ne partent pas (OK pour montrer le site).
- [ ] **B — Vrais emails gratuits (Brevo)** : Claude code l'envoi via l'API HTTP de Brevo (non bloquée). Toi : créer un compte Brevo (300 emails/jour gratuits) + vérifier ton adresse expéditrice. → emails fonctionnels depuis Render.
- [ ] **C — Render payant (~7 $/mois)** : débloque le SMTP, ta config Yahoo actuelle remarche sans rien coder.

> 👉 Recommandation : **A** pour l'instant (juste montrer le site), **B** le jour de l'ouverture réelle.

---

## 🟠 PRIORITÉ 2 — Avant d'ouvrir au public (obligatoire pour vendre)

### Légal (vente en France)
- [ ] **Mentions légales** (identité, hébergeur, contact)
- [ ] **CGV** (conditions générales de vente)
- [ ] **Politique de confidentialité (RGPD)**
- [ ] **Bandeau cookies**
- [ ] Renseigner `SHOP_SIRET` et `SHOP_VAT` (apparaissent sur les factures PDF)

### Paiement réel
- [ ] Passer les **clés Stripe en `live`** (au lieu de `sk_test_…`)
- [ ] Créer le **webhook Stripe de production** → `https://voltpc.onrender.com/api/webhook`, coller son `whsec_…` dans Render
- [ ] Tester un vrai paiement de bout en bout

### Données réelles
- [ ] Mettre des **stocks réels** (le catalogue est une démo)
- [ ] Vérifier/ajuster les **prix** (actuellement fictifs)
- [ ] Décider du sort du **compte démo** et des **faux avis** (garder ? retirer ?)

---

## 🟡 PRIORITÉ 3 — Fiabilité / passage à l'échelle

- [ ] **Persistance des données** : sur Render gratuit, la base se **réinitialise à chaque redéploiement** (commandes/comptes perdus). Pour conserver : plan payant + disque persistant (`render.yaml` déjà prêt à l'accueillir), ou migrer vers **PostgreSQL**.
- [ ] **Nom de domaine** personnalisé (ex. `voltpc.fr`) à la place de `voltpc.onrender.com`
- [ ] **Sauvegardes** de la base
- [ ] **Désactiver `DEV_SHOW_CODES`** définitivement le jour où les vrais emails marchent (sécurité)

---

## 🟢 PRIORITÉ 4 — Qualité technique (pas urgent)

- [ ] **Tests automatisés** (aucun pour l'instant) : au minimum la logique de paiement, la réservation de stock, la vérification d'email
- [ ] Migrer `@app.on_event("startup")` (déprécié) → `lifespan` FastAPI
- [ ] Nettoyer la **base locale** (PC) : 8 commandes + comptes de test, stocks à 1

---

## 📌 Aide-mémoire

| Quoi | Valeur |
|---|---|
| Site en ligne | https://voltpc.onrender.com |
| Dépôt GitHub | https://github.com/snow922210/voltpc |
| Render — Logs | https://dashboard.render.com/web/srv-d8m8c33bc2fs738h8u90/logs |
| Render — Variables | https://dashboard.render.com/web/srv-d8m8c33bc2fs738h8u90/env |
| Compte démo | `demo@voltpc.fr` / `demo1234` |
| Lancer en local | double-clic sur `start.bat` → http://127.0.0.1:8000 |
| Publier une modif | `git add -A && git commit -m "..." && git push` (Render redéploie seul) |
| Guide déploiement détaillé | voir `DEPLOYMENT.md` |

### Rappels importants
- **Secrets** : `backend/.env` n'est JAMAIS publié (protégé par `.gitignore`). Les vraies clés vivent dans **Render → Environment**, pas dans le code.
- **Base éphémère** (Render gratuit) : tout repart de zéro à chaque redéploiement → normal pour une démo.
