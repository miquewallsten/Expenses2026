# tests/test_tenant_agent_models.py
"""Tests for tenant-scoped agent models."""

import json
import pytest
from datetime import datetime

from packages.modules.agent.models_tenant import (
    TenantAgentSession,
    TenantAgentMemory,
    TenantWorkflowProgress,
)


def test_create_tenant_agent_session(db_session):
    """Test creating a TenantAgentSession."""
    session = TenantAgentSession(
        company_id=1,
        agent_key="admin_copilot",
        user_id=42,
        session_id="sess-abc123",
    )
    db_session.add(session)
    db_session.commit()

    assert session.id is not None
    assert session.company_id == 1
    assert session.agent_key == "admin_copilot"
    assert session.user_id == 42
    assert session.session_id == "sess-abc123"
    assert session.created_at is not None
    assert session.updated_at is not None


def test_create_tenant_agent_memory(db_session):
    """Test creating a TenantAgentMemory entry."""
    memory = TenantAgentMemory(
        company_id=1,
        agent_key="admin_copilot",
        key="preferred_category",
        value="travel",
        confidence=0.95,
    )
    db_session.add(memory)
    db_session.commit()

    assert memory.id is not None
    assert memory.company_id == 1
    assert memory.agent_key == "admin_copilot"
    assert memory.key == "preferred_category"
    assert memory.value == "travel"
    assert memory.confidence == 0.95
    assert memory.created_at is not None
    assert memory.updated_at is not None


def test_tenant_memory_unique_key(db_session):
    """Test that same key can exist for different companies but not within same company+agent."""
    # Create memory for company 1
    memory1 = TenantAgentMemory(
        company_id=1,
        agent_key="admin_copilot",
        key="preferred_category",
        value="travel",
        confidence=0.95,
    )
    db_session.add(memory1)
    db_session.commit()

    # Same key for different company should work
    memory2 = TenantAgentMemory(
        company_id=2,
        agent_key="admin_copilot",
        key="preferred_category",
        value="office",
        confidence=0.80,
    )
    db_session.add(memory2)
    db_session.commit()

    assert memory2.id is not None
    assert memory2.company_id == 2

    # Same key within same company+agent should fail due to unique constraint
    memory3 = TenantAgentMemory(
        company_id=1,
        agent_key="admin_copilot",
        key="preferred_category",  # Duplicate key within same company+agent
        value="software",
        confidence=0.90,
    )
    db_session.add(memory3)

    with pytest.raises(Exception):  # Will raise IntegrityError
        db_session.commit()


def test_create_workflow_progress(db_session):
    """Test creating a TenantWorkflowProgress entry."""
    context_data = {"requester_id": 42, "amount": 1500.00}
    progress = TenantWorkflowProgress(
        company_id=1,
        workflow_key="expense_approval",
        current_step="manager_review",
        total_steps=4,
        completed_steps=2,
        context=json.dumps(context_data),
    )
    db_session.add(progress)
    db_session.commit()

    assert progress.id is not None
    assert progress.company_id == 1
    assert progress.workflow_key == "expense_approval"
    assert progress.current_step == "manager_review"
    assert progress.total_steps == 4
    assert progress.completed_steps == 2
    loaded_context = json.loads(progress.context)
    assert loaded_context["requester_id"] == 42
    assert progress.created_at is not None
    assert progress.updated_at is not None