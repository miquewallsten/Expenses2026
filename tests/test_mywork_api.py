from __future__ import annotations

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from packages.core.platform.models import Company
from packages.core.platform.models_user import User


def test_manifest_requires_auth(client: TestClient) -> None:
    r = client.get("/mywork/manifest")
    assert r.status_code == 401


def test_manifest_returns_user_manifest(client: TestClient, db_session: Session) -> None:
    company = Company(name="Manifest Co", slug="manifest-co")
    db_session.add(company)
    db_session.commit()
    db_session.refresh(company)

    user = User(
        full_name="Manifest User",
        email="manifest@test.com",
        role="employee",
        company_id=company.id,
        can_create_expenses=True,
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)

    r = client.get("/mywork/manifest", headers={"X-User-Id": str(user.id)})
    assert r.status_code == 200
    body = r.json()
    assert body["user"]["id"] == user.id
    assert body["user"]["email"] == user.email
    assert body["user"]["role"] == "employee"
    assert "permissions" in body
    assert "modules" in body
    assert "copilot" in body
    assert "tenant" in body
    assert body["tenant"]["companyId"] == company.id


def test_context_requires_auth(client: TestClient) -> None:
    r = client.post("/mywork/context", json={"module": "expenses"})
    assert r.status_code == 401


def test_context_returns_copilot_suggestions(client: TestClient, db_session: Session) -> None:
    company = Company(name="Ctx Co", slug="ctx-co")
    db_session.add(company)
    db_session.commit()
    db_session.refresh(company)

    user = User(
        full_name="Ctx User",
        email="ctx@test.com",
        role="employee",
        company_id=company.id,
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)

    r = client.post(
        "/mywork/context",
        json={"module": "expenses"},
        headers={"X-User-Id": str(user.id)},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["module"] == "expenses"
    assert len(body["copilot_suggestions"]) > 0
    assert body["copilot_suggestions"][0]["actionId"] == "expenses:create"


def test_actions_requires_auth(client: TestClient) -> None:
    r = client.post("/mywork/actions", json={"action_id": "expenses:create", "module": "expenses"})
    assert r.status_code == 401


def test_actions_routes_to_handler(client: TestClient, db_session: Session) -> None:
    company = Company(name="Action Co", slug="action-co")
    db_session.add(company)
    db_session.commit()
    db_session.refresh(company)

    user = User(
        full_name="Action User",
        email="action@test.com",
        role="employee",
        company_id=company.id,
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)

    r = client.post(
        "/mywork/actions",
        json={
            "action_id": "expenses:create",
            "module": "expenses",
            "payload": {"amount": 100.0, "description": "Taxi ride", "company_id": company.id},
        },
        headers={"X-User-Id": str(user.id)},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["success"] is True
    assert "expense_id" in body["data"]


def test_actions_returns_error_for_unknown_action(client: TestClient, db_session: Session) -> None:
    company = Company(name="Unknown Co", slug="unknown-co")
    db_session.add(company)
    db_session.commit()
    db_session.refresh(company)

    user = User(
        full_name="Unknown User",
        email="unknown@test.com",
        role="employee",
        company_id=company.id,
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)

    r = client.post(
        "/mywork/actions",
        json={"action_id": "does:not_exist", "module": "expenses"},
        headers={"X-User-Id": str(user.id)},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["success"] is False
    assert body["error"]["code"] == "unknown_action"
    assert body["error"]["retryable"] is False
