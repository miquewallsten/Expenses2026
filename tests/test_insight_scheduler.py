"""Phase 8.5 — insight scheduler + nightly digest."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from decimal import Decimal

import pytest

from packages.core.platform.models_user import User
from packages.modules.expenses.models.expense import Expense
from packages.modules.amex.models import AmexStatement, AmexStatementLine
from packages.modules.agent.insights import run_scanners, run_for_all_companies
from packages.modules.agent.jobs.insight_digest import run_daily_insight_digest
from packages.modules.agent.models import AgentInsight
from packages.modules.channels.models import NotificationDispatch


# ── Scanners ────────────────────────────────────────────────────────────────


def test_scanner_unmatched_amex_aging(db_session, test_company):
    stmt = AmexStatement(
        company_id=test_company.id, filename="x.csv", currency="MXN",
        total_amount=Decimal("100"), line_count=1, status="draft",
    )
    db_session.add(stmt)
    db_session.flush()
    line = AmexStatementLine(
        statement_id=stmt.id, company_id=test_company.id, line_no=1,
        description="UBER", amount=Decimal("100"), currency="MXN",
        status="unmatched",
    )
    db_session.add(line)
    db_session.commit()
    old = datetime.utcnow() - timedelta(days=20)
    db_session.query(AmexStatementLine).filter(
        AmexStatementLine.id == line.id
    ).update({"created_at": old})
    db_session.commit()

    rows = run_scanners(db_session, test_company.id, persist=False)
    assert any(r.kind == "unmatched_amex_aging" for r in rows)


def test_scanner_pending_approval_aging(db_session, test_company):
    e = Expense(
        company_id=test_company.id, amount=Decimal("99"),
        description="stuck", status="submitted",
    )
    db_session.add(e)
    db_session.commit()
    old = datetime.utcnow() - timedelta(days=12)
    db_session.query(Expense).filter(Expense.id == e.id).update({"created_at": old})
    db_session.commit()

    rows = run_scanners(db_session, test_company.id, persist=False)
    assert any(r.kind == "pending_approval_aging" for r in rows)


def test_scanner_cfdi_cancelled_unhandled(db_session, test_company):
    e = Expense(
        company_id=test_company.id, amount=Decimal("99"),
        description="cancelled cfdi", status="approved",
        cfdi_status="Cancelado",
    )
    db_session.add(e)
    db_session.commit()
    rows = run_scanners(db_session, test_company.id, persist=False)
    assert any(r.kind == "cfdi_cancelled_unhandled" for r in rows)


def test_run_for_all_companies_returns_company_map(db_session, test_company):
    out = run_for_all_companies(db_session)
    assert test_company.id in out
    assert out[test_company.id] >= 0


# ── Digest job ──────────────────────────────────────────────────────────────


def _admin(db_session, test_company):
    u = User(
        full_name="Finance Admin", email="finance@test.com",
        role="admin", company_id=test_company.id, is_active=True,
    )
    db_session.add(u)
    db_session.commit()
    db_session.refresh(u)
    return u


def test_digest_dispatches_to_finance_role(db_session, test_company, monkeypatch):
    _admin(db_session, test_company)
    # Seed an open insight so the digest has content.
    db_session.add(AgentInsight(
        company_id=test_company.id, kind="x", severity="warn",
        title="Test signal", body="body", status="open",
    ))
    db_session.commit()

    monkeypatch.setenv("EMAIL_DRY_RUN", "1")
    sent = run_daily_insight_digest(db_session, rescan=False)
    assert sent >= 1

    rows = (
        db_session.query(NotificationDispatch)
        .filter(NotificationDispatch.event_type.like("agent.daily_insight_digest.%"))
        .all()
    )
    assert len(rows) >= 1


def test_digest_skips_company_with_no_open_insights(
    db_session, test_company, monkeypatch
):
    _admin(db_session, test_company)
    monkeypatch.setenv("EMAIL_DRY_RUN", "1")
    sent = run_daily_insight_digest(db_session, rescan=False)
    assert sent == 0


# ── Manual trigger endpoint ─────────────────────────────────────────────────


def test_trigger_endpoint_admin_scoped(client, db_session, test_company):
    admin = _admin(db_session, test_company)
    res = client.post(
        "/agent/insights/run",
        headers={"X-User-Id": str(admin.id)},
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["ok"] is True
    assert str(test_company.id) in {str(k) for k in body["scanned"].keys()}
    assert body["digest_dispatched"] == 0


def test_trigger_endpoint_forbidden_for_employee(
    client, db_session, test_company, test_user
):
    res = client.post(
        "/agent/insights/run",
        headers={"X-User-Id": str(test_user.id)},
    )
    assert res.status_code == 403
