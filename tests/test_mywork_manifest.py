"""Tests for MyWork manifest service."""
from __future__ import annotations

import pytest
from sqlalchemy.orm import Session

from packages.core.platform.models import Company
from packages.core.platform.models_user import User
from packages.modules.mywork.core.manifest_service import ManifestService


@pytest.fixture
def manifest_service(db_session: Session) -> ManifestService:
    return ManifestService(db_session)


@pytest.fixture
def admin_user(db_session: Session, test_company: Company) -> User:
    user = User(
        full_name="Admin User",
        email="admin@test.com",
        role="admin",
        company_id=test_company.id,
        is_super_admin=False,
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


@pytest.fixture
def super_admin_user(db_session: Session, test_company: Company) -> User:
    user = User(
        full_name="Super Admin",
        email="superadmin@test.com",
        role="super_admin",
        company_id=test_company.id,
        is_super_admin=True,
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


@pytest.fixture
def accounting_user(db_session: Session, test_company: Company) -> User:
    user = User(
        full_name="Accounting User",
        email="accounting@test.com",
        role="accounting",
        company_id=test_company.id,
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


@pytest.fixture
def manager_user(db_session: Session, test_company: Company) -> User:
    user = User(
        full_name="Manager User",
        email="manager@test.com",
        role="manager",
        company_id=test_company.id,
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


class TestManifestService:
    def test_employee_manifest(self, manifest_service: ManifestService, test_user: User):
        manifest = manifest_service.build_manifest(test_user.id)
        assert manifest["user"]["id"] == test_user.id
        assert manifest["user"]["email"] == test_user.email
        assert manifest["user"]["fullName"] == test_user.full_name
        assert manifest["user"]["role"] == "employee"
        assert manifest["user"]["isSuperAdmin"] is False

        modules = [m["id"] for m in manifest["modules"]]
        assert "expenses" in modules
        assert "time" in modules
        assert "reports" in modules
        assert "approvals" not in modules
        assert "accounting" not in modules
        assert "admin" not in modules
        assert "super-admin" not in modules

        assert manifest["copilot"]["agentId"] == "employee-copilot"
        assert "expenses:create" in manifest["permissions"]

    def test_manager_manifest(self, manifest_service: ManifestService, manager_user: User):
        manifest = manifest_service.build_manifest(manager_user.id)
        assert manifest["user"]["role"] == "manager"
        assert manifest["user"]["isSuperAdmin"] is False

        modules = [m["id"] for m in manifest["modules"]]
        assert "expenses" in modules
        assert "approvals" in modules
        assert "time" in modules
        assert "reports" in modules
        assert "accounting" not in modules
        assert "admin" not in modules
        assert "super-admin" not in modules

        assert manifest["copilot"]["agentId"] == "manager-copilot"
        assert "approval:approve" in manifest["permissions"]

    def test_accounting_manifest(self, manifest_service: ManifestService, accounting_user: User):
        manifest = manifest_service.build_manifest(accounting_user.id)
        assert manifest["user"]["role"] == "accounting"

        modules = [m["id"] for m in manifest["modules"]]
        assert "expenses" in modules
        assert "accounting" in modules
        assert "reports" in modules
        assert "approvals" not in modules
        assert "admin" not in modules
        assert "super-admin" not in modules

        assert manifest["copilot"]["agentId"] == "accounting-copilot"

    def test_admin_sees_only_admin_module(self, manifest_service: ManifestService, admin_user: User):
        manifest = manifest_service.build_manifest(admin_user.id)
        assert manifest["user"]["role"] == "admin"
        assert manifest["user"]["isSuperAdmin"] is False

        modules = [m["id"] for m in manifest["modules"]]
        assert modules == ["admin"]
        assert manifest["copilot"]["agentId"] == "admin-copilot"

    def test_super_admin_sees_all_modules(self, manifest_service: ManifestService, super_admin_user: User):
        manifest = manifest_service.build_manifest(super_admin_user.id)
        assert manifest["user"]["isSuperAdmin"] is True

        modules = [m["id"] for m in manifest["modules"]]
        assert "expenses" in modules
        assert "approvals" in modules
        assert "accounting" in modules
        assert "time" in modules
        assert "reports" in modules
        assert "admin" in modules
        assert "super-admin" in modules

        assert manifest["copilot"]["agentId"] == "super-admin-copilot"

    def test_user_not_found_raises(self, manifest_service: ManifestService):
        with pytest.raises(ValueError, match="User not found"):
            manifest_service.build_manifest(99999)

    def test_tool_permissions(self, manifest_service: ManifestService, test_user: User):
        manifest = manifest_service.build_manifest(test_user.id)
        perms = manifest["permissions"]
        assert isinstance(perms, list)
        assert "expenses:create" in perms

    def test_tenant_config(self, manifest_service: ManifestService, test_user: User, test_company: Company):
        manifest = manifest_service.build_manifest(test_user.id)
        assert manifest["tenant"]["companyId"] == test_company.id
        assert manifest["tenant"]["companyName"] == test_company.name
