# Audit titres, H1, descriptions et contenu

Date : 1er juillet 2026  
Périmètre : 338 URL locales, dont les 316 URL du sitemap

## Résultat après corrections

| Contrôle | Nombre |
|---|---:|
| Titres absents | 0 |
| Titres inférieurs à 30 caractères | 3 |
| Titres supérieurs à 60 caractères | 0 |
| Descriptions absentes | 0 |
| Descriptions inférieures à 120 caractères | 27 |
| Descriptions supérieures à 160 caractères | 0 |
| H1 absents | 0 |
| H1 multiples | 0 |
| Pages minces selon les seuils du crawler | 49 |

## Améliorations réalisées

- Les titres produit utilisent maintenant la marque et la catégorie lorsque
  cela apporte du contexte.
- Les titres trop courts sont passés de **208 à 3**.
- Les pages catégories utilisent des titres orientés intention d'achat.
- Chaque catégorie possède désormais une introduction propre à son sujet.
- Les descriptions courtes sont passées de **66 à 27**.
- Les contenus minces détectés sont passés de **65 à 49**.

## Éléments restants

### Titres courts

- `qui-sommes-nous`
- `mentions-legales`
- `compte` — page privée en `noindex`, impact SEO négligeable

### Descriptions courtes

Vingt-trois fiches produit environ possèdent encore une meta description
inférieure à 120 caractères. La meta reprend le contenu produit : la bonne
correction consiste à enrichir la fiche avec des informations vérifiées, pas à
gonfler artificiellement la balise.

### Contenus minces

- 39 fiches produit ;
- 10 petites catégories.

Ces pages restent fonctionnelles et structurées, mais leur profondeur
éditoriale est inférieure au seuil interne. Les caractéristiques et avis
apportent une valeur réelle ; le prochain lot doit ajouter des usages,
compatibilités, limites et conseils propres à chaque référence.

## Doublons

Les principaux doublons exacts observés concernent :

- `/catalogue?cat=...` ;
- les URL propres `/categorie/<slug>`.

Ces doublons sont intentionnellement consolidés vers la même URL canonique.
Les URL propres sont seules présentes dans le sitemap. Il ne s'agit donc pas
d'une duplication indexable non maîtrisée.

L'inventaire éditorial du catalogue détecte également 46 paires de
descriptions proches. Elles doivent être réécrites progressivement en
commençant par les produits à potentiel et par les similarités les plus fortes.
