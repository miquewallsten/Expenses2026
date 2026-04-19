from datetime import datetime

from sqlalchemy import DateTime, String, func
from sqlalchemy.orm import Mapped, mapped_column

from apps.api.db import Base


class ExportBundleConfig(Base):
    """Per-company configuration for export bundle generation.

    Controls how bundles are named and serialised.  One row per company;
    uniqueness is enforced at the application layer.

    Allowed values
    --------------
    export_format : "json" | "csv"

    Tokens available in bundle_name_pattern
    ----------------------------------------
    {company_id} — numeric company identifier
    {date}       — ISO date of generation (YYYY-MM-DD)
    """

    __tablename__ = "export_bundle_configs"

    id:         Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    company_id: Mapped[int] = mapped_column(index=True, nullable=False)

    # ── Naming ────────────────────────────────────────────────────────────────
    bundle_name_pattern: Mapped[str] = mapped_column(
        String(255),
        default="company{company_id}_{date}_export_bundle",
        server_default="company{company_id}_{date}_export_bundle",
        nullable=False,
    )

    # ── Format ────────────────────────────────────────────────────────────────
    export_format: Mapped[str] = mapped_column(
        String(10),
        default="json",
        server_default="json",
        nullable=False,
    )

    # ── Metadata ──────────────────────────────────────────────────────────────
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now(), nullable=False
    )
