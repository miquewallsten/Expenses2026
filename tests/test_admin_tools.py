"""Tests for admin copilot tools."""

from __future__ import annotations

import pytest
from pydantic import BaseModel, ConfigDict

from packages.core.platform.models_user import User
from packages.modules.agent.core.context import AgentContext
from packages.modules.agent.core.registry import REGISTRY, ToolResult
from packages.modules.agent.tools import registry_all  # noqa: F401 — triggers tool registration


def _ctx(db_session, test_company, *, persona="admin", role="admin", user_id=42):
    return AgentContext(
        db=db_session,
        company_id=test_company.id,
        user_id=user_id,
        user_email="admin@test.com",
        user_role=role,
        persona=persona,
    )


class TestInviteUserTool:
    def test_invite_user_success(self, db_session, test_company):
        ctx = _ctx(db_session, test_company)
        res = REGISTRY.dispatch("invite_user", {"email": "new@example.com", "role": "employee"}, ctx)
        assert res.ok is True
        assert res.data["email"] == "new@example.com"
        user = db_session.query(User).filter(User.email == "new@example.com").first()
        assert user is not None
        assert user.role == "employee"

    def test_invite_user_duplicate_email(self, db_session, test_company):
        ctx = _ctx(db_session, test_company)
        REGISTRY.dispatch("invite_user", {"email": "dup@example.com"}, ctx)
        res = REGISTRY.dispatch("invite_user", {"email": "dup@example.com"}, ctx)
        assert res.ok is False
        assert "already exists" in res.summary

    def test_invite_user_permission_denied(self, db_session, test_company):
        ctx = _ctx(db_session, test_company, role="employee")
        res = REGISTRY.dispatch("invite_user", {"email": "x@example.com"}, ctx)
        assert res.ok is False
        assert "forbidden" in (res.error or "")


class TestUpdatePolicyTool:
    def test_update_xml_required_mode(self, db_session, test_company):
        ctx = _ctx(db_session, test_company)
        res = REGISTRY.dispatch("update_policy", {"policy_type": "xml_required_mode", "value": "always"}, ctx)
        assert res.ok is True
        assert res.data["xml_required_mode"] == "always"

    def test_update_approval_mode(self, db_session, test_company):
        ctx = _ctx(db_session, test_company)
        res = REGISTRY.dispatch("update_policy", {"policy_type": "approval_mode", "value": "manager_only"}, ctx)
        assert res.ok is True
        assert res.data["approval_mode"] == "manager_only"

    def test_update_allow_resubmission(self, db_session, test_company):
        ctx = _ctx(db_session, test_company)
        res = REGISTRY.dispatch("update_policy", {"policy_type": "allow_resubmission", "value": False}, ctx)
        assert res.ok is True
        assert res.data["allow_resubmission"] is False

    def test_update_policy_invalid_type(self, db_session, test_company):
        ctx = _ctx(db_session, test_company)
        res = REGISTRY.dispatch("update_policy", {"policy_type": "unknown_type", "value": "x"}, ctx)
        assert res.ok is False
        assert "invalid arguments" in res.summary

    def test_update_policy_permission_denied(self, db_session, test_company):
        ctx = _ctx(db_session, test_company, role="employee")
        res = REGISTRY.dispatch("update_policy", {"policy_type": "approval_mode", "value": "none"}, ctx)
        assert res.ok is False
        assert "forbidden" in (res.error or "")


class TestSendAnnouncementTool:
    def test_send_announcement_success(self, db_session, test_company):
        ctx = _ctx(db_session, test_company)
        res = REGISTRY.dispatch("send_announcement", {"message": "Hello team", "target": "all"}, ctx)
        assert res.ok is True
        assert "Announcement sent" in res.summary

    def test_send_announcement_permission_denied(self, db_session, test_company):
        ctx = _ctx(db_session, test_company, role="employee")
        res = REGISTRY.dispatch("send_announcement", {"message": "Hello"}, ctx)
        assert res.ok is False
        assert "forbidden" in (res.error or "")


class TestGetCompanyConfigTool:
    def test_get_company_config_success(self, db_session, test_company):
        ctx = _ctx(db_session, test_company)
        res = REGISTRY.dispatch("get_company_config", {}, ctx)
        assert res.ok is True
        assert "company_setup" in res.data
        assert "approval_setup" in res.data
        assert "accounting_setup" in res.data

    def test_get_company_config_permission_denied(self, db_session, test_company):
        ctx = _ctx(db_session, test_company, role="employee")
        res = REGISTRY.dispatch("get_company_config", {}, ctx)
        assert res.ok is False
        assert "forbidden" in (res.error or "")


class TestUpdateWorkflowTool:
    def test_update_workflow_success(self, db_session, test_company):
        ctx = _ctx(db_session, test_company)
        res = REGISTRY.dispatch(
            "update_workflow",
            {"approval_mode": "manager_then_accounting", "accounting_review_mode": "exceptions_only"},
            ctx,
        )
        assert res.ok is True
        assert res.data["changes"]["approval_mode"] == "manager_then_accounting"
        assert res.data["changes"]["accounting_review_mode"] == "exceptions_only"

    def test_update_workflow_empty_patch(self, db_session, test_company):
        ctx = _ctx(db_session, test_company)
        res = REGISTRY.dispatch("update_workflow", {}, ctx)
        assert res.ok is False
        assert "empty_patch" in (res.error or "")

    def test_update_workflow_permission_denied(self, db_session, test_company):
        ctx = _ctx(db_session, test_company, role="employee")
        res = REGISTRY.dispatch("update_workflow", {"approval_mode": "none"}, ctx)
        assert res.ok is False
        assert "forbidden" in (res.error or "")


class TestUpdateUserTool:
    def test_update_user_success(self, db_session, test_company):
        ctx = _ctx(db_session, test_company)
        # Create a user first
        REGISTRY.dispatch("invite_user", {"email": "updateme@example.com", "role": "employee"}, ctx)
        user = db_session.query(User).filter(User.email == "updateme@example.com").first()
        res = REGISTRY.dispatch("update_user", {"user_id": user.id, "role": "manager", "department": "Sales"}, ctx)
        assert res.ok is True
        assert res.data["changes"]["role"] == "manager"
        assert res.data["changes"]["department"] == "Sales"
        db_session.refresh(user)
        assert user.role == "manager"
        assert user.department == "Sales"

    def test_update_user_empty_patch(self, db_session, test_company):
        ctx = _ctx(db_session, test_company)
        REGISTRY.dispatch("invite_user", {"email": "noop@example.com"}, ctx)
        user = db_session.query(User).filter(User.email == "noop@example.com").first()
        res = REGISTRY.dispatch("update_user", {"user_id": user.id}, ctx)
        assert res.ok is False
        assert "empty_patch" in (res.error or "")

    def test_update_user_not_found(self, db_session, test_company):
        ctx = _ctx(db_session, test_company)
        res = REGISTRY.dispatch("update_user", {"user_id": 99999, "role": "manager"}, ctx)
        assert res.ok is False
        assert "not_found" in (res.error or "")

    def test_update_user_permission_denied(self, db_session, test_company):
        ctx = _ctx(db_session, test_company, role="employee")
        res = REGISTRY.dispatch("update_user", {"user_id": 1, "role": "manager"}, ctx)
        assert res.ok is False
        assert "forbidden" in (res.error or "")


class TestDeactivateUserTool:
    def test_deactivate_user_success(self, db_session, test_company):
        ctx = _ctx(db_session, test_company)
        REGISTRY.dispatch("invite_user", {"email": "deactivate@example.com"}, ctx)
        user = db_session.query(User).filter(User.email == "deactivate@example.com").first()
        res = REGISTRY.dispatch("deactivate_user", {"user_id": user.id}, ctx)
        assert res.ok is True
        db_session.refresh(user)
        assert user.is_active is False

    def test_deactivate_user_self(self, db_session, test_company):
        ctx = _ctx(db_session, test_company, user_id=42)
        # Create a user with id 42
        user = User(email="self@example.com", full_name="Self User", company_id=test_company.id, role="admin", id=42)
        db_session.add(user)
        db_session.commit()
        res = REGISTRY.dispatch("deactivate_user", {"user_id": 42}, ctx)
        assert res.ok is False
        assert "self_deactivation" in (res.error or "")

    def test_deactivate_user_not_found(self, db_session, test_company):
        ctx = _ctx(db_session, test_company)
        res = REGISTRY.dispatch("deactivate_user", {"user_id": 99999}, ctx)
        assert res.ok is False
        assert "not_found" in (res.error or "")

    def test_deactivate_user_permission_denied(self, db_session, test_company):
        ctx = _ctx(db_session, test_company, role="employee")
        res = REGISTRY.dispatch("deactivate_user", {"user_id": 1}, ctx)
        assert res.ok is False
        assert "forbidden" in (res.error or "")


class TestReactivateUserTool:
    def test_reactivate_user_success(self, db_session, test_company):
        ctx = _ctx(db_session, test_company)
        REGISTRY.dispatch("invite_user", {"email": "reactivate@example.com"}, ctx)
        user = db_session.query(User).filter(User.email == "reactivate@example.com").first()
        user.is_active = False
        db_session.commit()
        res = REGISTRY.dispatch("reactivate_user", {"user_id": user.id}, ctx)
        assert res.ok is True
        db_session.refresh(user)
        assert user.is_active is True

    def test_reactivate_user_already_active(self, db_session, test_company):
        ctx = _ctx(db_session, test_company)
        REGISTRY.dispatch("invite_user", {"email": "already@example.com"}, ctx)
        user = db_session.query(User).filter(User.email == "already@example.com").first()
        res = REGISTRY.dispatch("reactivate_user", {"user_id": user.id}, ctx)
        assert res.ok is False
        assert "already_active" in (res.error or "")

    def test_reactivate_user_not_found(self, db_session, test_company):
        ctx = _ctx(db_session, test_company)
        res = REGISTRY.dispatch("reactivate_user", {"user_id": 99999}, ctx)
        assert res.ok is False
        assert "not_found" in (res.error or "")

    def test_reactivate_user_permission_denied(self, db_session, test_company):
        ctx = _ctx(db_session, test_company, role="employee")
        res = REGISTRY.dispatch("reactivate_user", {"user_id": 1}, ctx)
        assert res.ok is False
        assert "forbidden" in (res.error or "")


class TestListUsersTool:
    def test_list_users_basic(self, db_session, test_company):
        """Test list_users returns all users for admin."""
        ctx = _ctx(db_session, test_company)
        # Create some users
        REGISTRY.dispatch("invite_user", {"email": "user1@example.com", "role": "employee"}, ctx)
        REGISTRY.dispatch("invite_user", {"email": "user2@example.com", "role": "manager"}, ctx)

        res = REGISTRY.dispatch("list_users", {}, ctx)
        assert res.ok is True
        assert "users" in res.data
        assert len(res.data["users"]) >= 2
        emails = [u["email"] for u in res.data["users"]]
        assert "user1@example.com" in emails
        assert "user2@example.com" in emails

    def test_list_users_filter_by_role(self, db_session, test_company):
        """Test list_users filters by role."""
        ctx = _ctx(db_session, test_company)
        REGISTRY.dispatch("invite_user", {"email": "emp1@example.com", "role": "employee"}, ctx)
        REGISTRY.dispatch("invite_user", {"email": "mgr1@example.com", "role": "manager"}, ctx)
        REGISTRY.dispatch("invite_user", {"email": "acct1@example.com", "role": "accountant"}, ctx)

        res = REGISTRY.dispatch("list_users", {"roles": ["manager"]}, ctx)
        assert res.ok is True
        assert len(res.data["users"]) == 1
        assert res.data["users"][0]["role"] == "manager"

    def test_list_users_filter_by_active(self, db_session, test_company):
        """Test list_users filters by is_active."""
        ctx = _ctx(db_session, test_company)
        REGISTRY.dispatch("invite_user", {"email": "active_user@example.com"}, ctx)
        REGISTRY.dispatch("invite_user", {"email": "inactive_user@example.com"}, ctx)
        # Deactivate one user
        user = db_session.query(User).filter(User.email == "inactive_user@example.com").first()
        user.is_active = False
        db_session.commit()

        res = REGISTRY.dispatch("list_users", {"is_active": True}, ctx)
        assert res.ok is True
        emails = [u["email"] for u in res.data["users"]]
        assert "active_user@example.com" in emails
        assert "inactive_user@example.com" not in emails

    def test_list_users_search(self, db_session, test_company):
        """Test list_users search by name and email."""
        ctx = _ctx(db_session, test_company)
        REGISTRY.dispatch("invite_user", {"email": "alice@test.com", "role": "employee"}, ctx)
        REGISTRY.dispatch("invite_user", {"email": "bob@test.com", "role": "employee"}, ctx)

        res = REGISTRY.dispatch("list_users", {"search": "alice"}, ctx)
        assert res.ok is True
        assert len(res.data["users"]) == 1
        assert res.data["users"][0]["email"] == "alice@test.com"

    def test_list_users_group_by_department(self, db_session, test_company):
        """Test list_users grouping by department."""
        ctx = _ctx(db_session, test_company)
        REGISTRY.dispatch("invite_user", {"email": "sales1@example.com", "department": "Sales"}, ctx)
        REGISTRY.dispatch("invite_user", {"email": "sales2@example.com", "department": "Sales"}, ctx)
        REGISTRY.dispatch("invite_user", {"email": "eng1@example.com", "department": "Engineering"}, ctx)

        res = REGISTRY.dispatch("list_users", {"group_by": "department"}, ctx)
        assert res.ok is True
        assert "grouped" in res.data
        assert "Sales" in res.data["grouped"]
        assert "Engineering" in res.data["grouped"]
        assert len(res.data["grouped"]["Sales"]) == 2
        assert len(res.data["grouped"]["Engineering"]) == 1

    def test_list_users_include_metrics(self, db_session, test_company):
        """Test list_users with include_metrics returns extra fields."""
        ctx = _ctx(db_session, test_company)
        REGISTRY.dispatch("invite_user", {"email": "metric_user@example.com"}, ctx)

        res = REGISTRY.dispatch("list_users", {"include_metrics": True}, ctx)
        assert res.ok is True
        # Find the metric_user
        user = next(u for u in res.data["users"] if u["email"] == "metric_user@example.com")
        assert "last_login_at" in user
        assert "created_at" in user
        assert "expense_count" in user

    def test_list_users_permission_denied(self, db_session, test_company):
        """Test list_users requires admin role."""
        ctx = _ctx(db_session, test_company, role="employee")
        res = REGISTRY.dispatch("list_users", {}, ctx)
        assert res.ok is False
        assert "forbidden" in (res.error or "")

    def test_list_users_filter_by_legal_entity(self, db_session, test_company):
        """Test list_users filters by legal_entity_id."""
        ctx = _ctx(db_session, test_company)
        # Create users with different legal_entity_id values
        REGISTRY.dispatch("invite_user", {"email": "entity1@example.com"}, ctx)
        REGISTRY.dispatch("invite_user", {"email": "entity2@example.com"}, ctx)
        REGISTRY.dispatch("invite_user", {"email": "no_entity@example.com"}, ctx)

        # Set legal_entity_id on first two users
        user1 = db_session.query(User).filter(User.email == "entity1@example.com").first()
        user1.legal_entity_id = 100
        user2 = db_session.query(User).filter(User.email == "entity2@example.com").first()
        user2.legal_entity_id = 200
        db_session.commit()

        # Filter by legal_entity_id 100
        res = REGISTRY.dispatch("list_users", {"legal_entity_id": 100}, ctx)
        assert res.ok is True
        emails = [u["email"] for u in res.data["users"]]
        assert "entity1@example.com" in emails
        assert "entity2@example.com" not in emails
        assert "no_entity@example.com" not in emails

    def test_list_users_filter_by_capabilities(self, db_session, test_company):
        """Test list_users filters by capabilities flags."""
        ctx = _ctx(db_session, test_company)
        REGISTRY.dispatch("invite_user", {"email": "can_create@example.com"}, ctx)
        REGISTRY.dispatch("invite_user", {"email": "cannot_create@example.com"}, ctx)

        # Set capabilities differently
        can_user = db_session.query(User).filter(User.email == "can_create@example.com").first()
        can_user.can_create_expenses = True
        cannot_user = db_session.query(User).filter(User.email == "cannot_create@example.com").first()
        cannot_user.can_create_expenses = False
        db_session.commit()

        # Filter for users who can create expenses
        res = REGISTRY.dispatch("list_users", {"capabilities": ["can_create_expenses"]}, ctx)
        assert res.ok is True
        emails = [u["email"] for u in res.data["users"]]
        assert "can_create@example.com" in emails
        assert "cannot_create@example.com" not in emails

    def test_list_users_filter_by_has_delegation(self, db_session, test_company):
        """Test list_users filters by has_delegation."""
        ctx = _ctx(db_session, test_company)
        REGISTRY.dispatch("invite_user", {"email": "delegate_user@example.com"}, ctx)
        REGISTRY.dispatch("invite_user", {"email": "boss_user@example.com"}, ctx)
        REGISTRY.dispatch("invite_user", {"email": "no_delegate@example.com"}, ctx)

        # Set up delegation: delegate_user acts on behalf of boss_user
        delegate_user = db_session.query(User).filter(User.email == "delegate_user@example.com").first()
        boss_user = db_session.query(User).filter(User.email == "boss_user@example.com").first()
        delegate_user.delegates_for_user_id = boss_user.id
        db_session.commit()

        # Filter for users with delegation
        res = REGISTRY.dispatch("list_users", {"has_delegation": True}, ctx)
        assert res.ok is True
        emails = [u["email"] for u in res.data["users"]]
        assert "delegate_user@example.com" in emails
        assert "no_delegate@example.com" not in emails

        # Filter for users without delegation
        res = REGISTRY.dispatch("list_users", {"has_delegation": False}, ctx)
        assert res.ok is True
        emails = [u["email"] for u in res.data["users"]]
        assert "delegate_user@example.com" not in emails
        assert "no_delegate@example.com" in emails

    def test_list_users_pagination(self, db_session, test_company):
        """Test list_users pagination with limit and offset."""
        ctx = _ctx(db_session, test_company)
        # Create 5 users
        for i in range(5):
            REGISTRY.dispatch("invite_user", {"email": f"page_user{i}@example.com", "role": "employee"}, ctx)

        # Get first page (limit=2)
        res = REGISTRY.dispatch("list_users", {"limit": 2, "offset": 0}, ctx)
        assert res.ok is True
        assert len(res.data["users"]) == 2

        # Get second page (limit=2, offset=2)
        res2 = REGISTRY.dispatch("list_users", {"limit": 2, "offset": 2}, ctx)
        assert res2.ok is True
        assert len(res2.data["users"]) == 2

        # Ensure different users on each page
        page1_ids = {u["id"] for u in res.data["users"]}
        page2_ids = {u["id"] for u in res2.data["users"]}
        assert page1_ids.isdisjoint(page2_ids), "Pages should have different users"

        # Get remaining users (offset=4)
        res3 = REGISTRY.dispatch("list_users", {"limit": 10, "offset": 4}, ctx)
        assert res3.ok is True
        # Should have at least 1 user (the 5th one we created, plus any existing ones from other tests)
        assert len(res3.data["users"]) >= 1

    def test_list_users_invalid_role(self, db_session, test_company):
        """Test list_users rejects invalid roles."""
        ctx = _ctx(db_session, test_company)
        res = REGISTRY.dispatch("list_users", {"roles": ["superhero", "employee"]}, ctx)
        assert res.ok is False
        assert "invalid_roles" in (res.error or "")
        assert "superhero" in res.summary

    def test_list_users_invalid_capability(self, db_session, test_company):
        """Test list_users rejects invalid capabilities."""
        ctx = _ctx(db_session, test_company)
        res = REGISTRY.dispatch("list_users", {"capabilities": ["fly_to_moon", "can_create_expenses"]}, ctx)
        assert res.ok is False
        assert "invalid_capabilities" in (res.error or "")
        assert "fly_to_moon" in res.summary


class TestGetUserPermissionsTool:
    def test_get_user_permissions_success(self, db_session, test_company):
        """Test get_user_permissions returns detailed breakdown."""
        ctx = _ctx(db_session, test_company)
        # Create a user to query
        REGISTRY.dispatch("invite_user", {"email": "perms@example.com", "role": "accountant"}, ctx)
        user = db_session.query(User).filter(User.email == "perms@example.com").first()

        res = REGISTRY.dispatch("get_user_permissions", {"user_id": user.id}, ctx)
        assert res.ok is True
        assert "capabilities" in res.data
        assert "explanations" in res.data
        assert "module_visibility" in res.data
        assert "role_preset" in res.data
        assert res.data["role"] == "accountant"
        # Accounting role should have accounting access
        assert res.data["module_visibility"]["accounting_review"] is True

    def test_get_user_permissions_not_found(self, db_session, test_company):
        """Test get_user_permissions returns error for non-existent user."""
        ctx = _ctx(db_session, test_company)
        res = REGISTRY.dispatch("get_user_permissions", {"user_id": 99999}, ctx)
        assert res.ok is False
        assert "not_found" in (res.error or "")

    def test_get_user_permissions_permission_denied(self, db_session, test_company):
        """Test get_user_permissions requires admin role."""
        ctx = _ctx(db_session, test_company, role="employee")
        res = REGISTRY.dispatch("get_user_permissions", {"user_id": 1}, ctx)
        assert res.ok is False
        assert "forbidden" in (res.error or "")

    def test_get_user_permissions_with_delegation(self, db_session, test_company):
        """Test get_user_permissions includes delegation info."""
        ctx = _ctx(db_session, test_company)
        # Create boss and delegate
        REGISTRY.dispatch("invite_user", {"email": "boss@example.com", "role": "manager"}, ctx)
        boss = db_session.query(User).filter(User.email == "boss@example.com").first()
        REGISTRY.dispatch("invite_user", {"email": "delegate@example.com", "role": "employee"}, ctx)
        delegate = db_session.query(User).filter(User.email == "delegate@example.com").first()
        # Set up delegation
        delegate.delegates_for_user_id = boss.id
        db_session.commit()

        res = REGISTRY.dispatch("get_user_permissions", {"user_id": delegate.id}, ctx)
        assert res.ok is True
        assert "delegation" in res.data
        assert res.data["delegation"]["id"] == boss.id
        assert "boss" in res.data["delegation"]["name"].lower() or res.data["delegation"]["name"] == boss.full_name


class TestCreateUserTool:
    def test_create_user_with_role_preset(self, db_session, test_company):
        """Test create_user applies role preset for accountant."""
        ctx = _ctx(db_session, test_company)
        res = REGISTRY.dispatch(
            "create_user",
            {
                "email": "newaccountant@test.com",
                "full_name": "New Accountant",
                "role": "accountant",
            },
            ctx,
        )
        assert res.ok is True
        assert res.data["role"] == "accountant"
        assert res.data["capabilities"]["can_access_accounting"] is True
        assert res.data["capabilities"]["can_view_analytics"] is True
        assert res.data["capabilities"]["can_create_expenses"] is False

        # Verify user was created in DB
        user = db_session.query(User).filter(User.email == "newaccountant@test.com").first()
        assert user is not None
        assert user.can_access_accounting is True
        assert user.can_view_analytics is True
        assert user.can_create_expenses is False

    def test_create_user_secretary_needs_delegation(self, db_session, test_company):
        """Test create_user for secretary with delegation."""
        ctx = _ctx(db_session, test_company)
        # Create boss user first
        REGISTRY.dispatch(
            "create_user",
            {"email": "boss@test.com", "full_name": "Boss User", "role": "manager"},
            ctx,
        )
        boss = db_session.query(User).filter(User.email == "boss@test.com").first()

        res = REGISTRY.dispatch(
            "create_user",
            {
                "email": "newsecretary@test.com",
                "full_name": "New Secretary",
                "role": "secretary",
                "delegates_for_user_id": boss.id,
            },
            ctx,
        )

        assert res.ok is True
        assert res.data["role"] == "secretary"
        assert res.data["delegates_for_user_id"] == boss.id
        assert res.data["capabilities"]["can_create_expenses"] is True

        # Verify DB
        user = db_session.query(User).filter(User.email == "newsecretary@test.com").first()
        assert user is not None
        assert user.delegates_for_user_id == boss.id
        assert user.can_create_expenses is True

    def test_create_user_with_custom_capabilities(self, db_session, test_company):
        """Test create_user with explicit capabilities overrides preset."""
        ctx = _ctx(db_session, test_company)
        res = REGISTRY.dispatch(
            "create_user",
            {
                "email": "customadmin@test.com",
                "full_name": "Custom Admin",
                "role": "admin",
                "can_create_expenses": True,  # Override default (admin preset has False)
                "can_access_accounting": True,
            },
            ctx,
        )

        assert res.ok is True
        assert res.data["capabilities"]["can_create_expenses"] is True
        assert res.data["capabilities"]["can_access_accounting"] is True

        # Verify DB
        user = db_session.query(User).filter(User.email == "customadmin@test.com").first()
        assert user is not None
        assert user.can_create_expenses is True
        assert user.can_access_accounting is True

    def test_create_user_duplicate_email(self, db_session, test_company):
        """Test create_user rejects duplicate email."""
        ctx = _ctx(db_session, test_company)
        REGISTRY.dispatch("create_user", {"email": "dup@test.com", "full_name": "First"}, ctx)
        res = REGISTRY.dispatch("create_user", {"email": "dup@test.com", "full_name": "Second"}, ctx)
        assert res.ok is False
        assert "already exists" in res.summary

    def test_create_user_permission_denied(self, db_session, test_company):
        """Test create_user requires admin role."""
        ctx = _ctx(db_session, test_company, role="employee")
        res = REGISTRY.dispatch(
            "create_user",
            {"email": "noauth@test.com", "full_name": "No Auth"},
            ctx,
        )
        assert res.ok is False
        assert "forbidden" in (res.error or "")

    def test_create_user_with_legal_entity(self, db_session, test_company):
        """Test create_user with legal_entity_id assignment."""
        ctx = _ctx(db_session, test_company)
        res = REGISTRY.dispatch(
            "create_user",
            {
                "email": "legal_entity_user@test.com",
                "full_name": "Entity User",
                "role": "employee",
                "legal_entity_id": 42,
            },
            ctx,
        )
        assert res.ok is True
        assert res.data["user_id"] is not None

        user = db_session.query(User).filter(User.email == "legal_entity_user@test.com").first()
        assert user is not None
        assert user.legal_entity_id == 42

    def test_create_user_with_department(self, db_session, test_company):
        """Test create_user with department assignment."""
        ctx = _ctx(db_session, test_company)
        res = REGISTRY.dispatch(
            "create_user",
            {
                "email": "dept_user@test.com",
                "full_name": "Dept User",
                "role": "employee",
                "department": "Engineering",
            },
            ctx,
        )
        assert res.ok is True

        user = db_session.query(User).filter(User.email == "dept_user@test.com").first()
        assert user is not None
        assert user.department == "Engineering"

    def test_create_user_executive_preset(self, db_session, test_company):
        """Test create_user with executive role preset."""
        ctx = _ctx(db_session, test_company)
        res = REGISTRY.dispatch(
            "create_user",
            {"email": "exec@test.com", "full_name": "Executive User", "role": "executive"},
            ctx,
        )
        assert res.ok is True
        # Executive preset has can_create_expenses=True, has_executive_reporting=True
        assert res.data["capabilities"]["can_create_expenses"] is True
        assert res.data["capabilities"]["has_executive_reporting"] is True
        assert res.data["capabilities"]["can_access_accounting"] is False

    def test_create_user_employee_default(self, db_session, test_company):
        """Test create_user defaults to employee role."""
        ctx = _ctx(db_session, test_company)
        res = REGISTRY.dispatch(
            "create_user",
            {"email": "default@test.com", "full_name": "Default User"},
            ctx,
        )
        assert res.ok is True
        assert res.data["role"] == "employee"
        # Employee preset has can_create_expenses=True
        assert res.data["capabilities"]["can_create_expenses"] is True
