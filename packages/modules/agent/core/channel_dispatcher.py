from __future__ import annotations

import json
import logging
from typing import Any, Dict

from packages.modules.agent.core.agent_definition_service import AGENT_DEF_SERVICE
from packages.modules.agent.core.engine import run_turn
from packages.modules.agent.models_definitions import ChannelAgentConfig

_log = logging.getLogger(__name__)


class ChannelAgentDispatcher:
    """
    Handles autonomous agent execution for inbound channels (WhatsApp, Email).
    Implements the confidence-based commit/escalate logic.
    """

    def __init__(self):
        self.def_svc = AGENT_DEF_SERVICE

    def dispatch(
        self, 
        db, 
        channel_type: str, 
        message: str, 
        user_id: int, 
        company_id: int
    ) -> Dict[str, Any]:
        """
        Processes an inbound message autonomously.
        
        Returns:
            {
                "action": "commit" | "escalate",
                "content": str,
                "detail": str | None,
                "session_id": str | None
            }
        """
        # 1. Load channel configuration
        config = db.query(ChannelAgentConfig).filter(
            ChannelAgentConfig.channel_type == channel_type,
            # In a real multi-tenant app, we'd filter by company_id if configs were per-company.
            # Currently, channel configs are platform-global.
        ).first()

        if not config:
            _log.error("No channel config found for %s", channel_type)
            return {
                "action": "escalate",
                "content": "System error: channel configuration missing.",
                "detail": "missing_config",
                "session_id": None
            }

        key = "whatsapp" if channel_type == "whatsapp" else "email" if channel_type == "email" else "config"
        agent_def = self.def_svc.get_by_key(db, key)

        if not agent_def:
            return {
                "action": "escalate",
                "content": "Agent not found.",
                "detail": "agent_missing",
                "session_id": None
            }

        result = run_turn(
            db=db,
            user=user_id,
            company_id=company_id,
            persona="employee",
            user_message=message,
            agent_definition=agent_def,
        )

        confidence = result.get("confidence", 1.0)
        content = result.get("content", "")
        if "ESCALAR" in content.upper() or "not sure" in content.lower():
            confidence = 0.0

        threshold = getattr(config, "autonomous_threshold", 0.6)
        if confidence < threshold:
            return {"action": "escalate", "content": content, "detail": "low_confidence", "session_id": result.get("session_id")}

        extracted_data = result.get("extracted_data", {})
        rules = json.loads(config.high_stakes_rules) if config.high_stakes_rules else []
        for rule in rules:
            field = rule.get("field")
            op = rule.get("op")
            val = rule.get("value")
            actual_val = extracted_data.get(field)
            if actual_val is None:
                continue
            if op == "gt" and actual_val > val:
                return {"action": "escalate", "content": content, "detail": f"high_stakes: {field} {op} {val}", "session_id": result.get("session_id")}
            if op == "lt" and actual_val < val:
                return {"action": "escalate", "content": content, "detail": f"high_stakes: {field} {op} {val}", "session_id": result.get("session_id")}

        return {"action": "commit", "content": content, "detail": None, "session_id": result.get("session_id")}


# Singleton instance for import convenience
CHANNEL_DISPATCHER = ChannelAgentDispatcher()
