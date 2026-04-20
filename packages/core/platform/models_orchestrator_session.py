from datetime import datetime

from sqlalchemy import DateTime, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from apps.api.db import Base


class OrchestratorSession(Base):
    """Multi-turn conversation history for the AI Configuration Orchestrator.

    Each row is one ongoing setup conversation for a company.
    Turns are stored as a JSON array capped at _MAX_SESSION_TURNS (enforced in router):
      [{"role": "user"|"assistant", "content": str, "timestamp": ISO}]
    """

    __tablename__ = "orchestrator_sessions"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    company_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    session_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    turns: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now(), onupdate=func.now()
    )
