"""Tests for platform tools (super admin)."""

from __future__ import annotations

import pytest

from packages.core.platform.models_platform import PlatformTenant, PlatformLLMProvider
from packages.modules.agent.core.context import AgentContext
from packages.modules.agent.core.registry import REGISTRY, ToolResult
from packages.modules.agent.tools import registry_all  # noqa: F401 — triggers tool registration


def _super_admin_ctx(db_session, test_company):
    """Create a super_admin context for platform tools."""
    return AgentContext(
        db=db_session,
        company_id=test_company.id,
        user_id=1,
        user_email="superadmin@platform.local",
        user_role="admin",  # role is separate from persona
        persona="super_admin",
    )


def _admin_ctx(db_session, test_company):
    """Create a regular admin context for permission tests."""
    return AgentContext(
        db=db_session,
        company_id=test_company.id,
        user_id=2,
        user_email="admin@company.local",
        user_role="admin",
        persona="admin",
    )


class TestCreateTenantTool:
    def test_create_tenant_success(self, db_session, test_company):
        ctx = _super_admin_ctx(db_session, test_company)
        res = REGISTRY.dispatch("create_tenant", {"slug": "acme-corp", "name": "Acme Corporation"}, ctx)
        assert res.ok is True
        assert "Acme Corporation" in res.summary
        assert res.data["slug"] == "acme-corp"
        assert res.data["plan"] == "starter"  # default

        # Verify in database
        tenant = db_session.query(PlatformTenant).filter(PlatformTenant.slug == "acme-corp").first()
        assert tenant is not None
        assert tenant.name == "Acme Corporation"

    def test_create_tenant_with_plan(self, db_session, test_company):
        ctx = _super_admin_ctx(db_session, test_company)
        res = REGISTRY.dispatch(
            "create_tenant",
            {"slug": "premium-co", "name": "Premium Co", "plan": "enterprise"},
            ctx,
        )
        assert res.ok is True
        assert res.data["plan"] == "enterprise"

    def test_create_tenant_duplicate_slug(self, db_session, test_company):
        ctx = _super_admin_ctx(db_session, test_company)
        REGISTRY.dispatch("create_tenant", {"slug": "duptest", "name": "First"}, ctx)
        res = REGISTRY.dispatch("create_tenant", {"slug": "duptest", "name": "Second"}, ctx)
        assert res.ok is False
        assert "already exists" in res.summary
        assert res.error == "duplicate_slug"

    def test_create_tenant_invalid_slug(self, db_session, test_company):
        ctx = _super_admin_ctx(db_session, test_company)
        res = REGISTRY.dispatch("create_tenant", {"slug": "Invalid Slug!", "name": "Test"}, ctx)
        assert res.ok is False
        assert "invalid" in res.summary.lower()

    def test_create_tenant_permission_denied(self, db_session, test_company):
        ctx = _admin_ctx(db_session, test_company)  # regular admin, not super_admin
        res = REGISTRY.dispatch("create_tenant", {"slug": "unauthorized", "name": "Test"}, ctx)
        assert res.ok is False
        assert "forbidden" in (res.error or "").lower() or "not available" in res.summary.lower()


class TestListTenantsTool:
    def test_list_tenants_empty(self, db_session, test_company):
        ctx = _super_admin_ctx(db_session, test_company)
        res = REGISTRY.dispatch("list_tenants", {}, ctx)
        assert res.ok is True
        assert res.data["tenants"] == []

    def test_list_tenants_with_data(self, db_session, test_company):
        ctx = _super_admin_ctx(db_session, test_company)
        REGISTRY.dispatch("create_tenant", {"slug": "tenant-a", "name": "Tenant A"}, ctx)
        REGISTRY.dispatch("create_tenant", {"slug": "tenant-b", "name": "Tenant B"}, ctx)

        res = REGISTRY.dispatch("list_tenants", {}, ctx)
        assert res.ok is True
        assert len(res.data["tenants"]) == 2
        slugs = [t["slug"] for t in res.data["tenants"]]
        assert "tenant-a" in slugs
        assert "tenant-b" in slugs

    def test_list_tenants_include_inactive(self, db_session, test_company):
        ctx = _super_admin_ctx(db_session, test_company)
        REGISTRY.dispatch("create_tenant", {"slug": "active-tenant", "name": "Active"}, ctx)
        REGISTRY.dispatch("create_tenant", {"slug": "to-suspend", "name": "To Suspend"}, ctx)
        REGISTRY.dispatch("suspend_tenant", {"slug": "to-suspend"}, ctx)

        # Without include_inactive
        res = REGISTRY.dispatch("list_tenants", {}, ctx)
        assert res.ok is True
        slugs = [t["slug"] for t in res.data["tenants"]]
        assert "active-tenant" in slugs
        assert "to-suspend" not in slugs

        # With include_inactive
        res = REGISTRY.dispatch("list_tenants", {"include_inactive": True}, ctx)
        assert res.ok is True
        slugs = [t["slug"] for t in res.data["tenants"]]
        assert "active-tenant" in slugs
        assert "to-suspend" in slugs


class TestUpdateTenantTool:
    def test_update_tenant_name(self, db_session, test_company):
        ctx = _super_admin_ctx(db_session, test_company)
        REGISTRY.dispatch("create_tenant", {"slug": "updatable", "name": "Original Name"}, ctx)

        res = REGISTRY.dispatch("update_tenant", {"slug": "updatable", "name": "New Name"}, ctx)
        assert res.ok is True
        assert res.data["changes"]["name"] == "New Name"

        tenant = db_session.query(PlatformTenant).filter(PlatformTenant.slug == "updatable").first()
        assert tenant.name == "New Name"

    def test_update_tenant_plan(self, db_session, test_company):
        ctx = _super_admin_ctx(db_session, test_company)
        REGISTRY.dispatch("create_tenant", {"slug": "plan-test", "name": "Plan Test"}, ctx)

        res = REGISTRY.dispatch("update_tenant", {"slug": "plan-test", "plan": "professional"}, ctx)
        assert res.ok is True
        assert res.data["changes"]["plan"] == "professional"

    def test_update_tenant_not_found(self, db_session, test_company):
        ctx = _super_admin_ctx(db_session, test_company)
        res = REGISTRY.dispatch("update_tenant", {"slug": "nonexistent", "name": "Test"}, ctx)
        assert res.ok is False
        assert res.error == "not_found"

    def test_update_tenant_no_changes(self, db_session, test_company):
        ctx = _super_admin_ctx(db_session, test_company)
        REGISTRY.dispatch("create_tenant", {"slug": "nochange", "name": "No Change"}, ctx)
        res = REGISTRY.dispatch("update_tenant", {"slug": "nochange"}, ctx)
        assert res.ok is False
        assert res.error == "empty_patch"


class TestSuspendTenantTool:
    def test_suspend_tenant_success(self, db_session, test_company):
        ctx = _super_admin_ctx(db_session, test_company)
        REGISTRY.dispatch("create_tenant", {"slug": "to-suspend", "name": "To Suspend"}, ctx)

        res = REGISTRY.dispatch("suspend_tenant", {"slug": "to-suspend", "reason": "Payment overdue"}, ctx)
        assert res.ok is True
        assert "Payment overdue" in res.summary

        tenant = db_session.query(PlatformTenant).filter(PlatformTenant.slug == "to-suspend").first()
        assert tenant.is_active is False

    def test_suspend_tenant_already_suspended(self, db_session, test_company):
        ctx = _super_admin_ctx(db_session, test_company)
        REGISTRY.dispatch("create_tenant", {"slug": "already-suspended", "name": "Already Suspended"}, ctx)
        REGISTRY.dispatch("suspend_tenant", {"slug": "already-suspended"}, ctx)

        res = REGISTRY.dispatch("suspend_tenant", {"slug": "already-suspended"}, ctx)
        assert res.ok is False
        assert res.error == "already_suspended"

    def test_suspend_tenant_not_found(self, db_session, test_company):
        ctx = _super_admin_ctx(db_session, test_company)
        res = REGISTRY.dispatch("suspend_tenant", {"slug": "nonexistent"}, ctx)
        assert res.ok is False
        assert res.error == "not_found"


class TestCreateProviderTool:
    def test_create_provider_success(self, db_session, test_company):
        ctx = _super_admin_ctx(db_session, test_company)
        res = REGISTRY.dispatch(
            "create_provider",
            {
                "name": "openai-gpt4",
                "provider_type": "openai",
                "model_name": "gpt-4-turbo",
                "cost_per_1k_input": 0.01,
                "cost_per_1k_output": 0.03,
            },
            ctx,
        )
        assert res.ok is True
        assert res.data["name"] == "openai-gpt4"
        assert res.data["provider_type"] == "openai"

        provider = db_session.query(PlatformLLMProvider).filter(PlatformLLMProvider.name == "openai-gpt4").first()
        assert provider is not None
        assert provider.model_name == "gpt-4-turbo"

    def test_create_provider_with_base_url(self, db_session, test_company):
        ctx = _super_admin_ctx(db_session, test_company)
        res = REGISTRY.dispatch(
            "create_provider",
            {
                "name": "ollama-local",
                "provider_type": "ollama",
                "model_name": "llama3",
                "base_url": "http://localhost:11434",
            },
            ctx,
        )
        assert res.ok is True
        assert res.data["provider_type"] == "ollama"

        provider = db_session.query(PlatformLLMProvider).filter(PlatformLLMProvider.name == "ollama-local").first()
        assert provider.base_url == "http://localhost:11434"

    def test_create_provider_duplicate_name(self, db_session, test_company):
        ctx = _super_admin_ctx(db_session, test_company)
        REGISTRY.dispatch(
            "create_provider",
            {"name": "dup-provider", "provider_type": "openai", "model_name": "gpt-4"},
            ctx,
        )
        res = REGISTRY.dispatch(
            "create_provider",
            {"name": "dup-provider", "provider_type": "anthropic", "model_name": "claude"},
            ctx,
        )
        assert res.ok is False
        assert res.error == "duplicate_name"

    def test_create_provider_permission_denied(self, db_session, test_company):
        ctx = _admin_ctx(db_session, test_company)  # regular admin, not super_admin
        res = REGISTRY.dispatch(
            "create_provider",
            {"name": "unauthorized", "provider_type": "openai", "model_name": "gpt-4"},
            ctx,
        )
        assert res.ok is False


class TestListProvidersTool:
    def test_list_providers_empty(self, db_session, test_company):
        ctx = _super_admin_ctx(db_session, test_company)
        res = REGISTRY.dispatch("list_providers", {}, ctx)
        assert res.ok is True
        assert res.data["providers"] == []

    def test_list_providers_with_data(self, db_session, test_company):
        ctx = _super_admin_ctx(db_session, test_company)
        REGISTRY.dispatch(
            "create_provider",
            {"name": "provider-a", "provider_type": "openai", "model_name": "gpt-4"},
            ctx,
        )
        REGISTRY.dispatch(
            "create_provider",
            {"name": "provider-b", "provider_type": "anthropic", "model_name": "claude"},
            ctx,
        )

        res = REGISTRY.dispatch("list_providers", {}, ctx)
        assert res.ok is True
        assert len(res.data["providers"]) == 2
        names = [p["name"] for p in res.data["providers"]]
        assert "provider-a" in names
        assert "provider-b" in names


class TestUpdateProviderTool:
    def test_update_provider_activate(self, db_session, test_company):
        ctx = _super_admin_ctx(db_session, test_company)
        REGISTRY.dispatch(
            "create_provider",
            {"name": "to-activate", "provider_type": "openai", "model_name": "gpt-4"},
            ctx,
        )
        # Deactivate it first
        provider = db_session.query(PlatformLLMProvider).filter(PlatformLLMProvider.name == "to-activate").first()
        provider.is_active = False
        db_session.commit()

        res = REGISTRY.dispatch("update_provider", {"name": "to-activate", "is_active": True}, ctx)
        assert res.ok is True
        assert res.data["changes"]["is_active"] is True

        db_session.refresh(provider)
        assert provider.is_active is True

    def test_update_provider_deactivate(self, db_session, test_company):
        ctx = _super_admin_ctx(db_session, test_company)
        REGISTRY.dispatch(
            "create_provider",
            {"name": "to-deactivate", "provider_type": "openai", "model_name": "gpt-4"},
            ctx,
        )

        res = REGISTRY.dispatch("update_provider", {"name": "to-deactivate", "is_active": False}, ctx)
        assert res.ok is True
        assert res.data["changes"]["is_active"] is False

        provider = db_session.query(PlatformLLMProvider).filter(PlatformLLMProvider.name == "to-deactivate").first()
        assert provider.is_active is False

    def test_update_provider_not_found(self, db_session, test_company):
        ctx = _super_admin_ctx(db_session, test_company)
        res = REGISTRY.dispatch("update_provider", {"name": "nonexistent", "is_active": False}, ctx)
        assert res.ok is False
        assert res.error == "not_found"

    def test_update_provider_no_changes(self, db_session, test_company):
        ctx = _super_admin_ctx(db_session, test_company)
        REGISTRY.dispatch(
            "create_provider",
            {"name": "nochange", "provider_type": "openai", "model_name": "gpt-4"},
            ctx,
        )
        res = REGISTRY.dispatch("update_provider", {"name": "nochange", "is_active": True}, ctx)
        assert res.ok is False
        assert res.error == "empty_patch"