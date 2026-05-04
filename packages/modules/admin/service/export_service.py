"""Service for creating and managing tenant data exports."""

from datetime import datetime, timedelta

from sqlalchemy import desc
from sqlalchemy.orm import Session

from packages.core.platform.models_export_job import ExportJob, ExportStatus, ExportType


class ExportService:
    """Service for creating and managing tenant data exports.

    Provides methods to:
    - Create export jobs (full, incremental, range)
    - Track job status lifecycle
    - Calculate incremental date ranges
    - Manage download URL expiration
    """

    DOWNLOAD_EXPIRATION_DAYS = 7

    def __init__(self, db: Session):
        self.db = db

    def create_job(
        self,
        company_id: int,
        export_type: str = ExportType.FULL.value,
        date_range_start: datetime | None = None,
        date_range_end: datetime | None = None,
        include_files: bool = True,
        include_audit: bool = True,
        requested_by: int | None = None,
    ) -> ExportJob:
        """Create a new export job.

        Args:
            company_id: Tenant identifier
            export_type: Type of export (full, incremental, range)
            date_range_start: Start date for range exports
            date_range_end: End date for range exports
            include_files: Whether to include file attachments
            include_audit: Whether to include audit trail
            requested_by: User ID who requested the export

        Returns:
            The created ExportJob instance
        """
        # For incremental exports, calculate date range from last export
        if export_type == ExportType.INCREMENTAL.value:
            start, end = self.get_incremental_range(company_id)
            date_range_start = start
            date_range_end = end

        job = ExportJob(
            company_id=company_id,
            export_type=export_type,
            date_range_start=date_range_start,
            date_range_end=date_range_end,
            include_files=include_files,
            include_audit=include_audit,
            status=ExportStatus.PENDING.value,
            requested_by=requested_by,
        )

        self.db.add(job)
        self.db.commit()
        self.db.refresh(job)

        # Trigger background processing
        from apps.api.jobs.export_tasks import process_export_task
        process_export_task.delay(job.id)

        return job

    def get_incremental_range(self, company_id: int) -> tuple[datetime | None, datetime | None]:
        """Calculate date range for incremental export.

        Finds the last completed export for the company and returns
        a range from that export's completion time to now.

        Args:
            company_id: Tenant identifier

        Returns:
            Tuple of (start_datetime, end_datetime) or (None, None) if no prior export
        """
        # Find the most recent completed export for this company
        last_export = (
            self.db.query(ExportJob)
            .filter(ExportJob.company_id == company_id)
            .filter(ExportJob.status == ExportStatus.COMPLETE.value)
            .filter(ExportJob.completed_at.isnot(None))
            .order_by(desc(ExportJob.completed_at))
            .first()
        )

        if last_export is None or last_export.completed_at is None:
            return (None, None)

        # Range is from last export completion to now
        return (last_export.completed_at, datetime.now())

    def get_pending_jobs(self, limit: int = 100) -> list[ExportJob]:
        """Get all pending export jobs for processing.

        Args:
            limit: Maximum number of jobs to return

        Returns:
            List of ExportJob instances with pending status, ordered by creation time
        """
        return (
            self.db.query(ExportJob)
            .filter(ExportJob.status == ExportStatus.PENDING.value)
            .order_by(ExportJob.created_at.asc())
            .limit(limit)
            .all()
        )

    def mark_processing(self, job_id: int) -> ExportJob:
        """Mark a job as processing.

        Args:
            job_id: Export job identifier

        Returns:
            The updated ExportJob instance

        Raises:
            ValueError: If job not found
        """
        job = self.get_job(job_id)
        if job is None:
            raise ValueError(f"Export job {job_id} not found")

        job.status = ExportStatus.PROCESSING.value
        self.db.commit()
        self.db.refresh(job)

        return job

    def mark_complete(
        self,
        job_id: int,
        download_url: str,
        file_size: int,
    ) -> ExportJob:
        """Mark a job as complete with download URL.

        Sets the download URL, file size, completion time, and expiration time
        (7 days from now).

        Args:
            job_id: Export job identifier
            download_url: Temporary URL to download the export
            file_size: Size of the generated export file in bytes

        Returns:
            The updated ExportJob instance

        Raises:
            ValueError: If job not found
        """
        job = self.get_job(job_id)
        if job is None:
            raise ValueError(f"Export job {job_id} not found")

        now = datetime.now()
        expires_at = now + timedelta(days=self.DOWNLOAD_EXPIRATION_DAYS)

        job.status = ExportStatus.COMPLETE.value
        job.download_url = download_url
        job.file_size_bytes = file_size
        job.completed_at = now
        job.expires_at = expires_at

        self.db.commit()
        self.db.refresh(job)

        return job

    def mark_failed(self, job_id: int, error_message: str) -> ExportJob:
        """Mark a job as failed with error message.

        Args:
            job_id: Export job identifier
            error_message: Description of what went wrong

        Returns:
            The updated ExportJob instance

        Raises:
            ValueError: If job not found
        """
        job = self.get_job(job_id)
        if job is None:
            raise ValueError(f"Export job {job_id} not found")

        job.status = ExportStatus.FAILED.value
        job.error_message = error_message
        job.completed_at = datetime.now()

        self.db.commit()
        self.db.refresh(job)

        return job

    def get_company_history(self, company_id: int, limit: int = 20) -> list[ExportJob]:
        """Get export history for a company, most recent first.

        Args:
            company_id: Tenant identifier
            limit: Maximum number of jobs to return

        Returns:
            List of ExportJob instances ordered by created_at descending, then id descending
        """
        return (
            self.db.query(ExportJob)
            .filter(ExportJob.company_id == company_id)
            .order_by(desc(ExportJob.created_at), desc(ExportJob.id))
            .limit(limit)
            .all()
        )

    def get_job(self, job_id: int) -> ExportJob | None:
        """Get a specific export job.

        Args:
            job_id: Export job identifier

        Returns:
            ExportJob instance or None if not found
        """
        return self.db.query(ExportJob).filter(ExportJob.id == job_id).first()

    def is_job_expired(self, job: ExportJob) -> bool:
        """Check if a job's download URL has expired.

        Args:
            job: ExportJob instance

        Returns:
            True if the download URL has expired, False otherwise
        """
        if job.expires_at is None:
            return False

        return datetime.now() > job.expires_at