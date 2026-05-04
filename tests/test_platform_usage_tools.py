"""Tests for platform usage monitoring tools."""

from __future__ import annotations

from decimal import Decimal

import pytest

from packages.core.platform.models_platform import PlatformTenant, PlatformLLMProvider, PlatformUsageLog
from packages.modules.agent.core.context import AgentContext
from packages.modules.agent.core.registry import REGISTRY
from packages.modules.agent.tools import registry_all  # noqa: F401 — triggers tool registration


def _super_admin_ctx(db_session, test_company):
    """Create a super_admin context for platform tools."""
    return AgentContext(
        db=db_session,
        company_id=test_company.id,
        user_id=1,
        user_email="superadmin@platform.local",
        user_role="admin",
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


@pytest.fixture
def platform_tenant(db_session):
    """Create a test platform tenant."""
    tenant = PlatformTenant(
        slug="test-tenant",
        name="Test Tenant",
        plan="starter",
        is_active=True,
    )
    db_session.add(tenant)
    db_session.commit()
    db_session.refresh(tenant)
    return tenant


@pytest.fixture
def platform_provider(db_session):
    """Create a test LLM provider."""
    provider = PlatformLLMProvider(
        name="test-provider",
        provider_type="openai",
        model_name="gpt-4",
        cost_per_1k_tokens_input=Decimal("0.03"),
        cost_per_1k_tokens_output=Decimal("0.06"),
        is_active=True,
    )
    db_session.add(provider)
    db_session.commit()
    db_session.refresh(provider)
    return provider


@pytest.fixture
def platform_usage_log(db_session, platform_tenant, platform_provider):
    """Create a test usage log entry."""
    log = PlatformUsageLog(
        tenant_id=platform_tenant.id,
        agent_key="test-agent",
        provider_id=platform_provider.id,
        input_tokens=100,
        output_tokens=50,
        cost_input=Decimal("0.003"),
        cost_output=Decimal("0.003"),
        ok=True,  # Request succeeded
    )
    db_session.add(log)
    db_session.commit()
    db_session.refresh(log)
    return log


class TestGetPlatformUsageStats:
    def test_get_platform_usage_stats_empty_db(self, db_session, test_company):
        """Test get_platform_usage_stats with no usage data."""
        ctx = _super_admin_ctx(db_session, test_company)
        res = REGISTRY.dispatch("get_platform_usage_stats", {}, ctx)
        assert res.ok is True
        assert "total_requests" in res.data
        assert res.data["total_requests"] == 0

    def test_get_platform_usage_stats_with_data(self, db_session, test_company, platform_usage_log):
        """Test get_platform_usage_stats with usage data."""
        ctx = _super_admin_ctx(db_session, test_company)
        res = REGISTRY.dispatch("get_platform_usage_stats", {}, ctx)
        assert res.ok is True
        assert res.data["total_requests"] >= 1
        assert "total_cost" in res.data

    def test_get_platform_usage_stats_with_date_filter(self, db_session, test_company, platform_usage_log):
        """Test get_platform_usage_stats with date filtering."""
        ctx = _super_admin_ctx(db_session, test_company)
        res = REGISTRY.dispatch(
            "get_platform_usage_stats",
            {"start_date": "2026-01-01", "end_date": "2026-12-31"},
            ctx,
        )
        assert res.ok is True
        assert "period" in res.data
        assert res.data["period"]["start"] == "2026-01-01"

    def test_get_platform_usage_stats_invalid_date(self, db_session, test_company):
        """Test get_platform_usage_stats with invalid date format."""
        ctx = _super_admin_ctx(db_session, test_company)
        res = REGISTRY.dispatch(
            "get_platform_usage_stats",
            {"start_date": "invalid-date"},
            ctx,
        )
        assert res.ok is False
        assert res.error == "invalid_date"

    def test_get_platform_usage_stats_permission_denied(self, db_session, test_company):
        """Test that regular admin cannot access usage stats."""
        ctx = _admin_ctx(db_session, test_company)
        res = REGISTRY.dispatch("get_platform_usage_stats", {}, ctx)
        assert res.ok is False
        assert "forbidden" in (res.error or "").lower() or "not available" in res.summary.lower()


class TestGetTenantUsageBreakdown:
    def test_get_tenant_usage_breakdown_empty(self, db_session, test_company):
        """Test get_tenant_usage_breakdown with no data."""
        ctx = _super_admin_ctx(db_session, test_company)
        res = REGISTRY.dispatch("get_tenant_usage_breakdown", {}, ctx)
        assert res.ok is True
        assert "tenants" in res.data
        assert res.data["tenants"] == []

    def test_get_tenant_usage_breakdown_with_data(self, db_session, test_company, platform_tenant, platform_usage_log):
        """Test get_tenant_usage_breakdown with usage data."""
        ctx = _super_admin_ctx(db_session, test_company)
        res = REGISTRY.dispatch("get_tenant_usage_breakdown", {}, ctx)
        assert res.ok is True
        assert "tenants" in res.data
        assert len(res.data["tenants"]) >= 1
        # Check that the tenant data includes expected fields
        tenant_data = res.data["tenants"][0]
        assert "tenant_id" in tenant_data
        assert "tenant_slug" in tenant_data
        assert "request_count" in tenant_data
        assert "total_input_tokens" in tenant_data

    def test_get_tenant_usage_breakdown_multiple_tenants(self, db_session, test_company, platform_provider):
        """Test breakdown correctly aggregates per tenant."""
        ctx = _super_admin_ctx(db_session, test_company)

        # Create two tenants
        tenant1 = PlatformTenant(slug="tenant-1", name="Tenant 1", plan="starter", is_active=True)
        tenant2 = PlatformTenant(slug="tenant-2", name="Tenant 2", plan="starter", is_active=True)
        db_session.add_all([tenant1, tenant2])
        db_session.commit()
        db_session.refresh(tenant1)
        db_session.refresh(tenant2)

        # Create usage logs for each tenant
        log1 = PlatformUsageLog(
            tenant_id=tenant1.id,
            agent_key="agent-1",
            provider_id=platform_provider.id,
            input_tokens=100,
            output_tokens=50,
            cost_input=Decimal("0.01"),
            cost_output=Decimal("0.02"),
            ok=True,
        )
        log2 = PlatformUsageLog(
            tenant_id=tenant2.id,
            agent_key="agent-2",
            provider_id=platform_provider.id,
            input_tokens=200,
            output_tokens=100,
            cost_input=Decimal("0.02"),
            cost_output=Decimal("0.04"),
            ok=True,
        )
        db_session.add_all([log1, log2])
        db_session.commit()

        res = REGISTRY.dispatch("get_tenant_usage_breakdown", {}, ctx)
        assert res.ok is True
        assert len(res.data["tenants"]) == 2

    def test_get_tenant_usage_breakdown_permission_denied(self, db_session, test_company):
        """Test that regular admin cannot access tenant breakdown."""
        ctx = _admin_ctx(db_session, test_company)
        res = REGISTRY.dispatch("get_tenant_usage_breakdown", {}, ctx)
        assert res.ok is False


class TestExportUsageCsv:
    def test_export_usage_csv_empty(self, db_session, test_company):
        """Test export_usage_csv with no data."""
        ctx = _super_admin_ctx(db_session, test_company)
        res = REGISTRY.dispatch(
            "export_usage_csv",
            {"start_date": "2026-01-01", "end_date": "2026-12-31"},
            ctx,
        )
        assert res.ok is True
        assert "csv_data" in res.data
        assert res.data["record_count"] == 0

    def test_export_usage_csv_with_data(self, db_session, test_company, platform_tenant, platform_usage_log):
        """Test export_usage_csv with usage data."""
        ctx = _super_admin_ctx(db_session, test_company)
        res = REGISTRY.dispatch("export_usage_csv", {}, ctx)
        assert res.ok is True
        assert "csv_data" in res.data
        assert res.data["record_count"] >= 1
        # Check CSV header
        assert "timestamp,tenant_id,tenant_slug" in res.data["csv_data"]

    def test_export_usage_csv_with_tenant_filter(self, db_session, test_company, platform_tenant, platform_usage_log):
        """Test export_usage_csv with tenant filtering."""
        ctx = _super_admin_ctx(db_session, test_company)
        res = REGISTRY.dispatch(
            "export_usage_csv",
            {"tenant_slug": "test-tenant"},
            ctx,
        )
        assert res.ok is True
        assert "test-tenant" in res.data["csv_data"]

    def test_export_usage_csv_invalid_tenant(self, db_session, test_company):
        """Test export_usage_csv with non-existent tenant."""
        ctx = _super_admin_ctx(db_session, test_company)
        res = REGISTRY.dispatch(
            "export_usage_csv",
            {"tenant_slug": "nonexistent-tenant"},
            ctx,
        )
        assert res.ok is False
        assert res.error == "tenant_not_found"

    def test_export_usage_csv_invalid_date(self, db_session, test_company):
        """Test export_usage_csv with invalid date format."""
        ctx = _super_admin_ctx(db_session, test_company)
        res = REGISTRY.dispatch(
            "export_usage_csv",
            {"start_date": "not-a-date"},
            ctx,
        )
        assert res.ok is False
        assert res.error == "invalid_date"

    def test_export_usage_csv_permission_denied(self, db_session, test_company):
        """Test that regular admin cannot export usage CSV."""
        ctx = _admin_ctx(db_session, test_company)
        res = REGISTRY.dispatch("export_usage_csv", {}, ctx)
        assert res.ok is False


class TestUsageToolsPermission:
    def test_usage_tools_not_available_to_tenant_admin(self, db_session, test_company):
        """Verify usage tools are restricted to super admin."""
        ctx = _admin_ctx(db_session, test_company)

        # All three tools should be forbidden for regular admin
        for tool_name in ["get_platform_usage_stats", "get_tenant_usage_breakdown", "export_usage_csv"]:
            res = REGISTRY.dispatch(tool_name, {}, ctx)
            assert res.ok is False, f"{tool_name} should be forbidden for regular admin"
            assert "forbidden" in (res.error or "").lower() or "not available" in res.summary.lower()