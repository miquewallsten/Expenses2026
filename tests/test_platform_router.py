"""Tests for platform router (super admin HTTP endpoints)."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from packages.core.platform.models_platform import (
    PlatformTenant,
    PlatformLLMProvider,
    PlatformAgentDefinition,
)


@pytest.fixture
def super_admin_user(db_session, test_company):
    """Create a super admin user for testing."""
    from packages.core.platform.models_user import User
    user = User(
        full_name="Super Admin",
        email="superadmin@platform.local",
        role="admin",
        company_id=test_company.id,
        is_super_admin=True,
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


@pytest.fixture
def regular_admin_user(db_session, test_company):
    """Create a regular admin user (not super admin) for testing."""
    from packages.core.platform.models_user import User
    user = User(
        full_name="Regular Admin",
        email="admin@company.local",
        role="admin",
        company_id=test_company.id,
        is_super_admin=False,
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


class TestTenantRoutes:
    """Tests for /platform/tenants endpoints."""

    def test_list_tenants_unauthorized(self, client):
        """Test that unauthenticated requests are rejected."""
        response = client.get("/platform/tenants")
        assert response.status_code == 401

    def test_list_tenants_without_super_admin(self, client, regular_admin_user):
        """Test that non-super-admin users are rejected."""
        # Note: This requires proper auth setup which may need adjustment
        # based on how auth is handled in tests
        headers = {"X-User-Id": str(regular_admin_user.id)}
        response = client.get("/platform/tenants", headers=headers)
        assert response.status_code == 403

    def test_list_tenants_with_super_admin(self, client, super_admin_user):
        """Test listing tenants as super admin."""
        headers = {"X-User-Id": str(super_admin_user.id)}
        response = client.get("/platform/tenants", headers=headers)
        assert response.status_code == 200
        assert isinstance(response.json(), list)

    def test_create_tenant_unauthorized(self, client):
        """Test that unauthenticated requests are rejected."""
        response = client.post(
            "/platform/tenants",
            json={"slug": "test-tenant", "name": "Test Tenant"},
        )
        assert response.status_code == 401

    def test_create_tenant_with_super_admin(self, client, super_admin_user, db_session):
        """Test creating a tenant as super admin."""
        headers = {"X-User-Id": str(super_admin_user.id)}
        response = client.post(
            "/platform/tenants",
            headers=headers,
            json={
                "slug": "new-tenant",
                "name": "New Tenant",
                "plan": "professional",
            },
        )
        assert response.status_code == 200
        data = response.json()
        assert data["slug"] == "new-tenant"
        assert data["name"] == "New Tenant"
        assert data["plan"] == "professional"
        assert data["is_active"] is True

        # Verify in database
        tenant = db_session.query(PlatformTenant).filter(PlatformTenant.slug == "new-tenant").first()
        assert tenant is not None
        assert tenant.name == "New Tenant"

    def test_create_tenant_duplicate_slug(self, client, super_admin_user, db_session):
        """Test that duplicate slugs are rejected."""
        headers = {"X-User-Id": str(super_admin_user.id)}

        # Create first tenant
        client.post(
            "/platform/tenants",
            headers=headers,
            json={"slug": "dup-test", "name": "First Tenant"},
        )

        # Try to create second with same slug
        response = client.post(
            "/platform/tenants",
            headers=headers,
            json={"slug": "dup-test", "name": "Second Tenant"},
        )
        assert response.status_code == 409

    def test_create_tenant_invalid_slug(self, client, super_admin_user):
        """Test that invalid slugs are rejected."""
        headers = {"X-User-Id": str(super_admin_user.id)}
        response = client.post(
            "/platform/tenants",
            headers=headers,
            json={"slug": "Invalid Slug!", "name": "Test"},
        )
        assert response.status_code == 422  # Validation error

    def test_update_tenant(self, client, super_admin_user, db_session):
        """Test updating tenant name and plan."""
        headers = {"X-User-Id": str(super_admin_user.id)}

        # Create tenant
        client.post(
            "/platform/tenants",
            headers=headers,
            json={"slug": "update-test", "name": "Original Name"},
        )

        # Update it
        response = client.patch(
            "/platform/tenants/update-test",
            headers=headers,
            json={"name": "Updated Name", "plan": "enterprise"},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "Updated Name"
        assert data["plan"] == "enterprise"

    def test_update_tenant_not_found(self, client, super_admin_user):
        """Test updating non-existent tenant."""
        headers = {"X-User-Id": str(super_admin_user.id)}
        response = client.patch(
            "/platform/tenants/nonexistent",
            headers=headers,
            json={"name": "Test"},
        )
        assert response.status_code == 404

    def test_suspend_tenant(self, client, super_admin_user, db_session):
        """Test suspending a tenant."""
        headers = {"X-User-Id": str(super_admin_user.id)}

        # Create tenant
        client.post(
            "/platform/tenants",
            headers=headers,
            json={"slug": "suspend-test", "name": "To Suspend"},
        )

        # Suspend it
        response = client.delete("/platform/tenants/suspend-test", headers=headers)
        assert response.status_code == 200
        assert response.json()["is_active"] is False

        # Verify in database
        tenant = db_session.query(PlatformTenant).filter(PlatformTenant.slug == "suspend-test").first()
        assert tenant.is_active is False

    def test_suspend_tenant_already_suspended(self, client, super_admin_user, db_session):
        """Test suspending an already suspended tenant."""
        headers = {"X-User-Id": str(super_admin_user.id)}

        # Create and suspend tenant
        client.post(
            "/platform/tenants",
            headers=headers,
            json={"slug": "already-suspended", "name": "Already Suspended"},
        )
        client.delete("/platform/tenants/already-suspended", headers=headers)

        # Try to suspend again
        response = client.delete("/platform/tenants/already-suspended", headers=headers)
        assert response.status_code == 400


class TestProviderRoutes:
    """Tests for /platform/providers endpoints."""

    def test_list_providers_unauthorized(self, client):
        """Test that unauthenticated requests are rejected."""
        response = client.get("/platform/providers")
        assert response.status_code == 401

    def test_list_providers_with_super_admin(self, client, super_admin_user):
        """Test listing providers as super admin."""
        headers = {"X-User-Id": str(super_admin_user.id)}
        response = client.get("/platform/providers", headers=headers)
        assert response.status_code == 200
        assert isinstance(response.json(), list)

    def test_create_provider(self, client, super_admin_user, db_session):
        """Test creating a provider."""
        headers = {"X-User-Id": str(super_admin_user.id)}
        response = client.post(
            "/platform/providers",
            headers=headers,
            json={
                "name": "openai-gpt4",
                "provider_type": "openai",
                "model_name": "gpt-4-turbo",
                "cost_per_1k_input": 0.01,
                "cost_per_1k_output": 0.03,
            },
        )
        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "openai-gpt4"
        assert data["provider_type"] == "openai"
        assert data["model_name"] == "gpt-4-turbo"

    def test_create_provider_with_base_url(self, client, super_admin_user, db_session):
        """Test creating a provider with custom base URL."""
        headers = {"X-User-Id": str(super_admin_user.id)}
        response = client.post(
            "/platform/providers",
            headers=headers,
            json={
                "name": "ollama-local",
                "provider_type": "ollama",
                "model_name": "llama3",
                "base_url": "http://localhost:11434",
            },
        )
        assert response.status_code == 200
        data = response.json()
        assert data["base_url"] == "http://localhost:11434"

    def test_create_provider_duplicate_name(self, client, super_admin_user, db_session):
        """Test that duplicate provider names are rejected."""
        headers = {"X-User-Id": str(super_admin_user.id)}

        # Create first provider
        client.post(
            "/platform/providers",
            headers=headers,
            json={"name": "dup-provider", "provider_type": "openai", "model_name": "gpt-4"},
        )

        # Try to create second with same name
        response = client.post(
            "/platform/providers",
            headers=headers,
            json={"name": "dup-provider", "provider_type": "anthropic", "model_name": "claude"},
        )
        assert response.status_code == 409

    def test_update_provider(self, client, super_admin_user, db_session):
        """Test updating a provider."""
        headers = {"X-User-Id": str(super_admin_user.id)}

        # Create provider
        client.post(
            "/platform/providers",
            headers=headers,
            json={"name": "update-provider", "provider_type": "openai", "model_name": "gpt-4"},
        )

        # Update it
        response = client.patch(
            "/platform/providers/update-provider",
            headers=headers,
            json={"is_active": False},
        )
        assert response.status_code == 200
        assert response.json()["is_active"] is False

    def test_update_provider_not_found(self, client, super_admin_user):
        """Test updating non-existent provider."""
        headers = {"X-User-Id": str(super_admin_user.id)}
        response = client.patch(
            "/platform/providers/nonexistent",
            headers=headers,
            json={"is_active": False},
        )
        assert response.status_code == 404


class TestAgentDefinitionRoutes:
    """Tests for /platform/definitions endpoint."""

    def test_list_definitions_unauthorized(self, client):
        """Test that unauthenticated requests are rejected."""
        response = client.get("/platform/definitions")
        assert response.status_code == 401

    def test_list_definitions_with_super_admin(self, client, super_admin_user, db_session):
        """Test listing agent definitions as super admin."""
        # Create a provider first
        provider = PlatformLLMProvider(
            name="test-provider",
            provider_type="ollama",
            model_name="llama3",
        )
        db_session.add(provider)
        db_session.commit()
        db_session.refresh(provider)

        # Create an agent definition
        definition = PlatformAgentDefinition(
            key="test-agent",
            name="Test Agent",
            system_prompt="You are a test agent.",
            allowed_tools='["test_tool"]',
            default_provider_id=provider.id,
        )
        db_session.add(definition)
        db_session.commit()

        headers = {"X-User-Id": str(super_admin_user.id)}
        response = client.get("/platform/definitions", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        # Find our definition
        keys = [d["key"] for d in data]
        assert "test-agent" in keys


class TestUsageRoute:
    """Tests for /platform/usage endpoint."""

    def test_usage_unauthorized(self, client):
        """Test that unauthenticated requests are rejected."""
        response = client.get("/platform/usage")
        assert response.status_code == 401

    def test_usage_with_super_admin(self, client, super_admin_user):
        """Test getting usage stats as super admin."""
        headers = {"X-User-Id": str(super_admin_user.id)}
        response = client.get("/platform/usage", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert "total_requests" in data
        assert "total_input_tokens" in data
        assert "total_output_tokens" in data
        assert "total_cost" in data
        assert "by_tenant" in data
        assert "by_provider" in data
        assert "by_agent" in data