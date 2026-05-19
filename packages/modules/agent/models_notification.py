"""Database-backed notification models for the agent push service.

Replaces the in-memory dicts in notification_service.py with persistent
PostgreSQL storage.  Migrations are in alembic/ — this module only
defines the ORM models.
"""

from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from apps.api.db import Base


class Notification(Base):
    """A notification addressed to one or more users (by role or user_id)."""
    __tablename__ = "notifications"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    company_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    type: Mapped[str] = mapped_column(String(32), nullable=False, default="info")
    target_roles: Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON list
    channels: Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON list
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now()
    )


class NotificationRead(Base):
    """Tracks which users have read/dismissed a notification."""
    __tablename__ = "notification_reads"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    notification_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("notifications.id", ondelete="CASCADE"), nullable=False
    )
    user_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    read_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now()
    )
