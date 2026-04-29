# tests/test_agent_definitions.py
import json
import pytest
from packages.modules.agent.models_definitions import AgentDefinition
from packages.modules.agent.core.agent_definition_service import (
    AgentDefinitionService,
)
from packages.modules.agent.tools import registry_all  # noqa: F401 — populate REGISTRY


@pytest.fixture
def svc():
    return AgentDefinitionService()


def test_seed_creates_defaults(db_session, svc):
    svc.seed_defaults(db_session)
    keys = {d.key for d in db_session.query(AgentDefinition).all()}
    assert "orchestrator" in keys
    assert "expense" in keys
    assert "accounting" in keys
    assert "config" in keys
    assert "compliance" in keys
    assert "whatsapp" in keys
    assert "email" in keys


def test_seed_is_idempotent(db_session, svc):
    svc.seed_defaults(db_session)
    svc.seed_defaults(db_session)
    count = db_session.query(AgentDefinition).count()
    assert count == 7


def test_get_by_key(db_session, svc):
    svc.seed_defaults(db_session)
    agent = svc.get_by_key(db_session, "expense")
    assert agent is not None
    assert agent.persona == "employee"


def test_get_by_key_missing_returns_none(db_session, svc):
    svc.seed_defaults(db_session)
    assert svc.get_by_key(db_session, "nonexistent") is None


def test_upsert_creates_new_agent(db_session, svc):
    agent = svc.upsert(db_session, {
        "key": "custom",
        "name": "Custom Agent",
        "system_prompt": "You are a custom agent.",
        "persona": "admin",
        "allowed_tools": [],
    })
    assert agent.id is not None
    assert agent.is_system is False


def test_upsert_updates_existing(db_session, svc):
    svc.seed_defaults(db_session)
    updated = svc.upsert(db_session, {
        "key": "expense",
        "name": "Expense Agent v2",
        "system_prompt": "Updated prompt.",
        "persona": "employee",
        "allowed_tools": [],
    })
    assert updated.name == "Expense Agent v2"
    count = db_session.query(AgentDefinition).filter_by(key="expense").count()
    assert count == 1


def test_delete_system_agent_raises(db_session, svc):
    svc.seed_defaults(db_session)
    with pytest.raises(ValueError, match="system agent"):
        svc.delete(db_session, "expense")


def test_delete_custom_agent(db_session, svc):
    svc.upsert(db_session, {
        "key": "deleteme",
        "name": "Delete Me",
        "system_prompt": "temp",
        "persona": "admin",
        "allowed_tools": [],
    })
    svc.delete(db_session, "deleteme")
    assert svc.get_by_key(db_session, "deleteme") is None


def test_invalid_tool_name_rejected(db_session, svc):
    with pytest.raises(ValueError, match="unknown tool"):
        svc.upsert(db_session, {
            "key": "bad",
            "name": "Bad",
            "system_prompt": "x",
            "persona": "admin",
            "allowed_tools": ["this_tool_does_not_exist_xyz"],
        })
