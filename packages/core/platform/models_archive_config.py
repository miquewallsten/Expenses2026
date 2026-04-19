from datetime import datetime

from sqlalchemy import DateTime, String, func
from sqlalchemy.orm import Mapped, mapped_column

from apps.api.db import Base


class ArchiveConfig(Base):
    """Per-company archive naming configuration.

    Controls how stored file keys are structured when files are archived.
    One row per company; uniqueness is enforced at the application layer.

    Pattern tokens
    --------------
    file_pattern:
        {company}    — company slug / identifier
        {date}       — archive date (YYYY-MM-DD)
        {expense_id} — associated expense id, or empty string if none
        {filename}   — original filename stem
        {year}       — 4-digit year
        {month}      — 2-digit month

    folder_pattern:
        {year}       — 4-digit year
        {month}      — 2-digit month
        {company}    — company slug / identifier
    """

    __tablename__ = "archive_configs"

    id:         Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    company_id: Mapped[int] = mapped_column(index=True, nullable=False)

    # ── Naming patterns ───────────────────────────────────────────────────────
    file_pattern: Mapped[str] = mapped_column(
        String(255),
        default="{company}_{date}_{expense_id}",
        server_default="{company}_{date}_{expense_id}",
        nullable=False,
    )
    folder_pattern: Mapped[str] = mapped_column(
        String(255),
        default="{year}/{month}",
        server_default="{year}/{month}",
        nullable=False,
    )

    # ── Audit ─────────────────────────────────────────────────────────────────
    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
