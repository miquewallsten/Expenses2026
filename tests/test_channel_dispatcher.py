# tests/test_channel_dispatcher.py
import pytest
import json
from unittest.mock import MagicMock, patch
from packages.modules.agent.core.channel_dispatcher import ChannelAgentDispatcher
from packages.modules.agent.models_definitions import ChannelAgentConfig, AgentDefinition

@pytest.fixture
def dispatcher():
    return ChannelAgentDispatcher()

@pytest.fixture
def mock_db():
    return MagicMock()

def test_dispatch_autonomous_success(dispatcher, mock_db):
    # Setup: Config with high threshold, agent definition
    config = ChannelAgentConfig(
        agent_id=1,
        channel_type="whatsapp",
        autonomous_threshold=0.7,
        high_stakes_rules="[]"
    )
    agent_def = AgentDefinition(key="whatsapp", system_prompt="You are a bot", allowed_tools="[]")

    # Mock DB to return these
    mock_db.query.return_value.filter.return_value.first.return_value = config
    # Patch the singleton service directly
    with patch.object(dispatcher.def_svc, "get_by_key", return_value=agent_def):
        with patch("packages.modules.agent.core.channel_dispatcher.run_turn") as mock_run:
            mock_run.return_value = {
                "ok": True,
                "content": "Expense created successfully",
                "confidence": 0.9, # High confidence
                "session_id": "sess_123"
            }

            result = dispatcher.dispatch(mock_db, "whatsapp", "I spent 10 dollars on coffee", user_id=101, company_id=1)

            assert result["action"] == "commit"
            assert result["content"] == "Expense created successfully"
            mock_run.assert_called_once()

def test_dispatch_escalation_low_confidence(dispatcher, mock_db):
    config = ChannelAgentConfig(
        agent_id=1,
        channel_type="whatsapp",
        autonomous_threshold=0.8,
        high_stakes_rules="[]"
    )
    agent_def = AgentDefinition(key="whatsapp", system_prompt="You are a bot", allowed_tools="[]")

    mock_db.query.return_value.filter.return_value.first.return_value = config
    with patch.object(dispatcher.def_svc, "get_by_key", return_value=agent_def):
        with patch("packages.modules.agent.core.channel_dispatcher.run_turn") as mock_run:
            mock_run.return_value = {
                "ok": True,
                "content": "I think this is an expense but I'm not sure",
                "confidence": 0.5, # Below threshold
                "session_id": "sess_123"
            }

            result = dispatcher.dispatch(mock_db, "whatsapp", "Something vague", user_id=101, company_id=1)

            assert result["action"] == "escalate"
            assert result["detail"] == "low_confidence"

def test_dispatch_high_stakes_escalation(dispatcher, mock_db):
    # Rule: amount > 1000 is high stakes
    config = ChannelAgentConfig(
        agent_id=1,
        channel_type="whatsapp",
        autonomous_threshold=0.5,
        high_stakes_rules=json.dumps([{"field": "amount", "op": "gt", "value": 1000}])
    )
    agent_def = AgentDefinition(key="whatsapp", system_prompt="You are a bot", allowed_tools="[]")

    mock_db.query.return_value.filter.return_value.first.return_value = config
    with patch.object(dispatcher.def_svc, "get_by_key", return_value=agent_def):
        with patch("packages.modules.agent.core.channel_dispatcher.run_turn") as mock_run:
            mock_run.return_value = {
                "ok": True,
                "content": "Created expense for 5000 dollars",
                "confidence": 0.99,
                "extracted_data": {"amount": 5000},
                "session_id": "sess_123"
            }

            result = dispatcher.dispatch(mock_db, "whatsapp", "I spent 5000 on a laptop", user_id=101, company_id=1)

            assert result["action"] == "escalate"
            assert "high_stakes" in result["detail"]
