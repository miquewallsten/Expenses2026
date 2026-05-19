# tests/test_workflow_service.py
"""Tests for WorkflowService state machine operations."""

import pytest
from packages.modules.agent.models_tenant import TenantWorkflowProgress
from packages.modules.agent.core.workflow import WorkflowService


@pytest.fixture
def svc():
    return WorkflowService()


def test_start_workflow(db_session, test_company):
    """Test starting a new workflow."""
    svc = WorkflowService()

    progress = svc.start(
        db_session,
        company_id=test_company.id,
        workflow_key="onboarding",
        total_steps=5
    )

    assert progress.id is not None
    assert progress.company_id == test_company.id
    assert progress.workflow_key == "onboarding"
    assert progress.current_step == "step_0"
    assert progress.total_steps == 5
    assert progress.completed_steps == 0
    assert progress.context is None


def test_start_workflow_with_context(db_session, test_company):
    """Test starting a workflow with initial context."""
    svc = WorkflowService()

    progress = svc.start(
        db_session,
        company_id=test_company.id,
        workflow_key="data_import",
        total_steps=3,
        context={"source": "csv", "file_name": "data.csv"}
    )

    assert progress.context is not None
    import json
    ctx = json.loads(progress.context)
    assert ctx["source"] == "csv"
    assert ctx["file_name"] == "data.csv"


def test_get_workflow(db_session, test_company):
    """Test retrieving an existing workflow."""
    svc = WorkflowService()

    # Start a workflow
    created = svc.start(
        db_session,
        company_id=test_company.id,
        workflow_key="onboarding",
        total_steps=5
    )

    # Retrieve it
    retrieved = svc.get(db_session, company_id=test_company.id, workflow_key="onboarding")

    assert retrieved is not None
    assert retrieved.id == created.id
    assert retrieved.workflow_key == "onboarding"


def test_get_nonexistent_workflow(db_session, test_company):
    """Test retrieving a workflow that doesn't exist."""
    svc = WorkflowService()

    result = svc.get(db_session, company_id=test_company.id, workflow_key="nonexistent")

    assert result is None


def test_advance_workflow(db_session, test_company):
    """Test advancing a workflow to the next step."""
    svc = WorkflowService()

    # Start a workflow
    progress = svc.start(
        db_session,
        company_id=test_company.id,
        workflow_key="onboarding",
        total_steps=5
    )

    assert progress.current_step == "step_0"
    assert progress.completed_steps == 0

    # Advance to next step
    progress = svc.advance(db_session, company_id=test_company.id, workflow_key="onboarding")

    assert progress.current_step == "step_1"
    assert progress.completed_steps == 1

    # Advance again
    progress = svc.advance(db_session, company_id=test_company.id, workflow_key="onboarding")

    assert progress.current_step == "step_2"
    assert progress.completed_steps == 2


def test_advance_beyond_total_steps_raises(db_session, test_company):
    """Test that advancing beyond total_steps raises an error."""
    svc = WorkflowService()

    # Start a workflow with only 2 steps
    progress = svc.start(
        db_session,
        company_id=test_company.id,
        workflow_key="quick_setup",
        total_steps=2
    )

    # Advance to step 1 (completed_steps=1)
    progress = svc.advance(db_session, company_id=test_company.id, workflow_key="quick_setup")

    # Advance to step 2 (completed_steps=2) - now complete
    progress = svc.advance(db_session, company_id=test_company.id, workflow_key="quick_setup")

    # Trying to advance beyond should raise
    with pytest.raises(ValueError, match="Cannot advance beyond total steps"):
        svc.advance(db_session, company_id=test_company.id, workflow_key="quick_setup")


def test_skip_optional_step(db_session, test_company):
    """Test skipping an optional workflow step."""
    svc = WorkflowService()

    # Start a workflow
    progress = svc.start(
        db_session,
        company_id=test_company.id,
        workflow_key="onboarding",
        total_steps=5
    )

    assert progress.current_step == "step_0"
    assert progress.completed_steps == 0

    # Skip step 0 and move to step 1
    progress = svc.skip(
        db_session,
        company_id=test_company.id,
        workflow_key="onboarding",
        step_id="step_0",
        reason="Optional step skipped"
    )

    assert progress.current_step == "step_1"
    assert progress.completed_steps == 1


def test_skip_non_current_step_raises(db_session, test_company):
    """Test that skipping a non-current step raises an error."""
    svc = WorkflowService()

    # Start a workflow
    progress = svc.start(
        db_session,
        company_id=test_company.id,
        workflow_key="onboarding",
        total_steps=5
    )

    # Try to skip a step that isn't current
    with pytest.raises(ValueError, match="Can only skip the current step"):
        svc.skip(
            db_session,
            company_id=test_company.id,
            workflow_key="onboarding",
            step_id="step_2",
            reason="Invalid skip"
        )


def test_rollback_step(db_session, test_company):
    """Test rolling back a workflow to a previous step."""
    svc = WorkflowService()

    # Start and advance a workflow
    progress = svc.start(
        db_session,
        company_id=test_company.id,
        workflow_key="onboarding",
        total_steps=5
    )

    progress = svc.advance(db_session, company_id=test_company.id, workflow_key="onboarding")
    assert progress.current_step == "step_1"
    assert progress.completed_steps == 1

    progress = svc.advance(db_session, company_id=test_company.id, workflow_key="onboarding")
    assert progress.current_step == "step_2"
    assert progress.completed_steps == 2

    # Rollback to step 1
    progress = svc.rollback(
        db_session,
        company_id=test_company.id,
        workflow_key="onboarding",
        step_id="step_1"
    )

    assert progress.current_step == "step_1"
    assert progress.completed_steps == 1


def test_rollback_to_future_step_raises(db_session, test_company):
    """Test that rolling back to a future step raises an error."""
    svc = WorkflowService()

    # Start a workflow
    progress = svc.start(
        db_session,
        company_id=test_company.id,
        workflow_key="onboarding",
        total_steps=5
    )

    # Try to rollback to a future step
    with pytest.raises(ValueError, match="Can only rollback to a previous step"):
        svc.rollback(
            db_session,
            company_id=test_company.id,
            workflow_key="onboarding",
            step_id="step_3"
        )


def test_workflow_context(db_session, test_company):
    """Test updating workflow context."""
    svc = WorkflowService()

    # Start a workflow with initial context
    progress = svc.start(
        db_session,
        company_id=test_company.id,
        workflow_key="onboarding",
        total_steps=5,
        context={"initial": "value"}
    )

    import json
    ctx = json.loads(progress.context)
    assert ctx["initial"] == "value"

    # Update context
    progress = svc.update_context(
        db_session,
        company_id=test_company.id,
        workflow_key="onboarding",
        key="user_name",
        value="John Doe"
    )

    ctx = json.loads(progress.context)
    assert ctx["initial"] == "value"
    assert ctx["user_name"] == "John Doe"

    # Update another context key
    progress = svc.update_context(
        db_session,
        company_id=test_company.id,
        workflow_key="onboarding",
        key="company_name",
        value="Acme Corp"
    )

    ctx = json.loads(progress.context)
    assert ctx["initial"] == "value"
    assert ctx["user_name"] == "John Doe"
    assert ctx["company_name"] == "Acme Corp"


def test_complete_workflow(db_session, test_company):
    """Test completing a workflow."""
    svc = WorkflowService()

    # Start a workflow
    progress = svc.start(
        db_session,
        company_id=test_company.id,
        workflow_key="onboarding",
        total_steps=2
    )

    assert progress.completed_steps == 0

    # Advance to complete
    progress = svc.advance(db_session, company_id=test_company.id, workflow_key="onboarding")
    assert progress.completed_steps == 1

    # Complete the workflow
    progress = svc.complete(db_session, company_id=test_company.id, workflow_key="onboarding")

    # Should be at the last step with all steps completed
    assert progress.current_step == "step_2"
    assert progress.completed_steps == 2


def test_workflow_tenant_isolation(db_session):
    """Test that workflows are isolated between tenants."""
    from packages.core.platform.models import Company
    svc = WorkflowService()

    # Create two companies
    company1 = Company(name="Company 1", slug="co1")
    company2 = Company(name="Company 2", slug="co2")
    db_session.add(company1)
    db_session.add(company2)
    db_session.commit()
    db_session.refresh(company1)
    db_session.refresh(company2)

    # Start workflows for both companies
    progress1 = svc.start(
        db_session,
        company_id=company1.id,
        workflow_key="onboarding",
        total_steps=3
    )
    progress2 = svc.start(
        db_session,
        company_id=company2.id,
        workflow_key="onboarding",
        total_steps=3
    )

    # Advance company 1's workflow
    progress1 = svc.advance(db_session, company_id=company1.id, workflow_key="onboarding")

    # Company 2's workflow should remain unchanged
    progress2_check = svc.get(db_session, company_id=company2.id, workflow_key="onboarding")

    assert progress1.completed_steps == 1
    assert progress2_check.completed_steps == 0