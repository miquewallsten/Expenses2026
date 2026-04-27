"""Phase 8.3 hookup — kNN suggest_category in create_expense + record_feedback in update_expense."""
from __future__ import annotations

import pytest
from sqlalchemy.orm import Session

from packages.core.platform.models import Company
from packages.core.platform.models_accounting_category import AccountingCategory
from packages.modules.ai.models_categorization_feedback import CategorizationFeedback
from packages.modules.ai.service.categorization_feedback_service import record_feedback
from packages.modules.expenses.schemas.expense import ExpenseCreate
from packages.modules.expenses.schemas.expense_update import ExpenseUpdate
from packages.modules.expenses.service.expense_service import (
    create_expense,
    update_expense,
)


@pytest.fixture
def co83(db_session: Session, monkeypatch) -> Company:
    monkeypatch.delenv("OLLAMA_EMBED_URL", raising=False)
    co = Company(name="P83", slug="p83")
    db_session.add(co)
    db_session.commit()
    db_session.refresh(co)
    for code, name in [("travel", "Travel"), ("meals", "Meals"), ("other", "Other")]:
        db_session.add(
            AccountingCategory(
                company_id=co.id, code=code, name=name, is_active=True
            )
        )
    db_session.commit()
    return co


def test_create_uses_knn_when_keyword_misses(db_session: Session, co83: Company) -> None:
    # Seed feedback rows so kNN has signal for a description that has no
    # keyword match (use a nonsense merchant phrase to dodge the heuristic).
    for _ in range(3):
        record_feedback(
            db_session,
            company_id=co83.id,
            description_text="zzqx widget purchase",
            corrected_category="travel",
        )
    db_session.commit()

    payload = ExpenseCreate(
        company_id=co83.id,
        amount=100.0,
        description="zzqx widget purchase",
    )
    exp = create_expense(db_session, payload)
    assert exp.category_code == "travel"


def test_create_falls_through_when_knn_below_threshold(
    db_session: Session, co83: Company
) -> None:
    # No feedback rows → no suggestion → caller-supplied wins.
    payload = ExpenseCreate(
        company_id=co83.id,
        amount=100.0,
        description="zzqx widget purchase",
        category_code="meals",
    )
    exp = create_expense(db_session, payload)
    assert exp.category_code == "meals"


def test_update_records_feedback_on_category_change(
    db_session: Session, co83: Company
) -> None:
    payload = ExpenseCreate(
        company_id=co83.id,
        amount=100.0,
        description="lunch with client",
        category_code="meals",
    )
    exp = create_expense(db_session, payload)

    before = db_session.query(CategorizationFeedback).filter_by(company_id=co83.id).count()
    update_expense(db_session, exp.id, ExpenseUpdate(category_code="travel"))
    after = db_session.query(CategorizationFeedback).filter_by(company_id=co83.id).count()
    assert after == before + 1

    fb = (
        db_session.query(CategorizationFeedback)
        .filter_by(company_id=co83.id)
        .order_by(CategorizationFeedback.id.desc())
        .first()
    )
    assert fb is not None
    assert fb.corrected_category == "travel"
    assert fb.original_category == "meals"
    assert fb.expense_id == exp.id


def test_update_no_feedback_when_category_unchanged(
    db_session: Session, co83: Company
) -> None:
    payload = ExpenseCreate(
        company_id=co83.id,
        amount=100.0,
        description="lunch with client",
        category_code="meals",
    )
    exp = create_expense(db_session, payload)

    before = db_session.query(CategorizationFeedback).filter_by(company_id=co83.id).count()
    update_expense(db_session, exp.id, ExpenseUpdate(category_code="meals"))
    after = db_session.query(CategorizationFeedback).filter_by(company_id=co83.id).count()
    assert after == before
