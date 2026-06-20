# Scripts utilitaires (maintenance ponctuelle)

Scripts **jetables** séparés du code applicatif. Ils ne sont **pas** importés par
l'API ; ils servent à amorcer/ajuster les données de démo. À lancer depuis ce
dossier :

```powershell
cd voltpc\backend\scripts
python add_products.py
```

| Script | Rôle |
|---|---|
| `add_products.py` | Insère les produits de `seed.py` absents de la base (idempotent). |
| `rename_products.py` | Normalise les noms de produits (préfixe catégorie). |
| `reset_stock.py` | Remet tous les stocks à 1 (tests). |
| `fetch_images.py` | Télécharge une photo libre (Wikimedia Commons) par produit. |
| `refetch_images.py` | Re-télécharge les images mal assorties (requêtes plus strictes). |
| `download_exact_images.py` | Téléchargement direct d'images par URL. |
| `fetch_boxes.py` | Récupère des visuels de boîtes produit. |

> Les modules de **données** (`seed.py`, `seed_cpu.py`, `seed_intel.py`,
> `seed_budget.py`, `seed_extra.py`, `perf.py`) restent dans `backend/` : ils sont
> importés au démarrage de l'API.
