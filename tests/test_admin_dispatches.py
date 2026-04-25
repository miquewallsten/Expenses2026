"""Phase 1.8 — admin dispatches endpoint."""

from __future__ import annotations

from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from packages.core.platform.models import Company
from packages.core.platform.models_user import User
from packages.modules.channels.models import NotificationDispatch


@pytest.fixture
def admin_setup(db_session: Session) -> dict:
    company = Company(name="Acme", slug="acme")
    db_session.add(company)
    db_session.commit()
    admin = User(
        company_id=company.id,
        email="admin@acme.test",
        full_name="Admin",
        role="admin",
    )
    db_session.add(admin)
    db_session.commit()

    for i in range(3):
        db_session.add(
            NotificationDispatch(
                company_id=company.id,
                event_type=f"expense.test.{i}",
                resource_type="expense",
                resource_id=100 + i,
                recipient_user_id=admin.id,
                recipient_address="admin@acme.test",
                channel="email",
                status="sent" if i % 2 == 0 else "failed",
                attempts=1,
                created_at=datetime.now(tz=timezone.utc),
            )
        )
    db_session.commit()
    return {"company": company, "admin": admin}


def test_list_dispatches_returns_rows(
    client: TestClient, db_session: Session, admin_setup: dict
) -> None:
    headers = {"X-User-Id": str(admin_setup["admin"].id)}
    r = client.get(
        f"/admin/channels/dispatches/{admin_setup['company'].id}",
        headers=headers,
    )
    assert r.status_code == 200
    rows = r.json()
    assert len(rows) == 3
    assert all("event_type" in row for row in rows)


def test_list_dispatches_filters_by_status(
    client: TestClient, db_session: Session, admin_setup: dict
) -> None:
    headers = {"X-User-Id": str(admin_setup["admin"].id)}
    r = client.get(
        f"/admin/channels/dispatches/{admin_setup['company'].id}?status=failed",
        headers=headers,
    )
    assert r.status_code == 200
    rows = r.json()
    assert all(row["status"] == "failed" for row in rows)
    assert len(rows) == 1


def test_list_dispatches_requires_admin(
    client: TestClient, db_session: Session, admin_setup: dict
) -> None:
    employee = User(
        company_id=admin_setup["company"].id,
        email="emp@acme.test",
        full_name="Emp",
        role="employee",
    )
    db_session.add(employee)
    db_session.commit()
    r = client.get(
        f"/admin/channels/dispatches/{admin_setup['company'].id}",
        headers={"X-User-Id": str(employee.id)},
    )
    assert r.status_code in (401, 403)
