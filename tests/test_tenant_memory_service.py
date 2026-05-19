# tests/test_tenant_memory_service.py
"""Tests for TenantMemoryService - company-scoped memory management."""

import pytest
from datetime import datetime, timedelta
from unittest.mock import MagicMock

from packages.modules.agent.core.memory import TenantMemoryService
from packages.modules.agent.models_tenant import TenantAgentMemory


@pytest.fixture
def mock_db():
    """Create a mock database session."""
    return MagicMock()


class TestTenantMemoryService:
    """Tests for TenantMemoryService class methods."""

    def test_save_and_get_memory(self, db_session):
        """Test saving and retrieving a memory value."""
        service = TenantMemoryService(db_session)

        # Save a memory
        memory = service.save(
            company_id=1,
            agent_key="admin_copilot",
            key="preferred_category",
            value="travel",
            confidence=0.95,
        )

        assert memory.id is not None
        assert memory.company_id == 1
        assert memory.agent_key == "admin_copilot"
        assert memory.key == "preferred_category"
        assert memory.value == "travel"
        assert memory.confidence == 0.95

        # Retrieve the memory value
        value = service.get(
            company_id=1,
            agent_key="admin_copilot",
            key="preferred_category",
        )

        assert value == "travel"

    def test_memory_isolation(self, db_session):
        """Test that same key can exist for different companies."""
        service = TenantMemoryService(db_session)

        # Save memory for company 1
        service.save(
            company_id=1,
            agent_key="admin_copilot",
            key="preferred_category",
            value="travel",
            confidence=0.95,
        )

        # Save memory with same key for company 2
        service.save(
            company_id=2,
            agent_key="admin_copilot",
            key="preferred_category",
            value="office",
            confidence=0.80,
        )

        # Each company should get its own value
        value1 = service.get(company_id=1, agent_key="admin_copilot", key="preferred_category")
        value2 = service.get(company_id=2, agent_key="admin_copilot", key="preferred_category")

        assert value1 == "travel"
        assert value2 == "office"

    def test_update_existing_memory(self, db_session):
        """Test that saving with same key updates the existing record."""
        service = TenantMemoryService(db_session)

        # Initial save
        memory1 = service.save(
            company_id=1,
            agent_key="admin_copilot",
            key="preferred_category",
            value="travel",
            confidence=0.90,
        )

        # Update with same key
        memory2 = service.save(
            company_id=1,
            agent_key="admin_copilot",
            key="preferred_category",
            value="software",
            confidence=0.95,
        )

        # Should be the same record (upsert), just updated
        assert memory1.id == memory2.id
        assert memory2.value == "software"
        assert memory2.confidence == 0.95

        # Verify get returns updated value
        value = service.get(company_id=1, agent_key="admin_copilot", key="preferred_category")
        assert value == "software"

    def test_list_memories(self, db_session):
        """Test listing all memories for an agent."""
        service = TenantMemoryService(db_session)

        # Save multiple memories
        service.save(company_id=1, agent_key="admin_copilot", key="cat1", value="val1", confidence=0.9)
        service.save(company_id=1, agent_key="admin_copilot", key="cat2", value="val2", confidence=0.8)
        service.save(company_id=1, agent_key="admin_copilot", key="cat3", value="val3", confidence=0.7)

        # List all
        memories = service.list_for_agent(company_id=1, agent_key="admin_copilot")
        assert len(memories) == 3

        # List with min_confidence filter
        high_confidence = service.list_for_agent(
            company_id=1, agent_key="admin_copilot", min_confidence=0.85
        )
        assert len(high_confidence) == 1
        assert high_confidence[0].key == "cat1"

    def test_delete_memory(self, db_session):
        """Test deleting a memory."""
        service = TenantMemoryService(db_session)

        # Save a memory
        service.save(
            company_id=1,
            agent_key="admin_copilot",
            key="preferred_category",
            value="travel",
        )

        # Delete it
        deleted = service.delete(
            company_id=1,
            agent_key="admin_copilot",
            key="preferred_category",
        )
        assert deleted is True

        # Verify it's gone
        value = service.get(company_id=1, agent_key="admin_copilot", key="preferred_category")
        assert value is None

        # Delete non-existent should return False
        deleted_again = service.delete(
            company_id=1,
            agent_key="admin_copilot",
            key="preferred_category",
        )
        assert deleted_again is False

    def test_get_record(self, db_session):
        """Test retrieving full memory record."""
        service = TenantMemoryService(db_session)

        # Save a memory
        service.save(
            company_id=1,
            agent_key="admin_copilot",
            key="preferred_category",
            value="travel",
            confidence=0.95,
        )

        # Get the full record
        record = service.get_record(
            company_id=1,
            agent_key="admin_copilot",
            key="preferred_category",
        )

        assert record is not None
        assert isinstance(record, TenantAgentMemory)
        assert record.key == "preferred_category"
        assert record.value == "travel"
        assert record.confidence == 0.95

    def test_get_updates_last_used_at(self, db_session):
        """Test that get() updates last_used_at timestamp."""
        service = TenantMemoryService(db_session)

        # Save a memory
        service.save(
            company_id=1,
            agent_key="admin_copilot",
            key="preferred_category",
            value="travel",
        )

        # Get the record to see initial last_used_at
        record_before = service.get_record(
            company_id=1,
            agent_key="admin_copilot",
            key="preferred_category",
        )
        assert record_before.last_used_at is None

        # Get the value (which should update last_used_at)
        value = service.get(company_id=1, agent_key="admin_copilot", key="preferred_category")
        assert value == "travel"

        # Verify last_used_at was updated
        record_after = service.get_record(
            company_id=1,
            agent_key="admin_copilot",
            key="preferred_category",
        )
        assert record_after.last_used_at is not None
        assert isinstance(record_after.last_used_at, datetime)

    def test_save_default_confidence(self, db_session):
        """Test that save uses default confidence of 1.0 if not provided."""
        service = TenantMemoryService(db_session)

        memory = service.save(
            company_id=1,
            agent_key="admin_copilot",
            key="test_key",
            value="test_value",
        )

        assert memory.confidence == 1.0

    def test_different_agents_same_company(self, db_session):
        """Test that different agents within same company have separate memories."""
        service = TenantMemoryService(db_session)

        # Save memory for admin_copilot agent
        service.save(
            company_id=1,
            agent_key="admin_copilot",
            key="greeting",
            value="Hello admin",
        )

        # Save memory for employee agent
        service.save(
            company_id=1,
            agent_key="employee_copilot",
            key="greeting",
            value="Hello employee",
        )

        # Each agent should get its own value
        admin_val = service.get(company_id=1, agent_key="admin_copilot", key="greeting")
        employee_val = service.get(company_id=1, agent_key="employee_copilot", key="greeting")

        assert admin_val == "Hello admin"
        assert employee_val == "Hello employee"