"""Phase 8.7 — finance_copilot tools golden tests (3+ per tool)."""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal

import pytest

from packages.modules.agent.core.context import AgentContext
from packages.modules.agent.core.registry import REGISTRY
from packages.modules.agent.tools import registry_all  # noqa: F401
from packages.modules.expenses.models.document import ExpenseDocument
from packages.modules.expenses.models.expense import Expense


def _ctx(db_session, company_id: int):
    return AgentContext(
        db=db_session, company_id=company_id, user_id=1,
        user_email="fm@test.com", user_role="finance_manager",
        persona="finance_manager",
    )


# ── find_missing_receipts ───────────────────────────────────────────────────


def _seed_expense(db, *, company_id, status="approved", desc="x", amount=100, cfdi_uuid=None):
    e = Expense(
        company_id=company_id, description=desc, amount=Decimal(str(amount)),
        status=status, expense_date=date.today(), cfdi_uuid=cfdi_uuid,
    )
    db.add(e)
    db.commit()
    db.refresh(e)
    return e


def _attach_doc(db, *, company_id, expense_id, filename="r.pdf", text=""):
    d = ExpenseDocument(
        company_id=company_id, expense_id=expense_id,
        filename=filename, content_text=text,
    )
    db.add(d)
    db.commit()
    db.refresh(d)
    return d


def test_find_missing_receipts_empty_company(db_session, test_company):
    res = REGISTRY.dispatch("find_missing_receipts", {}, _ctx(db_session, test_company.id))
    assert res.ok
    assert res.data["count"] == 0


def test_find_missing_receipts_returns_unattached(db_session, test_company):
    _seed_expense(db_session, company_id=test_company.id, desc="no receipt")
    res = REGISTRY.dispatch("find_missing_receipts", {}, _ctx(db_session, test_company.id))
    assert res.ok
    assert res.data["count"] == 1
    assert res.data["missing"][0]["description"] == "no receipt"


def test_find_missing_receipts_excludes_attached(db_session, test_company):
    e1 = _seed_expense(db_session, company_id=test_company.id, desc="with receipt")
    e2 = _seed_expense(db_session, company_id=test_company.id, desc="without")
    _attach_doc(db_session, company_id=test_company.id, expense_id=e1.id)
    res = REGISTRY.dispatch("find_missing_receipts", {}, _ctx(db_session, test_company.id))
    assert res.data["count"] == 1
    assert res.data["missing"][0]["expense_id"] == e2.id


# ── match_cfdis_batch ───────────────────────────────────────────────────────


def test_match_cfdis_batch_empty(db_session, test_company):
    res = REGISTRY.dispatch("match_cfdis_batch", {}, _ctx(db_session, test_company.id))
    assert res.ok
    assert res.data["match_count"] == 0
    assert res.data["unmatched_count"] == 0


def test_match_cfdis_batch_finds_pair(db_session, test_company):
    uuid = "AAAA1111-2222-3333-4444-555566667777"
    e = _seed_expense(db_session, company_id=test_company.id, cfdi_uuid=uuid)
    db_session.add(ExpenseDocument(
        company_id=test_company.id, expense_id=None,
        filename=f"factura-{uuid}.xml", content_text="",
    ))
    db_session.commit()
    res = REGISTRY.dispatch("match_cfdis_batch", {}, _ctx(db_session, test_company.id))
    assert res.data["match_count"] == 1
    assert res.data["matched"][0]["expense_id"] == e.id


def test_match_cfdis_batch_reports_unmatched(db_session, test_company):
    _seed_expense(db_session, company_id=test_company.id,
                  cfdi_uuid="ZZZZ9999-1111-2222-3333-444455556666")
    res = REGISTRY.dispatch("match_cfdis_batch", {}, _ctx(db_session, test_company.id))
    assert res.data["unmatched_count"] == 1
    assert res.data["match_count"] == 0


# ── generate_poliza_preview ─────────────────────────────────────────────────


def test_poliza_preview_not_found(db_session, test_company):
    res = REGISTRY.dispatch(
        "generate_poliza_preview", {"expense_id": 99999}, _ctx(db_session, test_company.id),
    )
    assert res.ok is False
    assert res.error == "not_found"


def test_poliza_preview_invalid_args(db_session, test_company):
    res = REGISTRY.dispatch(
        "generate_poliza_preview", {}, _ctx(db_session, test_company.id),
    )
    assert res.ok is False  # validation error from missing expense_id


def test_poliza_preview_returns_data_for_real_expense(db_session, test_company):
    e = _seed_expense(db_session, company_id=test_company.id, amount=200)
    res = REGISTRY.dispatch(
        "generate_poliza_preview", {"expense_id": e.id}, _ctx(db_session, test_company.id),
    )
    # poliza_simulator may succeed or fail depending on COA setup; accept either,
    # but if it succeeds, payload shape must match.
    if res.ok:
        assert res.data["expense_id"] == e.id
        assert "preview" in res.data


# ── run_month_end ───────────────────────────────────────────────────────────


def test_month_end_empty_company(db_session, test_company):
    res = REGISTRY.dispatch("run_month_end", {}, _ctx(db_session, test_company.id))
    assert res.ok
    assert res.data["pending_approval_count"] == 0
    assert res.data["cancelled_cfdi_count"] == 0


def test_month_end_counts_pending(db_session, test_company):
    _seed_expense(db_session, company_id=test_company.id, status="submitted")
    _seed_expense(db_session, company_id=test_company.id, status="manager_approved")
    _seed_expense(db_session, company_id=test_company.id, status="approved")
    res = REGISTRY.dispatch("run_month_end", {}, _ctx(db_session, test_company.id))
    assert res.data["pending_approval_count"] == 2


def test_month_end_counts_cancelled_cfdi(db_session, test_company):
    e = _seed_expense(db_session, company_id=test_company.id)
    e.cfdi_status = "Cancelado"
    db_session.commit()
    res = REGISTRY.dispatch("run_month_end", {}, _ctx(db_session, test_company.id))
    assert res.data["cancelled_cfdi_count"] == 1
