# 📚 Documentation VOLT PC / VoltCore

Sommaire de la documentation projet. Point d'entrée général : le [README](../README.md) à la racine.

## Démarrer
- [README](../README.md) — présentation, lancement local, Stripe, structure du projet.
- [deploiement.md](deploiement.md) — mise en production : Docker Compose + HTTPS automatique, ou Render.

## Suivi & planification
- [roadmap.md](roadmap.md) — feuille de route, état réel, ce qui reste à faire.
- [a-faire.md](a-faire.md) — backlog d'améliorations classé par priorité (crédibilité, achat, configurateur, UX…).

## Catalogue & contenus
- [campagne-images.md](campagne-images.md) — pipeline images produit + descriptions enrichies, et **état d'avancement** de la collecte d'images Amazon.

## Outillage (ne pas déplacer)
Ces fichiers sont lus automatiquement par Claude Code / les agents à un chemin fixe :
- `../CLAUDE.md`, `../AGENTS.md` — instructions agents + graphify.
- `../.claude/skills/run-voltcore/` — skill pour lancer/tester l'app (`SKILL.md` + `smoke.py`).
- `../backend/scripts/README.md` — scripts de maintenance ponctuelle.

## Fichiers d'état (générés, dans `backend/`)
Non destinés à la lecture humaine directe, mais utiles au suivi :
- `_gallery_progress.md` — journal détaillé de la campagne images (repris par le `/loop`).
- `_gallery_ids.json` — IDs d'images Amazon collectés par produit.
- `_worklist.json` — liste de travail (245 produits + jetons de correspondance).
