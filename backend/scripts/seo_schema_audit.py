"""Validation locale des JSON-LD extraits par seo_site_crawl.py."""

from __future__ import annotations

import json
from collections import Counter, defaultdict
from pathlib import Path
from urllib.parse import urlsplit


PROJECT = Path(__file__).resolve().parents[2]
CRAWL = PROJECT / "docs" / "seo-data" / "crawl" / "crawl.json"
OUTPUT = PROJECT / "docs" / "seo-data" / "schema"


def walk(value):
    if isinstance(value, dict):
        yield value
        for child in value.values():
            yield from walk(child)
    elif isinstance(value, list):
        for child in value:
            yield from walk(child)


def types(node: dict) -> set[str]:
    kind = node.get("@type")
    if isinstance(kind, str):
        return {kind}
    if isinstance(kind, list):
        return {str(item) for item in kind}
    return set()


def absolute_url(value) -> bool:
    if isinstance(value, str):
        parsed = urlsplit(value)
        return parsed.scheme in {"http", "https"} and bool(parsed.netloc)
    if isinstance(value, list):
        return bool(value) and all(absolute_url(item) for item in value)
    return False


def main() -> int:
    crawl = json.loads(CRAWL.read_text(encoding="utf-8"))
    findings = []
    type_counts = Counter()
    pages_with_schema = 0
    product_pages = 0
    valid_product_pages = 0
    page_types = defaultdict(set)

    def finding(url, severity, title, detail):
        findings.append(
            {"url": url, "severity": severity, "title": title, "detail": detail}
        )

    for page in crawl["pages"]:
        if page.get("status") != 200 or "text/html" not in page.get("content_type", ""):
            continue
        blocks = page.get("schema_blocks", [])
        if not blocks:
            continue
        pages_with_schema += 1
        url = page["url"]
        product_valid = True
        product_seen = False
        for block in blocks:
            if isinstance(block, dict) and block.get("@context") != "https://schema.org":
                finding(url, "High", "@context absent ou inattendu", str(block.get("@context")))
            for node in walk(block):
                node_types = types(node)
                for kind in node_types:
                    type_counts[kind] += 1
                    page_types[url].add(kind)
                if "Product" in node_types:
                    product_seen = True
                    required = ["name", "image", "description", "offers"]
                    missing = [key for key in required if not node.get(key)]
                    if missing:
                        product_valid = False
                        finding(url, "High", "Product incomplet", ", ".join(missing))
                    if node.get("image") and not absolute_url(node["image"]):
                        product_valid = False
                        finding(url, "High", "Image Product non absolue", str(node["image"]))
                    offers = node.get("offers")
                    offer_nodes = offers if isinstance(offers, list) else [offers]
                    for offer in offer_nodes:
                        if not isinstance(offer, dict):
                            product_valid = False
                            finding(url, "High", "Offer invalide", "Objet attendu")
                            continue
                        offer_missing = [
                            key
                            for key in ("price", "priceCurrency", "availability", "url")
                            if not offer.get(key)
                        ]
                        if offer_missing:
                            product_valid = False
                            finding(url, "High", "Offer incomplet", ", ".join(offer_missing))
                        if offer.get("url") and not absolute_url(offer["url"]):
                            product_valid = False
                            finding(url, "High", "URL Offer non absolue", str(offer["url"]))
                if "AggregateRating" in node_types:
                    missing = [
                        key for key in ("ratingValue", "reviewCount") if node.get(key) is None
                    ]
                    if missing:
                        finding(url, "Medium", "AggregateRating incomplet", ", ".join(missing))
                if "BreadcrumbList" in node_types:
                    items = node.get("itemListElement", [])
                    positions = [
                        item.get("position")
                        for item in items
                        if isinstance(item, dict)
                    ]
                    if positions != list(range(1, len(positions) + 1)):
                        finding(url, "Medium", "Positions Breadcrumb invalides", str(positions))
        if product_seen:
            product_pages += 1
            if product_valid:
                valid_product_pages += 1

    syntax_errors = [
        page["url"]
        for page in crawl["pages"]
        if page.get("schema_errors")
    ]
    summary = {
        "pages_with_schema": pages_with_schema,
        "schema_type_counts": dict(sorted(type_counts.items())),
        "product_pages": product_pages,
        "valid_product_pages": valid_product_pages,
        "jsonld_syntax_errors": len(syntax_errors),
        "findings": len(findings),
    }
    payload = {
        "summary": summary,
        "findings": findings,
        "page_types": {key: sorted(value) for key, value in page_types.items()},
    }
    OUTPUT.mkdir(parents=True, exist_ok=True)
    (OUTPUT / "schema-audit.json").write_text(
        json.dumps(payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    lines = [
        "# Validation Schema.org VoltCore",
        "",
        "Validation locale des blocs JSON-LD présents dans le HTML initial.",
        "Le test Google Rich Results public reste à exécuter lorsque le domaine",
        "de production sera accessible.",
        "",
        f"- Pages avec JSON-LD : **{pages_with_schema}**",
        f"- Pages Product : **{product_pages}**",
        f"- Pages Product conformes aux champs contrôlés : **{valid_product_pages}**",
        f"- Erreurs de syntaxe JSON-LD : **{len(syntax_errors)}**",
        f"- Anomalies de propriétés : **{len(findings)}**",
        "",
        "## Types détectés",
        "",
        "| Type | Occurrences |",
        "|---|---:|",
    ]
    lines.extend(f"| {kind} | {count} |" for kind, count in sorted(type_counts.items()))
    lines += ["", "## Anomalies", ""]
    if not findings:
        lines.append("Aucune anomalie détectée par les règles locales.")
    else:
        for item in findings[:200]:
            lines.append(
                f"- **{item['severity']} — {item['title']}** : "
                f"{item['url']} — {item['detail']}"
            )
    (OUTPUT / "SCHEMA-REPORT.md").write_text("\n".join(lines), encoding="utf-8")
    print(
        f"{pages_with_schema} pages schema | {valid_product_pages}/{product_pages} Product valides | "
        f"{len(findings)} anomalies"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
