from datetime import datetime
from typing import Any

from sqlalchemy import Boolean, DateTime, JSON, String, func
from sqlalchemy.orm import Mapped, mapped_column

from apps.api.db import Base


class Company(Base):
    __tablename__ = "companies"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    # Onboarding state
    onboarding_started_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    onboarding_completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    onboarding_step: Mapped[str | None] = mapped_column(String(50), nullable=True)
    onboarding_data: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)