from __future__ import annotations

import re
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
        user_id: int | str, 
        company_id: int,
        *,
        confidence: float = 1.0,
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
        # 1. Resolve sender to a full User object so run_turn gets real capability flags
        from packages.core.platform.models_user import User as UserModel

        resolved_user: UserModel | None = None
        sender_ref: str  # original phone/email for session-id derivation
        if isinstance(user_id, int):
            resolved_user = db.query(UserModel).get(user_id)
            sender_ref = str(user_id)
        else:
            sender_ref = str(user_id)
            resolved_user = (
                db.query(UserModel)
                .filter(
                    UserModel.company_id == company_id,
                    UserModel.email == user_id,
                )
                .first()
            )
            if resolved_user is None:
                # Also try phone match for WhatsApp
                resolved_user = (
                    db.query(UserModel)
                    .filter(
                        UserModel.company_id == company_id,
                        UserModel.phone == user_id,
                    )
                    .first()
                )

        if resolved_user is None:
            _log.warning("No user found for sender_ref=%s in company=%s", sender_ref, company_id)
            return {
                "action": "escalate",
                "content": "No se pudo identificar al usuario.",
                "detail": "unknown_user",
                "session_id": None,
            }

        # 2. Derive a stable session_id so the same sender gets conversation continuity.
        #    Sanitize sender_ref (+, @, etc.) for use as a URL-safe token.
        safe_ref = re.sub(r"[^A-Za-z0-9_-]", "_", sender_ref.replace("+", "00"))
        derived_session_id = f"channel_{channel_type}_{company_id}_{safe_ref}"

        # TODO: Add "employee" persona — channel users submit expenses, they don't
        # configure the system. Currently Persona = Literal["admin", "accounting"],
        # so "admin" is the closest safe default until we extend the type.
        persona = "admin"

        # 3. Load channel configuration
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
            user=resolved_user,
            company_id=company_id,
            persona=persona,
            user_message=message,
            agent_definition=agent_def,
            session_id=derived_session_id,
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
