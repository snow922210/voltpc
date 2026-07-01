# Synthèse Lighthouse VoltCore

Mesures de laboratoire sur le serveur local. Elles ne remplacent pas les
données terrain CrUX au 75e percentile. L'INP réel n'est pas disponible
sans trafic Chrome suffisant ; le TBT est présenté uniquement comme
indicateur de réactivité en laboratoire.

| Scénario | Performance | Accessibilité | Bonnes pratiques | SEO | LCP | CLS | TBT |
|---|---:|---:|---:|---:|---:|---:|---:|
| catalogue-mobile | 69.0 | 94.0 | 100.0 | 100.0 | 4734.0 ms | 0.0 | 0.0 ms |
| home-desktop | 66.0 | 93.0 | 100.0 | 100.0 | 3070.0 ms | 0.0 | 0.0 ms |
| home-mobile | 71.0 | 96.0 | 100.0 | 100.0 | 4330.0 ms | 0.0 | 0.0 ms |
| product-mobile | 80.0 | 100.0 | 96.0 | 100.0 | 4309.0 ms | 0.0 | 24.0 ms |

## Audits à améliorer

### catalogue-mobile

- `color-contrast` : Background and foreground colors do not have a sufficient contrast ratio. (score 0)
- `forced-reflow-insight` : Forced reflow (score 0)
- `heading-order` : Heading elements are not in a sequentially-descending order (score 0)
- `lcp-breakdown-insight` : LCP breakdown (score 0)
- `network-dependency-tree-insight` : Network dependency tree (score 0)
- `render-blocking-insight` : Render-blocking requests (score 0) — Est savings of 3,830 ms
- `first-contentful-paint` : First Contentful Paint (score 0.15) — 4.5 s
- `largest-contentful-paint` : Largest Contentful Paint (score 0.32) — 4.7 s
- `speed-index` : Speed Index (score 0.4) — 6.4 s
- `image-delivery-insight` : Improve image delivery (score 0.5) — Est savings of 272 KiB
- `unminified-css` : Minify CSS (score 0.5) — Est savings of 7 KiB
- `unminified-javascript` : Minify JavaScript (score 0.5) — Est savings of 15 KiB
- `unused-css-rules` : Reduce unused CSS (score 0.5) — Est savings of 26 KiB
- `unused-javascript` : Reduce unused JavaScript (score 0.5) — Est savings of 55 KiB
- `interactive` : Time to Interactive (score 0.79) — 4.8 s

### home-desktop

- `aria-prohibited-attr` : Elements use prohibited ARIA attributes (score 0)
- `color-contrast` : Background and foreground colors do not have a sufficient contrast ratio. (score 0)
- `forced-reflow-insight` : Forced reflow (score 0)
- `lcp-breakdown-insight` : LCP breakdown (score 0)
- `network-dependency-tree-insight` : Network dependency tree (score 0)
- `render-blocking-insight` : Render-blocking requests (score 0) — Est savings of 2,870 ms
- `valid-source-maps` : Missing source maps for large first-party JavaScript (score 0)
- `first-contentful-paint` : First Contentful Paint (score 0.06) — 3.1 s
- `speed-index` : Speed Index (score 0.21) — 3.3 s
- `largest-contentful-paint` : Largest Contentful Paint (score 0.32) — 3.1 s
- `image-delivery-insight` : Improve image delivery (score 0.5) — Est savings of 355 KiB
- `mainthread-work-breakdown` : Minimize main-thread work (score 0.5) — 2.5 s
- `unminified-css` : Minify CSS (score 0.5) — Est savings of 7 KiB
- `unminified-javascript` : Minify JavaScript (score 0.5) — Est savings of 15 KiB
- `unused-css-rules` : Reduce unused CSS (score 0.5) — Est savings of 26 KiB
- `unused-javascript` : Reduce unused JavaScript (score 0.5) — Est savings of 135 KiB
- `interactive` : Time to Interactive (score 0.79) — 3.1 s

### home-mobile

- `color-contrast` : Background and foreground colors do not have a sufficient contrast ratio. (score 0)
- `forced-reflow-insight` : Forced reflow (score 0)
- `lcp-breakdown-insight` : LCP breakdown (score 0)
- `network-dependency-tree-insight` : Network dependency tree (score 0)
- `render-blocking-insight` : Render-blocking requests (score 0) — Est savings of 3,640 ms
- `first-contentful-paint` : First Contentful Paint (score 0.17) — 4.3 s
- `largest-contentful-paint` : Largest Contentful Paint (score 0.41) — 4.3 s
- `speed-index` : Speed Index (score 0.43) — 6.2 s
- `mainthread-work-breakdown` : Minimize main-thread work (score 0.5) — 2.9 s
- `unminified-css` : Minify CSS (score 0.5) — Est savings of 7 KiB
- `unminified-javascript` : Minify JavaScript (score 0.5) — Est savings of 15 KiB
- `unused-css-rules` : Reduce unused CSS (score 0.5) — Est savings of 24 KiB
- `unused-javascript` : Reduce unused JavaScript (score 0.5) — Est savings of 52 KiB
- `interactive` : Time to Interactive (score 0.84) — 4.3 s

### product-mobile

- `errors-in-console` : Browser errors were logged to the console (score 0)
- `forced-reflow-insight` : Forced reflow (score 0)
- `image-delivery-insight` : Improve image delivery (score 0) — Est savings of 289 KiB
- `network-dependency-tree-insight` : Network dependency tree (score 0)
- `render-blocking-insight` : Render-blocking requests (score 0) — Est savings of 2,100 ms
- `unminified-javascript` : Minify JavaScript (score 0) — Est savings of 15 KiB
- `unused-css-rules` : Reduce unused CSS (score 0) — Est savings of 25 KiB
- `unused-javascript` : Reduce unused JavaScript (score 0) — Est savings of 54 KiB
- `largest-contentful-paint` : Largest Contentful Paint (score 0.41) — 4.3 s
- `unminified-css` : Minify CSS (score 0.5) — Est savings of 7 KiB
- `first-contentful-paint` : First Contentful Paint (score 0.51) — 2.9 s
- `interactive` : Time to Interactive (score 0.84) — 4.3 s
