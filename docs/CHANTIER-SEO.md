# Chantier SEO VoltCore

Dernière mise à jour : 1er juillet 2026  
Score de départ : **69/100**  
Objectif : **85/100 avant indexation complète**, puis progression fondée sur les données Search Console.

Ce fichier est la todo-list et le journal de bord du chantier. Une tâche n'est cochée que lorsqu'elle est implémentée **et vérifiée**.

## Registre maître de l'audit complet

Ce registre reprend le périmètre demandé. Les états autorisés sont :
`À faire`, `En cours`, `Partiel`, `Bloqué — accès requis` et `Terminé`.

| # | Chantier | État actuel | Preuve attendue pour terminer |
|---:|---|---|---|
| 1 | Crawl réel de toutes les URL | Partiel — local complet | Export du crawl public, total d'URL et couverture complète |
| 2 | Validation du sitemap et des codes HTTP | Partiel — local complet | XML validé en production, comparaison crawl/sitemap, statut de chaque URL |
| 3 | Test mobile et captures visuelles | Terminé — local | Captures desktop/mobile et anomalies documentées |
| 4 | Lighthouse et Core Web Vitals | Partiel — laboratoire | Rapports Lighthouse puis LCP, INP, CLS terrain |
| 5 | Validation Schema.org / Google Rich Results | Partiel — local conforme | Types extraits, erreurs validées et test Google public |
| 6 | Audit détaillé des titres, H1 et descriptions | Terminé — local | Inventaire complet avec longueurs, doublons et pages fautives |
| 7 | Détection des contenus minces ou dupliqués | Terminé — local | Mesures sur toutes les pages et groupes de similarité |
| 8 | Audit complet des images et textes alternatifs | Partiel — local | Couverture alt, dimensions, poids, format et disponibilité publique |
| 9 | Analyse du maillage interne | Terminé — local | Profondeur, pages orphelines, liens cassés et ancres |
| 10 | Redirections, erreurs 404 et canonicals | Terminé — local | Chaînes, boucles, 404, soft-404 et conflits canonical |
| 11 | Search Console : indexation, clics, impressions, positions | Bloqué — accès requis | Export/API GSC authentifié et période précisée |
| 12 | Backlinks et autorité du domaine | Partiel — Common Crawl | Sources identifiées, domaines référents et niveau de confiance |
| 13 | Analyse concurrentielle et mots-clés | Terminé — sans volumes | Concurrents, intentions, volumes disponibles et écarts |
| 14 | Visibilité ChatGPT, Perplexity et Google AI | Partiel — préparation | Tests datés par plateforme et requête |
| 15 | Tunnel e-commerce et pages catégories | Partiel — jusqu'au checkout | Parcours mobile/desktop, paiement test et friction documentés |
| 16 | Score SXO et expérience utilisateur | Terminé — local | Personas, tâches, score et preuves visuelles |
| 17 | Rapport final et nouvelle note SEO | Terminé — 76/100 local | Rapport consolidé, données structurées et plan d'action |

### Règle de suivi

Après chaque session de travail, le journal doit préciser :

1. ce qui a été contrôlé ;
2. la méthode et le périmètre ;
3. les résultats chiffrés ;
4. les fichiers créés ou modifiés ;
5. les limites et accès manquants ;
6. la prochaine action exacte.

## Priorité 0 — Débloquer la publication

- [ ] Vérifier que `https://voltcore.fr/` répond en HTTPS avec un statut 200.
- [ ] Définir `SITE_INDEXABLE=1` dans l'environnement de production.
- [ ] Vérifier l'absence de `X-Robots-Tag: noindex, nofollow` sur les pages publiques.
- [x] Retirer automatiquement le bandeau de développement lorsque le site est indexable.
- [x] Garder le bandeau et `noindex` en environnement local pour éviter une publication accidentelle.
- [ ] Soumettre `/sitemap.xml` dans Google Search Console.
- [ ] Demander l'indexation de l'accueil, du catalogue, des catégories principales et de cinq produits prioritaires.

### Critères de validation

- L'accueil répond en 200.
- Le HTML public contient `index, follow`.
- L'en-tête HTTP ne contient aucun `noindex`.
- Le bandeau de démonstration est absent.
- Search Console accepte le sitemap.

## Priorité 1 — Fiabiliser le socle technique

- [x] Servir `robots.txt`, `sitemap.xml` et `llms.txt` en GET et HEAD.
- [x] Produire une seule image Open Graph par page.
- [x] Mettre les espaces privés et transactionnels en `noindex`.
- [x] Ajouter des tests anti-régression pour le mode développement et le mode indexable.
- [ ] Tester tous les codes HTTP du sitemap sur la version déployée.
- [x] Vérifier les canonicals de toutes les familles de pages en environnement local.
- [ ] Valider les données structurées avec Google Rich Results Test.
- [ ] Mesurer LCP, INP et CLS sur mobile et ordinateur.
- [ ] Ajouter un contrôle SEO automatique dans la CI.

## Priorité 2 — Catalogue et contenu

- [x] Identifier les fiches produit trop courtes ou trop similaires.
- [x] Générer un inventaire reproductible des longueurs, similarités et images principales.
- [ ] Définir un modèle éditorial par catégorie : usages, compatibilité, avantages, limites et conseils.
- [x] Définir un modèle éditorial commun fondé sur les usages, la compatibilité, les avantages et les limites.
- [x] Établir une première sélection interne de vingt opportunités éditoriales.
- [ ] Enrichir en premier les vingt produits à plus fort potentiel.
- [ ] Ajouter des textes introductifs uniques aux catégories principales.
- [ ] Créer des URL produit descriptives avec redirections 301 depuis les URL numériques.
- [ ] Ajouter des guides d'achat reliés aux catégories et aux produits.
- [ ] Renforcer les pages de confiance : entreprise, expertise, livraison, retours, garanties et SAV.

## Priorité 3 — Images et expérience

- [x] Maintenir les fichiers locaux sous 300 Ko.
- [ ] Vérifier que toutes les images du sitemap produit répondent en 200 et `image/*` en production.
- [ ] Auditer les attributs `alt` des galeries et contenus non produits.
- [x] Vérifier et compléter les dimensions explicites des images produit afin de limiter le CLS.
- [ ] Tester l'expérience mobile : navigation, filtres, configurateur, panier et checkout.
- [ ] Tester l'accessibilité du menu, des formulaires et des modales.

## Priorité 4 — Autorité et visibilité

- [ ] Connecter Search Console et conserver une mesure de référence.
- [ ] Construire la liste initiale des mots-clés et intentions de recherche.
- [ ] Comparer VoltCore aux principaux concurrents sur les catégories prioritaires.
- [ ] Définir un calendrier de guides, comparatifs et contenus de conseil.
- [ ] Obtenir des mentions et liens depuis des sites informatiques pertinents.
- [ ] Suivre les citations de la marque dans les moteurs de recherche génératifs.

## Journal des travaux

### 1er juillet 2026 — Initialisation

**Travail réalisé**

1. Relecture de l'audit précédent et contrôle du code SEO actuel.
2. Confirmation des améliorations déjà présentes : `llms.txt`, HEAD, robots cohérents et suppression du doublon `og:image`.
3. Création de cette todo-list priorisée.
4. Encadrement du bandeau de développement par des marqueurs dédiés.
5. Modification du rendu serveur : lorsque `SITE_INDEXABLE=1`, le bandeau et son message sur les paiements fictifs sont supprimés du HTML.
6. Ajout de trois tests de contrat SEO :
   - développement = `noindex` avec avertissement ;
   - production indexable = `index, follow` sans avertissement ;
   - pages privées = maintien possible de `noindex, follow`.
7. Vérification syntaxique de `backend/main.py` et du nouveau fichier de tests : réussie.
8. Contrôle des erreurs de patch et des espaces parasites avec Git : réussi.

**Fichiers modifiés**

- `frontend/index.html`
- `backend/main.py`
- `backend/tests/test_seo_contract.py`
- `docs/CHANTIER-SEO.md`

**Limites rencontrées**

- Le domaine public n'était pas accessible depuis l'outil d'audit.
- L'environnement Python disponible ne contient pas encore les dépendances FastAPI/uvicorn ; les tests applicatifs doivent donc être exécutés dans l'environnement du projet ou après installation des dépendances.
- Les fichiers `backend/seed.py` et `frontend/js/app.js` contenaient déjà des modifications ; ils ont été volontairement laissés intacts.

**Prochaine étape**

Exécuter les tests, ajouter un contrôle automatique des métadonnées et du sitemap, puis commencer l'inventaire des contenus produit trop minces.

### 1er juillet 2026 — Inventaire automatisé du catalogue

**Travail réalisé**

1. Ajout du script reproductible `backend/scripts/seo_catalog_inventory.py`.
2. Analyse des 290 produits et des 19 catégories sans modifier le catalogue.
3. Mesure de la longueur des descriptions enrichies.
4. Détection des descriptions très similaires à l'intérieur d'une même catégorie.
5. Vérification de la correspondance entre les produits, le registre d'images et les fichiers locaux.
6. Génération de deux livrables dans `docs/seo-data/` :
   - `CATALOGUE-INVENTAIRE.md`, rapport lisible et priorisé ;
   - `catalogue-inventory.json`, données complètes pour les contrôles futurs.

**Résultats**

- 290 produits analysés.
- 36,3 mots de description en moyenne.
- Minimum de 11 mots et maximum de 58 mots.
- 23 produits sans image principale locale reliée.
- 46 paires de descriptions présentant une similarité d'au moins 86 %.
- Les 290 descriptions restent sous 100 mots. Ce résultat porte sur le champ
  descriptif, pas sur toute la page : les caractéristiques, avis et blocs
  associés apportent du contenu supplémentaire.

**Décision**

Le prochain lot éditorial portera d'abord sur vingt fiches à fort potentiel,
et non sur une réécriture massive des 290 produits. Chaque enrichissement
devra apporter une information propre au produit et éviter les variantes
génériques uniquement fondées sur les caractéristiques.

**Prochaine étape**

Résoudre les 23 associations d'images manquantes, puis définir le modèle
éditorial des vingt premières fiches à enrichir.

### 1er juillet 2026 — Premier lot Images

**Travail réalisé**

1. Recherche des fichiers locaux correspondant aux 23 produits signalés.
2. Inspection visuelle du fichier `arc-b580-12-go-1.jpg`.
3. Ajout de l'alias exact `Arc B580 12 Go Limited Edition` dans le registre
   des images et dans le registre des sources.
4. Vérification du poids des 580 fichiers JPEG :
   - 292 dépassent 50 Ko ;
   - 12 dépassent 100 Ko ;
   - aucun ne dépasse 200 Ko.
5. Relecture des balises image des cartes, fiches produit, galeries,
   configurateur et interface d'administration.
6. Ajout de `width`, `height` et `decoding="async"` aux images du sélecteur
   de configuration qui n'avaient pas encore de dimensions explicites.

**Résultats**

- Le nombre d'images principales non reliées passe de 23 à 22.
- Les 22 autres produits ne possèdent pas de fichier local suffisamment sûr
  pour établir une association sans risquer d'afficher un mauvais produit.
- Les images principales ont un texte alternatif descriptif basé sur le nom
  du produit.
- Les miniatures décoratives utilisent volontairement un attribut `alt` vide.
- Aucun fichier ne dépasse le seuil d'avertissement de 200 Ko appliqué aux
  images de contenu.

**Prochaine étape**

Créer une liste d'acquisition exacte pour les 22 visuels manquants, avec une
source vérifiable par référence produit. Aucun visuel générique ou ressemblant
ne sera substitué à une référence précise.

### 1er juillet 2026 — Modèle éditorial et sélection initiale

**Travail réalisé**

1. Création de `docs/SEO-MODELE-FICHE-PRODUIT.md`.
2. Définition d'une structure utile : usages, compatibilité, points forts,
   limites, conseil VoltCore, caractéristiques et retours clients.
3. Ajout des garde-fous « Qui, comment, pourquoi » et anti-contenu générique.
4. Ajout à l'inventaire d'un score d'opportunité interne fondé sur :
   - la mise en avant du produit ;
   - sa note ;
   - son stock ;
   - l'existence d'une promotion ;
   - la présence d'une image principale.
5. Production automatique d'une liste de vingt fiches candidates.

**Limite**

Ce score ne représente pas la demande de recherche. Il sert uniquement à
commencer avec les données disponibles et devra être remplacé par les
impressions, requêtes et positions de Search Console.

**Prochaine étape**

Utiliser le modèle sur un petit lot pilote de fiches, contrôler la similarité
avant/après, puis généraliser seulement si la qualité et l'utilité progressent.

### 1er juillet 2026 — Crawl, rendu mobile, schéma et Lighthouse

**Travail réalisé**

1. Création d'un environnement Python isolé `.venv` et installation des
   dépendances épinglées du projet.
2. Exécution des tests applicatifs : **8 tests sur 8 réussis**.
3. Création du crawler `backend/scripts/seo_site_crawl.py`.
4. Crawl local production-like de **338 URL**, couvrant les **316 URL** du
   sitemap.
5. Correction du crawler pour projeter proprement les URL canoniques
   `https://voltcore.fr` vers l'origine locale sans produire de faux écarts.
6. Correction de trois défauts réels trouvés par le crawl :
   - métadonnées et H1 spécifiques pour le configurateur ;
   - rendu SEO propre de la page Contact ;
   - vraie réponse 404 pour les routes inconnues au lieu d'une soft-404 en 200.
7. Revalidation : aucun H1 absent, aucun canonical incohérent, aucune URL du
   sitemap oubliée et aucune page orpheline.
8. Création de l'audit visuel automatisé
   `backend/scripts/seo_visual_audit.mjs`.
9. Captures de sept routes en desktop et mobile, soit **14 scénarios** :
   accueil, catalogue, catégorie GPU, produit, configurateur, contact et 404.
10. Contrôle du tunnel avec création d'un compte temporaire, vérification,
    ajout au panier, ouverture du checkout et suppression du compte de test.
11. Création et exécution de l'audit Schema.org :
    - 336 pages avec JSON-LD ;
    - 288 fiches Product contrôlées ;
    - 288 conformes aux champs locaux vérifiés ;
    - aucune erreur JSON-LD ni propriété obligatoire manquante.
12. Exécution de quatre rapports Lighthouse puis revalidation de la fiche
    produit après correction.
13. Correctifs d'accessibilité :
    - noms accessibles sur les miniatures ;
    - cibles de 44 × 44 px pour les étoiles ;
    - libellés accessibles pour la notation ;
    - contraste renforcé du texte secondaire ;
    - H1 conservé sur la page 404 après hydratation JavaScript.

**Résultats Lighthouse**

| Scénario | Performance | Accessibilité | SEO | LCP | CLS | TBT |
|---|---:|---:|---:|---:|---:|---:|
| Accueil mobile | 71 | 96 | 100 | 4,3 s | 0 | 0 ms |
| Catalogue mobile | 69 | 94 | 100 | 4,7 s | 0 | 0 ms |
| Accueil desktop | 66 | 93 | 100 | 3,1 s | 0 | 0 ms |
| Produit mobile après correction | 80 | 100 | 100 | 4,3 s | 0 | 24 ms |

**Conclusion performance**

La stabilité visuelle et la réactivité sont bonnes sur l'échantillon, mais le
LCP de laboratoire dépasse encore l'objectif de 2,5 secondes. L'INP réel ne
peut pas être déduit de Lighthouse : il nécessite les données CrUX au 75e
percentile.

**Livrables**

- `docs/seo-data/crawl/crawl.json`
- `docs/seo-data/crawl/CRAWL-REPORT.md`
- `docs/seo-data/visual/visual-audit.json`
- `docs/seo-data/visual/VISUAL-AUDIT.md`
- `docs/seo-data/visual/screenshots/`
- `docs/seo-data/schema/schema-audit.json`
- `docs/seo-data/schema/SCHEMA-REPORT.md`
- `docs/seo-data/lighthouse/`

**Prochaine étape**

Finaliser l'analyse du maillage interne et du SXO, puis détecter les accès
Google disponibles avant d'aborder Search Console, backlinks, mots-clés,
concurrence et visibilité IA.

### 1er juillet 2026 — Données externes, marché, GEO et SXO

**Travail réalisé**

1. Détection des accès Google avec le script officiel du skill :
   niveau **−1, aucun identifiant configuré**.
2. Confirmation que GSC, URL Inspection, GA4, PSI API et CrUX ne sont pas
   accessibles sans clé ou compte de service.
3. Détection des sources de backlinks :
   - DataForSEO absent ;
   - Moz absent ;
   - Bing Webmaster absent ;
   - Common Crawl disponible.
4. Interrogation de Common Crawl `cc-main-2026-jan-feb-mar` :
   domaine absent du crawl et des classements, aucun domaine référent
   échantillonné.
5. Application de la règle de suffisance : aucun score de backlinks numérique,
   car un seul facteur sur sept est disponible.
6. Recherche publique des concurrents visibles sur l'intention
   « configurateur PC ».
7. Analyse de TopAchat, LDLC, Materiel.net, PCSpecialist, PcComponentes et Ma
   Petite Config.
8. Construction d'une architecture de mots-clés par intention, sans inventer
   de volumes.
9. Audit GEO : robots IA accessibles, SSR complet, schéma riche, autorité et
   contenus citables encore faibles. Score de préparation : **56/100**.
10. Analyse SXO du configurateur : type de page aligné avec la SERP, mais
    contenu, autorité et fraîcheur insuffisants. Score SXO : **58/100**.
11. Finalisation du maillage :
    - 11 357 liens internes ;
    - profondeur maximale de trois clics ;
    - zéro page orpheline ;
    - zéro lien interne cassé ;
    - zéro ancre vide ou générique.
12. Optimisation des titres produit et catégorie :
    - titres courts réduits de 208 à 3 ;
    - descriptions courtes réduites de 66 à 27 ;
    - contenus minces réduits de 65 à 49.
13. Ajout d'une introduction unique pour chacune des 19 catégories.
14. Nettoyage du sitemap : retrait des dates artificielles et des priorités
    ignorées.

**Livrables**

- `docs/seo-data/backlinks/BACKLINKS-REPORT.md`
- `docs/seo-data/market/COMPETITORS-KEYWORDS.md`
- `docs/seo-data/geo/GEO-ANALYSIS.md`
- `docs/seo-data/sxo/SXO-REPORT.md`
- `docs/seo-data/onpage/ONPAGE-CONTENT-REPORT.md`
- `docs/seo-data/images/IMAGE-AUDIT.md`
- `docs/seo-data/sitemap/VALIDATION-REPORT.md`
- `docs/seo-data/technical/TECHNICAL-REPORT.md`

**Blocages externes**

- Search Console, GA4 et CrUX : identifiants absents.
- Backlinks complets : Moz/Bing/DataForSEO absents.
- Visibilité directe ChatGPT/Perplexity : outil de suivi absent.
- Validation production : `voltcore.fr` ne répond pas depuis l'environnement
  d'audit.

**Prochaine étape**

Consolider le rapport final et la nouvelle note, puis exécuter le dernier
contrôle de non-régression sur le code et les tests.

### 1er juillet 2026 — Clôture du chantier local

**Travail réalisé**

1. Consolidation du rapport final, du plan d'action et des données d'audit.
2. Calcul de la nouvelle note locale vérifiée : **76/100**, contre 69/100 au
   démarrage.
3. Exécution des huit tests automatisés : **8 réussis**.
4. Validation syntaxique des scripts Python et JavaScript ajoutés ou modifiés.
5. Validation de tous les fichiers JSON produits par l'audit.
6. Contrôle des différences Git : aucune erreur d'espace ou de patch ; seuls
   les avertissements Windows LF/CRLF habituels subsistent.
7. Suppression de quatre comptes temporaires créés par les scénarios du tunnel
   e-commerce.
8. Suppression de l'environnement temporaire `SITE_INDEXABLE=1` et
   `DEV_SHOW_CODES=1` afin de rendre au poste local son mode de développement
   sécurisé.
9. Suppression des caches de tests temporaires.

**Résultat final vérifié**

- 338 URL explorées localement ;
- 316 URL déclarées dans le sitemap et toutes couvertes par le crawl ;
- zéro page orpheline, lien interne cassé ou conflit canonical local ;
- 288 produits sur 288 conformes aux contrôles Schema.org locaux ;
- score Lighthouse mobile de la fiche produit : performance 80,
  accessibilité 100 et SEO 100 ;
- note globale locale : **76/100**.

**Livrables de clôture**

- `../voltcore.fr-audit/FULL-AUDIT-REPORT.md`
- `../voltcore.fr-audit/ACTION-PLAN.md`
- `../voltcore.fr-audit/audit-data.json`
- `docs/seo-data/`

**Ce qui reste volontairement ouvert**

Les lignes 1, 2, 4, 5, 8, 11, 12, 14 et 15 du registre maître restent
partielles ou bloquées lorsqu'une preuve publique, une donnée terrain, un
paiement réel ou un accès tiers est indispensable. Elles ne doivent pas être
marquées « Terminées » sans :

- un domaine de production accessible ;
- un accès Search Console, GA4 et CrUX/PageSpeed ;
- une source complète de backlinks ;
- un outil de suivi ChatGPT/Perplexity/Google AI ;
- un environnement de paiement de test autorisé.

**Prochaine action exacte**

Déployer la version auditée, vérifier que `https://voltcore.fr/` répond en 200,
puis reprendre la priorité 0 de ce fichier avant de connecter Search Console.
