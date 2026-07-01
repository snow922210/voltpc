# Audit des images VoltCore

Date : 1er juillet 2026

## Résumé

| Mesure | Résultat |
|---|---:|
| Fichiers JPEG locaux | 580 |
| Poids total | 30 Mo |
| Fichiers supérieurs à 100 Ko | 12 |
| Fichiers supérieurs à 200 Ko | 0 |
| Occurrences image dans le crawl HTML | 288 |
| Attributs `alt` absents | 0 |
| Dimensions HTML absentes | 0 |
| Alt non vide hors plage 10–125 caractères | 31 |
| Produits sans image principale reliée | 22 |

## Points forts

- Toutes les images trouvées dans le HTML initial possèdent un attribut `alt`.
- Toutes disposent d'une largeur et d'une hauteur explicites.
- Les miniatures décoratives utilisent correctement `alt=""`.
- Aucun fichier local ne dépasse 200 Ko.
- L'image principale d'une fiche n'est pas chargée paresseusement et reçoit
  `fetchpriority="high"`.
- Les images secondaires utilisent `loading="lazy"` et `decoding="async"`.

## Problèmes et opportunités

### Images principales manquantes

Vingt-deux produits n'ont pas de correspondance sûre dans le registre local.
Ils doivent recevoir une image exacte et vérifiée, jamais une image générique
d'un produit ressemblant.

### Formats modernes absents

Le catalogue repose entièrement sur JPEG. WebP ou AVIF permettrait de réduire
le transfert, mais une conversion ne doit être déployée qu'avec :

- conservation d'un fallback ;
- vérification visuelle ;
- mise à jour des chemins ;
- contrôle des métadonnées et du cache.

### Images surdimensionnées pour les miniatures

Les galeries réutilisent des fichiers 800 × 800 dans des emplacements de
58–66 px. Lighthouse estime entre 272 et 355 Kio d'économie possible selon la
page. Des variantes 160 ou 240 px réduiraient ce gaspillage.

### Textes alternatifs courts

Trente-et-un textes alternatifs descriptifs font moins de dix caractères,
principalement lorsque le nom du produit est très court. Ce n'est pas une
absence d'alternative ; ils doivent être revus au cas par cas plutôt que
allongés artificiellement.

## Priorités

1. Acquérir les 22 images exactes manquantes.
2. Générer des miniatures dédiées pour les galeries.
3. Tester WebP sur un lot pilote et mesurer le gain réel.
4. Ajouter `srcset` et `sizes` lorsque plusieurs dimensions existent.
5. Vérifier les URL et types MIME sur la production publique.
