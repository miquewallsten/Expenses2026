"""Phase 5.6 — Agent V2 finance copilot tools."""
from __future__ import annotations

from datetime import date
from decimal import Decimal

import pytest
from sqlalchemy.orm import Session

from packages.core.platform.models import Company
from packages.core.platform.models_user import User
from packages.modules.agent.core.context import AgentContext
from packages.modules.agent.core.registry import REGISTRY
import packages.modules.agent.tools.finance_copilot  # noqa: F401  (register)
from packages.modules.expenses.models.document import ExpenseDocument
from packages.modules.expenses.models.expense import Expense


@pytest.fixture
def co56(db_session: Session) -> Company:
    co = Company(name="P56", slug="p56")
    db_session.add(co)
    db_session.commit()
    db_session.refresh(co)
    return co


@pytest.fixture
def admin56(db_session: Session, co56: Company) -> User:
    u = User(
        company_id=co56.id, email="admin@p56.test",
        full_name="Admin", role="admin",
    )
    db_session.add(u)
    db_session.commit()
    db_session.refresh(u)
    return u


def _ctx(db, user, co_id, persona="finance_manager") -> AgentContext:
    return AgentContext(
        db=db, company_id=co_id, user_id=user.id,
        user_email=user.email, user_role=user.role,
        persona=persona, session_id="t",
    )


def _mk_exp(db, co_id, *, amount=100, status="approved",
            uuid=None, dt=None, cat="travel") -> Expense:
    e = Expense(
        company_id=co_id, amount=Decimal(str(amount)),
        description="x", status=status,
        category_code=cat,
        expense_date=dt or date(2026, 4, 1),
        cfdi_uuid=uuid,
    )
    db.add(e)
    db.commit()
    db.refresh(e)
    return e


def _mk_doc(db, co_id, *, expense_id=None, filename="r.pdf",
            text="content", doctype="cfdi") -> ExpenseDocument:
    d = ExpenseDocument(
        company_id=co_id, expense_id=expense_id,
        filename=filename, content_text=text,
        document_type=doctype,
    )
    db.add(d)
    db.commit()
    db.refresh(d)
    return d


# ── persona registration ────────────────────────────────────────────────────


def test_finance_tools_registered_for_finance_manager() -> None:
    names = {s.name for s in REGISTRY.list_for_persona("finance_manager")}
    assert {"find_missing_receipts", "match_cfdis_batch",
            "generate_poliza_preview", "run_month_end"} <= names


def test_finance_tools_registered_for_admin() -> None:
    names = {s.name for s in REGISTRY.list_for_persona("admin")}
    assert "run_month_end" in names


def test_finance_tools_not_registered_for_employee() -> None:
    names = {s.name for s in REGISTRY.list_for_persona("employee")}
    assert "run_month_end" not in names
    assert "find_missing_receipts" not in names


# ── find_missing_receipts ───────────────────────────────────────────────────


def test_find_missing_receipts_empty(
    db_session: Session, co56: Company, admin56: User
) -> None:
    res = REGISTRY.dispatch(
        "find_missing_receipts", {}, _ctx(db_session, admin56, co56.id)
    )
    assert res.ok and res.data["count"] == 0


def test_find_missing_receipts_lists_only_undocumented(
    db_session: Session, co56: Company, admin56: User
) -> None:
    no_doc = _mk_exp(db_session, co56.id, amount=200)
    with_doc = _mk_exp(db_session, co56.id, amount=300)
    _mk_doc(db_session, co56.id, expense_id=with_doc.id, filename="r.pdf")
    _mk_exp(db_session, co56.id, amount=400, status="draft")  # excluded by status

    res = REGISTRY.dispatch(
        "find_missing_receipts", {},
        _ctx(db_session, admin56, co56.id),
    )
    assert res.ok
    ids = {row["expense_id"] for row in res.data["missing"]}
    assert ids == {no_doc.id}


def test_find_missing_receipts_company_isolated(
    db_session: Session, co56: Company, admin56: User
) -> None:
    other = Company(name="O", slug="o56")
    db_session.add(other)
    db_session.commit()
    _mk_exp(db_session, other.id, amount=999)
    res = REGISTRY.dispatch(
        "find_missing_receipts", {}, _ctx(db_session, admin56, co56.id)
    )
    assert res.data["count"] == 0


# ── match_cfdis_batch ───────────────────────────────────────────────────────


def test_match_cfdis_batch_pairs_by_uuid(
    db_session: Session, co56: Company, admin56: User
) -> None:
    e = _mk_exp(db_session, co56.id, uuid="UUID-AAA")
    doc = _mk_doc(
        db_session, co56.id, expense_id=None,
        filename="invoice-UUID-AAA.xml", text="...",
    )
    res = REGISTRY.dispatch(
        "match_cfdis_batch", {}, _ctx(db_session, admin56, co56.id)
    )
    assert res.ok
    assert res.data["match_count"] == 1
    assert res.data["matched"][0]["expense_id"] == e.id
    assert res.data["matched"][0]["document_id"] == doc.id


def test_match_cfdis_batch_unmatched(
    db_session: Session, co56: Company, admin56: User
) -> None:
    _mk_exp(db_session, co56.id, uuid="UUID-XYZ")
    res = REGISTRY.dispatch(
        "match_cfdis_batch", {}, _ctx(db_session, admin56, co56.id)
    )
    assert res.data["match_count"] == 0
    assert res.data["unmatched_count"] == 1


# ── generate_poliza_preview ─────────────────────────────────────────────────


def test_generate_poliza_preview_returns_lines(
    db_session: Session, co56: Company, admin56: User
) -> None:
    e = _mk_exp(db_session, co56.id, amount=500)
    res = REGISTRY.dispatch(
        "generate_poliza_preview", {"expense_id": e.id},
        _ctx(db_session, admin56, co56.id),
    )
    assert res.ok
    assert res.data["expense_id"] == e.id
    assert "preview" in res.data
    assert "lines" in res.data["preview"]


def test_generate_poliza_preview_not_found(
    db_session: Session, co56: Company, admin56: User
) -> None:
    res = REGISTRY.dispatch(
        "generate_poliza_preview", {"expense_id": 99999},
        _ctx(db_session, admin56, co56.id),
    )
    assert res.ok is False
    assert res.error == "not_found"


def test_generate_poliza_preview_cross_company_blocked(
    db_session: Session, co56: Company, admin56: User
) -> None:
    other = Company(name="O2", slug="o562")
    db_session.add(other)
    db_session.commit()
    e = _mk_exp(db_session, other.id, amount=500)
    res = REGISTRY.dispatch(
        "generate_poliza_preview", {"expense_id": e.id},
        _ctx(db_session, admin56, co56.id),
    )
    assert res.ok is False


# ── run_month_end ───────────────────────────────────────────────────────────


def test_run_month_end_aggregates(
    db_session: Session, co56: Company, admin56: User
) -> None:
    _mk_exp(db_session, co56.id, status="submitted")
    _mk_exp(db_session, co56.id, status="manager_approved")
    e_no_doc = _mk_exp(db_session, co56.id, status="approved")
    e_doc = _mk_exp(db_session, co56.id, status="approved")
    _mk_doc(db_session, co56.id, expense_id=e_doc.id)
    e_cancelled = _mk_exp(db_session, co56.id, uuid="UUID-Z")
    e_cancelled.cfdi_status = "Cancelado"
    db_session.commit()

    res = REGISTRY.dispatch(
        "run_month_end", {}, _ctx(db_session, admin56, co56.id)
    )
    assert res.ok
    d = res.data
    assert d["pending_approval_count"] == 2
    # e_no_doc + e_cancelled (also approved, no doc)
    assert d["missing_receipts"]["count"] == 2
    missing_ids = {row["expense_id"] for row in d["missing_receipts"]["missing"]}
    assert e_no_doc.id in missing_ids
    assert d["cancelled_cfdi_count"] == 1


# ── persona forbidden ───────────────────────────────────────────────────────


def test_finance_tools_forbidden_for_employee_persona(
    db_session: Session, co56: Company, admin56: User
) -> None:
    res = REGISTRY.dispatch(
        "run_month_end", {},
        _ctx(db_session, admin56, co56.id, persona="employee"),
    )
    assert res.ok is False
    assert res.error == "forbidden"
