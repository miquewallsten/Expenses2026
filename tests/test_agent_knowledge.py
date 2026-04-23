"""Tests for the agent knowledge pack and related tools."""

from __future__ import annotations

import pytest

from packages.modules.agent.core.knowledge import (
    get_chunk,
    list_chunks,
    reload_cache,
    render_for_prompt,
    search_knowledge,
)


@pytest.fixture(autouse=True)
def _fresh_cache():
    reload_cache()
    yield
    reload_cache()


def test_chunks_load_from_all_sources():
    sources = {c["source"] for c in list_chunks()}
    assert {"domain", "modules", "settings", "workflows"}.issubset(sources)


def test_search_finds_poliza():
    chunks = search_knowledge("¿qué es una póliza?", k=3)
    titles = [c["title"].lower() for c in chunks]
    assert any("póliza" in t or "poliza" in t or "voucher" in t for t in titles)


def test_search_synonyms_cfdi_factura():
    via_cfdi = search_knowledge("cfdi", k=3)
    via_factura = search_knowledge("factura", k=3)
    assert any(c["key"] == "cfdi" for c in via_cfdi)
    assert any(c["key"] == "cfdi" for c in via_factura)


def test_search_empty_query_returns_nothing():
    assert search_knowledge("", k=5) == []
    assert search_knowledge("   ", k=5) == []


def test_render_for_prompt_formats():
    chunks = search_knowledge("gasto aprobación", k=2)
    assert chunks
    text = render_for_prompt(chunks)
    assert "Conocimiento del producto" in text
    assert text.count("\n- ") == len(chunks)


def test_get_chunk_by_key():
    chunk = get_chunk("expense")
    assert chunk is not None
    assert chunk["source"] == "domain"
    assert "gasto" in chunk["title"].lower() or "expense" in chunk["title"].lower()


def test_no_match_returns_empty():
    # Intentionally-garbage tokens with zero overlap.
    assert search_knowledge("xyzzzqqq9999", k=3) == []
