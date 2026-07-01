"""Contrats SEO critiques pour éviter les régressions de mise en ligne."""

from pathlib import Path

import main


TEMPLATE = Path(main.INDEX_FILE).read_text(encoding="utf-8")


def test_development_mode_is_noindex_and_keeps_warning(monkeypatch):
    monkeypatch.delenv("SITE_INDEXABLE", raising=False)

    rendered = main._render(TEMPLATE)

    assert 'content="noindex, nofollow"' in rendered
    assert "Site en cours de développement" in rendered


def test_indexable_mode_removes_warning_and_allows_indexing(monkeypatch):
    monkeypatch.setenv("SITE_INDEXABLE", "1")

    rendered = main._render(TEMPLATE)

    assert 'content="index, follow"' in rendered
    assert "Site en cours de développement" not in rendered
    assert "Aucun paiement n'est réel" not in rendered


def test_private_route_can_stay_noindex_in_production(monkeypatch):
    monkeypatch.setenv("SITE_INDEXABLE", "1")

    rendered = main._render(TEMPLATE, robots="noindex, follow")

    assert 'content="noindex, follow"' in rendered
