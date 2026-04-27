"""
conftest.py — shared pytest fixtures for the financial-ops-platform test suite.

Uses an in-memory database so tests are fully isolated from the production PostgreSQL DB.
"""

import os
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

# In-memory engine for test isolation — no production DB touched.
TEST_DATABASE_URL = "sqlite:///:memory:"
os.environ.setdefault("ENVIRONMENT", "development")

from apps.api.db import Base
from apps.api.deps import get_db

# Import the central model aggregator so every SQLAlchemy model is registered
# with Base.metadata before create_all runs. Single source of truth — shared
# with alembic/env.py.
import packages.core.platform.models_all  # noqa: F401

# Re-exported symbols used directly by fixtures below.
from packages.core.platform.models import Company  # noqa: F401
from packages.core.platform.models_user import User  # noqa: F401


@pytest.fixture(scope="function")
def test_engine():
    engine = create_engine(
        TEST_DATABASE_URL,
        connect_args={"check_same_thread": False},  # required for SQLite in-memory test engine
        poolclass=StaticPool,  # share one connection so :memory: state is visible across threads
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
