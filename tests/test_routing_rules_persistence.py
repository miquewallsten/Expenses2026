"""Phase 5.5 persistence — admin routing-rules CRUD + service helper."""
from __future__ import annotations

import pytest
from sqlalchemy.orm import Session

from packages.core.platform.models import Company
from packages.core.platform.models_user import User
from packages.modules.expenses.models_routing import ApprovalRoutingRule
from packages.modules.expenses.service.approval_routing_service import (
    list_rules_for_company,
    match_rule,
    resolve_approvers,
)


@pytest.fixture
def co(db_session: Session) -> Company:
    c = Company(name="RR", slug="rr")
    db_session.add(c)
    db_session.commit()
    db_session.refresh(c)
    return c


def _admin(db_session: Session, co: Company) -> User:
    u = User(full_name="A", email="a-rr@test.com", role="admin", company_id=co.id)
    db_session.add(u)
    db_session.commit()
    db_session.refresh(u)
    return u


def _emp(db_session: Session, co: Company) -> User:
    u = User(full_name="E", email="e-rr@test.com", role="employee", company_id=co.id)
    db_session.add(u)
    db_session.commit()
    db_session.refresh(u)
    return u


def _payload(**over):
    base = {
        "rule_key": "high-value-travel",
        "name": "High value travel → CFO",
        "priority": 10,
        "when_json": {
            "all": [
                {"field": "amount", "op": "gte", "value": 5000},
                {"field": "category_code", "op": "eq", "value": "travel"},
            ]
        },
        "approvers_json": [{"role": "cfo"}],
        "sla_hours": 48,
        "escalation_role": "cfo",
        "is_enabled": True,
    }
    base.update(over)
    return base


# ── HTTP CRUD ────────────────────────────────────────────────────────────


def test_list_admin_only(client, db_session, co):
    emp = _emp(db_session, co)
    r = client.get(
        f"/admin/routing-rules/{co.id}", headers={"X-User-Id": str(emp.id)}
    )
    assert r.status_code == 403


def test_create_then_list(client, db_session, co):
    admin = _admin(db_session, co)
    r = client.post(
        f"/admin/routing-rules/{co.id}",
        json=_payload(),
        headers={"X-User-Id": str(admin.id)},
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["rule_key"] == "high-value-travel"
    assert body["priority"] == 10
    rl = client.get(
        f"/admin/routing-rules/{co.id}", headers={"X-User-Id": str(admin.id)}
    )
    assert rl.status_code == 200
    items = rl.json()
    assert len(items) == 1 and items[0]["id"] == body["id"]


def test_create_duplicate_rule_key_409(client, db_session, co):
    admin = _admin(db_session, co)
    client.post(
        f"/admin/routing-rules/{co.id}",
        json=_payload(),
        headers={"X-User-Id": str(admin.id)},
    )
    r2 = client.post(
        f"/admin/routing-rules/{co.id}",
        json=_payload(),
        headers={"X-User-Id": str(admin.id)},
    )
    assert r2.status_code == 409


def test_create_validates_when_shape(client, db_session, co):
    admin = _admin(db_session, co)
    bad = _payload(when_json={"all": []})  # empty list rejected
    r = client.post(
        f"/admin/routing-rules/{co.id}",
        json=bad,
        headers={"X-User-Id": str(admin.id)},
    )
    assert r.status_code == 422

    bad2 = _payload(
        rule_key="x", when_json={"field": "amount", "op": "frob", "value": 1}
    )
    r2 = client.post(
        f"/admin/routing-rules/{co.id}",
        json=bad2,
        headers={"X-User-Id": str(admin.id)},
    )
    assert r2.status_code == 422


def test_update_toggles_enabled(client, db_session, co):
    admin = _admin(db_session, co)
    r = client.post(
        f"/admin/routing-rules/{co.id}",
        json=_payload(),
        headers={"X-User-Id": str(admin.id)},
    )
    rid = r.json()["id"]
    r2 = client.patch(
        f"/admin/routing-rules/{co.id}/{rid}",
        json={"is_enabled": False, "priority": 99},
        headers={"X-User-Id": str(admin.id)},
    )
    assert r2.status_code == 200
    body = r2.json()
    assert body["is_enabled"] is False
    assert body["priority"] == 99


def test_delete_cross_company_404(client, db_session, co):
    admin = _admin(db_session, co)
    other = Company(name="Other", slug="other")
    db_session.add(other)
    db_session.commit()
    db_session.refresh(other)
    foreign = ApprovalRoutingRule(
        company_id=other.id,
        rule_key="x",
        name="x",
        priority=0,
        when_json={"field": "amount", "op": "eq", "value": 1},
        approvers_json=[{"role": "cfo"}],
    )
    db_session.add(foreign)
    db_session.commit()
    db_session.refresh(foreign)
    r = client.delete(
        f"/admin/routing-rules/{co.id}/{foreign.id}",
        headers={"X-User-Id": str(admin.id)},
    )
    assert r.status_code == 404


# ── Service helper ──────────────────────────────────────────────────────


def test_list_rules_for_company_round_trips_through_engine(db_session, co):
    db_session.add_all(
        [
            ApprovalRoutingRule(
                company_id=co.id,
                rule_key="cheap",
                name="cheap",
                priority=0,
                when_json={"field": "amount", "op": "lt", "value": 100},
                approvers_json=[{"role": "manager"}],
            ),
            ApprovalRoutingRule(
                company_id=co.id,
                rule_key="big",
                name="big",
                priority=10,
                when_json={"field": "amount", "op": "gte", "value": 5000},
                approvers_json=[{"role": "cfo"}],
                sla_hours=24,
                escalation_role="ceo",
            ),
            ApprovalRoutingRule(
                company_id=co.id,
                rule_key="paused",
                name="paused",
                priority=99,
                when_json={"field": "amount", "op": "gte", "value": 0},
                approvers_json=[{"role": "ceo"}],
                is_enabled=False,
            ),
        ]
    )
    db_session.commit()

    rules = list_rules_for_company(db_session, company_id=co.id)
    # Disabled rule excluded.
    assert {r["id"] for r in rules} == {"cheap", "big"}
    # Highest-priority enabled rule wins.
    matched = match_rule(rules, {"amount": 7000})
    assert matched is not None and matched["id"] == "big"
    assert matched["sla_hours"] == 24

    resolved = resolve_approvers(
        db_session, context={"amount": 7000}, rules=rules
    )
    assert resolved.rule_id == "big"
    assert resolved.approver_roles == ["cfo"]
    assert resolved.escalation_role == "ceo"


# ── Preview endpoint ────────────────────────────────────────────────────


def test_preview_matches_highest_priority_enabled(client, db_session, co):
    admin = _admin(db_session, co)
    db_session.add_all(
        [
            ApprovalRoutingRule(
                company_id=co.id,
                rule_key="cheap",
                name="cheap",
                priority=0,
                when_json={"field": "amount", "op": "lt", "value": 100},
                approvers_json=[{"role": "manager"}],
            ),
            ApprovalRoutingRule(
                company_id=co.id,
                rule_key="big",
                name="big",
                priority=10,
                when_json={"field": "amount", "op": "gte", "value": 5000},
                approvers_json=[{"role": "cfo"}],
                sla_hours=24,
                escalation_role="ceo",
            ),
        ]
    )
    db_session.commit()

    r = client.post(
        f"/admin/routing-rules/{co.id}/preview",
        json={"context": {"amount": 7000}},
        headers={"X-User-Id": str(admin.id)},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["matched_rule_id"] == "big"
    assert body["approver_roles"] == ["cfo"]
    assert body["sla_hours"] == 24
    assert body["escalation_role"] == "ceo"
    assert body["rules_evaluated"] == 2


def test_preview_no_match(client, db_session, co):
    admin = _admin(db_session, co)
    r = client.post(
        f"/admin/routing-rules/{co.id}/preview",
        json={"context": {"amount": 1}},
        headers={"X-User-Id": str(admin.id)},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["matched_rule_id"] is None
    assert body["approver_user_ids"] == []
    assert body["rules_evaluated"] == 0


def test_preview_admin_only(client, db_session, co):
    emp = _emp(db_session, co)
    r = client.post(
        f"/admin/routing-rules/{co.id}/preview",
        json={"context": {}},
        headers={"X-User-Id": str(emp.id)},
    )
    assert r.status_code == 403
