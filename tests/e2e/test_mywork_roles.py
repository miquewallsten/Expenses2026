"""E2E role-based tests for the unified MyWork portal manifest."""
from __future__ import annotations

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from packages.core.platform.models import Company
from packages.core.platform.models_user import User


def _create_user(db_session: Session, company: Company, role: str, is_super_admin: bool = False) -> User:
    user = User(
        full_name=f"{role.title()} User",
        email=f"{role}@test.com",
        role=role,
        company_id=company.id,
        is_super_admin=is_super_admin,
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


def _manifest_modules(client: TestClient, user: User) -> list[str]:
    r = client.get("/mywork/manifest", headers={"X-User-Id": str(user.id)})
    assert r.status_code == 200
    return [m["id"] for m in r.json()["modules"]]


class TestEmployeeManifest:
    def test_employee_sees_expenses_time_reports(self, client: TestClient, db_session: Session) -> None:
        company = Company(name="Employee Co", slug="employee-co")
        db_session.add(company)
        db_session.commit()
        db_session.refresh(company)

        user = _create_user(db_session, company, "employee")
        modules = _manifest_modules(client, user)

        assert "expenses" in modules
        assert "time" in modules
        assert "reports" in modules
        assert "approvals" not in modules
        assert "accounting" not in modules
        assert "admin" not in modules
        assert "super-admin" not in modules


class TestManagerManifest:
    def test_manager_sees_expenses_time_reports_approvals(self, client: TestClient, db_session: Session) -> None:
        company = Company(name="Manager Co", slug="manager-co")
        db_session.add(company)
        db_session.commit()
        db_session.refresh(company)

        user = _create_user(db_session, company, "manager")
        modules = _manifest_modules(client, user)

        assert "expenses" in modules
        assert "time" in modules
        assert "reports" in modules
        assert "approvals" in modules
        assert "accounting" not in modules
        assert "admin" not in modules
        assert "super-admin" not in modules


class TestAccountingManifest:
    def test_accounting_sees_expenses_accounting_reports(self, client: TestClient, db_session: Session) -> None:
        company = Company(name="Accounting Co", slug="accounting-co")
        db_session.add(company)
        db_session.commit()
        db_session.refresh(company)

        user = _create_user(db_session, company, "accounting")
        modules = _manifest_modules(client, user)

        assert "expenses" in modules
        assert "accounting" in modules
        assert "reports" in modules
        assert "approvals" not in modules
        assert "admin" not in modules
        assert "super-admin" not in modules


class TestAdminManifest:
    def test_admin_sees_only_admin_module(self, client: TestClient, db_session: Session) -> None:
        company = Company(name="Admin Co", slug="admin-co")
        db_session.add(company)
        db_session.commit()
        db_session.refresh(company)

        user = _create_user(db_session, company, "admin")
        modules = _manifest_modules(client, user)

        assert modules == ["admin"]


class TestSuperAdminManifest:
    def test_super_admin_sees_all_modules(self, client: TestClient, db_session: Session) -> None:
        company = Company(name="Super Co", slug="super-co")
        db_session.add(company)
        db_session.commit()
        db_session.refresh(company)

        user = _create_user(db_session, company, "super_admin", is_super_admin=True)
        modules = _manifest_modules(client, user)

        assert "expenses" in modules
        assert "approvals" in modules
        assert "accounting" in modules
        assert "time" in modules
        assert "reports" in modules
        assert "admin" in modules
        assert "super-admin" in modules


class TestRoleTransition:
    def test_change_user_role_updates_manifest(self, client: TestClient, db_session: Session) -> None:
        company = Company(name="Transition Co", slug="transition-co")
        db_session.add(company)
        db_session.commit()
        db_session.refresh(company)

        user = _create_user(db_session, company, "employee")

        # Initially employee
        modules = _manifest_modules(client, user)
        assert "expenses" in modules
        assert "approvals" not in modules

        # Change role to manager
        user.role = "manager"
        db_session.commit()
        db_session.refresh(user)

        modules = _manifest_modules(client, user)
        assert "expenses" in modules
        assert "approvals" in modules
        assert "time" in modules
        assert "reports" in modules

        # Change role to admin
        user.role = "admin"
        db_session.commit()
        db_session.refresh(user)

        modules = _manifest_modules(client, user)
        assert modules == ["admin"]
