# tests/test_platform_models.py
import pytest
from sqlalchemy import create_engine
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from apps.api.db import Base
from packages.core.platform.models_platform import (
    PlatformTenant, PlatformLLMProvider, PlatformAgentDefinition, PlatformUsageLog
)

@pytest.fixture
def db():
    from sqlalchemy import event

    engine = create_engine("sqlite:///:memory:")

    # Enable foreign key constraints for SQLite
    @event.listens_for(engine, "connect")
    def set_sqlite_pragma(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

    Base.metadata.create_all(engine)
    with Session(engine) as session:
        yield session

def test_create_platform_tenant(db):
    tenant = PlatformTenant(slug="acme", name="Acme Corp", plan="starter")
    db.add(tenant)
    db.commit()
    assert tenant.id is not None
    assert tenant.slug == "acme"
    assert tenant.is_active is True

def test_create_llm_provider(db):
    provider = PlatformLLMProvider(
        name="openai-main",
        provider_type="openai",
        model_name="gpt-4o",
        cost_per_1k_tokens_input=0.005,
        cost_per_1k_tokens_output=0.015,
    )
    db.add(provider)
    db.commit()
    assert provider.id is not None
    assert provider.is_active is True

def test_create_agent_definition(db):
    provider = PlatformLLMProvider(name="test", provider_type="ollama", model_name="llama3.2")
    db.add(provider)
    db.commit()

    agent = PlatformAgentDefinition(
        key="admin-config",
        name="Admin Configuration Agent",
        system_prompt="You are an admin assistant.",
        allowed_tools='["invite_user", "update_policy"]',
        default_provider_id=provider.id,
    )
    db.add(agent)
    db.commit()
    assert agent.id is not None
    assert agent.key == "admin-config"

def test_create_usage_log(db):
    tenant = PlatformTenant(slug="test", name="Test")
    provider = PlatformLLMProvider(name="test", provider_type="ollama", model_name="llama3.2")
    db.add_all([tenant, provider])
    db.commit()

    log = PlatformUsageLog(
        tenant_id=tenant.id,
        agent_key="admin-config",
        provider_id=provider.id,
        input_tokens=100,
        output_tokens=50,
        cost_input=0.0005,
        cost_output=0.00075,
    )
    db.add(log)
    db.commit()
    assert log.id is not None


# Constraint violation tests

def test_tenant_slug_unique_constraint(db):
    """Test that duplicate tenant slugs are rejected."""
    tenant1 = PlatformTenant(slug="acme", name="Acme Corp 1")
    tenant2 = PlatformTenant(slug="acme", name="Acme Corp 2")
    db.add_all([tenant1, tenant2])

    with pytest.raises(IntegrityError):
        db.commit()

def test_llm_provider_name_unique_constraint(db):
    """Test that duplicate provider names are rejected."""
    provider1 = PlatformLLMProvider(name="openai-main", provider_type="openai", model_name="gpt-4o")
    provider2 = PlatformLLMProvider(name="openai-main", provider_type="anthropic", model_name="claude")
    db.add_all([provider1, provider2])

    with pytest.raises(IntegrityError):
        db.commit()

def test_agent_definition_key_unique_constraint(db):
    """Test that duplicate agent keys are rejected."""
    agent1 = PlatformAgentDefinition(key="admin-config", name="Admin Agent 1", system_prompt="Prompt 1")
    agent2 = PlatformAgentDefinition(key="admin-config", name="Admin Agent 2", system_prompt="Prompt 2")
    db.add_all([agent1, agent2])

    with pytest.raises(IntegrityError):
        db.commit()

def test_usage_log_invalid_tenant_fk(db):
    """Test that usage logs require a valid tenant_id."""
    log = PlatformUsageLog(
        tenant_id=999,  # Non-existent tenant
        agent_key="admin-config",
        input_tokens=100,
        output_tokens=50,
    )
    db.add(log)

    with pytest.raises(IntegrityError):
        db.commit()

def test_usage_log_invalid_provider_fk(db):
    """Test that provider_id must reference a valid provider if set."""
    tenant = PlatformTenant(slug="test", name="Test")
    db.add(tenant)
    db.commit()

    log = PlatformUsageLog(
        tenant_id=tenant.id,
        agent_key="admin-config",
        provider_id=999,  # Non-existent provider
        input_tokens=100,
        output_tokens=50,
    )
    db.add(log)

    with pytest.raises(IntegrityError):
        db.commit()

def test_agent_definition_invalid_provider_fk(db):
    """Test that default_provider_id must reference a valid provider if set."""
    agent = PlatformAgentDefinition(
        key="admin-config",
        name="Admin Agent",
        system_prompt="Prompt",
        default_provider_id=999,  # Non-existent provider
    )
    db.add(agent)

    with pytest.raises(IntegrityError):
        db.commit()