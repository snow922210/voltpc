"""Inventaire SEO reproductible du catalogue VoltCore.

Le script ne modifie jamais le catalogue. Il mesure la couverture éditoriale,
les descriptions similaires et la présence des images principales, puis écrit
un rapport Markdown et un fichier JSON dans ``docs/seo-data``.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import unicodedata
from collections import Counter
from difflib import SequenceMatcher
from pathlib import Path


BACKEND = Path(__file__).resolve().parents[1]
PROJECT = BACKEND.parent
FRONTEND_IMAGES = PROJECT / "frontend" / "images"
DEFAULT_OUTPUT = PROJECT / "docs" / "seo-data"

sys.path.insert(0, str(BACKEND))

from product_images import PRODUCT_IMAGES  # noqa: E402
from seed import SEED_PRODUCTS  # noqa: E402


def words(text: str) -> list[str]:
    return re.findall(r"[A-Za-zÀ-ÖØ-öø-ÿ0-9]+", text or "")


def normalized(text: str) -> str:
    text = unicodedata.normalize("NFKD", text or "")
    text = "".join(c for c in text if not unicodedata.combining(c))
    return " ".join(words(text.lower()))


def image_path(product: dict) -> Path | None:
    url = PRODUCT_IMAGES.get(product["name"])
    if not url or not url.startswith("/images/"):
        return None
    return FRONTEND_IMAGES / url.removeprefix("/images/")


def similarity_pairs(products: list[dict], threshold: float) -> list[dict]:
    candidates = []
    normalized_descriptions = [normalized(p.get("description", "")) for p in products]
    for left in range(len(products)):
        for right in range(left + 1, len(products)):
            # Les rapprochements entre catégories différentes sont rarement
            # utiles et multiplient inutilement le coût quadratique.
            if products[left].get("category") != products[right].get("category"):
                continue
            ratio = SequenceMatcher(
                None,
                normalized_descriptions[left],
                normalized_descriptions[right],
                autojunk=False,
            ).ratio()
            if ratio >= threshold:
                candidates.append(
                    {
                        "left": products[left]["name"],
                        "right": products[right]["name"],
                        "category": products[left]["category"],
                        "similarity": round(ratio, 3),
                    }
                )
    return sorted(candidates, key=lambda item: item["similarity"], reverse=True)


def build_inventory(similarity_threshold: float = 0.86) -> dict:
    products = list(SEED_PRODUCTS)
    rows = []
    for product in products:
        description = product.get("description", "")
        path = image_path(product)
        count = len(words(description))
        opportunity_score = (
            (30 if product.get("featured") else 0)
            + float(product.get("rating") or 0) * 10
            + min(int(product.get("stock") or 0), 20)
            + (5 if product.get("old_price") else 0)
            + (5 if path and path.is_file() else 0)
        )
        rows.append(
            {
                "name": product["name"],
                "category": product["category"],
                "brand": product["brand"],
                "price": product["price"],
                "stock": product["stock"],
                "rating": product["rating"],
                "featured": bool(product.get("featured")),
                "description_words": count,
                "description_characters": len(description),
                "opportunity_score": round(opportunity_score, 1),
                "content_gate": (
                    "very_short" if count < 100 else
                    "short" if count < 200 else
                    "developing" if count < 400 else
                    "target"
                ),
                "image": str(path.relative_to(PROJECT)) if path else None,
                "image_exists": bool(path and path.is_file()),
            }
        )

    categories = Counter(row["category"] for row in rows)
    gates = Counter(row["content_gate"] for row in rows)
    missing_images = [row for row in rows if not row["image_exists"]]
    similar = similarity_pairs(products, similarity_threshold)

    return {
        "rules": {
            "product_target_words": 400,
            "critical_under_words": 100,
            "weak_under_words": 200,
            "similarity_threshold": similarity_threshold,
        },
        "summary": {
            "products": len(rows),
            "categories": len(categories),
            "average_description_words": round(
                sum(row["description_words"] for row in rows) / max(1, len(rows)), 1
            ),
            "minimum_description_words": min(
                (row["description_words"] for row in rows), default=0
            ),
            "maximum_description_words": max(
                (row["description_words"] for row in rows), default=0
            ),
            "missing_main_images": len(missing_images),
            "similar_description_pairs": len(similar),
            "content_gates": dict(gates),
        },
        "categories": dict(sorted(categories.items())),
        "priority_products": sorted(
            rows,
            key=lambda row: (row["description_words"], row["name"]),
        )[:50],
        "editorial_opportunities": sorted(
            rows,
            key=lambda row: (
                -row["opportunity_score"],
                row["description_words"],
                row["name"],
            ),
        )[:20],
        "missing_images": missing_images,
        "similar_descriptions": similar[:100],
        "products": rows,
    }


def markdown(inventory: dict) -> str:
    summary = inventory["summary"]
    lines = [
        "# Inventaire SEO du catalogue VoltCore",
        "",
        "Rapport généré automatiquement par `backend/scripts/seo_catalog_inventory.py`.",
        "",
        "## Résumé",
        "",
        f"- Produits analysés : **{summary['products']}**",
        f"- Catégories : **{summary['categories']}**",
        f"- Longueur moyenne : **{summary['average_description_words']} mots**",
        f"- Description la plus courte : **{summary['minimum_description_words']} mots**",
        f"- Description la plus longue : **{summary['maximum_description_words']} mots**",
        f"- Images principales absentes : **{summary['missing_main_images']}**",
        f"- Paires très similaires : **{summary['similar_description_pairs']}**",
        "",
        "Le seuil de référence de la skill SEO est de 400 mots pour une page produit.",
        "Ce seuil inclut l'ensemble du contenu utile de la page : description,",
        "caractéristiques, compatibilités, conseils, avis et contenus associés.",
        "",
        "## Répartition éditoriale",
        "",
        "| Niveau | Nombre | Interprétation |",
        "|---|---:|---|",
    ]
    labels = {
        "very_short": "moins de 100 mots",
        "short": "100 à 199 mots",
        "developing": "200 à 399 mots",
        "target": "400 mots et plus",
    }
    for key in ("very_short", "short", "developing", "target"):
        lines.append(
            f"| {key} | {summary['content_gates'].get(key, 0)} | {labels[key]} |"
        )

    lines += [
        "",
        "## Vingt opportunités éditoriales",
        "",
        "Classement interne provisoire fondé sur la mise en avant, la note, le",
        "stock, la promotion et la présence d'une image. Il devra être remplacé",
        "par les impressions et positions Search Console dès que disponibles.",
        "",
        "| Produit | Catégorie | Score interne | Mots |",
        "|---|---|---:|---:|",
    ]
    for row in inventory["editorial_opportunities"]:
        lines.append(
            f"| {row['name']} | {row['category']} | "
            f"{row['opportunity_score']:.1f} | {row['description_words']} |"
        )

    lines += [
        "",
        "## Produits à traiter en premier",
        "",
        "| Produit | Catégorie | Mots | Image |",
        "|---|---|---:|---|",
    ]
    for row in inventory["priority_products"][:30]:
        lines.append(
            f"| {row['name']} | {row['category']} | "
            f"{row['description_words']} | {'oui' if row['image_exists'] else 'non'} |"
        )

    lines += ["", "## Descriptions fortement similaires", ""]
    if inventory["similar_descriptions"]:
        lines += [
            "| Produit A | Produit B | Catégorie | Similarité |",
            "|---|---|---|---:|",
        ]
        for pair in inventory["similar_descriptions"][:30]:
            lines.append(
                f"| {pair['left']} | {pair['right']} | {pair['category']} | "
                f"{pair['similarity']:.1%} |"
            )
    else:
        lines.append("Aucune paire au-dessus du seuil configuré.")

    lines += ["", "## Images principales absentes", ""]
    if inventory["missing_images"]:
        lines.extend(f"- {row['name']}" for row in inventory["missing_images"][:100])
    else:
        lines.append("Aucune image principale absente dans le catalogue source.")

    lines += [
        "",
        "## Prochaine action",
        "",
        "Enrichir les vingt premières fiches de la liste prioritaire avec des",
        "informations propres au produit : usages, public visé, compatibilités,",
        "limites, conseils de montage et alternatives pertinentes.",
        "",
    ]
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--similarity", type=float, default=0.86)
    args = parser.parse_args()

    inventory = build_inventory(args.similarity)
    args.output.mkdir(parents=True, exist_ok=True)
    json_path = args.output / "catalogue-inventory.json"
    report_path = args.output / "CATALOGUE-INVENTAIRE.md"
    json_path.write_text(
        json.dumps(inventory, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    report_path.write_text(markdown(inventory), encoding="utf-8")

    summary = inventory["summary"]
    print(
        f"{summary['products']} produits | "
        f"{summary['average_description_words']} mots en moyenne | "
        f"{summary['missing_main_images']} images absentes | "
        f"{summary['similar_description_pairs']} paires similaires"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
