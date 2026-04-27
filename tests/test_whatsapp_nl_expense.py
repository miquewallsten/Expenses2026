"""Phase 8.8 — natural-language expense filing via WhatsApp."""

from __future__ import annotations

from decimal import Decimal

import pytest

from packages.modules.channels.schemas import NormalizedMessage
from packages.modules.channels.service.agent import (
    _classify_intent,
    _handle_nl_expense_filing,
    _parse_nl_expense,
)
from packages.modules.expenses.models import Expense


# ── Classifier ──────────────────────────────────────────────────────────────


@pytest.mark.parametrize("body", [
    "gasté 450 en uber al aeropuerto",
    "pagué $1,200 de comida en oxxo",
    "uber 250 pesos",
    "factura de 1500 mxn en walmart",
    "cobré 800 en gasolina",
])
def test_classifier_detects_nl_expense_filing(body):
    assert _classify_intent(body, has_attachments=False) == "nl_expense_filing"


@pytest.mark.parametrize("body", [
    "Hola",
    "¿Cuánto gasté este mes?",
    "Apruebo el gasto",
    "485921",
])
def test_classifier_does_not_misroute(body):
    assert _classify_intent(body, has_attachments=False) != "nl_expense_filing"


def test_attachments_still_route_to_expense_submission():
    # Even spending text with attachments goes to the doc-driven flow.
    assert _classify_intent("gasté 450 en uber", has_attachments=True) == "expense_submission"


# ── Parser ──────────────────────────────────────────────────────────────────


def test_parser_extracts_amount_and_supplier_and_category():
    out = _parse_nl_expense("gasté 450 en uber al aeropuerto")
    assert out["amount"] == 450.0
    assert "Uber" in (out["supplier"] or "")
    assert out["category_hint"] == "transport"


def test_parser_handles_pesos_keyword():
    out = _parse_nl_expense("uber 250 pesos")
    assert out["amount"] == 250.0


def test_parser_handles_dollar_sign_and_decimals():
    out = _parse_nl_expense("pagué $1200.50 en hotel")
    assert out["amount"] == 1200.5
    assert out["category_hint"] == "lodging"


def test_parser_returns_empty_when_no_amount():
    assert _parse_nl_expense("gasté algo en uber") == {}


def test_parser_categorizes_meals():
    out = _parse_nl_expense("cena 380 en restaurante")
    assert out["category_hint"] == "meals"


# ── Handler creates draft expense ───────────────────────────────────────────


def _msg(company_id, body):
    return NormalizedMessage(
        channel="whatsapp", company_id=company_id,
        sender_ref="+5215512345678", thread_id="+5215512345678",
        body=body, attachments=[],
    )


def test_handler_creates_draft_expense(db_session, test_company, test_user):
    reply = _handle_nl_expense_filing(
        db_session, _msg(test_company.id, "gasté 450 en uber al aeropuerto"),
        user_id=test_user.id,
    )
    assert "450" in reply
    rows = db_session.query(Expense).filter(
        Expense.company_id == test_company.id,
    ).all()
    assert len(rows) == 1
    e = rows[0]
    assert e.amount == Decimal("450.00")
    assert e.status == "draft"
    assert "uber" in e.description.lower()


def test_handler_rejects_message_without_amount(db_session, test_company, test_user):
    reply = _handle_nl_expense_filing(
        db_session, _msg(test_company.id, "gasté algo en uber"),
        user_id=test_user.id,
    )
    assert "monto" in reply.lower()
    assert db_session.query(Expense).count() == 0


def test_handler_persists_supplier_and_category_hints(db_session, test_company, test_user):
    _handle_nl_expense_filing(
        db_session, _msg(test_company.id, "pagué 1200 en hotel"),
        user_id=test_user.id,
    )
    e = db_session.query(Expense).filter(Expense.company_id == test_company.id).one()
    assert e.notes is not None
    import json as json_mod
    notes = json_mod.loads(e.notes)
    assert notes["source"] == "nl_expense_filing"
    assert notes["category_hint"] == "lodging"
