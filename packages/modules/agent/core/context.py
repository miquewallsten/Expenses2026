"""Agent runtime context.

``AgentContext`` carries the tenant lock (``company_id``) and the caller
identity into every tool handler. Tools never accept ``company_id`` as an LLM
argument; it flows through this context object exclusively.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from sqlalchemy.orm import Session


Persona = Literal["admin", "employee", "procurement", "finance_manager", "super_admin"]


@dataclass
class AgentContext:
    db: Session
    company_id: int
    user_id: int
    user_email: str
    user_role: str
    persona: Persona
    locale: str = "es"
    session_id: str | None = None
