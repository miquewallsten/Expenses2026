# tests/test_platform_models.py
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from apps.api.db import Base
from packages.core.platform.models_platform import (
    PlatformTenant, PlatformLLMProvider, PlatformAgentDefinition, PlatformUsageLog
)

@pytest.fixture
def db():
    engine = create_engine("sqlite:///:memory:")
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