"""Pydantic schemas for tenant export API endpoints."""

from __future__ import annotations

from datetime import datetime
from enum import Enum

from pydantic import BaseModel, ConfigDict, Field


class ExportType(str, Enum):
    """Type of export to perform."""

    FULL = "full"
    INCREMENTAL = "incremental"
    RANGE = "range"


class ExportStatus(str, Enum):
    """Status of an export job."""

    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETE = "complete"
    FAILED = "failed"
    EXPIRED = "expired"


class ExportRequest(BaseModel):
    """Request to create a new tenant export."""

    export_type: ExportType = Field(
        default=ExportType.FULL,
        description="Type of export to perform",
    )
    start_date: datetime | None = Field(
        default=None,
        description="Start date for range exports (required when export_type is RANGE)",
    )
    end_date: datetime | None = Field(
        default=None,
        description="End date for range exports (required when export_type is RANGE)",
    )
    include_files: bool = Field(
        default=True,
        description="Whether to include uploaded files in the export",
    )
    include_audit: bool = Field(
        default=True,
        description="Whether to include audit logs in the export",
    )


class ExportResponse(BaseModel):
    """Response model for an export job."""

    id: int = Field(description="Unique identifier for the export job")
    company_id: int = Field(description="ID of the company this export belongs to")
    status: ExportStatus = Field(description="Current status of the export job")
    export_type: ExportType = Field(description="Type of export performed")
    created_at: datetime = Field(description="When the export job was created")
    completed_at: datetime | None = Field(
        default=None,
        description="When the export job completed (null if not complete)",
    )
    download_url: str | None = Field(
        default=None,
        description="URL to download the export file (null if not ready)",
    )
    expires_at: datetime | None = Field(
        default=None,
        description="When the download URL expires (null if not ready)",
    )
    file_size_bytes: int | None = Field(
        default=None,
        description="Size of the export file in bytes (null if not complete)",
    )
    error_message: str | None = Field(
        default=None,
        description="Error message if export failed (null if successful)",
    )

    model_config = ConfigDict(from_attributes=True)


class ExportListResponse(BaseModel):
    """Response model for listing export jobs."""

    exports: list[ExportResponse] = Field(
        default_factory=list,
        description="List of export jobs",
    )
    total: int = Field(description="Total number of export jobs")
    page: int = Field(description="Current page number (1-indexed)")
    page_size: int = Field(description="Number of items per page")


class StorageUsageResponse(BaseModel):
    """Response model for storage usage information."""

    files_gb: float = Field(description="Storage used by uploaded files in GB")
    db_gb: float = Field(description="Storage used by database in GB")
    total_gb: float = Field(description="Total storage used in GB")
    included_gb: float = Field(description="Storage included in plan in GB")
    overage_gb: float = Field(description="Storage overage in GB")
    overage_percent: float = Field(description="Percentage of storage overage")
    period_start: str = Field(description="Start of billing period (ISO date)")
    period_end: str = Field(description="End of billing period (ISO date)")