"""Consolide les exports Lighthouse JSON en un rapport lisible."""

from __future__ import annotations

import json
from pathlib import Path


PROJECT = Path(__file__).resolve().parents[2]
ROOT = PROJECT / "docs" / "seo-data" / "lighthouse"


def number(value, digits=0):
    if value is None:
        return None
    return round(float(value), digits)


def load_report(path: Path) -> dict:
    data = json.loads(path.read_text(encoding="utf-8"))
    categories = data.get("categories", {})
    audits = data.get("audits", {})

    def score(name):
        value = categories.get(name, {}).get("score")
        return number(value * 100) if value is not None else None

    def metric(name, digits=0):
        return number(audits.get(name, {}).get("numericValue"), digits)

    return {
        "name": path.stem,
        "url": data.get("finalDisplayedUrl") or data.get("finalUrl"),
        "fetch_time": data.get("fetchTime"),
        "scores": {
            "performance": score("performance"),
            "accessibility": score("accessibility"),
            "best_practices": score("best-practices"),
            "seo": score("seo"),
        },
        "metrics": {
            "fcp_ms": metric("first-contentful-paint"),
            "lcp_ms": metric("largest-contentful-paint"),
            "cls": metric("cumulative-layout-shift", 3),
            "tbt_ms": metric("total-blocking-time"),
            "speed_index_ms": metric("speed-index"),
            "tti_ms": metric("interactive"),
        },
        "warnings": data.get("runWarnings", []),
        "failed_audits": [
            {
                "id": key,
                "title": audit.get("title"),
                "score": audit.get("score"),
                "display": audit.get("displayValue"),
            }
            for key, audit in audits.items()
            if audit.get("scoreDisplayMode") not in {"notApplicable", "informative", "manual"}
            and audit.get("score") is not None
            and audit.get("score") < 0.9
        ],
    }


def main() -> int:
    reports = [
        load_report(path)
        for path in sorted(ROOT.glob("*.json"))
        if path.name != "lighthouse-summary.json"
    ]
    payload = {"reports": reports}
    (ROOT / "lighthouse-summary.json").write_text(
        json.dumps(payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    lines = [
        "# Synthèse Lighthouse VoltCore",
        "",
        "Mesures de laboratoire sur le serveur local. Elles ne remplacent pas les",
        "données terrain CrUX au 75e percentile. L'INP réel n'est pas disponible",
        "sans trafic Chrome suffisant ; le TBT est présenté uniquement comme",
        "indicateur de réactivité en laboratoire.",
        "",
        "| Scénario | Performance | Accessibilité | Bonnes pratiques | SEO | LCP | CLS | TBT |",
        "|---|---:|---:|---:|---:|---:|---:|---:|",
    ]
    for report in reports:
        scores = report["scores"]
        metrics = report["metrics"]
        lines.append(
            f"| {report['name']} | {scores['performance']} | "
            f"{scores['accessibility']} | {scores['best_practices']} | "
            f"{scores['seo']} | {metrics['lcp_ms']} ms | "
            f"{metrics['cls']} | {metrics['tbt_ms']} ms |"
        )

    lines += ["", "## Audits à améliorer", ""]
    for report in reports:
        lines += [f"### {report['name']}", ""]
        failures = sorted(
            report["failed_audits"],
            key=lambda item: (item["score"], item["id"]),
        )
        if not failures:
            lines.append("Aucun audit noté sous 0,9.")
        else:
            for finding in failures[:20]:
                detail = f" — {finding['display']}" if finding.get("display") else ""
                lines.append(
                    f"- `{finding['id']}` : {finding['title']} "
                    f"(score {finding['score']}){detail}"
                )
        lines.append("")

    (ROOT / "LIGHTHOUSE-SUMMARY.md").write_text("\n".join(lines), encoding="utf-8")
    print(f"{len(reports)} rapports Lighthouse consolidés")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
