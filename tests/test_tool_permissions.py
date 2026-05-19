"""Tests for tool permission enforcement.

Verifies that agents can only use tools listed in their allowed_tools
from their database definition.
"""

import json
import pytest
from unittest.mock import MagicMock

from packages.modules.agent.core.context import AgentContext
from packages.modules.agent.core.registry import REGISTRY, ToolResult
from packages.modules.agent.tools import registry_all  # noqa: F401 — register tools


# ── Fixtures ────────────────────────────────────────────────────────────────

@pytest.fixture
def mock_db():
    """Mock database session."""
    return MagicMock()


@pytest.fixture
def admin_context(mock_db):
    """Admin context with a limited set of allowed tools."""
    return AgentContext(
        db=mock_db,
        company_id=1,
        user_id=1,
        user_email="admin@test.com",
        user_role="admin",
        persona="admin",
        locale="es",
        session_id="test-session",
        allowed_tools=["read_company_setup", "list_users", "invite_user"],
    )


@pytest.fixture
def employee_context(mock_db):
    """Employee context with only employee-appropriate tools."""
    return AgentContext(
        db=mock_db,
        company_id=1,
        user_id=2,
        user_email="employee@test.com",
        user_role="employee",
        persona="employee",
        locale="es",
        session_id="test-session",
        allowed_tools=["create_expense", "check_reimbursement_status", "list_my_expenses"],
    )


@pytest.fixture
def super_admin_context(mock_db):
    """Super admin context with platform-level tools."""
    return AgentContext(
        db=mock_db,
        company_id=1,
        user_id=3,
        user_email="superadmin@test.com",
        user_role="admin",
        persona="admin",
        locale="es",
        session_id="test-session",
        allowed_tools=["get_platform_usage_stats", "create_tenant", "read_company_setup"],
    )


@pytest.fixture
def mock_agent_definition():
    """Mock agent definition with allowed_tools."""
    definition = MagicMock()
    definition.system_prompt = "Test prompt"
    definition.allowed_tools = json.dumps(["read_company_setup", "list_users"])
    return definition


# ── Tests ───────────────────────────────────────────────────────────────────

def test_admin_cannot_use_tools_not_in_allowed_list(mock_db, admin_context):
    """Admin agent should not be able to use tools not in its allowed_tools."""
    # admin_context has ["read_company_setup", "list_users", "invite_user"]
    # create_tenant is NOT in that list

    result = REGISTRY.dispatch("create_tenant", {"name": "Test", "slug": "test"}, admin_context)

    assert result.ok == False
    assert "not allowed" in result.error.lower() or "permission" in result.error.lower()


def test_employee_cannot_use_admin_tools(mock_db, employee_context):
    """Employee agent should not be able to use admin tools."""
    # employee_context has ["create_expense", "check_reimbursement_status", "list_my_expenses"]
    # invite_user is NOT in that list

    result = REGISTRY.dispatch("invite_user", {"email": "test@example.com"}, employee_context)

    assert result.ok == False
    assert "not allowed" in result.error.lower() or "permission" in result.error.lower()


def test_allowed_tool_succeeds_permission_check(mock_db, admin_context):
    """Admin should be able to use tools in its allowed list.

    Note: The tool may still fail for other reasons (e.g., missing data),
    but it should NOT fail with a permission error.
    """
    # admin_context has read_company_setup in allowed_tools
    # The tool exists in registry, so permission check should pass
    result = REGISTRY.dispatch("read_company_setup", {}, admin_context)

    # Should not fail with permission denied
    # (might fail for other reasons like missing data, but not permission)
    if not result.ok and result.error:
        assert "not allowed" not in result.error.lower()
        assert "permission" not in result.error.lower()


def test_super_admin_can_use_platform_tools(mock_db, super_admin_context):
    """Super admin should have access to platform tools in its allowed list."""
    # super_admin_context has get_platform_usage_stats in allowed_tools
    # The tool exists and should pass permission check
    result = REGISTRY.dispatch("get_platform_usage_stats", {}, super_admin_context)

    # Should not fail with permission denied
    if not result.ok and result.error:
        assert "not allowed" not in result.error.lower()
        assert "permission" not in result.error.lower()


def test_context_without_allowed_tools_uses_persona_check(mock_db):
    """Context without allowed_tools should fall back to persona-based check."""
    # When allowed_tools is None, should use persona-based check
    ctx = AgentContext(
        db=mock_db,
        company_id=1,
        user_id=1,
        user_email="admin@test.com",
        user_role="admin",
        persona="admin",
        locale="es",
        session_id="test-session",
        allowed_tools=None,  # No allowed_tools restriction
    )

    # This should use persona check (admin persona can read company setup)
    # read_company_setup should be available for admin persona
    result = REGISTRY.dispatch("read_company_setup", {}, ctx)

    # Should pass persona check (might fail for other reasons, but not persona)
    if not result.ok and result.error:
        assert "persona" not in result.error.lower()


def test_empty_allowed_tools_blocks_all(mock_db):
    """Empty allowed_tools list should block all tools."""
    ctx = AgentContext(
        db=mock_db,
        company_id=1,
        user_id=1,
        user_email="admin@test.com",
        user_role="admin",
        persona="admin",
        locale="es",
        session_id="test-session",
        allowed_tools=[],  # Empty list = no tools allowed
    )

    result = REGISTRY.dispatch("read_company_setup", {}, ctx)

    assert result.ok == False
    assert "not allowed" in result.error.lower() or "permission" in result.error.lower()