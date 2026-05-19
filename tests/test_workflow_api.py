"""Tests for workflow API endpoints."""

import pytest
from fastapi.testclient import TestClient

from packages.core.platform.models import Company
from packages.core.platform.models_user import User
from packages.modules.agent.models_tenant import TenantWorkflowProgress


@pytest.fixture
def co(db_session) -> Company:
    """Create a test company."""
    c = Company(name="Workflow Test Co", slug="workflow-test-co")
    db_session.add(c)
    db_session.commit()
    db_session.refresh(c)
    return c


@pytest.fixture
def admin_user(db_session, co) -> User:
    """Create an admin user for the test company."""
    u = User(
        full_name="Workflow Admin",
        email="workflow-admin@test.com",
        role="admin",
        company_id=co.id,
    )
    db_session.add(u)
    db_session.commit()
    db_session.refresh(u)
    return u


@pytest.fixture
def auth_headers(admin_user) -> dict:
    """Create auth headers for the admin user."""
    return {"X-User-Id": str(admin_user.id)}


@pytest.fixture
def company_id(co) -> int:
    """Return the company ID."""
    return co.id


@pytest.fixture
def workflow_progress(db_session, co):
    """Create a test workflow progress record."""
    progress = TenantWorkflowProgress(
        company_id=co.id,
        workflow_key="onboarding",
        current_step="step_0",
        total_steps=5,
        completed_steps=0,
        context='{"initial": true}',
    )
    db_session.add(progress)
    db_session.commit()
    db_session.refresh(progress)
    return progress


def test_start_workflow(client: TestClient, auth_headers, company_id):
    """Test starting a new workflow."""
    response = client.post(
        f"/agent/workflow/{company_id}/start",
        headers=auth_headers,
        json={"workflow_key": "onboarding", "total_steps": 5},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["ok"] is True
    assert data["workflow_key"] == "onboarding"
    assert data["current_step"] == "step_0"
    assert data["total_steps"] == 5


def test_get_workflow_progress(client: TestClient, auth_headers, company_id, workflow_progress):
    """Test getting workflow progress."""
    response = client.get(
        f"/agent/workflow/{company_id}",
        headers=auth_headers,
        params={"workflow_key": "onboarding"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["workflow_key"] == "onboarding"
    assert data["current_step"] == "step_0"
    assert data["total_steps"] == 5


def test_advance_workflow(client: TestClient, auth_headers, company_id, workflow_progress):
    """Test advancing workflow to next step."""
    response = client.post(
        f"/agent/workflow/{company_id}/advance",
        headers=auth_headers,
        json={"workflow_key": "onboarding"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["current_step"] == "step_1"
    assert data["completed_steps"] == 1


def test_workflow_tenant_isolation(client, db_session, auth_headers, company_id):
    """Test that workflows are isolated by company."""
    # Create another company
    other_co = Company(name="Other Workflow Co", slug="other-workflow-co")
    db_session.add(other_co)
    db_session.commit()
    db_session.refresh(other_co)

    # Start workflow for test company
    response1 = client.post(
        f"/agent/workflow/{company_id}/start",
        headers=auth_headers,
        json={"workflow_key": "isolated_workflow", "total_steps": 3},
    )
    assert response1.status_code == 200

    # Start workflow for other company (need other company's admin)
    other_admin = User(
        full_name="Other Admin",
        email="other-workflow-admin@test.com",
        role="admin",
        company_id=other_co.id,
    )
    db_session.add(other_admin)
    db_session.commit()
    db_session.refresh(other_admin)

    other_headers = {"X-User-Id": str(other_admin.id)}
    response2 = client.post(
        f"/agent/workflow/{other_co.id}/start",
        headers=other_headers,
        json={"workflow_key": "isolated_workflow", "total_steps": 3},
    )
    assert response2.status_code == 200

    # Verify each company can only see their own workflow
    get1 = client.get(
        f"/agent/workflow/{company_id}",
        headers=auth_headers,
        params={"workflow_key": "isolated_workflow"},
    )
    assert get1.status_code == 200
    assert get1.json()["workflow_key"] == "isolated_workflow"

    get2 = client.get(
        f"/agent/workflow/{other_co.id}",
        headers=other_headers,
        params={"workflow_key": "isolated_workflow"},
    )
    assert get2.status_code == 200
    assert get2.json()["workflow_key"] == "isolated_workflow"


def test_advance_nonexistent_workflow(client: TestClient, auth_headers, company_id):
    """Test advancing a workflow that doesn't exist returns 404."""
    response = client.post(
        f"/agent/workflow/{company_id}/advance",
        headers=auth_headers,
        json={"workflow_key": "nonexistent"},
    )
    assert response.status_code == 404


def test_start_duplicate_workflow(client: TestClient, auth_headers, company_id, workflow_progress):
    """Test that starting a duplicate workflow fails."""
    response = client.post(
        f"/agent/workflow/{company_id}/start",
        headers=auth_headers,
        json={"workflow_key": "onboarding", "total_steps": 5},
    )
    assert response.status_code == 400
    assert "already exists" in response.json()["detail"].lower()