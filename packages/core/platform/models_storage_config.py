from datetime import datetime

from sqlalchemy import DateTime, String, func
from sqlalchemy.orm import Mapped, mapped_column

from apps.api.db import Base


class StorageConfig(Base):
    """Platform-level storage backend configuration.

    Stores non-secret connection parameters for the active file storage
    backend.  Secrets (access keys, passwords) must be kept in environment
    variables; they are never persisted in the database.

    company_id = 0 represents the platform-wide default used by all companies
    unless a company-specific override exists.

    Supported backends
    ------------------
    local   — local filesystem directory (development default)
    nas     — NAS or network-mounted path (treated as local by the backend)
    s3      — S3-compatible object store (AWS S3, MinIO, GCS S3, etc.)
    azure   — Azure Blob Storage
    """

    __tablename__ = "storage_configs"

    id:         Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    company_id: Mapped[int] = mapped_column(index=True, nullable=False, default=0)

    # ── Backend selector ──────────────────────────────────────────────────────
    backend: Mapped[str] = mapped_column(
        String(32),
        default="local",
        server_default="local",
        nullable=False,
    )

    # ── Local / NAS settings ──────────────────────────────────────────────────
    local_path: Mapped[str | None] = mapped_column(String(512), nullable=True)

    # ── S3 / object storage settings (no secrets) ─────────────────────────────
    endpoint_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    bucket:       Mapped[str | None] = mapped_column(String(255), nullable=True)
    prefix:       Mapped[str | None] = mapped_column(String(255), nullable=True)
    region:       Mapped[str | None] = mapped_column(String(64),  nullable=True)

    # ── Azure Blob settings (no secrets) ──────────────────────────────────────
    azure_account:   Mapped[str | None] = mapped_column(String(255), nullable=True)
    azure_container: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # ── Audit ─────────────────────────────────────────────────────────────────
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
