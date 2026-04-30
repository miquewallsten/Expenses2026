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
