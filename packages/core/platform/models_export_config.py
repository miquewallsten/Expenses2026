from datetime import datetime

from sqlalchemy import DateTime, String, func
from sqlalchemy.orm import Mapped, mapped_column

from apps.api.db import Base

# Allowed values for export_format
EXPORT_FORMAT_VALUES = ("csv", "json")


class ExportConfig(Base):
    """Per-company export configuration.

    Controls how batch exports are named, organised on disk, and serialised.
    One row per company; uniqueness is enforced at the application layer.

    Allowed values
    --------------
    export_format : "csv" | "json"
    """

    __tablename__ = "export_configs"

    id:         Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    company_id: Mapped[int] = mapped_column(index=True, nullable=False)

    # ── Naming ────────────────────────────────────────────────────────────────
    # Tokens available in file_pattern:
    #   {company}   — company identifier / slug
    #   {date}      — export date formatted by date_format
    #   {batch_id}  — unique batch identifier
    # Tokens available in folder_pattern:
    #   {year}      — 4-digit year
    #   {month}     — 2-digit month
    file_pattern: Mapped[str] = mapped_column(
        String(255),
        default="{company}_{date}_{batch_id}.csv",
        server_default="{company}_{date}_{batch_id}.csv",
        nullable=False,
    )
    folder_pattern: Mapped[str] = mapped_column(
        String(255),
        default="{year}/{month}/",
        server_default="{year}/{month}/",
        nullable=False,
    )

    # ── Format ────────────────────────────────────────────────────────────────
    export_format: Mapped[str] = mapped_column(
        String(10),
        default="csv",
        server_default="csv",
        nullable=False,
    )
    date_format: Mapped[str | None] = mapped_column(String(50), nullable=True)

    # ── Metadata ──────────────────────────────────────────────────────────────
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now(), nullable=False
    )
