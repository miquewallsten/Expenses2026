"""Phase 2.3 — permission catalog + has_permission() + /me/permissions tests."""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from packages.core.platform.models import Company
from packages.core.platform.models_permission import Permission
from packages.core.platform.models_role import Role
from packages.core.platform.models_role_permission import RolePermission
from packages.core.platform.models_user import User
from packages.core.platform.service_permissions import (
    PERMISSION_CATALOG,
    all_permission_keys,
    has_permission,
    invalidate_cache,
    list_permissions,
)


@pytest.fixture(autouse=True)
def _clear_cache() -> None:
    invalidate_cache()
    yield
    invalidate_cache()


@pytest.fixture
def co23(db_session: Session) -> Company:
    co = Company(name="P23", slug="p23")
    db_session.add(co)
    db_session.commit()
    db_session.refresh(co)
    return co


def _user(db: Session, co: Company, role: str, email: str) -> User:
    u = User(company_id=co.id, email=email, full_name=email, role=role)
    db.add(u)
    db.commit()
    db.refresh(u)
    return u


# ── Catalog hygiene ─────────────────────────────────────────────────────────


def test_catalog_keys_are_unique_and_namespaced() -> None:
    for k in PERMISSION_CATALOG:
        assert ":" in k, f"permission key {k!r} should be namespaced"
    assert len(set(PERMISSION_CATALOG.keys())) == len(PERMISSION_CATALOG)


def test_all_permission_keys_returns_catalog() -> None:
    assert set(all_permission_keys()) == set(PERMISSION_CATALOG.keys())


# ── Built-in role defaults ──────────────────────────────────────────────────


def test_admin_has_every_catalog_permission(
    db_session: Session, co23: Company
) -> None:
    admin = _user(db_session, co23, "admin", "a@p23.test")
    for key in PERMISSION_CATALOG:
        assert has_permission(db_session, admin, key), f"admin missing {key}"


def test_employee_has_minimal_permissions(
    db_session: Session, co23: Company
) -> None:
    emp = _user(db_session, co23, "employee", "e@p23.test")
    assert has_permission(db_session, emp, "expense:create")
    assert has_permission(db_session, emp, "expense:submit")
    assert not has_permission(db_session, emp, "expense:approve:manager")
    assert not has_permission(db_session, emp, "admin:users:read")
    assert not has_permission(db_session, emp, "agent:tools:rbac")


def test_manager_can_approve_but_not_admin(
    db_session: Session, co23: Company
) -> None:
    mgr = _user(db_session, co23, "manager", "m@p23.test")
    assert has_permission(db_session, mgr, "expense:approve:manager")
    assert has_permission(db_session, mgr, "expense:bulk_transition")
    assert not has_permission(db_session, mgr, "admin:roles:write")
    assert not has_permission(db_session, mgr, "admin:ai_policy:write")


def test_accounting_can_export_polizas(
    db_session: Session, co23: Company
) -> None:
    acc = _user(db_session, co23, "accounting", "ac@p23.test")
    assert has_permission(db_session, acc, "accounting:export_polizas")
    assert has_permission(db_session, acc, "expense:approve:accounting")
    assert not has_permission(db_session, acc, "admin:roles:write")


def test_disabled_user_has_no_permissions(
    db_session: Session, co23: Company
) -> None:
    disabled = _user(db_session, co23, "disabled", "d@p23.test")
    assert list_permissions(db_session, disabled) == []
    assert not has_permission(db_session, disabled, "expense:create")


def test_anonymous_user_has_no_permissions(db_session: Session) -> None:
    assert list_permissions(db_session, None) == []
    assert not has_permission(db_session, None, "expense:create")


def test_unknown_permission_key_raises(
    db_session: Session, co23: Company
) -> None:
    admin = _user(db_session, co23, "admin", "a2@p23.test")
    with pytest.raises(ValueError, match="Unknown permission key"):
        has_permission(db_session, admin, "this:does:not:exist")


# ── Custom Role rows extend the built-in baseline ──────────────────────────


def test_custom_role_grants_extra_permissions_on_top_of_baseline(
    db_session: Session, co23: Company
) -> None:
    # Insert the catalog Permission row + a custom Role row keyed 'employee'
    # for this company that grants an extra non-default permission.
    perm = Permission(
        key="analytics:view",
        name="View finance analytics dashboard",
        description=None,
    )
    db_session.add(perm)
    db_session.flush()

    role = Role(company_id=co23.id, key="employee", name="Employee+")
    db_session.add(role)
    db_session.flush()
    db_session.add(RolePermission(role_id=role.id, permission_id=perm.id))
    db_session.commit()
    invalidate_cache(co23.id, "employee")

    emp = _user(db_session, co23, "employee", "ext@p23.test")
    # Built-in baseline still applies
    assert has_permission(db_session, emp, "expense:create")
    # Plus the new grant
    assert has_permission(db_session, emp, "analytics:view")


def test_custom_role_in_other_company_does_not_leak(
    db_session: Session, co23: Company
) -> None:
    other = Company(name="Other23", slug="other23")
    db_session.add(other)
    db_session.commit()
    db_session.refresh(other)

    perm = Permission(
        key="analytics:export",
        name="Export analytics data",
        description=None,
    )
    db_session.add(perm)
    db_session.flush()
    role = Role(company_id=other.id, key="employee", name="Employee+")
    db_session.add(role)
    db_session.flush()
    db_session.add(RolePermission(role_id=role.id, permission_id=perm.id))
    db_session.commit()
    invalidate_cache()

    emp_co23 = _user(db_session, co23, "employee", "ee@p23.test")
    # The Role is attached to a different company, so emp_co23 doesn't get the
    # extra grant.
    assert not has_permission(db_session, emp_co23, "analytics:export")


# ── /me/permissions endpoint ────────────────────────────────────────────────


def test_me_permissions_returns_admin_full_set(
    client: TestClient, db_session: Session, co23: Company
) -> None:
    admin = _user(db_session, co23, "admin", "a3@p23.test")
    r = client.get("/me/permissions", headers={"X-User-Id": str(admin.id)})
    assert r.status_code == 200
    body = r.json()
    assert body["user_id"] == admin.id
    assert body["company_id"] == co23.id
    assert body["role"] == "admin"
    assert "expense:create" in body["permissions"]
    assert "admin:roles:write" in body["permissions"]
    assert len(body["permissions"]) == len(PERMISSION_CATALOG)


def test_me_permissions_returns_employee_minimal_set(
    client: TestClient, db_session: Session, co23: Company
) -> None:
    emp = _user(db_session, co23, "employee", "e2@p23.test")
    r = client.get("/me/permissions", headers={"X-User-Id": str(emp.id)})
    assert r.status_code == 200
    body = r.json()
    assert body["role"] == "employee"
    perms = set(body["permissions"])
    assert "expense:create" in perms
    assert "admin:roles:write" not in perms


def test_me_permissions_requires_auth(client: TestClient) -> None:
    r = client.get("/me/permissions")
    assert r.status_code == 401


def test_me_permissions_disabled_user_returns_empty(
    client: TestClient, db_session: Session, co23: Company
) -> None:
    d = _user(db_session, co23, "disabled", "d2@p23.test")
    r = client.get("/me/permissions", headers={"X-User-Id": str(d.id)})
    assert r.status_code == 200
    assert r.json()["permissions"] == []
