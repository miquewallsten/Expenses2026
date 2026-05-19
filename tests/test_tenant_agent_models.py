# tests/test_tenant_agent_models.py
"""Tests for tenant-scoped agent models."""

import json
import pytest
from datetime import datetime
from sqlalchemy.exc import IntegrityError

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

    with pytest.raises(IntegrityError):
        db_session.commit()
    db_session.rollback()


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


def test_tenant_session_unique_constraint(db_session):
    """Test that unique constraint on company_id + session_id is enforced."""
    # Create first session
    session1 = TenantAgentSession(
        company_id=1,
        agent_key="admin_copilot",
        user_id=42,
        session_id="sess-unique-123",
    )
    db_session.add(session1)
    db_session.commit()

    # Same session_id for different company should work
    session2 = TenantAgentSession(
        company_id=2,
        agent_key="admin_copilot",
        user_id=43,
        session_id="sess-unique-123",
    )
    db_session.add(session2)
    db_session.commit()

    assert session2.id is not None
    assert session2.company_id == 2

    # Same session_id within same company should fail
    session3 = TenantAgentSession(
        company_id=1,
        agent_key="admin_copilot",
        user_id=44,
        session_id="sess-unique-123",  # Duplicate session_id within same company
    )
    db_session.add(session3)

    with pytest.raises(IntegrityError):
        db_session.commit()
    db_session.rollback()


def test_workflow_progress_unique_constraint(db_session):
    """Test that unique constraint on company_id + workflow_key is enforced."""
    # Create first workflow progress
    progress1 = TenantWorkflowProgress(
        company_id=1,
        workflow_key="expense_approval_wf",
        current_step="step1",
        total_steps=3,
        completed_steps=0,
    )
    db_session.add(progress1)
    db_session.commit()

    # Same workflow_key for different company should work
    progress2 = TenantWorkflowProgress(
        company_id=2,
        workflow_key="expense_approval_wf",
        current_step="step2",
        total_steps=3,
        completed_steps=1,
    )
    db_session.add(progress2)
    db_session.commit()

    assert progress2.id is not None
    assert progress2.company_id == 2

    # Same workflow_key within same company should fail
    progress3 = TenantWorkflowProgress(
        company_id=1,
        workflow_key="expense_approval_wf",  # Duplicate workflow_key within same company
        current_step="step3",
        total_steps=3,
        completed_steps=2,
    )
    db_session.add(progress3)

    with pytest.raises(IntegrityError):
        db_session.commit()
    db_session.rollback()