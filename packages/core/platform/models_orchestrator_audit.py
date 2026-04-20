from datetime import datetime

from sqlalchemy import DateTime, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from apps.api.db import Base


class OrchestratorAuditLog(Base):
    """Immutable record of every orchestrator analyze and apply action.

    Records what the AI proposed (patches_proposed) and, for apply actions,
    what was actually persisted (patches_applied). Never modified after insert.
    """

    __tablename__ = "orchestrator_audit_log"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    company_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    session_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    action: Mapped[str] = mapped_column(String(20), nullable=False)           # "analyze" | "apply"
    engine_mode: Mapped[str | None] = mapped_column(String(20), nullable=True) # "DIAGNOSE" | "CONFIGURE" | "ADAPT"
    patches_proposed: Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON
    patches_applied: Mapped[str | None] = mapped_column(Text, nullable=True)   # JSON
    categories_proposed: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    categories_applied: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    applied_by: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
