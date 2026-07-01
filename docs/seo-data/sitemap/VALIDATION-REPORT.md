# Validation du sitemap VoltCore

Date : 1er juillet 2026

## Résultat local

| Contrôle | Résultat |
|---|---|
| URL déclarées | 316 |
| XML valide | Oui |
| Limite de 50 000 URL | Respectée |
| URL HTTPS déclarées | Oui |
| URL du sitemap parcourues | 316/316 |
| URL orphelines | 0 |
| URL noindex dans le sitemap | 0 |
| Redirections dans le sitemap | 0 |
| URL non canoniques | 0 |
| Sitemap déclaré dans robots.txt | Oui |

## Correction réalisée

Le sitemap ajoutait la date du jour à toutes les URL et une priorité. Cette
configuration a été retirée :

- une date identique et renouvelée à chaque requête constitue un faux signal de
  modification ;
- `priority` et `changefreq` sont ignorés par Google ;
- aucune date n'est préférable à une date inexacte.

Le jour où les produits disposeront d'une vraie date `updated_at`, un `lastmod`
fiable pourra être réintroduit.

## Limite

La validation porte sur la version locale correspondant au code actuel. Le
statut du sitemap soumis à Google reste inaccessible tant que Search Console
n'est pas configuré et que la production publique ne répond pas à l'audit.
