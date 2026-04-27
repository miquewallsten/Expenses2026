"""Phase 5.5 — routing_sla_overdue insight scanner."""
from __future__ import annotations

from datetime import datetime, timedelta
from decimal import Decimal

from packages.modules.agent.insights.scanners import scan_routing_sla_overdue
from packages.modules.expenses.models.expense import Expense
from packages.modules.expenses.models_routing import ApprovalRoutingRule


def _seed_rule(db_session, company_id, *, sla_hours=24, when=None, key="r"):
    db_session.add(
        ApprovalRoutingRule(
            company_id=company_id,
            rule_key=key,
            name=key,
            priority=10,
            when_json=when or {},
            approvers_json=[{"role": "manager"}],
            sla_hours=sla_hours,
            escalation_role="cfo",
            is_enabled=True,
        )
    )
    db_session.commit()


def _seed_expense(db_session, company_id, *, age_hours, status="submitted"):
    e = Expense(
        company_id=company_id,
        description="x",
        amount=Decimal("100.00"),
        status=status,
    )
    db_session.add(e)
    db_session.commit()
    db_session.refresh(e)
    e.created_at = datetime.utcnow() - timedelta(hours=age_hours)
    db_session.commit()
    db_session.refresh(e)
    return e


def test_no_rules_returns_empty(db_session, test_company):
    _seed_expense(db_session, test_company.id, age_hours=72)
    assert scan_routing_sla_overdue(db_session, test_company.id) == []


def test_overdue_expense_flagged(db_session, test_company):
    _seed_rule(db_session, test_company.id, sla_hours=24)
    _seed_expense(db_session, test_company.id, age_hours=72)
    out = scan_routing_sla_overdue(db_session, test_company.id)
    assert len(out) == 1
    card = out[0]
    assert card["kind"] == "routing_sla_overdue"
    assert card["severity"] == "critical"
    assert card["data_json"]["total"] == 1
    item = card["data_json"]["items"][0]
    assert item["sla_hours"] == 24
    assert item["escalation_role"] == "cfo"
    assert item["age_hours"] >= 24


def test_within_sla_not_flagged(db_session, test_company):
    _seed_rule(db_session, test_company.id, sla_hours=48)
    _seed_expense(db_session, test_company.id, age_hours=2)
    assert scan_routing_sla_overdue(db_session, test_company.id) == []


def test_draft_status_ignored(db_session, test_company):
    _seed_rule(db_session, test_company.id, sla_hours=1)
    _seed_expense(db_session, test_company.id, age_hours=72, status="draft")
    assert scan_routing_sla_overdue(db_session, test_company.id) == []


def test_runner_includes_scanner(db_session, test_company):
    from packages.modules.agent.insights import run_scanners

    _seed_rule(db_session, test_company.id, sla_hours=1, key="quick")
    _seed_expense(db_session, test_company.id, age_hours=10)
    rows = run_scanners(db_session, test_company.id)
    kinds = {r.kind for r in rows}
    assert "routing_sla_overdue" in kinds
