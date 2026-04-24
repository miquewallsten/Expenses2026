from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, String, func
from sqlalchemy.orm import Mapped, mapped_column

from apps.api.db import Base


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    company_id: Mapped[int | None] = mapped_column(
        ForeignKey("companies.id"), nullable=True, index=True
    )
    entity_type: Mapped[str] = mapped_column(String(50))
    entity_id: Mapped[int]
    action: Mapped[str] = mapped_column(String(50))
    actor_user_id: Mapped[int | None]
    detail_text: Mapped[str] = mapped_column(String(5000))
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    __table_args__ = (
        Index("ix_audit_logs_company_entity", "company_id", "entity_type", "entity_id"),
    )
