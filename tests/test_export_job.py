"""Tests for ExportJob model - tenant data export job tracking."""

import pytest
from datetime import datetime, timedelta
from packages.core.platform.models_export_job import ExportJob, ExportStatus, ExportType


def test_export_job_creation(db_session):
    """Test creating an export job with all required fields."""
    job = ExportJob(
        company_id=1,
        export_type=ExportType.FULL,
        status=ExportStatus.PENDING,
        include_files=True,
        include_audit=True,
    )
    db_session.add(job)
    db_session.commit()

    assert job.id is not None
    assert job.company_id == 1
    assert job.export_type == ExportType.FULL
    assert job.status == ExportStatus.PENDING
    assert job.created_at is not None
    assert job.completed_at is None
    assert job.download_url is None


def test_export_job_incremental_with_date_range(db_session):
    """Test creating an incremental export with date range."""
    start = datetime(2024, 1, 1)
    end = datetime(2024, 12, 31)

    job = ExportJob(
        company_id=1,
        export_type=ExportType.INCREMENTAL,
        date_range_start=start,
        date_range_end=end,
        status=ExportStatus.PENDING,
    )
    db_session.add(job)
    db_session.commit()

    assert job.export_type == ExportType.INCREMENTAL
    assert job.date_range_start == start
    assert job.date_range_end == end


def test_export_job_status_progression(db_session):
    """Test export job status progression from pending to complete."""
    job = ExportJob(
        company_id=1,
        export_type=ExportType.FULL,
        status=ExportStatus.PENDING,
    )
    db_session.add(job)
    db_session.commit()

    assert job.status == ExportStatus.PENDING

    # Progress to processing
    job.status = ExportStatus.PROCESSING
    db_session.commit()

    assert job.status == ExportStatus.PROCESSING

    # Complete the job
    job.status = ExportStatus.COMPLETE
    job.completed_at = datetime.utcnow()
    job.download_url = "https://storage.example.com/exports/123.zip"
    job.expires_at = datetime.utcnow() + timedelta(days=7)
    job.file_size_bytes = 1024 * 1024  # 1MB
    db_session.commit()

    assert job.status == ExportStatus.COMPLETE
    assert job.completed_at is not None
    assert job.download_url is not None
    assert job.expires_at is not None
    assert job.file_size_bytes == 1024 * 1024


def test_export_job_failure(db_session):
    """Test export job failure handling."""
    job = ExportJob(
        company_id=1,
        export_type=ExportType.FULL,
        status=ExportStatus.PROCESSING,
    )
    db_session.add(job)
    db_session.commit()

    # Job fails
    job.status = ExportStatus.FAILED
    job.error_message = "Database connection timeout"
    job.completed_at = datetime.utcnow()
    db_session.commit()

    assert job.status == ExportStatus.FAILED
    assert job.error_message == "Database connection timeout"


def test_export_job_expiration(db_session):
    """Test export job expiration status."""
    job = ExportJob(
        company_id=1,
        export_type=ExportType.FULL,
        status=ExportStatus.COMPLETE,
        download_url="https://storage.example.com/exports/123.zip",
        expires_at=datetime.utcnow() - timedelta(hours=1),  # Already expired
    )
    db_session.add(job)
    db_session.commit()

    # Mark as expired
    job.status = ExportStatus.EXPIRED
    db_session.commit()

    assert job.status == ExportStatus.EXPIRED


def test_export_job_with_requester(db_session):
    """Test export job with requester tracking."""
    job = ExportJob(
        company_id=1,
        export_type=ExportType.RANGE,
        status=ExportStatus.PENDING,
        requested_by=42,  # User ID who requested the export
    )
    db_session.add(job)
    db_session.commit()

    assert job.requested_by == 42


def test_export_status_enum_values():
    """Test that all expected export statuses are defined."""
    assert ExportStatus.PENDING == "pending"
    assert ExportStatus.PROCESSING == "processing"
    assert ExportStatus.COMPLETE == "complete"
    assert ExportStatus.FAILED == "failed"
    assert ExportStatus.EXPIRED == "expired"


def test_export_type_enum_values():
    """Test that all expected export types are defined."""
    assert ExportType.FULL == "full"
    assert ExportType.INCREMENTAL == "incremental"
    assert ExportType.RANGE == "range"


def test_export_job_indexes(db_session):
    """Test that export job indexes work correctly."""
    # Create multiple jobs for different companies and statuses
    for i in range(3):
        job = ExportJob(
            company_id=1,
            export_type=ExportType.FULL,
            status=ExportStatus.PENDING,
        )
        db_session.add(job)

    for i in range(2):
        job = ExportJob(
            company_id=2,
            export_type=ExportType.INCREMENTAL,
            status=ExportStatus.COMPLETE,
        )
        db_session.add(job)

    db_session.commit()

    # Query by company_id (should use index)
    company_1_jobs = db_session.query(ExportJob).filter_by(company_id=1).all()
    assert len(company_1_jobs) == 3

    # Query by status (should use index)
    pending_jobs = db_session.query(ExportJob).filter_by(status=ExportStatus.PENDING).all()
    assert len(pending_jobs) == 3