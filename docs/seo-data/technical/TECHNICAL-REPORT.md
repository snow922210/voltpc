# Audit SEO technique VoltCore

Date : 1er juillet 2026

## Score technique local : 78/100

Cette note mesure le code et le serveur local en mode indexable. Elle ne valide
pas le DNS, le certificat, les redirections HTTPS ni les en-têtes réellement
déployés sur `voltcore.fr`, actuellement inaccessible depuis l'audit.

| Catégorie | Note | État |
|---|---:|---|
| Crawlabilité | 95 | 316 URL du sitemap couvertes, robots valide |
| Indexabilité | 82 | Canonicals cohérents, noindex privé, production à confirmer |
| Sécurité | 82 | CSP et en-têtes présents, HTTPS/HSTS public à confirmer |
| Structure des URL | 66 | Catégories propres, produits encore basés sur un ID |
| Mobile | 92 | Aucun débordement sur 7 routes testées |
| Core Web Vitals | 55 | CLS/TBT bons, LCP laboratoire trop lent |
| Données structurées | 98 | 288 Product valides localement |
| Rendu JavaScript | 96 | Contenu critique et JSON-LD présents dans le HTML initial |
| IndexNow | 0 | Non implémenté |

## Points forts

- `robots.txt`, `sitemap.xml` et `llms.txt` disponibles en GET et HEAD.
- Sitemap entièrement couvert par le crawl local.
- Aucune page orpheline et aucun lien interne cassé.
- Canonicals cohérents après correction.
- Vraies réponses 404 pour les produits et routes inconnus.
- Pages privées et transactionnelles en `noindex, follow`.
- SSR des titres, descriptions, H1, contenu principal et JSON-LD.
- CSP, X-Content-Type-Options, X-Frame-Options et Referrer-Policy.
- Aucun débordement horizontal sur mobile ou desktop dans l'échantillon.

## Problèmes prioritaires

### LCP laboratoire

Le LCP varie de 3,1 à 4,7 secondes sur l'échantillon principal et atteint
4,3 secondes sur la fiche produit revalidée. L'objectif est inférieur à
2,5 secondes.

Les pistes Lighthouse principales sont :

- ressources bloquantes ;
- CSS et JavaScript inutilisés ;
- livraison d'images ;
- travail du thread principal et reflows forcés.

### Production non vérifiable

Le domaine public n'a pas répondu aux outils utilisés. Il faut confirmer :

- résolution DNS ;
- certificat TLS ;
- redirection HTTP vers HTTPS ;
- suppression réelle de `noindex` ;
- HSTS ;
- disponibilité des images et du sitemap.

### URL produit

Les URL `/produit/<id>` sont stables mais peu descriptives. Une migration vers
des slugs devra prévoir une table stable et des redirections 301 sans chaîne.

### IndexNow

IndexNow n'est pas utilisé. Son ajout peut accélérer la découverte sur Bing et
les moteurs compatibles, mais ne remplace pas Google Search Console.

## Validation

Le chantier technique local est considéré terminé lorsque les tests passent,
le crawl ne présente aucun défaut critique et les rapports sont régénérés. Le
chantier public restera partiel jusqu'au rétablissement ou à la mise en ligne
du domaine.
