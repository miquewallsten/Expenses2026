"""
conftest.py — shared pytest fixtures for the financial-ops-platform test suite.

Uses an in-memory database so tests are fully isolated from the production PostgreSQL DB.
"""

import os
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

# In-memory engine for test isolation — no production DB touched.
TEST_DATABASE_URL = "sqlite:///:memory:"
os.environ.setdefault("ENVIRONMENT", "development")

from apps.api.db import Base
from apps.api.deps import get_db

# Import every model so SQLAlchemy's metadata is fully populated before create_all.
# Keep this list in sync with alembic/env.py.
from packages.core.platform.models import Company  # noqa: F401
from packages.core.platform.models_user import User  # noqa: F401
from packages.core.platform.models_audit import AuditLog  # noqa: F401
from packages.core.platform.models_module import PlatformModule  # noqa: F401
from packages.core.platform.models_company_module import CompanyModule  # noqa: F401
from packages.core.platform.models_project import Project  # noqa: F401
from packages.core.platform.models_client import Client  # noqa: F401
from packages.core.platform.models_cost_center import CostCenter  # noqa: F401
from packages.core.platform.models_role import Role  # noqa: F401
from packages.core.platform.models_permission import Permission  # noqa: F401
from packages.core.platform.models_role_permission import RolePermission  # noqa: F401
from packages.core.platform.models_user_role import UserRole  # noqa: F401
from packages.core.platform.models_workflow_stage import WorkflowStage  # noqa: F401
from packages.core.platform.models_workflow_transition import WorkflowTransition  # noqa: F401
from packages.core.platform.models_expense_policy import CompanyExpensePolicy  # noqa: F401
from packages.core.platform.models_company_setup import CompanySetup  # noqa: F401
from packages.core.platform.models_legal_entity import LegalEntity  # noqa: F401
from packages.core.platform.models_accounting_category import AccountingCategory  # noqa: F401
from packages.core.platform.models_accounting_learning import AccountingLearning  # noqa: F401
from packages.core.platform.models_accounting_setup import AccountingSetup  # noqa: F401
from packages.core.platform.models_approval_setup import ApprovalSetup  # noqa: F401
from packages.core.platform.models_workflow_setup import WorkflowSetup  # noqa: F401
from packages.core.platform.models_archive_file import ArchiveFile  # noqa: F401
from packages.core.platform.models_archive_config import ArchiveConfig  # noqa: F401
from packages.modules.expenses.models import Expense, ExpenseDocument, ExpenseReport, Poliza  # noqa: F401
from packages.modules.expenses.models.expense_allocation import ExpenseAllocation  # noqa: F401
from packages.modules.expenses.models.expense_attachment import ExpenseAttachment  # noqa: F401
from packages.modules.ai.models_embedding import DocumentEmbedding  # noqa: F401
from packages.modules.agent.models import (  # noqa: F401 — registers agent_* tables
    AgentSession, AgentToolCall, AgentPendingAction, AgentUpload,
    AgentMemory, AgentInsight, AgentUsage,
)


@pytest.fixture(scope="function")
def test_engine():
    engine = create_engine(
        TEST_DATABASE_URL,
        connect_args={"check_same_thread": False},  # required for SQLite in-memory test engine
    )
    # Create all tables fresh for each test
    Base.metadata.create_all(bind=engine)
    yield engine
    Base.metadata.drop_all(bind=engine)
    engine.dispose()


@pytest.fixture(scope="function")
def db_session(test_engine):
    """Provides a clean database session for each test, rolled back afterwards."""
    TestingSession = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)
    session = TestingSession()
    try:
        yield session
    finally:
        session.rollback()
        session.close()


@pytest.fixture(scope="function")
def client(db_session):
    """FastAPI TestClient with the DB overridden to use the test session."""
    # Import app after env vars are set
    from apps.api.main import app

    def override_get_db():
        try:
            yield db_session
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app, raise_server_exceptions=True) as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture(scope="function")
def test_company(db_session):
    """Create a test company row."""
    company = Company(name="Test Company", slug="test-co")
    db_session.add(company)
    db_session.commit()
    db_session.refresh(company)
    return company


@pytest.fixture(scope="function")
def test_user(db_session, test_company):
    """Create a test employee user."""
    user = User(
        full_name="Test Employee",
        email="employee@test.com",
        role="employee",
        company_id=test_company.id,
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


@pytest.fixture(scope="function")
def manager_user(db_session, test_company):
    """Create a test manager user."""
    user = User(
        full_name="Test Manager",
        email="manager@test.com",
        role="manager",
        company_id=test_company.id,
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user
