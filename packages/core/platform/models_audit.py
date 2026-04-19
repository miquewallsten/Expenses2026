from datetime import datetime

from sqlalchemy import DateTime, String, func
from sqlalchemy.orm import Mapped, mapped_column

from apps.api.db import Base


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    entity_type: Mapped[str] = mapped_column(String(50))
    entity_id: Mapped[int]
    action: Mapped[str] = mapped_column(String(50))
    actor_user_id: Mapped[int | None]
    detail_text: Mapped[str] = mapped_column(String(5000))
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
