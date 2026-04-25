"""Phase 5.7 — approval SLA analytics."""
from __future__ import annotations

from datetime import datetime, timedelta
from decimal import Decimal

import pytest
from sqlalchemy.orm import Session

from packages.core.platform.models import Company
from packages.core.platform.models_audit import AuditLog
from packages.modules.expenses.models.expense import Expense
from packages.modules.expenses.service.approval_sla_analytics_service import (
    compute_sla_distribution,
)


@pytest.fixture
def co57(db_session: Session) -> Company:
    co = Company(name="P57", slug="p57")
    db_session.add(co)
    db_session.commit()
    db_session.refresh(co)
    return co


def _exp(db, co_id, *, status="approved") -> Expense:
    e = Expense(
        company_id=co_id, amount=Decimal("100"),
        description="x", status=status, category_code="travel",
    )
    db.add(e)
    db.commit()
    db.refresh(e)
    return e


def _audit(db, co_id, eid, *, detail, ts) -> AuditLog:
    a = AuditLog(
        company_id=co_id, entity_type="expense", entity_id=eid,
        action="status_change", detail_text=detail,
    )
    db.add(a)
    db.flush()
    a.created_at = ts
    db.commit()
    db.refresh(a)
    return a


def test_sla_empty(db_session: Session, co57: Company) -> None:
    out = compute_sla_distribution(db_session, company_id=co57.id)
    assert out["approved_count"] == 0
    assert out["p50_hours"] == 0.0
    assert out["open_count"] == 0


def test_sla_single_approval(db_session: Session, co57: Company) -> None:
    e = _exp(db_session, co57.id)
    base = datetime(2026, 4, 1, 9, 0)
    _audit(db_session, co57.id, e.id, detail="draft → submitted", ts=base)
    _audit(
        db_session, co57.id, e.id, detail="manager_approved → approved",
        ts=base + timedelta(hours=4, minutes=30),
    )
    out = compute_sla_distribution(db_session, company_id=co57.id)
    assert out["approved_count"] == 1
    assert out["p50_hours"] == 4.5
    assert out["max_hours"] == 4.5


def test_sla_multiple_percentiles(db_session: Session, co57: Company) -> None:
    base = datetime(2026, 4, 1, 9, 0)
    # deltas in hours: 1, 2, 4, 8, 24
    for hours in (1, 2, 4, 8, 24):
        e = _exp(db_session, co57.id)
        _audit(db_session, co57.id, e.id, detail="draft → submitted", ts=base)
        _audit(
            db_session, co57.id, e.id, detail="x → approved",
            ts=base + timedelta(hours=hours),
        )
    out = compute_sla_distribution(db_session, company_id=co57.id)
    assert out["approved_count"] == 5
    assert out["max_hours"] == 24.0
    assert 1.0 <= out["p50_hours"] <= 24.0
    assert out["p95_hours"] >= out["p50_hours"]


def test_sla_open_pending(db_session: Session, co57: Company) -> None:
    now = datetime(2026, 4, 24, 12, 0)
    e1 = _exp(db_session, co57.id, status="submitted")
    e2 = _exp(db_session, co57.id, status="manager_approved")
    _audit(
        db_session, co57.id, e1.id, detail="draft → submitted",
        ts=now - timedelta(hours=10),
    )
    _audit(
        db_session, co57.id, e2.id, detail="draft → submitted",
        ts=now - timedelta(hours=50),
    )
    out = compute_sla_distribution(db_session, company_id=co57.id, now=now)
    assert out["open_count"] == 2
    assert out["open_max_hours"] == 50.0


def test_sla_company_isolated(db_session: Session, co57: Company) -> None:
    other = Company(name="O57", slug="o57")
    db_session.add(other)
    db_session.commit()
    e = _exp(db_session, other.id)
    base = datetime(2026, 4, 1, 9, 0)
    _audit(db_session, other.id, e.id, detail="draft → submitted", ts=base)
    _audit(
        db_session, other.id, e.id, detail="x → approved",
        ts=base + timedelta(hours=99),
    )
    out = compute_sla_distribution(db_session, company_id=co57.id)
    assert out["approved_count"] == 0
    assert out["max_hours"] == 0.0


def test_sla_skips_unsubmitted_expenses(db_session: Session, co57: Company) -> None:
    e = _exp(db_session, co57.id)
    base = datetime(2026, 4, 1, 9, 0)
    # No "submitted" event; only approved
    _audit(
        db_session, co57.id, e.id, detail="x → approved",
        ts=base + timedelta(hours=5),
    )
    out = compute_sla_distribution(db_session, company_id=co57.id)
    assert out["approved_count"] == 0
