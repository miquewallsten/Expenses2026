"""Phase 5.3 — fuzzy duplicate expense detection."""
from __future__ import annotations

from datetime import date
from decimal import Decimal

import pytest
from sqlalchemy.orm import Session

from packages.core.platform.models import Company
from packages.modules.expenses.models.expense import Expense
from packages.modules.expenses.service.duplicate_detection_service import (
    find_duplicates,
    has_blocking_duplicate,
)


@pytest.fixture
def co53(db_session: Session) -> Company:
    co = Company(name="P53", slug="p53")
    db_session.add(co)
    db_session.commit()
    db_session.refresh(co)
    return co


def _mk(db, co_id, *, amount, dt, desc, uuid=None) -> Expense:
    e = Expense(
        company_id=co_id, amount=Decimal(str(amount)),
        description=desc, status="approved",
        expense_date=dt, cfdi_uuid=uuid,
    )
    db.add(e)
    db.commit()
    db.refresh(e)
    return e


def test_no_duplicates_when_table_empty(db_session: Session, co53: Company) -> None:
    out = find_duplicates(
        db_session, company_id=co53.id,
        amount=Decimal("100.00"),
        expense_date=date(2026, 4, 1),
        description="Lunch",
    )
    assert out == []
    assert has_blocking_duplicate(out) is False


def test_exact_uuid_match_is_blocking(db_session: Session, co53: Company) -> None:
    e1 = _mk(db_session, co53.id,
             amount="500.00", dt=date(2026, 4, 1),
             desc="Hotel ABC", uuid="UUID-XYZ")
    out = find_duplicates(
        db_session, company_id=co53.id,
        amount=Decimal("99.00"),  # different amount
        expense_date=date(2026, 1, 1),  # different date
        description="totally unrelated",
        cfdi_uuid="UUID-XYZ",
    )
    assert len(out) == 1
    assert out[0].expense_id == e1.id
    assert out[0].confidence == "exact_uuid"
    assert has_blocking_duplicate(out) is True


def test_strong_match_amount_date_and_fuzzy_description(
    db_session: Session, co53: Company
) -> None:
    e1 = _mk(db_session, co53.id,
             amount="1856.00", dt=date(2026, 4, 1),
             desc="Uber ride to airport CDMX")
    out = find_duplicates(
        db_session, company_id=co53.id,
        amount=Decimal("1856.00"),
        expense_date=date(2026, 4, 2),
        description="Uber ride to airport CDMX  ",
    )
    assert len(out) == 1
    assert out[0].expense_id == e1.id
    assert out[0].confidence == "strong"
    assert has_blocking_duplicate(out) is True


def test_weak_match_amount_date_but_different_description(
    db_session: Session, co53: Company
) -> None:
    _mk(db_session, co53.id,
        amount="500.00", dt=date(2026, 4, 1),
        desc="Office supplies — printer ink cartridges")
    out = find_duplicates(
        db_session, company_id=co53.id,
        amount=Decimal("500.00"),
        expense_date=date(2026, 4, 2),
        description="Lunch with client",
    )
    assert len(out) == 1
    assert out[0].confidence == "weak"
    assert has_blocking_duplicate(out) is False


def test_excludes_outside_date_window(db_session: Session, co53: Company) -> None:
    _mk(db_session, co53.id,
        amount="100.00", dt=date(2026, 4, 1), desc="Coffee")
    out = find_duplicates(
        db_session, company_id=co53.id,
        amount=Decimal("100.00"),
        expense_date=date(2026, 4, 10),  # 9 days away
        description="Coffee",
    )
    assert out == []


def test_excludes_outside_amount_tolerance(db_session: Session, co53: Company) -> None:
    _mk(db_session, co53.id,
        amount="100.00", dt=date(2026, 4, 1), desc="Coffee")
    out = find_duplicates(
        db_session, company_id=co53.id,
        amount=Decimal("100.50"),
        expense_date=date(2026, 4, 1),
        description="Coffee",
    )
    assert out == []


def test_company_isolation(db_session: Session, co53: Company) -> None:
    other = Company(name="Other", slug="other53")
    db_session.add(other)
    db_session.commit()
    _mk(db_session, other.id, amount="100.00",
        dt=date(2026, 4, 1), desc="Coffee")
    out = find_duplicates(
        db_session, company_id=co53.id,
        amount=Decimal("100.00"),
        expense_date=date(2026, 4, 1),
        description="Coffee",
    )
    assert out == []


def test_exclude_id_skips_self(db_session: Session, co53: Company) -> None:
    e1 = _mk(db_session, co53.id,
             amount="100.00", dt=date(2026, 4, 1), desc="Coffee")
    out = find_duplicates(
        db_session, company_id=co53.id,
        amount=Decimal("100.00"),
        expense_date=date(2026, 4, 1),
        description="Coffee",
        exclude_id=e1.id,
    )
    assert out == []


def test_uuid_match_not_double_counted_with_strong_path(
    db_session: Session, co53: Company
) -> None:
    e1 = _mk(db_session, co53.id,
             amount="100.00", dt=date(2026, 4, 1),
             desc="Coffee", uuid="UUID-A")
    out = find_duplicates(
        db_session, company_id=co53.id,
        amount=Decimal("100.00"),
        expense_date=date(2026, 4, 1),
        description="Coffee",
        cfdi_uuid="UUID-A",
    )
    assert len(out) == 1
    assert out[0].expense_id == e1.id
    assert out[0].confidence == "exact_uuid"


def test_sort_strongest_first(db_session: Session, co53: Company) -> None:
    e_weak = _mk(db_session, co53.id,
                 amount="100.00", dt=date(2026, 4, 1),
                 desc="Office supplies pens")
    e_uuid = _mk(db_session, co53.id,
                 amount="999.00", dt=date(2025, 1, 1),
                 desc="Anything", uuid="UUID-Z")
    e_strong = _mk(db_session, co53.id,
                   amount="100.00", dt=date(2026, 4, 1),
                   desc="lunch with client")
    out = find_duplicates(
        db_session, company_id=co53.id,
        amount=Decimal("100.00"),
        expense_date=date(2026, 4, 1),
        description="Lunch with client",
        cfdi_uuid="UUID-Z",
    )
    confidences = [m.confidence for m in out]
    assert confidences == ["exact_uuid", "strong", "weak"]
    assert out[0].expense_id == e_uuid.id
    assert out[1].expense_id == e_strong.id
    assert out[2].expense_id == e_weak.id
