from datetime import datetime

from sqlalchemy import DateTime, String, func
from sqlalchemy.orm import Mapped, mapped_column

from apps.api.db import Base


class ConfigVersion(Base):
    __tablename__ = "config_versions"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    setup_session_id: Mapped[int] = mapped_column(index=True)
    config_type: Mapped[str] = mapped_column(String(50))
    content_text: Mapped[str] = mapped_column(String(5000))
    status: Mapped[str] = mapped_column(String(50), default="active")
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
