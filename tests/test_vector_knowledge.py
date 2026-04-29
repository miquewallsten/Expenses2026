"""Tests for the agent vector knowledge service and hybrid search."""

from __future__ import annotations

import pytest

from packages.core.platform.models import Company
from packages.modules.agent.core.knowledge import hybrid_search_knowledge
from packages.modules.agent.models_knowledge_chunk import KnowledgeChunk
from packages.modules.agent.service.knowledge_service import index_document, search_knowledge


class TestKnowledgeService:
    def test_index_and_search_roundtrip(self, db_session):
        company = Company(name="Test", slug="test-vec")
        db_session.add(company)
        db_session.commit()

        row = index_document(
            db_session,
            company_id=company.id,
            source_type="product_doc",
            title="Política de gastos",
            body="Define los límites de gastos y aprobaciones.",
            meta={"version": "1.0"},
        )
        db_session.commit()
        assert row.id is not None
        assert isinstance(row, KnowledgeChunk)

        results = search_knowledge(
            db_session,
            company_id=company.id,
            query_text="Define los límites de gastos y aprobaciones.",
            k=5,
            min_score=0.55,
        )
        assert len(results) >= 1
        titles = [r["title"] for r in results]
        assert "Política de gastos" in titles

    def test_search_filters_by_company(self, db_session):
        c1 = Company(name="C1", slug="c1")
        c2 = Company(name="C2", slug="c2")
        db_session.add_all([c1, c2])
        db_session.commit()

        index_document(
            db_session,
            company_id=c1.id,
            source_type="tenant_note",
            title="Nota C1",
            body="Solo visible para empresa uno",
        )
        db_session.commit()

        res = search_knowledge(db_session, company_id=c2.id, query_text="empresa uno", k=5)
        assert res == []

    def test_search_respects_source_type(self, db_session):
        company = Company(name="Test", slug="test-src")
        db_session.add(company)
        db_session.commit()

        index_document(
            db_session,
            company_id=company.id,
            source_type="product_doc",
            title="Doc",
            body="Documentación del producto",
        )
        index_document(
            db_session,
            company_id=company.id,
            source_type="config_history",
            title="Hist",
            body="Documentación del producto",
        )
        db_session.commit()

        res = search_knowledge(
            db_session,
            company_id=company.id,
            query_text="Documentación del producto",
            source_type="product_doc",
            k=5,
        )
        assert len(res) == 1
        assert res[0]["source_type"] == "product_doc"


class TestHybridSearchKnowledge:
    def test_hybrid_returns_vector_results(self, db_session):
        company = Company(name="Test", slug="test-hyb")
        db_session.add(company)
        db_session.commit()

        index_document(
            db_session,
            company_id=company.id,
            source_type="product_doc",
            title="Aprobaciones",
            body="Configura los flujos de aprobación de gastos.",
        )
        db_session.commit()

        chunks = hybrid_search_knowledge(
            db_session, company.id, "Configura los flujos de aprobación de gastos.", k=3
        )
        assert len(chunks) >= 1
        titles = [c["title"] for c in chunks]
        assert "Aprobaciones" in titles
        assert chunks[0]["source"] == "product_doc"

    def test_hybrid_falls_back_to_static_when_no_vector_match(self, db_session):
        company = Company(name="Test", slug="test-hyb2")
        db_session.add(company)
        db_session.commit()

        # No knowledge chunks indexed for this company
        chunks = hybrid_search_knowledge(
            db_session, company.id, "¿qué es una póliza?", k=3
        )
        assert len(chunks) >= 1
        titles = [c["title"].lower() for c in chunks]
        assert any("póliza" in t or "poliza" in t or "voucher" in t for t in titles)
        # Static chunks come from YAML, so they have 'source' like 'domain'
        assert any(c.get("source") != "vector" for c in chunks)

    def test_hybrid_empty_query(self, db_session):
        company = Company(name="Test", slug="test-hyb3")
        db_session.add(company)
        db_session.commit()

        assert hybrid_search_knowledge(db_session, company.id, "", k=3) == []
        assert hybrid_search_knowledge(db_session, company.id, "   ", k=3) == []

    def test_hybrid_with_db_none(self):
        """When db is None, falls back to static search."""
        chunks = hybrid_search_knowledge(None, 1, "gasto", k=3)
        assert len(chunks) >= 1
        assert all("title" in c and "body" in c for c in chunks)
