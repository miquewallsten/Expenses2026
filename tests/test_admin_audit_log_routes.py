"""Admin audit-log viewer routes."""
from __future__ import annotations

import pytest
from sqlalchemy.orm import Session

from packages.core.platform.models import Company
from packages.core.platform.models_audit import AuditLog
from packages.core.platform.models_user import User


@pytest.fixture
def co(db_session: Session) -> Company:
    c = Company(name="AL", slug="al")
    db_session.add(c)
    db_session.commit()
    db_session.refresh(c)
    return c


def _admin(db_session: Session, co: Company) -> User:
    u = User(full_name="A", email="a-al@test.com", role="admin", company_id=co.id)
    db_session.add(u)
    db_session.commit()
    db_session.refresh(u)
    return u


def _emp(db_session: Session, co: Company) -> User:
    u = User(full_name="E", email="e-al@test.com", role="employee", company_id=co.id)
    db_session.add(u)
    db_session.commit()
    db_session.refresh(u)
    return u


def _seed(db_session: Session, co: Company, n: int = 3) -> list[AuditLog]:
    rows = []
    for i in range(n):
        r = AuditLog(
            company_id=co.id,
            entity_type="Expense" if i % 2 == 0 else "AiPolicy",
            entity_id=i + 1,
            action="expense.transition" if i % 2 == 0 else "ai_policy.update",
            actor_user_id=None,
            detail_text=f"row-{i}",
        )
        db_session.add(r)
        rows.append(r)
    db_session.commit()
    return rows


def test_list_audit_log_admin_only(client, db_session, co):
    emp = _emp(db_session, co)
    r = client.get(f"/admin/audit-log/{co.id}", headers={"X-User-Id": str(emp.id)})
    assert r.status_code == 403


def test_list_audit_log_returns_rows_desc(client, db_session, co):
    admin = _admin(db_session, co)
    _seed(db_session, co, n=5)
    r = client.get(f"/admin/audit-log/{co.id}", headers={"X-User-Id": str(admin.id)})
    assert r.status_code == 200, r.text
    body = r.json()
    assert len(body["rows"]) == 5
    ids = [row["id"] for row in body["rows"]]
    assert ids == sorted(ids, reverse=True)
    assert body["next_cursor"] is None


def test_list_audit_log_filter_by_action(client, db_session, co):
    admin = _admin(db_session, co)
    _seed(db_session, co, n=4)
    r = client.get(
        f"/admin/audit-log/{co.id}",
        params={"action": "ai_policy.update"},
        headers={"X-User-Id": str(admin.id)},
    )
    assert r.status_code == 200
    rows = r.json()["rows"]
    assert all(row["action"] == "ai_policy.update" for row in rows)
    assert len(rows) == 2


def test_list_audit_log_pagination_cursor(client, db_session, co):
    admin = _admin(db_session, co)
    _seed(db_session, co, n=6)
    r = client.get(
        f"/admin/audit-log/{co.id}",
        params={"limit": 4},
        headers={"X-User-Id": str(admin.id)},
    )
    body = r.json()
    assert len(body["rows"]) == 4
    assert body["next_cursor"] is not None
    r2 = client.get(
        f"/admin/audit-log/{co.id}",
        params={"limit": 4, "cursor": body["next_cursor"]},
        headers={"X-User-Id": str(admin.id)},
    )
    body2 = r2.json()
    assert len(body2["rows"]) == 2
    assert body2["next_cursor"] is None
    # No overlap between pages.
    page1_ids = {row["id"] for row in body["rows"]}
    page2_ids = {row["id"] for row in body2["rows"]}
    assert page1_ids.isdisjoint(page2_ids)


def test_list_audit_log_cross_company_isolated(client, db_session, co):
    admin = _admin(db_session, co)
    other = Company(name="Other", slug="other")
    db_session.add(other)
    db_session.commit()
    db_session.refresh(other)
    _seed(db_session, other, n=2)
    r = client.get(f"/admin/audit-log/{co.id}", headers={"X-User-Id": str(admin.id)})
    assert r.status_code == 200
    assert r.json()["rows"] == []


def test_list_actions(client, db_session, co):
    admin = _admin(db_session, co)
    _seed(db_session, co, n=4)
    r = client.get(
        f"/admin/audit-log/{co.id}/actions", headers={"X-User-Id": str(admin.id)}
    )
    assert r.status_code == 200
    actions = r.json()
    assert set(actions) == {"expense.transition", "ai_policy.update"}
    assert actions == sorted(actions)
