# tests/test_orchestrator_routing.py
import pytest
import json
from unittest.mock import MagicMock, patch
from packages.modules.agent.core.orchestrator import AgentOrchestrator
from packages.modules.agent.core.context import AgentContext, Persona
from packages.modules.agent.models_definitions import AgentDefinition


@pytest.fixture
def orchestrator():
    return AgentOrchestrator()


@pytest.fixture
def ctx():
    return AgentContext(
        db=MagicMock(),
        company_id=1,
        user_id=101,
        user_email="test@example.com",
        user_role="admin",
        persona="admin",
        locale="es",
        session_id="sess_123"
    )


def test_route_request_routes_to_expense_agent(orchestrator, ctx, db_session):
    from packages.modules.agent.core.agent_definition_service import AGENT_DEF_SERVICE
    AGENT_DEF_SERVICE.seed_defaults(db_session)

    with patch("packages.modules.agent.core.orchestrator.run_turn") as mock_run_turn:
        mock_run_turn.side_effect = [
            {"ok": True, "content": '{"agent_key": "expense", "confidence": 0.9}', "session_id": "sess_123", "tool_calls": [], "pending": []},
            {"ok": True, "content": "Expense created!", "session_id": "sess_123", "tool_calls": [], "pending": []},
        ]

        import asyncio
        result = asyncio.run(orchestrator.route_request(ctx, "I want to create an expense"))

        assert result["ok"] is True
        assert result["content"] == "Expense created!"
        assert mock_run_turn.call_count == 2

        first_call = mock_run_turn.call_args_list[0].kwargs
        assert "agent_definition" in first_call
        assert first_call["agent_definition"] is not None

        second_call = mock_run_turn.call_args_list[1].kwargs
        assert second_call["agent_definition"] is not None


def test_route_request_falls_back_to_config_agent(orchestrator, ctx, db_session):
    from packages.modules.agent.core.agent_definition_service import AGENT_DEF_SERVICE
    AGENT_DEF_SERVICE.seed_defaults(db_session)

    with patch("packages.modules.agent.core.orchestrator.run_turn") as mock_run_turn:
        mock_run_turn.return_value = {
            "ok": True,
            "content": '{"agent_key": "config", "confidence": 0.3}',
            "session_id": "sess_123",
            "tool_calls": [],
            "pending": []
        }

        import asyncio
        result = asyncio.run(orchestrator.route_request(ctx, "something ambiguous"))

        assert result["ok"] is True
        assert mock_run_turn.call_count == 2
