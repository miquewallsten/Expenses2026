"""Tests for the Phase 8.3 categorization feedback service."""
from __future__ import annotations

import pytest

from packages.modules.ai.models_categorization_feedback import CategorizationFeedback
from packages.modules.ai.service.categorization_feedback_service import (
    record_feedback,
    suggest_category,
)


def test_record_feedback_persists_row_and_embedding(db_session, test_company, monkeypatch):
    monkeypatch.delenv("OLLAMA_EMBED_URL", raising=False)
    row = record_feedback(
        db_session,
        company_id=test_company.id,
        description_text="Uber al aeropuerto",
        corrected_category="travel",
        original_category="other",
        corrected_by_user_id=1,
    )
    db_session.commit()
    assert row.id is not None
    assert row.corrected_category == "travel"
    assert row.description_embedding is not None
    fetched = db_session.query(CategorizationFeedback).filter_by(id=row.id).first()
    assert fetched is not None
    assert fetched.original_category == "other"


def test_record_feedback_requires_description_and_category(db_session, test_company):
    with pytest.raises(ValueError):
        record_feedback(
            db_session, company_id=test_company.id,
            description_text="", corrected_category="travel",
        )
    with pytest.raises(ValueError):
        record_feedback(
            db_session, company_id=test_company.id,
            description_text="x", corrected_category="",
        )


def test_suggest_category_returns_none_with_no_history(db_session, test_company, monkeypatch):
    monkeypatch.delenv("OLLAMA_EMBED_URL", raising=False)
    out = suggest_category(
        db_session, company_id=test_company.id, description_text="Uber",
    )
    assert out is None


def test_suggest_category_picks_majority_after_feedback(
    db_session, test_company, monkeypatch
):
    monkeypatch.delenv("OLLAMA_EMBED_URL", raising=False)
    for _ in range(3):
        record_feedback(
            db_session, company_id=test_company.id,
            description_text="Uber al aeropuerto",
            corrected_category="travel",
        )
    db_session.commit()

    out = suggest_category(
        db_session, company_id=test_company.id,
        description_text="Uber al aeropuerto",
    )
    assert out is not None
    assert out["category"] == "travel"
    assert out["confidence"] >= 0.5
    assert out["votes"] >= 1


def test_suggest_category_isolates_by_company(db_session, test_company, monkeypatch):
    monkeypatch.delenv("OLLAMA_EMBED_URL", raising=False)
    record_feedback(
        db_session, company_id=test_company.id + 999,
        description_text="Uber al aeropuerto", corrected_category="travel",
    )
    db_session.commit()
    out = suggest_category(
        db_session, company_id=test_company.id,
        description_text="Uber al aeropuerto",
    )
    assert out is None  # the only feedback row belongs to a different company


def test_suggest_category_ignores_low_score_neighbours(
    db_session, test_company, monkeypatch
):
    monkeypatch.delenv("OLLAMA_EMBED_URL", raising=False)
    record_feedback(
        db_session, company_id=test_company.id,
        description_text="totally unrelated quantum physics paper",
        corrected_category="research",
    )
    db_session.commit()
    # min_score=0.99 forces rejection — different texts won't hit that bar.
    out = suggest_category(
        db_session, company_id=test_company.id,
        description_text="lunch with client",
        min_score=0.99,
    )
    assert out is None
