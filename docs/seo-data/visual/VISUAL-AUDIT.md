# Audit visuel et mobile VoltCore

- Pages et variantes testées : **14**
- Réponses non-200 : **2**
- Débordements horizontaux : **0**
- Pages avec erreur console : **14**
- Pages avec contrôles sans nom : **2**
- Pages avec petites cibles tactiles : **14**

## Tunnel e-commerce

- Produit ajouté au panier : **true**
- Bouton de commande visible : **true**
- Checkout authentifié atteint : **true**
- Compte de test supprimé : **true**

## Pages contrôlées

| Appareil | Route | HTTP | H1 | Débordement | Erreurs console | Petites cibles |
|---|---|---:|---:|---|---:|---:|
| desktop | / | 200 | 1 | non | 1 | 29 |
| desktop | /catalogue | 200 | 1 | non | 1 | 105 |
| desktop | /categorie/cartes-graphiques | 200 | 1 | non | 1 | 74 |
| desktop | /produit/1 | 200 | 1 | non | 2 | 31 |
| desktop | /configurateur | 200 | 1 | non | 1 | 27 |
| desktop | /contact | 200 | 1 | non | 1 | 27 |
| desktop | /__audit_page_absente__ | 404 | 1 | non | 2 | 26 |
| mobile | / | 200 | 1 | non | 1 | 33 |
| mobile | /catalogue | 200 | 1 | non | 1 | 27 |
| mobile | /categorie/cartes-graphiques | 200 | 1 | non | 1 | 25 |
| mobile | /produit/1 | 200 | 1 | non | 2 | 29 |
| mobile | /configurateur | 200 | 1 | non | 1 | 31 |
| mobile | /contact | 200 | 1 | non | 1 | 23 |
| mobile | /__audit_page_absente__ | 404 | 1 | non | 2 | 22 |

Les captures sont disponibles dans `docs/seo-data/visual/screenshots/`.
