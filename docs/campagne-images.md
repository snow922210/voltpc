# Campagne images & descriptions produit

Comment les **fiches produit** sont enrichies : descriptions détaillées + galeries
de 3-5 vraies photos par produit. Tous les scripts sont dans `backend/`.

## 1. Descriptions enrichies (terminé — 245/245)

`backend/enrich_descriptions.py` part de la phrase d'accroche écrite à la main dans
`seed.py` et ajoute 1-2 phrases construites à partir des **specs réelles** de chaque
produit (VRAM, TDP, socket, fréquence, capacité…). C'est appliqué automatiquement à
l'import de `seed.py`, donc propagé en base par `resync_catalog.py` (et en prod via
`RESYNC_ON_BOOT=1`).

> Source unique : modifier l'accroche dans `seed.py` suffit, l'enrichi suit.

## 2. Galeries multi-images

Le frontend (fiche produit) tente d'afficher `images/<slug>-1.jpg … -5.jpg` et retire
automatiquement les vignettes qui ne chargent pas. Il suffit donc de **déposer les
fichiers** ; aucun changement de code n'est requis.

Deux scripts produisent ces images (carré blanc 800×800) à partir d'IDs d'images Amazon :

| Script | Rôle |
|---|---|
| `add_gallery_images.py` | Ajoute les vues secondaires `-2…-N` **sans toucher** à `-1`. Lit `_gallery_ids.json` (`{nom: [ids…]}`). Saute les fichiers déjà présents. |
| `set_full_gallery.py` | Réécrit la galerie **complète, `-1` incluse** (lit `_full_gallery.json`). À réserver aux corrections (ex. RAM dont l'image principale pré-existante était fausse). |

### Méthode de collecte (via navigateur)
1. Recherche Amazon.fr du produit → choisir la **bonne fiche** (modèle + capacité + couleur exacts).
2. Extraire les IDs des miniatures de la galerie (en filtrant vidéos et images génériques).
3. Vérification **visuelle obligatoire** pour le stockage et la RAM (capacité/couleur imprimées).
4. Générer puis contrôler le rendu.

### Pièges connus
- Les fiches Amazon basculent souvent en variante **blanche** par défaut → vérifier le titre (`Blanc`/`Gris`/`Noir`).
- Les CPU AMD partagent des **images génériques** (socket, « sans ventilateur ») → ne garder que la boîte/puce.
- Plusieurs images principales RAM pré-existantes étaient **fausses** (mauvais modèle/marque) → corrigées via `set_full_gallery.py`.

## 3. État d'avancement

Le journal détaillé et reprenable est dans **`backend/_gallery_progress.md`**
(catégories faites, skips justifiés, règles). Reprise : relancer le `/loop` de collecte.

Au dernier point : **GPU, CPU et RAM terminés** ; restent stockage, cartes mères,
alimentations, boîtiers, refroidissement, écrans et périphériques.
