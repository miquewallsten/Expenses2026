"""Tenant data export job tracking.

ExportJob records track the lifecycle of tenant data export requests:
- Full exports (complete tenant data dump)
- Incremental exports (delta since last export)
- Range exports (date-bounded subset)

Jobs progress through states: pending -> processing -> complete/failed/expired
Download URLs are temporary and expire after 7 days.
"""

from datetime import datetime
from enum import Enum

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from apps.api.db import Base


class ExportStatus(str, Enum):
    """Lifecycle states for export jobs."""

    PENDING = "pending"  # Job created, waiting to be processed
    PROCESSING = "processing"  # Worker is generating the export
    COMPLETE = "complete"  # Export ready for download
    FAILED = "failed"  # Export generation failed
    EXPIRED = "expired"  # Download URL has expired


class ExportType(str, Enum):
    """Types of tenant data exports."""

    FULL = "full"  # Complete tenant data dump
    INCREMENTAL = "incremental"  # Delta since last export
    RANGE = "range"  # Date-bounded subset


class ExportJob(Base):
    """Tracks tenant data export requests for status and download management.

    Attributes:
        company_id: Tenant identifier (required for multi-tenant isolation)
        export_type: Type of export (full, incremental, range)
        date_range_start: Start date for range exports (None for full/incremental)
        date_range_end: End date for range exports (None for full/incremental)
        include_files: Whether to include file attachments (default True)
        include_audit: Whether to include audit trail (default True)
        status: Current job state
        created_at: When the job was requested
        completed_at: When the job finished (success or failure)
        download_url: Temporary URL to download the export (expires after 7 days)
        expires_at: When the download URL expires
        file_size_bytes: Size of the generated export file
        error_message: Error details if status is FAILED
        requested_by: User ID who requested the export

    Indexes:
        ix_export_jobs_company_id: company_id (tenant isolation queries)
        ix_export_jobs_status: status (job queue polling)
    """

    __tablename__ = "export_jobs"
    __table_args__ = (
        Index("ix_export_jobs_status", "status"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    company_id: Mapped[int] = mapped_column(Integer, ForeignKey("companies.id"), nullable=False, index=True)

    # Export configuration
    export_type: Mapped[str] = mapped_column(String(20), default=ExportType.FULL.value)
    date_range_start: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    date_range_end: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    include_files: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    include_audit: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # Status
    status: Mapped[str] = mapped_column(String(20), default=ExportStatus.PENDING.value)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False
    )
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    # Download
    download_url: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    file_size_bytes: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # Error handling
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Requester
    requested_by: Mapped[int | None] = mapped_column(Integer, ForeignKey("users.id"), nullable=True)