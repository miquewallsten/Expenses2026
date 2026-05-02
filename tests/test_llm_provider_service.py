# tests/test_llm_provider_service.py
import os
import pytest
from unittest.mock import patch
from packages.modules.agent.models_definitions import LLMProviderConfig
from packages.modules.agent.core.llm_provider_service import LLMProviderService


@pytest.fixture
def svc():
    return LLMProviderService()


def test_resolve_global_default(db_session, svc):
    # No configs in DB — fallback auto-detects Ollama or uses hardcoded default
    config = svc.resolve_provider(db_session, company_id=None)
    assert config.provider == "ollama"
    assert config.model_name  # non-empty (auto-detected or hardcoded)


def test_resolve_company_override(db_session, svc):
    # Create a company override
    config = LLMProviderConfig(
        company_id=1,
        provider="anthropic",
        model_name="claude-3-5-sonnet",
        is_active=True
    )
    db_session.add(config)
    db_session.commit()

    resolved = svc.resolve_provider(db_session, company_id=1)
    assert resolved.provider == "anthropic"
    assert resolved.model_name == "claude-3-5-sonnet"


def test_resolve_inactive_fallback(db_session, svc):
    # Create an inactive company override
    config = LLMProviderConfig(
        company_id=1,
        provider="anthropic",
        model_name="claude-3-5-sonnet",
        is_active=False
    )
    db_session.add(config)
    db_session.commit()

    # Should fallback to global default
    resolved = svc.resolve_provider(db_session, company_id=1)
    assert resolved.provider == "ollama"


def test_resolve_api_key_from_env(svc):
    config = LLMProviderConfig(
        provider="openai",
        api_key_env_ref="OPENAI_API_KEY_SECRET"
    )
    
    with patch.dict(os.environ, {"OPENAI_API_KEY_SECRET": "sk-test-123"}):
        key = svc.resolve_api_key(config)
        assert key == "sk-test-123"


def test_resolve_api_key_missing_env(svc):
    config = LLMProviderConfig(
        provider="openai",
        api_key_env_ref="MISSING_KEY"
    )
    
    with patch.dict(os.environ, {}, clear=True):
        key = svc.resolve_api_key(config)
        assert key is None


def test_upsert_global_config(db_session, svc):
    # Upsert global (company_id=None)
    config = svc.upsert(db_session, {
        "provider": "openai",
        "model_name": "gpt-4o",
        "company_id": None
    })
    assert config.provider == "openai"
    assert config.company_id is None
    
    # Verify it's now the global default
    resolved = svc.resolve_provider(db_session, company_id=999)
    assert resolved.provider == "openai"
