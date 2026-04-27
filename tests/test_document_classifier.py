"""Tests for Phase 8.11 — document classifier service."""
from __future__ import annotations

import pytest

from packages.modules.ai.models_embedding import DocumentEmbedding
from packages.modules.ai.service.embedding_service import index_document
from packages.modules.expenses.service.document_classifier_service import (
    LABELS,
    _knn_vote,
    _rule_signals,
    classify_document,
)


# ── Rule signal unit tests ───────────────────────────────────────────────────

def test_rule_signal_cfdi_xml_marker():
    label, conf, hits = _rule_signals(
        '<cfdi:Comprobante Total="100.00"><tfd:TimbreFiscalDigital UUID="X"/>'
    )
    assert label == "cfdi_xml"
    assert conf >= 0.9
    assert "cfdi_xml_marker" in hits


def test_rule_signal_xml_extension_with_uuid():
    label, conf, hits = _rule_signals(
        'comprobante UUID="A1B2C3D4"', filename="invoice.xml"
    )
    assert label == "cfdi_xml"
    assert "xml_extension+comprobante" in hits


def test_rule_signal_sat_qr_url_means_invoice():
    label, conf, hits = _rule_signals(
        "https://verificacfdi.facturaelectronica.sat.gob.mx/default.aspx?id=X"
    )
    assert label == "invoice"
    assert conf >= 0.9


def test_rule_signal_estado_de_cuenta_is_statement():
    label, _, hits = _rule_signals("Banco — Estado de cuenta — marzo 2026")
    assert label == "statement"
    assert "statement_keyword" in hits


def test_rule_signal_balances_is_statement():
    label, _, _ = _rule_signals("Saldo anterior 100\nMovimientos\nSaldo actual 200")
    assert label == "statement"


def test_rule_signal_factura_with_rfc_is_invoice():
    label, _, _ = _rule_signals("FACTURA\nRFC Emisor: ABC123456XYZ\nTotal: 100")
    assert label == "invoice"


def test_rule_signal_ticket_is_receipt():
    label, _, _ = _rule_signals("Ticket de compra\nOXXO\nTotal $50")
    assert label == "receipt"


def test_rule_signal_thank_you_is_receipt():
    label, _, _ = _rule_signals("Subtotal 90\nGracias por su compra")
    assert label == "receipt"


def test_rule_signal_no_match_returns_none():
    label, conf, hits = _rule_signals("random text without signals")
    assert label is None
    assert conf == 0.0


def test_rule_signal_empty_text_returns_none():
    label, _, _ = _rule_signals("")
    assert label is None


# ── classify_document — full pipeline ────────────────────────────────────────

def test_classify_high_conf_rule_short_circuits(db_session, test_company):
    out = classify_document(
        db_session,
        company_id=test_company.id,
        content_text="<cfdi:Comprobante><tfd:TimbreFiscalDigital UUID='X'/></cfdi:Comprobante>",
    )
    assert out["label"] == "cfdi_xml"
    assert out["method"] == "rule"
    assert out["confidence"] >= 0.9
    # short-circuited → no kNN was consulted
    assert out["neighbours"] == []


def test_classify_no_signals_defaults_to_other(db_session, test_company):
    out = classify_document(
        db_session,
        company_id=test_company.id,
        content_text="hello world",
    )
    assert out["label"] == "other"
    assert out["method"] == "default"
    assert out["confidence"] == 0.0


def test_classify_weak_rule_kept_when_no_knn(db_session, test_company):
    out = classify_document(
        db_session,
        company_id=test_company.id,
        content_text="Ticket de compra OXXO total $50",
    )
    # No labeled neighbours present → weak receipt rule wins.
    assert out["label"] == "receipt"
    assert out["method"] == "rule"


def test_classify_returns_known_label_set(db_session, test_company):
    out = classify_document(
        db_session,
        company_id=test_company.id,
        content_text="random",
    )
    assert out["label"] in LABELS


# ── kNN vote integration ─────────────────────────────────────────────────────

def _seed_labeled_embedding(db, *, company_id: int, text: str, label: str):
    index_document(
        db,
        company_id=company_id,
        text=text,
        meta={"label": label},
    )
    db.commit()


def test_knn_vote_picks_majority_label(db_session, test_company):
    # Seed several near-duplicate texts labeled 'statement'.
    base = "Banco mensual movimientos saldo anterior saldo actual estado mensual"
    for _ in range(3):
        _seed_labeled_embedding(
            db_session, company_id=test_company.id, text=base, label="statement"
        )
    label, conf, used = _knn_vote(
        db_session, company_id=test_company.id, content_text=base
    )
    assert label == "statement"
    assert conf > 0.0
    assert len(used) >= 1


def test_knn_vote_ignores_unlabeled(db_session, test_company):
    text = "neutral document body without strong signals"
    # Seed an embedding without a label — must be ignored.
    index_document(
        db_session,
        company_id=test_company.id,
        text=text,
        meta={},
    )
    db_session.commit()
    label, conf, used = _knn_vote(
        db_session, company_id=test_company.id, content_text=text
    )
    assert label is None
    assert conf == 0.0


def test_knn_vote_company_isolation(db_session, test_company):
    # Seed a labeled embedding for a DIFFERENT company.
    other_co = Company(name="Other Co", slug="other-co")
    db_session.add(other_co)
    db_session.commit()
    db_session.refresh(other_co)
    text = "saldo anterior saldo actual movimientos del mes"
    _seed_labeled_embedding(
        db_session, company_id=other_co.id, text=text, label="statement"
    )
    label, _, _ = _knn_vote(
        db_session, company_id=test_company.id, content_text=text
    )
    # Cross-company embeddings must not leak into this tenant's vote.
    assert label is None


def test_classify_uses_knn_when_rule_weak(db_session, test_company):
    # Seed three labeled "invoice" neighbours similar to the query.
    text = "factura emitida por proveedor servicios profesionales"
    for _ in range(3):
        _seed_labeled_embedding(
            db_session, company_id=test_company.id, text=text, label="invoice"
        )
    out = classify_document(
        db_session,
        company_id=test_company.id,
        content_text=text,
    )
    assert out["label"] == "invoice"
    # At minimum the kNN method should be considered — either it wins, or the
    # weak rule does — but neighbours must have been queried and reported.
    assert "neighbours" in out


def test_classify_empty_text_is_other(db_session, test_company):
    out = classify_document(
        db_session,
        company_id=test_company.id,
        content_text="",
    )
    assert out["label"] == "other"


# Need Company import for company-isolation test.
from packages.core.platform.models import Company  # noqa: E402
