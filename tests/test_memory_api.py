# tests/test_memory_api.py
"""Tests for the tenant agent memory management API endpoints."""

import pytest
from fastapi.testclient import TestClient

from packages.core.platform.models import Company
from packages.core.platform.models_user import User
from packages.modules.agent.models_tenant import TenantAgentMemory
from packages.modules.agent.core.memory import TenantMemoryService


@pytest.fixture
def admin_user(db_session, test_company):
    """Create an admin user for testing."""
    user = User(
        full_name="Admin User",
        email="admin@test.com",
        role="admin",
        company_id=test_company.id,
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


@pytest.fixture
def other_company(db_session):
    """Create a second test company for isolation tests."""
    company = Company(name="Other Company", slug="other-co")
    db_session.add(company)
    db_session.commit()
    db_session.refresh(company)
    return company


@pytest.fixture
def other_admin_user(db_session, other_company):
    """Create an admin user for the other company."""
    user = User(
        full_name="Other Admin",
        email="other_admin@test.com",
        role="admin",
        company_id=other_company.id,
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


class TestMemoryListEndpoint:
    """Tests for GET /agent/tenant-memory/{cid}."""

    def test_list_memories_empty(self, client, admin_user):
        """Test listing memories when none exist."""
        headers = {"X-User-Id": str(admin_user.id)}
        response = client.get(f"/agent/tenant-memory/{admin_user.company_id}", headers=headers)
        assert response.status_code == 200
        assert response.json() == []

    def test_list_memories_with_data(self, client, admin_user, db_session):
        """Test listing memories returns stored entries."""
        service = TenantMemoryService(db_session)
        service.save(
            company_id=admin_user.company_id,
            agent_key="admin",
            key="preferred_category",
            value="travel",
            confidence=0.95,
        )
        service.save(
            company_id=admin_user.company_id,
            agent_key="admin",
            key="default_currency",
            value="MXN",
            confidence=0.90,
        )

        headers = {"X-User-Id": str(admin_user.id)}
        response = client.get(f"/agent/tenant-memory/{admin_user.company_id}", headers=headers)

        assert response.status_code == 200
        data = response.json()
        assert len(data) == 2
        keys = {item["key"] for item in data}
        assert "preferred_category" in keys
        assert "default_currency" in keys

    def test_list_memories_filter_by_agent_key(self, client, admin_user, db_session):
        """Test listing memories filtered by agent_key."""
        service = TenantMemoryService(db_session)
        service.save(
            company_id=admin_user.company_id,
            agent_key="admin",
            key="setting_a",
            value="value_a",
        )
        service.save(
            company_id=admin_user.company_id,
            agent_key="expense",
            key="setting_b",
            value="value_b",
        )

        headers = {"X-User-Id": str(admin_user.id)}
        # Filter by admin agent
        response = client.get(
            f"/agent/tenant-memory/{admin_user.company_id}?agent_key=admin",
            headers=headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 1
        assert data[0]["key"] == "setting_a"

        # Filter by expense agent
        response = client.get(
            f"/agent/tenant-memory/{admin_user.company_id}?agent_key=expense",
            headers=headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 1
        assert data[0]["key"] == "setting_b"

    def test_list_memories_tenant_isolation(
        self, client, admin_user, other_admin_user, other_company, db_session
    ):
        """Test that listing memories only returns own company's data."""
        service = TenantMemoryService(db_session)
        # Save memory for company 1
        service.save(
            company_id=admin_user.company_id,
            agent_key="admin",
            key="company1_key",
            value="company1_value",
        )
        # Save memory for company 2
        service.save(
            company_id=other_company.id,
            agent_key="admin",
            key="company2_key",
            value="company2_value",
        )

        # User from company 1 should only see their memories
        headers = {"X-User-Id": str(admin_user.id)}
        response = client.get(f"/agent/tenant-memory/{admin_user.company_id}", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 1
        assert data[0]["key"] == "company1_key"

        # User from company 2 should only see their memories
        headers = {"X-User-Id": str(other_admin_user.id)}
        response = client.get(f"/agent/tenant-memory/{other_company.id}", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 1
        assert data[0]["key"] == "company2_key"

    def test_list_memories_cross_company_denied(
        self, client, admin_user, other_company
    ):
        """Test that user cannot list another company's memories."""
        headers = {"X-User-Id": str(admin_user.id)}
        # Try to access other company's memories
        response = client.get(f"/agent/tenant-memory/{other_company.id}", headers=headers)
        assert response.status_code == 403

    def test_list_memories_unauthorized(self, client):
        """Test that unauthenticated requests are rejected."""
        response = client.get("/agent/tenant-memory/1")
        assert response.status_code == 401  # Unauthorized

    def test_list_memories_non_admin_denied(self, client, test_user):
        """Test that non-admin users cannot list memories."""
        headers = {"X-User-Id": str(test_user.id)}
        response = client.get(f"/agent/tenant-memory/{test_user.company_id}", headers=headers)
        assert response.status_code == 403


class TestMemoryDeleteEndpoint:
    """Tests for DELETE /agent/tenant-memory/{cid}/{key}."""

    def test_delete_memory_success(self, client, admin_user, db_session):
        """Test deleting a memory entry."""
        service = TenantMemoryService(db_session)
        service.save(
            company_id=admin_user.company_id,
            agent_key="admin",
            key="to_delete",
            value="delete_me",
        )

        headers = {"X-User-Id": str(admin_user.id)}
        response = client.delete(
            f"/agent/tenant-memory/{admin_user.company_id}/to_delete",
            headers=headers,
        )
        assert response.status_code == 200
        assert response.json()["ok"] is True

        # Verify it was deleted
        value = service.get(
            company_id=admin_user.company_id,
            agent_key="admin",
            key="to_delete",
        )
        assert value is None

    def test_delete_memory_with_agent_key(self, client, admin_user, db_session):
        """Test deleting a memory entry with specific agent_key."""
        service = TenantMemoryService(db_session)
        service.save(
            company_id=admin_user.company_id,
            agent_key="admin",
            key="shared_key",
            value="admin_value",
        )
        service.save(
            company_id=admin_user.company_id,
            agent_key="expense",
            key="shared_key",
            value="expense_value",
        )

        # Delete only the admin agent's memory
        headers = {"X-User-Id": str(admin_user.id)}
        response = client.delete(
            f"/agent/tenant-memory/{admin_user.company_id}/shared_key?agent_key=admin",
            headers=headers,
        )
        assert response.status_code == 200

        # Verify admin memory is gone but expense memory remains
        admin_value = service.get(
            company_id=admin_user.company_id,
            agent_key="admin",
            key="shared_key",
        )
        expense_value = service.get(
            company_id=admin_user.company_id,
            agent_key="expense",
            key="shared_key",
        )
        assert admin_value is None
        assert expense_value == "expense_value"

    def test_delete_memory_not_found(self, client, admin_user):
        """Test deleting a non-existent memory."""
        headers = {"X-User-Id": str(admin_user.id)}
        response = client.delete(
            f"/agent/tenant-memory/{admin_user.company_id}/nonexistent",
            headers=headers,
        )
        assert response.status_code == 404

    def test_delete_memory_tenant_isolation(
        self, client, admin_user, other_admin_user, other_company, db_session
    ):
        """Test that deleting memory enforces tenant isolation."""
        service = TenantMemoryService(db_session)
        service.save(
            company_id=other_company.id,
            agent_key="admin",
            key="protected_key",
            value="protected_value",
        )

        # Try to delete other company's memory using own company_id
        headers = {"X-User-Id": str(admin_user.id)}
        response = client.delete(
            f"/agent/tenant-memory/{admin_user.company_id}/protected_key",
            headers=headers,
        )
        # Should succeed but not affect other company's memory
        # (delete returns 200 but deletes nothing since key doesn't exist for this company)
        assert response.status_code == 404  # Key not found for this company

        # Verify other company's memory is intact
        value = service.get(
            company_id=other_company.id,
            agent_key="admin",
            key="protected_key",
        )
        assert value == "protected_value"

    def test_delete_memory_cross_company_denied(
        self, client, admin_user, other_company
    ):
        """Test that user cannot delete another company's memory."""
        headers = {"X-User-Id": str(admin_user.id)}
        response = client.delete(
            f"/agent/tenant-memory/{other_company.id}/some_key",
            headers=headers,
        )
        assert response.status_code == 403

    def test_delete_memory_unauthorized(self, client):
        """Test that unauthenticated requests are rejected."""
        response = client.delete("/agent/tenant-memory/1/some_key")
        assert response.status_code == 401  # Unauthorized

    def test_delete_memory_non_admin_denied(self, client, test_user):
        """Test that non-admin users cannot delete memories."""
        headers = {"X-User-Id": str(test_user.id)}
        response = client.delete(
            f"/agent/tenant-memory/{test_user.company_id}/some_key",
            headers=headers,
        )
        assert response.status_code == 403


class TestMemoryResponseFormat:
    """Tests for memory API response format."""

    def test_list_memory_response_format(self, client, admin_user, db_session):
        """Test that list response includes all expected fields."""
        service = TenantMemoryService(db_session)
        service.save(
            company_id=admin_user.company_id,
            agent_key="admin",
            key="test_key",
            value="test_value",
            confidence=0.85,
        )

        headers = {"X-User-Id": str(admin_user.id)}
        response = client.get(f"/agent/tenant-memory/{admin_user.company_id}", headers=headers)
        assert response.status_code == 200

        data = response.json()
        assert len(data) == 1
        item = data[0]
        assert "id" in item
        assert item["agent_key"] == "admin"
        assert item["key"] == "test_key"
        assert item["value"] == "test_value"
        assert item["confidence"] == 0.85
        assert "created_at" in item
        assert "updated_at" in item

    def test_delete_memory_response_format(self, client, admin_user, db_session):
        """Test that delete response has expected format."""
        service = TenantMemoryService(db_session)
        service.save(
            company_id=admin_user.company_id,
            agent_key="admin",
            key="delete_me",
            value="value",
        )

        headers = {"X-User-Id": str(admin_user.id)}
        response = client.delete(
            f"/agent/tenant-memory/{admin_user.company_id}/delete_me",
            headers=headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert data["ok"] is True
        assert data["key"] == "delete_me"