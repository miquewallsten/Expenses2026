"""Tests for the Phase 8.1 embedding ingestion service."""
from __future__ import annotations

from packages.modules.ai.models_embedding import DocumentEmbedding
from packages.modules.ai.service.embedding_service import (
    chunk_text,
    embed_text,
    find_similar,
    index_document,
)


def test_chunk_text_short_returns_single_chunk():
    chunks = chunk_text("hello world")
    assert chunks == ["hello world"]


def test_chunk_text_long_overlapping_chunks():
    text = "a" * 2500
    chunks = chunk_text(text, size=1000, overlap=200)
    # step = 800 → starts at 0, 800, 1600, 2400 → 4 chunks
    assert len(chunks) == 4
    assert all(len(c) <= 1000 for c in chunks)
    # consecutive chunks must share `overlap` chars
    assert chunks[0][-200:] == chunks[1][:200]


def test_embed_text_deterministic_same_input(monkeypatch):
    monkeypatch.delenv("OLLAMA_EMBED_URL", raising=False)
    a = embed_text("invoice for catering services")
    b = embed_text("invoice for catering services")
    assert a == b
    assert len(a) == 32


def test_index_document_creates_rows_and_returns_count(db_session, test_company, monkeypatch):
    monkeypatch.delenv("OLLAMA_EMBED_URL", raising=False)
    text = "x" * 2200  # → 3 chunks at 1000/200
    n = index_document(
        db_session,
        company_id=test_company.id,
        text=text,
        document_id=None,
        meta={"source": "test"},
    )
    db_session.commit()
    assert n == 3
    rows = (
        db_session.query(DocumentEmbedding)
        .filter(DocumentEmbedding.company_id == test_company.id)
        .all()
    )
    assert len(rows) == 3
    assert {r.chunk_index for r in rows} == {0, 1, 2}
    assert all(r.embedding is not None for r in rows)


def test_index_document_replaces_existing_for_same_document_id(
    db_session, test_company, monkeypatch
):
    monkeypatch.delenv("OLLAMA_EMBED_URL", raising=False)
    # First pass — 3 chunks tagged with document_id=42
    index_document(
        db_session,
        company_id=test_company.id,
        text="x" * 2200,
        document_id=42,
    )
    db_session.commit()
    first = (
        db_session.query(DocumentEmbedding)
        .filter(DocumentEmbedding.document_id == 42)
        .count()
    )
    assert first == 3

    # Re-index same document — old rows must be deleted, only new survive.
    index_document(
        db_session,
        company_id=test_company.id,
        text="short replacement",
        document_id=42,
    )
    db_session.commit()
    second = (
        db_session.query(DocumentEmbedding)
        .filter(DocumentEmbedding.document_id == 42)
        .all()
    )
    assert len(second) == 1
    assert second[0].chunk_text == "short replacement"


def test_find_similar_returns_best_match_and_isolates_company(
    db_session, test_company, monkeypatch
):
    monkeypatch.delenv("OLLAMA_EMBED_URL", raising=False)

    # Index two distinct strings under test_company.id …
    index_document(db_session, company_id=test_company.id, text="catering invoice for office lunch")
    index_document(db_session, company_id=test_company.id, text="rental agreement for warehouse")
    # … and a third under a *different* company.
    index_document(db_session, company_id=test_company.id + 999, text="catering invoice for office lunch")
    db_session.commit()

    hits = find_similar(
        db_session,
        company_id=test_company.id,
        query_text="catering invoice for office lunch",
        k=5,
    )
    assert hits, "expected at least one match"
    # All hits must belong to test_company.id only.
    assert all(r.company_id == test_company.id for r, _ in hits)
    # The exact-text row should rank first.
    assert hits[0][0].chunk_text == "catering invoice for office lunch"
    # Identical-input cosine should be ~1.0.
    assert hits[0][1] > 0.999
