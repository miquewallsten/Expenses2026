"""Phase 5.5 hookup — submit_expense writes a routing.decision audit entry
when an enabled rule matches the expense context.
"""
from __future__ import annotations

import json
from decimal import Decimal

import pytest

from packages.core.platform.models_approval_setup import ApprovalSetup
from packages.core.platform.models_audit import AuditLog
from packages.modules.expenses.models.expense import Expense
from packages.modules.expenses.models_routing import ApprovalRoutingRule
from packages.modules.expenses.service.transition_service import submit_expense


def _seed_setup(db_session, company_id):
    db_session.add(
        ApprovalSetup(
            company_id=company_id,
            approval_mode="none",
            allow_resubmission_after_rejection=True,
        )
    )
    db_session.commit()


def _draft(db_session, company_id, **over):
    base = dict(
        company_id=company_id,
        description="rd",
        amount=Decimal("100.00"),
        status="draft",
    )
    base.update(over)
    e = Expense(**base)
    db_session.add(e)
    db_session.commit()
    db_session.refresh(e)
    return e


def _decision_rows(db_session, expense_id):
    return list(
        db_session.query(AuditLog)
        .filter(
            AuditLog.entity_type == "expense",
            AuditLog.entity_id == expense_id,
            AuditLog.action == "routing.decision",
        )
        .order_by(AuditLog.id.asc())
    )


def test_no_rules_no_decision_audit(db_session, test_company, test_user):
    _seed_setup(db_session, test_company.id)
    e = _draft(db_session, test_company.id)
    submit_expense(db_session, e, actor_user_id=test_user.id)
    assert _decision_rows(db_session, e.id) == []


def test_matching_rule_writes_decision(db_session, test_company, test_user):
    _seed_setup(db_session, test_company.id)
    db_session.add(
        ApprovalRoutingRule(
            company_id=test_company.id,
            rule_key="hv-travel",
            name="hv",
            priority=10,
            when_json={
                "all": [
                    {"field": "amount", "op": "gte", "value": 5000},
                    {"field": "category_code", "op": "eq", "value": "travel"},
                ]
            },
            approvers_json=[{"role": "cfo"}],
            sla_hours=48,
            escalation_role="cfo",
            is_enabled=True,
        )
    )
    db_session.commit()
    e = _draft(
        db_session,
        test_company.id,
        amount=Decimal("9000.00"),
        category_code="travel",
    )
    submit_expense(db_session, e, actor_user_id=test_user.id)
    rows = _decision_rows(db_session, e.id)
    assert len(rows) == 1
    payload = json.loads(rows[0].detail_text)
    assert payload["rule_id"] == "hv-travel"
    assert payload["sla_hours"] == 48
    assert payload["escalation_role"] == "cfo"
    assert payload["approver_roles"] == ["cfo"]
    assert payload["approver_user_ids"] == []


def test_non_matching_rule_skips_decision(db_session, test_company, test_user):
    _seed_setup(db_session, test_company.id)
    db_session.add(
        ApprovalRoutingRule(
            company_id=test_company.id,
            rule_key="hv-travel",
            name="hv",
            priority=10,
            when_json={
                "all": [{"field": "amount", "op": "gte", "value": 5000}]
            },
            approvers_json=[{"role": "cfo"}],
            sla_hours=48,
            is_enabled=True,
        )
    )
    db_session.commit()
    e = _draft(db_session, test_company.id, amount=Decimal("100.00"))
    submit_expense(db_session, e, actor_user_id=test_user.id)
    assert _decision_rows(db_session, e.id) == []


def test_disabled_rule_ignored(db_session, test_company, test_user):
    _seed_setup(db_session, test_company.id)
    db_session.add(
        ApprovalRoutingRule(
            company_id=test_company.id,
            rule_key="off",
            name="off",
            priority=10,
            when_json={"all": [{"field": "amount", "op": "gte", "value": 1}]},
            approvers_json=[{"role": "cfo"}],
            sla_hours=24,
            is_enabled=False,
        )
    )
    db_session.commit()
    e = _draft(db_session, test_company.id, amount=Decimal("999.00"))
    submit_expense(db_session, e, actor_user_id=test_user.id)
    assert _decision_rows(db_session, e.id) == []


def test_routing_failure_does_not_block_submit(
    db_session, test_company, test_user, monkeypatch
):
    _seed_setup(db_session, test_company.id)
    e = _draft(db_session, test_company.id, amount=Decimal("100.00"))

    def _boom(*a, **kw):
        raise RuntimeError("evaluator down")

    import packages.modules.expenses.service.approval_routing_service as ars

    monkeypatch.setattr(ars, "evaluate_for_expense", _boom)
    out = submit_expense(db_session, e, actor_user_id=test_user.id)
    assert out.status == "submitted"
    assert _decision_rows(db_session, e.id) == []
