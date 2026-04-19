from datetime import datetime

from sqlalchemy import DateTime, String, func
from sqlalchemy.orm import Mapped, mapped_column

from apps.api.db import Base


class SetupSession(Base):
    __tablename__ = "setup_sessions"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    company_id: Mapped[int] = mapped_column(index=True)
    status: Mapped[str] = mapped_column(String(50), default="draft")
    current_stage: Mapped[str] = mapped_column(String(50), default="intake")
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
