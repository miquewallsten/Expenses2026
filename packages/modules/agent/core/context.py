"""Agent runtime context.

``AgentContext`` carries the tenant lock (``company_id``) and the caller
identity into every tool handler. Tools never accept ``company_id`` as an LLM
argument; it flows through this context object exclusively.

Capability flags (can_create_expenses, can_access_accounting, etc.) control
what functional areas a user can access, regardless of their role. This allows
fine-grained control over module visibility—for example, a configuration-only
admin (can_create_expenses=False) focuses on setup and doesn't see expense
submission modules.
"""

from __future__ import annotations

from dataclasses import dataclass, field
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
    allowed_tools: list[str] | None = None  # From agent definition; None = use persona defaults
    # User capability flags — control what modules the user can access
    can_create_expenses: bool = True
    can_access_accounting: bool = False
    can_view_analytics: bool = False
    is_amex_reconciler: bool = False
    has_executive_reporting: bool = False
    # Org assignment context
    delegates_for_user_id: int | None = None
    delegates_for_user_name: str | None = None
    assigned_project_ids: list[int] = field(default_factory=list)

