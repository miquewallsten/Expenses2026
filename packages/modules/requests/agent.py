"""Agent integration service for purchase request processing."""

import logging
from typing import Any

from sqlalchemy.orm import Session

from packages.modules.agent.core.context import AgentContext, Persona
from packages.modules.agent.core.engine import run_turn
from packages.modules.requests.schemas import PurchaseRequestRead

log = logging.getLogger(__name__)


def get_initial_greeting(db: Session, request: PurchaseRequestRead) -> None:
    """
    Send initial greeting message for a new purchase request.
    This would typically initiate the first agent interaction.
    
    Args:
        db: Database session
        request: The newly created purchase request
    """
    # For now, this is a no-op as the agent interaction starts with the first chat message
    # In a future implementation, this could send a welcome message or initial prompt
    pass


def process_chat(db: Session, request: PurchaseRequestRead, message: str, do_research: bool = False) -> dict[str, Any]:
    """
    Process a chat message for a purchase request through the agent system.
    
    Args:
        db: Database session
        request: The purchase request being discussed
        message: User's chat message
        do_research: Whether to perform research for this message
        
    Returns:
        Agent processing result with reply and extracted data
    """
    try:
        # We need a User object for run_turn. We'll fetch the requester.
        from packages.core.platform.models_user import User
        user = db.query(User).filter(User.id == request.requester_id).one()
        
        # Run agent turn
        result = run_turn(
            db=db,
            user=user,
            company_id=request.company_id,
            persona=Persona.PROCUREMENT,
            user_message=message,
            session_id=f"request_{request.id}",
            locale="es",
        )
        
        return {
            "reply": result["content"],
            "extracted_fields": result.get("extracted_fields"),
            "ready_to_submit": result.get("ready_to_submit", False),
            "research_results": result.get("research_results") if do_research else None,
        }
        
    except Exception as exc:
        log.error("Failed to process request chat through agent: %s", exc, exc_info=True)
        # Return a friendly error response
        return {
            "reply": "Lo siento, estoy teniendo problemas para procesar tu mensaje. "
                     "Por favor intenta de nuevo o contacta al administrador.",
            "extracted_fields": None,
            "ready_to_submit": False,
            "research_results": None,
        }