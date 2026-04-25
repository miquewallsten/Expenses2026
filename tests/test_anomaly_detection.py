"""Phase 5.4 — anomaly detection."""
from __future__ import annotations

from datetime import date, datetime, timedelta
from decimal import Decimal

import pytest
from sqlalchemy.orm import Session

from packages.core.platform.models import Company
from packages.modules.expenses.models.expense import Expense
from packages.modules.expenses.service.anomaly_detection_service import (
    compute_baseline,
    detect_anomalies,
)


@pytest.fixture
def co54(db_session: Session) -> Company:
    co = Company(name="P54", slug="p54")
    db_session.add(co)
    db_session.commit()
    db_session.refresh(co)
    return co


def _mk(
    db, co_id, *, amount, dt, category="travel",
    status="approved", created_at=None,
) -> Expense:
    e = Expense(
        company_id=co_id, amount=Decimal(str(amount)),
        description="x", status=status,
        category_code=category, expense_date=dt,
    )
    if created_at is not None:
        e.created_at = created_at
    db.add(e)
    db.commit()
    db.refresh(e)
    return e


def test_baseline_empty_returns_empty_dict(db_session: Session, co54: Company) -> None:
    bl = compute_baseline(db_session, company_id=co54.id)
    assert bl == {}


def test_baseline_aggregates_per_category(
    db_session: Session, co54: Company
) -> None:
    today = date(2026, 4, 20)
    for amt in (100, 110, 120, 130, 140):
        _mk(db_session, co54.id, amount=amt, dt=today, category="travel")
    for amt in (50, 50, 50):
        _mk(db_session, co54.id, amount=amt, dt=today, category="meals")
    bl = compute_baseline(db_session, company_id=co54.id, today=today)
    assert set(bl.keys()) == {"travel", "meals"}
    assert bl["travel"]["count"] == 5
    assert bl["travel"]["mean"] == 120.0
    assert bl["travel"]["stddev"] > 0
    assert bl["meals"]["mean"] == 50.0
    assert bl["meals"]["stddev"] == 0.0  # all equal


def test_baseline_excludes_non_approved(
    db_session: Session, co54: Company
) -> None:
    today = date(2026, 4, 20)
    _mk(db_session, co54.id, amount=100, dt=today, status="draft")
    _mk(db_session, co54.id, amount=200, dt=today, status="submitted")
    _mk(db_session, co54.id, amount=300, dt=today, status="approved")
    bl = compute_baseline(db_session, company_id=co54.id, today=today)
    assert bl["travel"]["count"] == 1
    assert bl["travel"]["mean"] == 300.0


def test_baseline_respects_window_days(
    db_session: Session, co54: Company
) -> None:
    today = date(2026, 4, 20)
    _mk(db_session, co54.id, amount=999, dt=date(2025, 1, 1))  # outside
    _mk(db_session, co54.id, amount=100, dt=today)
    bl = compute_baseline(
        db_session, company_id=co54.id, window_days=90, today=today
    )
    assert bl["travel"]["count"] == 1
    assert bl["travel"]["mean"] == 100.0


def test_baseline_company_isolated(
    db_session: Session, co54: Company
) -> None:
    other = Company(name="X", slug="x54")
    db_session.add(other)
    db_session.commit()
    today = date(2026, 4, 20)
    _mk(db_session, other.id, amount=9999, dt=today)
    _mk(db_session, co54.id, amount=100, dt=today)
    bl = compute_baseline(db_session, company_id=co54.id, today=today)
    assert bl["travel"]["mean"] == 100.0


def test_amount_outlier_flag(db_session: Session, co54: Company) -> None:
    today = date(2026, 4, 20)
    for amt in (100, 105, 110, 95, 100, 102, 98, 105, 100, 100):
        _mk(db_session, co54.id, amount=amt, dt=today, category="travel")
    flags = detect_anomalies(
        db_session, company_id=co54.id,
        amount=Decimal("5000"), category_code="travel",
        expense_date=today,
    )
    kinds = {f.kind for f in flags}
    assert "amount_outlier" in kinds
    outlier = next(f for f in flags if f.kind == "amount_outlier")
    assert outlier.severity == "alert"
    assert outlier.detail["amount"] == 5000.0


def test_amount_within_3sigma_no_outlier_flag(
    db_session: Session, co54: Company
) -> None:
    today = date(2026, 4, 20)
    for amt in (100, 105, 110, 95, 100, 102, 98, 105, 100, 100):
        _mk(db_session, co54.id, amount=amt, dt=today, category="travel")
    flags = detect_anomalies(
        db_session, company_id=co54.id,
        amount=Decimal("110"), category_code="travel",
        expense_date=today,
    )
    assert not any(f.kind == "amount_outlier" for f in flags)


def test_new_category_flag(db_session: Session, co54: Company) -> None:
    today = date(2026, 4, 20)
    _mk(db_session, co54.id, amount=100, dt=today, category="travel")
    flags = detect_anomalies(
        db_session, company_id=co54.id,
        amount=Decimal("50"), category_code="software",
        expense_date=today,
    )
    kinds = {f.kind for f in flags}
    assert "new_category" in kinds
    f = next(x for x in flags if x.kind == "new_category")
    assert f.severity == "warn"
    assert f.detail["category_code"] == "software"


def test_small_sample_no_outlier_flag(db_session: Session, co54: Company) -> None:
    today = date(2026, 4, 20)
    _mk(db_session, co54.id, amount=100, dt=today, category="travel")
    _mk(db_session, co54.id, amount=110, dt=today, category="travel")
    flags = detect_anomalies(
        db_session, company_id=co54.id,
        amount=Decimal("99999"), category_code="travel",
        expense_date=today,
    )
    # Only 2 samples → no outlier flag (need ≥3)
    assert not any(f.kind == "amount_outlier" for f in flags)


def test_velocity_spike_flag(db_session: Session, co54: Company) -> None:
    now = datetime.utcnow()
    today = now.date()
    # 5 expenses in last hour → +1 (current) = 6 > 5 threshold
    for _ in range(5):
        _mk(
            db_session, co54.id, amount=10, dt=today, category="travel",
            created_at=now - timedelta(minutes=10),
        )
    flags = detect_anomalies(
        db_session, company_id=co54.id,
        amount=Decimal("10"), category_code="travel",
        expense_date=today,
    )
    kinds = {f.kind for f in flags}
    assert "velocity_spike" in kinds
    vf = next(f for f in flags if f.kind == "velocity_spike")
    assert vf.detail["recent_count"] == 6


def test_velocity_no_flag_when_below_threshold(
    db_session: Session, co54: Company
) -> None:
    now = datetime.utcnow()
    today = now.date()
    for _ in range(3):
        _mk(
            db_session, co54.id, amount=10, dt=today,
            created_at=now - timedelta(minutes=5),
        )
    flags = detect_anomalies(
        db_session, company_id=co54.id,
        amount=Decimal("10"), category_code="travel",
        expense_date=today,
    )
    assert not any(f.kind == "velocity_spike" for f in flags)


def test_velocity_excludes_self(db_session: Session, co54: Company) -> None:
    now = datetime.utcnow()
    today = now.date()
    expenses = [
        _mk(
            db_session, co54.id, amount=10, dt=today,
            created_at=now - timedelta(minutes=5),
        )
        for _ in range(6)
    ]
    # With 6 in window but excluding self → 5 + 1 = 6, still spike
    # Now exclude one as "self" → 5 + 1 = 6 still triggers
    # Use 5 existing instead, exclude one → 4 + 1 = 5, not > 5
    self_id = expenses[0].id
    flags = detect_anomalies(
        db_session, company_id=co54.id,
        amount=Decimal("10"), category_code="travel",
        expense_date=today,
        expense_id=self_id,
    )
    vf = [f for f in flags if f.kind == "velocity_spike"]
    # 6 total - 1 self + 1 current = 6 > 5 → still spike
    assert vf and vf[0].detail["recent_count"] == 6


def test_no_flags_for_normal_expense(db_session: Session, co54: Company) -> None:
    today = date(2026, 4, 20)
    old = datetime.utcnow() - timedelta(days=10)
    for amt in (100, 105, 110, 95, 100):
        _mk(
            db_session, co54.id, amount=amt, dt=today,
            category="travel", created_at=old,
        )
    flags = detect_anomalies(
        db_session, company_id=co54.id,
        amount=Decimal("103"), category_code="travel",
        expense_date=today,
    )
    assert flags == []
