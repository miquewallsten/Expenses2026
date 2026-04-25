"""Phase 5.5 — approval routing rule engine + SLA escalation."""
from __future__ import annotations

from datetime import datetime, timedelta

import pytest
from sqlalchemy.orm import Session

from packages.core.platform.models import Company
from packages.core.platform.models_audit import AuditLog
from packages.core.platform.models_user import User
from packages.modules.expenses.service.approval_routing_service import (
    apply_delegation,
    evaluate_when,
    find_overdue,
    match_rule,
    resolve_approvers,
)


@pytest.fixture
def co55(db_session: Session) -> Company:
    co = Company(name="P55", slug="p55")
    db_session.add(co)
    db_session.commit()
    db_session.refresh(co)
    return co


def _user(db: Session, co_id: int, name: str, *, delegates_to: int | None = None) -> User:
    u = User(
        company_id=co_id, email=f"{name}@p55.test",
        full_name=name, role="employee",
        delegates_for_user_id=delegates_to,
    )
    db.add(u)
    db.commit()
    db.refresh(u)
    return u


# ── evaluate_when / match_rule ──────────────────────────────────────────────


def test_evaluate_when_empty_predicate_matches() -> None:
    assert evaluate_when(None, {"amount": 100}) is True
    assert evaluate_when({}, {"amount": 100}) is True


def test_evaluate_when_simple_op() -> None:
    when = {"field": "amount", "op": "gte", "value": 1000}
    assert evaluate_when(when, {"amount": 1500}) is True
    assert evaluate_when(when, {"amount": 500}) is False


def test_evaluate_when_all_and_any() -> None:
    when = {"all": [
        {"field": "category_code", "op": "eq", "value": "travel"},
        {"any": [
            {"field": "amount", "op": "gte", "value": 5000},
            {"field": "expense_type", "op": "eq", "value": "international"},
        ]},
    ]}
    assert evaluate_when(when, {"category_code": "travel", "amount": 5500}) is True
    assert evaluate_when(when, {"category_code": "travel", "amount": 100,
                                "expense_type": "international"}) is True
    assert evaluate_when(when, {"category_code": "meals", "amount": 5500}) is False
    assert evaluate_when(when, {"category_code": "travel", "amount": 100}) is False


def test_evaluate_when_in_operator() -> None:
    when = {"field": "cost_center_id", "op": "in", "value": [1, 2, 3]}
    assert evaluate_when(when, {"cost_center_id": 2}) is True
    assert evaluate_when(when, {"cost_center_id": 9}) is False


def test_match_rule_priority_order() -> None:
    rules = [
        {"id": "default", "priority": 0, "approvers": [{"role": "manager"}]},
        {"id": "high", "priority": 100,
         "when": {"field": "amount", "op": "gte", "value": 1000},
         "approvers": [{"role": "cfo"}]},
    ]
    hi = match_rule(rules, {"amount": 5000})
    assert hi is not None and hi["id"] == "high"
    lo = match_rule(rules, {"amount": 100})
    assert lo is not None and lo["id"] == "default"


def test_match_rule_no_match_returns_none() -> None:
    rules = [{"id": "x", "when": {"field": "amount", "op": "gt", "value": 1000},
              "approvers": []}]
    assert match_rule(rules, {"amount": 100}) is None


# ── apply_delegation ────────────────────────────────────────────────────────


def test_apply_delegation_no_delegate(db_session: Session, co55: Company) -> None:
    u = _user(db_session, co55.id, "alone")
    assert apply_delegation(db_session, u.id) == u.id


def test_apply_delegation_walks_chain(db_session: Session, co55: Company) -> None:
    a = _user(db_session, co55.id, "a")
    b = _user(db_session, co55.id, "b", delegates_to=a.id)
    c = _user(db_session, co55.id, "c", delegates_to=b.id)
    assert apply_delegation(db_session, c.id) == a.id


def test_apply_delegation_cycle_safe(db_session: Session, co55: Company) -> None:
    a = _user(db_session, co55.id, "ca")
    b = _user(db_session, co55.id, "cb", delegates_to=a.id)
    a.delegates_for_user_id = b.id
    db_session.commit()
    # should terminate without infinite loop
    out = apply_delegation(db_session, a.id)
    assert out in {a.id, b.id}


# ── resolve_approvers ───────────────────────────────────────────────────────


def test_resolve_approvers_full(db_session: Session, co55: Company) -> None:
    cfo = _user(db_session, co55.id, "cfo")
    rules = [{
        "id": "high-value",
        "priority": 10,
        "when": {"field": "amount", "op": "gte", "value": 5000},
        "approvers": [{"user_id": cfo.id}, {"role": "controller"}],
        "sla_hours": 48,
        "escalation_role": "ceo",
    }]
    out = resolve_approvers(
        db_session, context={"amount": 10000}, rules=rules,
    )
    assert out.rule_id == "high-value"
    assert out.approver_user_ids == [cfo.id]
    assert out.approver_roles == ["controller"]
    assert out.sla_hours == 48
    assert out.escalation_role == "ceo"


def test_resolve_approvers_with_delegation(
    db_session: Session, co55: Company
) -> None:
    boss = _user(db_session, co55.id, "boss")
    ea = _user(db_session, co55.id, "ea", delegates_to=boss.id)
    rules = [{"id": "any", "approvers": [{"user_id": ea.id}]}]
    out = resolve_approvers(db_session, context={}, rules=rules)
    assert out.approver_user_ids == [boss.id]


def test_resolve_approvers_no_match(db_session: Session, co55: Company) -> None:
    rules = [{"id": "x", "when": {"field": "amount", "op": "gt",
              "value": 1000}, "approvers": [{"role": "cfo"}]}]
    out = resolve_approvers(db_session, context={"amount": 100}, rules=rules)
    assert out.rule_id is None
    assert out.approver_user_ids == []
    assert out.approver_roles == []


# ── find_overdue ────────────────────────────────────────────────────────────


def test_find_overdue_flags_when_age_exceeds_sla(db_session: Session) -> None:
    now = datetime(2026, 4, 24, 12, 0, 0)
    rules = [{
        "id": "default", "priority": 0,
        "approvers": [{"role": "manager"}],
        "sla_hours": 24, "escalation_role": "cfo",
    }]
    rows = [
        (1, "submitted", now - timedelta(hours=30), {"amount": 100}),
        (2, "submitted", now - timedelta(hours=10), {"amount": 100}),
    ]
    out = find_overdue(db_session, expenses_with_ctx=rows, rules=rules, now=now)
    assert len(out) == 1
    assert out[0].expense_id == 1
    assert out[0].sla_hours == 24
    assert out[0].escalation_role == "cfo"
    assert out[0].age_hours == 30.0


def test_find_overdue_skips_terminal_status(db_session: Session) -> None:
    now = datetime(2026, 4, 24, 12, 0, 0)
    rules = [{"id": "x", "approvers": [], "sla_hours": 1}]
    rows = [
        (1, "approved", now - timedelta(hours=999), {"amount": 100}),
        (2, "rejected", now - timedelta(hours=999), {"amount": 100}),
        (3, "draft", now - timedelta(hours=999), {"amount": 100}),
    ]
    out = find_overdue(db_session, expenses_with_ctx=rows, rules=rules, now=now)
    assert out == []


def test_find_overdue_skips_when_no_rule_matches(db_session: Session) -> None:
    now = datetime(2026, 4, 24, 12, 0, 0)
    rules = [{
        "id": "high",
        "when": {"field": "amount", "op": "gte", "value": 5000},
        "approvers": [], "sla_hours": 1,
    }]
    rows = [(1, "submitted", now - timedelta(hours=5), {"amount": 100})]
    out = find_overdue(db_session, expenses_with_ctx=rows, rules=rules, now=now)
    assert out == []


def test_find_overdue_skips_when_sla_not_set(db_session: Session) -> None:
    now = datetime(2026, 4, 24, 12, 0, 0)
    rules = [{"id": "x", "approvers": [{"role": "manager"}]}]
    rows = [(1, "submitted", now - timedelta(hours=999), {"amount": 100})]
    out = find_overdue(db_session, expenses_with_ctx=rows, rules=rules, now=now)
    assert out == []
