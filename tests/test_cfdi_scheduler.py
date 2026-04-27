"""Phase 4.8 follow-up — CFDI watcher scheduler tests (gating + cross-company runner)."""
from __future__ import annotations

from datetime import date, datetime, timedelta
from decimal import Decimal

import pytest
from sqlalchemy.orm import Session

from packages.core.platform.models import Company
from packages.modules.expenses.jobs import scheduler as cfdi_sched
from packages.modules.expenses.models.expense import Expense
from packages.modules.expenses.service import cfdi_lifecycle_service as svc


def _mk_expense(db, co_id, *, uuid, status="Vigente", last_checked=None) -> Expense:
    e = Expense(
        company_id=co_id,
        amount=Decimal("100.00"),
        description="x",
        status="approved",
        expense_date=date(2026, 4, 1),
        cfdi_uuid=uuid,
        cfdi_status=status,
        cfdi_last_checked_at=last_checked,
    )
    db.add(e)
    db.commit()
    db.refresh(e)
    return e


def test_start_scheduler_skips_when_env_unset(monkeypatch) -> None:
    cfdi_sched._scheduler = None
    monkeypatch.delenv("CFDI_SCHEDULER_ENABLED", raising=False)
    assert cfdi_sched.start_scheduler() is None


def test_start_scheduler_idempotent(monkeypatch) -> None:
    cfdi_sched._scheduler = None
    monkeypatch.setenv("CFDI_SCHEDULER_ENABLED", "1")
    s1 = cfdi_sched.start_scheduler()
    try:
        assert s1 is not None
        s2 = cfdi_sched.start_scheduler()
        assert s2 is s1
        # job is registered
        assert s1.get_job("cfdi.daily_recheck") is not None
    finally:
        cfdi_sched.shutdown_scheduler()


def test_run_cfdi_recheck_all_companies_iterates_and_aggregates(
    db_session: Session, monkeypatch
) -> None:
    co_a = Company(name="A", slug="a-co")
    co_b = Company(name="B", slug="b-co")
    db_session.add_all([co_a, co_b])
    db_session.commit()
    db_session.refresh(co_a)
    db_session.refresh(co_b)

    stale = datetime.utcnow() - timedelta(days=30)
    _mk_expense(db_session, co_a.id, uuid="UA-1", last_checked=stale)
    _mk_expense(db_session, co_a.id, uuid="UA-2", status="Cancelado", last_checked=stale)
    _mk_expense(db_session, co_b.id, uuid="UB-1", last_checked=stale)

    monkeypatch.setattr(
        svc, "check_cfdi_with_sat",
        lambda *a, **k: {"sat_status": "Vigente"},
    )

    totals = cfdi_sched.run_cfdi_recheck_all_companies(db_session)
    assert totals["companies"] >= 2
    assert totals["checked"] == 2  # UA-1 + UB-1, UA-2 skipped (cancelled)
    assert totals["skipped"] >= 1
    assert totals["flipped"] == 0


def test_run_cfdi_recheck_swallows_per_company_errors(
    db_session: Session, monkeypatch
) -> None:
    co = Company(name="ErrCo", slug="err-co")
    db_session.add(co)
    db_session.commit()

    def boom(*a, **k):
        raise RuntimeError("simulated")

    monkeypatch.setattr(cfdi_sched, "recheck_pending", boom)
    # Should not raise
    totals = cfdi_sched.run_cfdi_recheck_all_companies(db_session)
    assert totals["checked"] == 0
    assert totals["flipped"] == 0
