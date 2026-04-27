"""Phase 2.4 regression tests — FK cascade + extraction timestamps + category validation."""
from __future__ import annotations

import pytest
from sqlalchemy import text
from sqlalchemy.orm import Session

from packages.core.platform.models import Company
from packages.core.platform.models_accounting_category import AccountingCategory
from packages.modules.expenses.models.document import ExpenseDocument
from packages.modules.expenses.models.expense_allocation import ExpenseAllocation
from packages.modules.expenses.models.expense_attachment import ExpenseAttachment
from packages.modules.expenses.models.expense import Expense
from packages.modules.expenses.schemas.expense import ExpenseCreate
from packages.modules.expenses.service.expense_service import (
    create_expense,
    update_expense,
)
from packages.modules.expenses.schemas.expense_update import ExpenseUpdate


@pytest.fixture(autouse=True)
def _enable_fk_pragma(db_session: Session) -> None:
    """SQLite ignores FOREIGN KEY constraints unless this PRAGMA is on. Enable
    it for this file so cascade rules actually fire — the rest of the suite
    intentionally tolerates dangling FKs and is left untouched."""
    db_session.execute(text("PRAGMA foreign_keys=ON"))


@pytest.fixture
def co24(db_session: Session) -> Company:
    co = Company(name="P24", slug="p24")
    db_session.add(co)
    db_session.commit()
    db_session.refresh(co)
    db_session.add(
        AccountingCategory(
            company_id=co.id, code="travel", name="Travel", is_active=True
        )
    )
    db_session.commit()
    return co


def _make_expense(db: Session, co: Company) -> Expense:
    exp = Expense(
        company_id=co.id,
        amount=100.0,
        description="seed",
        status="draft",
    )
    db.add(exp)
    db.commit()
    db.refresh(exp)
    return exp


# ── category_code service-layer validation ──────────────────────────────────


def test_create_rejects_unknown_category_code(
    db_session: Session, co24: Company
) -> None:
    payload = ExpenseCreate(
        company_id=co24.id,
        amount=50.0,
        description="lunch",
        category_code="not-a-real-code",
    )
    with pytest.raises(ValueError, match="not an active AccountingCategory"):
        create_expense(db_session, payload)


def test_create_accepts_active_category_code(
    db_session: Session, co24: Company
) -> None:
    payload = ExpenseCreate(
        company_id=co24.id,
        amount=50.0,
        description="zzzunique",  # avoid heuristic match overriding our code
        category_code="travel",
    )
    exp = create_expense(db_session, payload)
    assert exp.category_code == "travel"


def test_create_rejects_inactive_category_code(
    db_session: Session, co24: Company
) -> None:
    db_session.add(
        AccountingCategory(
            company_id=co24.id, code="legacy", name="Legacy", is_active=False
        )
    )
    db_session.commit()
    payload = ExpenseCreate(
        company_id=co24.id,
        amount=50.0,
        description="x",
        category_code="legacy",
    )
    with pytest.raises(ValueError, match="not an active AccountingCategory"):
        create_expense(db_session, payload)


def test_update_rejects_unknown_category_code(
    db_session: Session, co24: Company
) -> None:
    exp = _make_expense(db_session, co24)
    with pytest.raises(ValueError, match="not an active AccountingCategory"):
        update_expense(
            db_session, exp.id, ExpenseUpdate(category_code="ghost")
        )


# ── FK cascade ──────────────────────────────────────────────────────────────


def test_delete_expense_cascades_attachments_and_allocations(
    db_session: Session, co24: Company
) -> None:
    exp = _make_expense(db_session, co24)
    db_session.add(
        ExpenseAttachment(
            expense_id=exp.id,
            attachment_type="receipt",
            filename="r.pdf",
            content_text="x",
        )
    )
    db_session.add(
        ExpenseAllocation(
            expense_id=exp.id, percent=100.0, project_id=None
        )
    )
    db_session.commit()

    db_session.delete(exp)
    db_session.commit()

    assert (
        db_session.query(ExpenseAttachment)
        .filter(ExpenseAttachment.expense_id == exp.id)
        .count()
        == 0
    )
    assert (
        db_session.query(ExpenseAllocation)
        .filter(ExpenseAllocation.expense_id == exp.id)
        .count()
        == 0
    )


def test_delete_expense_sets_documents_expense_id_null(
    db_session: Session, co24: Company
) -> None:
    exp = _make_expense(db_session, co24)
    doc = ExpenseDocument(
        company_id=co24.id,
        expense_id=exp.id,
        filename="a.pdf",
        content_text="x",
    )
    db_session.add(doc)
    db_session.commit()
    doc_id = doc.id

    db_session.delete(exp)
    db_session.commit()

    refreshed = db_session.query(ExpenseDocument).filter_by(id=doc_id).first()
    assert refreshed is not None, "document should not be deleted"
    assert refreshed.expense_id is None, "expense_id should be SET NULL"


# ── extraction timestamps exist on model ────────────────────────────────────


def test_expense_document_extraction_timestamps_round_trip(
    db_session: Session, co24: Company
) -> None:
    from datetime import datetime

    started = datetime(2026, 4, 26, 10, 0, 0)
    completed = datetime(2026, 4, 26, 10, 0, 5)
    doc = ExpenseDocument(
        company_id=co24.id,
        filename="x.pdf",
        content_text="hello",
        extraction_started_at=started,
        extraction_completed_at=completed,
    )
    db_session.add(doc)
    db_session.commit()
    db_session.refresh(doc)
    assert doc.extraction_started_at == started
    assert doc.extraction_completed_at == completed
