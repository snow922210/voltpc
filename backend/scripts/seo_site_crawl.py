"""Crawler SEO reproductible pour VoltCore.

Usage:
    python backend/scripts/seo_site_crawl.py http://127.0.0.1:8050

Le script respecte robots.txt, suit au maximum trois redirections, explore
jusqu'à 500 pages et produit un export JSON ainsi qu'un rapport Markdown.
"""

from __future__ import annotations

import argparse
import json
import re
import time
import urllib.robotparser
import xml.etree.ElementTree as ET
from collections import Counter, defaultdict, deque
from dataclasses import dataclass, field
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urldefrag, urljoin, urlsplit, urlunsplit

import requests


PROJECT = Path(__file__).resolve().parents[2]
DEFAULT_OUTPUT = PROJECT / "docs" / "seo-data" / "crawl"
USER_AGENT = "VoltCoreSEOAudit/1.0"


def clean_url(url: str) -> str:
    url, _ = urldefrag(url)
    parsed = urlsplit(url)
    path = re.sub(r"/{2,}", "/", parsed.path or "/")
    return urlunsplit((parsed.scheme.lower(), parsed.netloc.lower(), path, parsed.query, ""))


def words(text: str) -> int:
    return len(re.findall(r"[A-Za-zÀ-ÖØ-öø-ÿ0-9]+", text or ""))


def schema_types(value) -> list[str]:
    found = []
    if isinstance(value, dict):
        kind = value.get("@type")
        if isinstance(kind, str):
            found.append(kind)
        elif isinstance(kind, list):
            found.extend(str(item) for item in kind)
        for child in value.values():
            found.extend(schema_types(child))
    elif isinstance(value, list):
        for child in value:
            found.extend(schema_types(child))
    return found


class PageParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.title_parts: list[str] = []
        self.h1_parts: list[list[str]] = []
        self.description = ""
        self.canonical = ""
        self.robots = ""
        self.links: list[dict] = []
        self.images: list[dict] = []
        self.jsonld_raw: list[str] = []
        self.visible_text: list[str] = []
        self._in_title = False
        self._h1_index: int | None = None
        self._anchor_index: int | None = None
        self._jsonld_index: int | None = None
        self._skip_depth = 0

    def handle_starttag(self, tag: str, attrs_list) -> None:
        attrs = {str(k).lower(): (v or "") for k, v in attrs_list}
        tag = tag.lower()
        if tag in {"script", "style", "noscript", "svg"}:
            self._skip_depth += 1
        if tag == "title":
            self._in_title = True
        elif tag == "h1":
            self.h1_parts.append([])
            self._h1_index = len(self.h1_parts) - 1
        elif tag == "meta":
            name = attrs.get("name", "").lower()
            if name == "description":
                self.description = attrs.get("content", "").strip()
            elif name == "robots":
                self.robots = attrs.get("content", "").strip()
        elif tag == "link" and "canonical" in attrs.get("rel", "").lower():
            self.canonical = attrs.get("href", "").strip()
        elif tag == "a" and attrs.get("href"):
            self.links.append(
                {
                    "href": attrs["href"].strip(),
                    "anchor": attrs.get("aria-label", "").strip(),
                    "_text": [],
                }
            )
            self._anchor_index = len(self.links) - 1
        elif tag == "img":
            self.images.append(
                {
                    "src": attrs.get("src", "").strip(),
                    "alt": attrs.get("alt"),
                    "width": attrs.get("width", ""),
                    "height": attrs.get("height", ""),
                    "loading": attrs.get("loading", ""),
                    "decoding": attrs.get("decoding", ""),
                    "fetchpriority": attrs.get("fetchpriority", ""),
                }
            )
            if self._anchor_index is not None and attrs.get("alt"):
                self.links[self._anchor_index]["_text"].append(attrs["alt"].strip())
        elif tag == "script" and attrs.get("type", "").lower() == "application/ld+json":
            self.jsonld_raw.append("")
            self._jsonld_index = len(self.jsonld_raw) - 1

    def handle_endtag(self, tag: str) -> None:
        tag = tag.lower()
        if tag == "title":
            self._in_title = False
        elif tag == "h1":
            self._h1_index = None
        elif tag == "a":
            self._anchor_index = None
        elif tag == "script":
            self._jsonld_index = None
        if tag in {"script", "style", "noscript", "svg"} and self._skip_depth:
            self._skip_depth -= 1

    def handle_data(self, data: str) -> None:
        text = " ".join(data.split())
        if self._in_title and text:
            self.title_parts.append(text)
        if self._h1_index is not None and text:
            self.h1_parts[self._h1_index].append(text)
        if self._anchor_index is not None and text:
            self.links[self._anchor_index]["_text"].append(text)
        if self._jsonld_index is not None:
            self.jsonld_raw[self._jsonld_index] += data
        if not self._skip_depth and text:
            self.visible_text.append(text)

    def result(self) -> dict:
        parsed_schemas = []
        schema_blocks = []
        schema_errors = []
        for raw in self.jsonld_raw:
            try:
                value = json.loads(raw)
                schema_blocks.append(value)
                parsed_schemas.extend(schema_types(value))
            except json.JSONDecodeError as exc:
                schema_errors.append(str(exc))
        links = []
        for link in self.links:
            anchor = link["anchor"] or " ".join(link.pop("_text", [])).strip()
            links.append({"href": link["href"], "anchor": anchor})
        return {
            "title": " ".join(self.title_parts).strip(),
            "description": self.description,
            "canonical": self.canonical,
            "robots": self.robots,
            "h1": [" ".join(parts).strip() for parts in self.h1_parts],
            "links": links,
            "images": self.images,
            "schema_types": sorted(set(parsed_schemas)),
            "schema_blocks": schema_blocks,
            "schema_errors": schema_errors,
            "word_count": words(" ".join(self.visible_text)),
        }


@dataclass
class CrawlState:
    base: str
    max_pages: int
    delay: float
    session: requests.Session = field(default_factory=requests.Session)
    pages: dict[str, dict] = field(default_factory=dict)
    edges: list[dict] = field(default_factory=list)
    discovered_depth: dict[str, int] = field(default_factory=dict)
    sitemap_urls: set[str] = field(default_factory=set)
    sitemap_advertised_urls: set[str] = field(default_factory=set)
    sitemap_errors: list[str] = field(default_factory=list)

    def __post_init__(self) -> None:
        self.origin = urlsplit(self.base).netloc.lower()
        self.session.headers.update({"User-Agent": USER_AGENT})
        self.robots_url = urljoin(self.base, "/robots.txt")
        self.sitemap_url = urljoin(self.base, "/sitemap.xml")
        self.robot = urllib.robotparser.RobotFileParser()
        self.robot.set_url(self.robots_url)

    def internal(self, url: str) -> bool:
        parsed = urlsplit(url)
        return parsed.scheme in {"http", "https"} and parsed.netloc.lower() == self.origin

    def localize(self, url: str) -> str:
        """Projette une URL canonique de production sur la base locale auditée."""
        parsed = urlsplit(url)
        local_base = urlsplit(self.base)
        return clean_url(
            urlunsplit(
                (
                    local_base.scheme,
                    local_base.netloc,
                    parsed.path or "/",
                    parsed.query,
                    "",
                )
            )
        )

    def fetch_robots(self) -> dict:
        try:
            response = self.session.get(self.robots_url, timeout=20)
            self.robot.parse(response.text.splitlines())
            return {
                "status": response.status_code,
                "content_type": response.headers.get("content-type", ""),
                "body": response.text,
            }
        except requests.RequestException as exc:
            self.robot.parse([])
            return {"status": None, "error": str(exc), "body": ""}

    def fetch_sitemap(self) -> dict:
        try:
            response = self.session.get(self.sitemap_url, timeout=30)
            result = {
                "status": response.status_code,
                "content_type": response.headers.get("content-type", ""),
                "url_count": 0,
            }
            if response.status_code != 200:
                return result
            root = ET.fromstring(response.content)
            locations = []
            lastmods = []
            for element in root.iter():
                local = element.tag.rsplit("}", 1)[-1]
                if local == "loc" and element.text:
                    locations.append(clean_url(element.text.strip()))
                elif local == "lastmod" and element.text:
                    lastmods.append(element.text.strip())
            self.sitemap_advertised_urls.update(locations)
            self.sitemap_urls.update(self.localize(url) for url in locations)
            result["url_count"] = len(locations)
            result["lastmod_count"] = len(lastmods)
            result["unique_lastmod_count"] = len(set(lastmods))
            result["deprecated_priority_count"] = sum(
                1 for element in root.iter() if element.tag.rsplit("}", 1)[-1] == "priority"
            )
            result["deprecated_changefreq_count"] = sum(
                1 for element in root.iter() if element.tag.rsplit("}", 1)[-1] == "changefreq"
            )
            return result
        except (requests.RequestException, ET.ParseError) as exc:
            self.sitemap_errors.append(str(exc))
            return {"status": None, "error": str(exc), "url_count": 0}

    def fetch_page(self, url: str, depth: int | None) -> dict:
        if not self.robot.can_fetch(USER_AGENT, url):
            return {"url": url, "depth": depth, "blocked_by_robots": True}
        chain = []
        current = url
        response = None
        try:
            for _ in range(4):
                response = self.session.get(current, timeout=30, allow_redirects=False)
                if response.is_redirect or response.is_permanent_redirect:
                    location = urljoin(current, response.headers.get("location", ""))
                    chain.append(
                        {
                            "url": current,
                            "status": response.status_code,
                            "location": clean_url(location),
                        }
                    )
                    current = clean_url(location)
                    continue
                break
            if response is None:
                raise requests.RequestException("No response")
            content_type = response.headers.get("content-type", "")
            record = {
                "url": url,
                "final_url": clean_url(current),
                "status": response.status_code,
                "depth": depth,
                "redirect_chain": chain,
                "content_type": content_type,
                "bytes": len(response.content),
                "x_robots_tag": response.headers.get("x-robots-tag", ""),
                "headers": {
                    key.lower(): response.headers.get(key, "")
                    for key in (
                        "Content-Security-Policy",
                        "Strict-Transport-Security",
                        "X-Content-Type-Options",
                        "X-Frame-Options",
                        "Referrer-Policy",
                        "Cache-Control",
                    )
                },
            }
            if "text/html" in content_type.lower():
                parser = PageParser()
                parser.feed(response.text)
                record.update(parser.result())
            return record
        except requests.RequestException as exc:
            return {"url": url, "depth": depth, "error": str(exc), "redirect_chain": chain}

    def crawl(self) -> None:
        queue = deque([(clean_url(self.base), 0)])
        queued = {clean_url(self.base)}

        while queue and len(self.pages) < self.max_pages:
            url, depth = queue.popleft()
            if url in self.pages:
                continue
            record = self.fetch_page(url, depth)
            self.pages[url] = record
            self.discovered_depth.setdefault(url, depth)
            for link in record.get("links", []):
                target = clean_url(urljoin(url, link["href"]))
                if not self.internal(target):
                    continue
                self.edges.append(
                    {
                        "source": url,
                        "target": target,
                        "anchor": link.get("anchor", ""),
                    }
                )
                if target not in queued and target not in self.pages:
                    queued.add(target)
                    self.discovered_depth[target] = depth + 1
                    queue.append((target, depth + 1))
            if self.delay:
                time.sleep(self.delay)

        for url in sorted(self.sitemap_urls):
            if len(self.pages) >= self.max_pages:
                break
            if url not in self.pages:
                self.pages[url] = self.fetch_page(url, None)
                if self.delay:
                    time.sleep(self.delay)

        probes = [
            clean_url(urljoin(self.base, "/__seo_missing_page__")),
            clean_url(urljoin(self.base, "/produit/999999999")),
        ]
        for url in probes:
            if url not in self.pages and len(self.pages) < self.max_pages:
                self.pages[url] = self.fetch_page(url, None)


def summarize(state: CrawlState, robots: dict, sitemap: dict) -> dict:
    pages = list(state.pages.values())
    html_pages = [page for page in pages if "text/html" in page.get("content_type", "").lower()]
    ok_html = [page for page in html_pages if page.get("status") == 200]
    incoming = Counter(edge["target"] for edge in state.edges)
    crawled_urls = set(state.pages)
    sitemap_missing = sorted(state.sitemap_urls - crawled_urls)
    crawled_not_sitemap = sorted(
        url for url in crawled_urls - state.sitemap_urls
        if "__seo_missing_page__" not in url and "999999999" not in url
    )

    duplicate_titles = defaultdict(list)
    duplicate_descriptions = defaultdict(list)
    duplicate_canonicals = defaultdict(list)
    for page in ok_html:
        if page.get("title"):
            duplicate_titles[page["title"]].append(page["url"])
        if page.get("description"):
            duplicate_descriptions[page["description"]].append(page["url"])
        if page.get("canonical"):
            duplicate_canonicals[page["canonical"]].append(page["url"])

    image_total = 0
    image_missing_alt = 0
    image_bad_alt = 0
    image_no_dimensions = 0
    for page in ok_html:
        for image in page.get("images", []):
            image_total += 1
            alt = image.get("alt")
            if alt is None:
                image_missing_alt += 1
            elif alt and not 10 <= len(alt) <= 125:
                image_bad_alt += 1
            if not image.get("width") or not image.get("height"):
                image_no_dimensions += 1

    status_counts = Counter(str(page.get("status", "error")) for page in pages)
    thin = [
        page["url"] for page in ok_html
        if page.get("word_count", 0) < (
            250 if "/produit/" in page["url"] else
            300 if "/categorie/" in page["url"] else
            100
        )
    ]
    noindex = [
        page["url"] for page in ok_html
        if "noindex" in (
            page.get("robots", "") + " " + page.get("x_robots_tag", "")
        ).lower()
    ]
    orphan_sitemap = sorted(
        url for url in state.sitemap_urls
        if incoming[url] == 0 and clean_url(state.base) != url
    )
    depths = {
        page["url"]: page.get("depth")
        for page in pages
        if isinstance(page.get("depth"), int)
    }
    generic_anchors = {"cliquez ici", "ici", "en savoir plus", "voir", "lire la suite"}
    empty_anchor_edges = [
        edge for edge in state.edges if not edge.get("anchor", "").strip()
    ]
    generic_anchor_edges = [
        edge
        for edge in state.edges
        if edge.get("anchor", "").strip().lower() in generic_anchors
    ]
    incoming_counts = Counter(edge["target"] for edge in state.edges)

    return {
        "scope": {
            "base": state.base,
            "max_pages": state.max_pages,
            "pages_crawled": len(pages),
            "html_pages": len(html_pages),
            "sitemap_urls": len(state.sitemap_urls),
        },
        "robots": robots,
        "sitemap": sitemap,
        "status_counts": dict(status_counts),
        "issues": {
            "errors": [page["url"] for page in pages if page.get("error")],
            "non_200": [
                page["url"] for page in pages
                if page.get("status") not in {200, None}
            ],
            "redirects": [
                page["url"] for page in pages if page.get("redirect_chain")
            ],
            "missing_title": [page["url"] for page in ok_html if not page.get("title")],
            "title_too_short": [
                page["url"] for page in ok_html
                if page.get("title") and len(page["title"]) < 30
            ],
            "title_too_long": [
                page["url"] for page in ok_html
                if len(page.get("title", "")) > 60
            ],
            "duplicate_titles": {
                key: value for key, value in duplicate_titles.items() if len(value) > 1
            },
            "missing_description": [
                page["url"] for page in ok_html if not page.get("description")
            ],
            "description_too_short": [
                page["url"] for page in ok_html
                if page.get("description") and len(page["description"]) < 120
            ],
            "description_too_long": [
                page["url"] for page in ok_html
                if len(page.get("description", "")) > 160
            ],
            "duplicate_descriptions": {
                key: value
                for key, value in duplicate_descriptions.items()
                if len(value) > 1
            },
            "missing_h1": [page["url"] for page in ok_html if not page.get("h1")],
            "multiple_h1": [
                page["url"] for page in ok_html if len(page.get("h1", [])) > 1
            ],
            "missing_canonical": [
                page["url"] for page in ok_html if not page.get("canonical")
            ],
            "canonical_mismatch": [
                page["url"] for page in ok_html
                if page.get("canonical")
                and (
                    urlsplit(clean_url(page["canonical"])).path,
                    urlsplit(clean_url(page["canonical"])).query,
                )
                != (
                    urlsplit(clean_url(page.get("final_url", page["url"]))).path,
                    urlsplit(clean_url(page.get("final_url", page["url"]))).query,
                )
                and "?" not in page["url"]
            ],
            "duplicate_canonicals": {
                key: value
                for key, value in duplicate_canonicals.items()
                if len(value) > 1
            },
            "invalid_jsonld": [
                page["url"] for page in ok_html if page.get("schema_errors")
            ],
            "thin_content": thin,
            "noindex": noindex,
            "sitemap_not_crawled": sitemap_missing,
            "crawled_not_sitemap": crawled_not_sitemap,
            "orphan_sitemap_urls": orphan_sitemap,
            "internal_links_to_non_200": sorted(
                {
                    edge["target"]
                    for edge in state.edges
                    if state.pages.get(edge["target"], {}).get("status") not in {200, None}
                }
            ),
        },
        "images": {
            "total_occurrences": image_total,
            "missing_alt": image_missing_alt,
            "non_empty_alt_outside_10_125_chars": image_bad_alt,
            "missing_dimensions": image_no_dimensions,
        },
        "internal_linking": {
            "edges": len(state.edges),
            "max_depth": max(depths.values(), default=0),
            "pages_deeper_than_3": sorted(
                url for url, depth in depths.items() if depth > 3
            ),
            "empty_anchor_links": len(empty_anchor_edges),
            "generic_anchor_links": len(generic_anchor_edges),
            "top_linked_pages": [
                {"url": url, "incoming_links": count}
                for url, count in incoming_counts.most_common(20)
            ],
        },
    }


def markdown(summary: dict) -> str:
    issues = summary["issues"]
    scope = summary["scope"]
    lines = [
        "# Crawl SEO VoltCore",
        "",
        f"- Base : `{scope['base']}`",
        f"- Pages parcourues : **{scope['pages_crawled']}**",
        f"- Pages HTML : **{scope['html_pages']}**",
        f"- URL du sitemap : **{scope['sitemap_urls']}**",
        f"- Statuts : `{json.dumps(summary['status_counts'], ensure_ascii=False)}`",
        "",
        "## Résultats principaux",
        "",
    ]
    fields = [
        ("URL non-200", "non_200"),
        ("Redirections", "redirects"),
        ("Titres absents", "missing_title"),
        ("Titres trop courts", "title_too_short"),
        ("Titres trop longs", "title_too_long"),
        ("Descriptions absentes", "missing_description"),
        ("Descriptions trop courtes", "description_too_short"),
        ("Descriptions trop longues", "description_too_long"),
        ("H1 absents", "missing_h1"),
        ("H1 multiples", "multiple_h1"),
        ("Canonicals absents", "missing_canonical"),
        ("Canonicals incohérents", "canonical_mismatch"),
        ("JSON-LD invalides", "invalid_jsonld"),
        ("Contenus minces", "thin_content"),
        ("Pages noindex", "noindex"),
        ("Pages orphelines du sitemap", "orphan_sitemap_urls"),
        ("Liens internes vers une URL non-200", "internal_links_to_non_200"),
    ]
    for label, key in fields:
        lines.append(f"- {label} : **{len(issues[key])}**")
    lines += [
        f"- Titres dupliqués : **{len(issues['duplicate_titles'])} groupes**",
        f"- Descriptions dupliquées : **{len(issues['duplicate_descriptions'])} groupes**",
        "",
        "## Images dans les pages HTML",
        "",
        f"- Occurrences : **{summary['images']['total_occurrences']}**",
        f"- Alt absent : **{summary['images']['missing_alt']}**",
        f"- Alt non vide hors plage 10–125 caractères : **{summary['images']['non_empty_alt_outside_10_125_chars']}**",
        f"- Dimensions absentes : **{summary['images']['missing_dimensions']}**",
        "",
        "## Maillage interne",
        "",
        f"- Liens internes suivis : **{summary['internal_linking']['edges']}**",
        f"- Profondeur maximale : **{summary['internal_linking']['max_depth']}**",
        f"- Pages au-delà de trois clics : **{len(summary['internal_linking']['pages_deeper_than_3'])}**",
        f"- Liens sans ancre accessible : **{summary['internal_linking']['empty_anchor_links']}**",
        f"- Ancres génériques : **{summary['internal_linking']['generic_anchor_links']}**",
        "",
        "## Détail des URL problématiques",
        "",
    ]
    for label, key in fields:
        values = issues[key]
        if not values:
            continue
        lines += [f"### {label}", ""]
        lines.extend(f"- {url}" for url in values[:100])
        if len(values) > 100:
            lines.append(f"- … et {len(values) - 100} autres URL dans l'export JSON")
        lines.append("")
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("base")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--max-pages", type=int, default=500)
    parser.add_argument("--delay", type=float, default=0.0)
    args = parser.parse_args()

    state = CrawlState(clean_url(args.base), args.max_pages, args.delay)
    robots = state.fetch_robots()
    sitemap = state.fetch_sitemap()
    state.crawl()
    summary = summarize(state, robots, sitemap)
    payload = {
        "summary": summary,
        "pages": list(state.pages.values()),
        "edges": state.edges,
        "sitemap_urls": sorted(state.sitemap_urls),
        "sitemap_advertised_urls": sorted(state.sitemap_advertised_urls),
    }
    args.output.mkdir(parents=True, exist_ok=True)
    (args.output / "crawl.json").write_text(
        json.dumps(payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    (args.output / "CRAWL-REPORT.md").write_text(
        markdown(summary),
        encoding="utf-8",
    )
    print(
        f"{summary['scope']['pages_crawled']} pages | "
        f"{summary['scope']['sitemap_urls']} sitemap | "
        f"{len(summary['issues']['non_200'])} non-200 | "
        f"{len(summary['issues']['thin_content'])} minces"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
