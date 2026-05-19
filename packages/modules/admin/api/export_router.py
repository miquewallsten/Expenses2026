"""export_router.py — REST API for tenant data export.

Provides endpoints for:
- Creating export jobs (full, incremental, range)
- Listing export history
- Checking export status
- Downloading completed exports
- Viewing storage usage
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from apps.api.auth import get_current_user, require_permission, require_same_company
from apps.api.deps import get_db
from packages.core.platform.models_export_job import ExportJob, ExportStatus
from packages.core.platform.models_user import User
from packages.modules.admin.schemas.export_schemas import (
    ExportListResponse,
    ExportRequest,
    ExportResponse,
    StorageUsageResponse,
)
from packages.modules.admin.service.export_service import ExportService
from packages.modules.admin.service.storage_usage_service import StorageUsageService


router = APIRouter(
    prefix="/admin/export",
    tags=["admin", "export"],
    dependencies=[Depends(require_permission("expense:export"))],
)


def _export_job_to_response(job: ExportJob) -> ExportResponse:
    """Convert ExportJob model to response schema."""
    return ExportResponse(
        id=job.id,
        company_id=job.company_id,
        status=ExportStatus(job.status),
        export_type=job.export_type,
        created_at=job.created_at,
        completed_at=job.completed_at,
        download_url=job.download_url,
        expires_at=job.expires_at,
        file_size_bytes=job.file_size_bytes,
        error_message=job.error_message,
    )


@router.post("", response_model=ExportResponse, status_code=201)
def create_export(
    request: ExportRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ExportResponse:
    """Create a new tenant data export job.

    The export runs asynchronously. Poll GET /{job_id} for status.
    """
    service = ExportService(db)

    # Validate date range if RANGE type
    if request.export_type.value == "range":
        if not request.start_date or not request.end_date:
            raise HTTPException(
                status_code=400,
                detail="start_date and end_date are required for range exports",
            )
        if request.start_date >= request.end_date:
            raise HTTPException(
                status_code=400,
                detail="start_date must be before end_date",
            )

    job = service.create_job(
        company_id=current_user.company_id,
        export_type=request.export_type.value,
        date_range_start=request.start_date,
        date_range_end=request.end_date,
        include_files=request.include_files,
        include_audit=request.include_audit,
        requested_by=current_user.id,
    )

    return _export_job_to_response(job)


@router.get("", response_model=ExportListResponse)
def list_exports(
    page: int = Query(default=1, ge=1, description="Page number (1-indexed)"),
    page_size: int = Query(default=20, ge=1, le=100, description="Items per page"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ExportListResponse:
    """List export history for the current company."""
    service = ExportService(db)

    # Get total count and paginated results
    total = (
        db.query(ExportJob)
        .filter(ExportJob.company_id == current_user.company_id)
        .count()
    )

    offset = (page - 1) * page_size
    jobs = (
        db.query(ExportJob)
        .filter(ExportJob.company_id == current_user.company_id)
        .order_by(ExportJob.created_at.desc())
        .offset(offset)
        .limit(page_size)
        .all()
    )

    return ExportListResponse(
        exports=[_export_job_to_response(job) for job in jobs],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/storage", response_model=StorageUsageResponse)
def get_storage_usage(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> StorageUsageResponse:
    """Get storage usage metrics for the current company."""
    service = StorageUsageService(db)
    summary = service.get_usage_summary(current_user.company_id)

    return StorageUsageResponse(
        files_gb=summary["files_gb"],
        db_gb=summary["db_gb"],
        total_gb=summary["total_gb"],
        included_gb=summary["included_gb"],
        overage_gb=summary["overage_gb"],
        overage_percent=summary["overage_percent"],
        period_start=summary["period_start"],
        period_end=summary["period_end"],
    )


@router.get("/{job_id}", response_model=ExportResponse)
def get_export_status(
    job_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ExportResponse:
    """Get status of a specific export job."""
    service = ExportService(db)
    job = service.get_job(job_id)

    if job is None:
        raise HTTPException(status_code=404, detail="Export job not found")

    # Enforce company isolation
    require_same_company(job.company_id, current_user)

    return _export_job_to_response(job)


@router.get("/{job_id}/download")
def download_export(
    job_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """Get download URL for a completed export.

    Returns:
        download_url: Temporary URL to download the export file

    Raises:
        400: Export not ready for download
        403: Not authorized to access this export
        404: Export job not found
        410: Download URL has expired
    """
    service = ExportService(db)
    job = service.get_job(job_id)

    if job is None:
        raise HTTPException(status_code=404, detail="Export job not found")

    # Enforce company isolation
    require_same_company(job.company_id, current_user)

    # Check if export is complete
    if job.status != ExportStatus.COMPLETE.value:
        raise HTTPException(
            status_code=400,
            detail=f"Export not ready for download (status: {job.status})",
        )

    # Check if download URL has expired
    if service.is_job_expired(job):
        raise HTTPException(
            status_code=410,
            detail="Download URL has expired. Please create a new export.",
        )

    return {"download_url": job.download_url}