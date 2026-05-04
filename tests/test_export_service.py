"""Tests for ExportService — export job management."""

from datetime import datetime, timedelta

import pytest
from sqlalchemy.orm import Session

from packages.core.platform.models import Company
from packages.core.platform.models_user import User
from packages.core.platform.models_export_job import ExportJob, ExportStatus, ExportType
from packages.modules.admin.service.export_service import ExportService


@pytest.fixture
def export_company(db_session: Session) -> Company:
    """Create a test company for export tests."""
    company = Company(name="Export Service Co", slug="export-service-co")
    db_session.add(company)
    db_session.commit()
    db_session.refresh(company)
    return company


@pytest.fixture
def export_user(db_session: Session, export_company: Company) -> User:
    """Create a test user for export tests."""
    user = User(
        email="export@example.com",
        full_name="Export User",
        company_id=export_company.id,
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


@pytest.fixture
def export_service(db_session: Session) -> ExportService:
    """Create an ExportService instance."""
    return ExportService(db_session)


class TestCreateExportJob:
    """Tests for create_job method."""

    def test_creates_full_export_job(
        self,
        db_session: Session,
        export_company: Company,
        export_service: ExportService,
    ) -> None:
        """Test creating a full export job with defaults."""
        job = export_service.create_job(company_id=export_company.id)

        assert job.id is not None
        assert job.company_id == export_company.id
        assert job.export_type == ExportType.FULL.value
        assert job.status == ExportStatus.PENDING.value
        assert job.include_files is True
        assert job.include_audit is True
        assert job.date_range_start is None
        assert job.date_range_end is None

    def test_creates_range_export_with_dates(
        self,
        db_session: Session,
        export_company: Company,
        export_service: ExportService,
    ) -> None:
        """Test creating a range export with custom date range."""
        start = datetime(2024, 1, 1)
        end = datetime(2024, 12, 31)

        job = export_service.create_job(
            company_id=export_company.id,
            export_type=ExportType.RANGE.value,
            date_range_start=start,
            date_range_end=end,
        )

        assert job.export_type == ExportType.RANGE.value
        assert job.date_range_start == start
        assert job.date_range_end == end

    def test_creates_job_with_custom_options(
        self,
        db_session: Session,
        export_company: Company,
        export_user: User,
        export_service: ExportService,
    ) -> None:
        """Test creating job with custom options."""
        job = export_service.create_job(
            company_id=export_company.id,
            include_files=False,
            include_audit=False,
            requested_by=export_user.id,
        )

        assert job.include_files is False
        assert job.include_audit is False
        assert job.requested_by == export_user.id

    def test_incremental_uses_date_range_from_last_export(
        self,
        db_session: Session,
        export_company: Company,
        export_service: ExportService,
    ) -> None:
        """Test that incremental export calculates range from last export."""
        # Create a completed export first
        completed_job = export_service.create_job(company_id=export_company.id)
        export_service.mark_complete(completed_job.id, "https://example.com/export.zip", 1024)

        # Now create an incremental export
        before_create = datetime.now()
        incremental_job = export_service.create_job(
            company_id=export_company.id,
            export_type=ExportType.INCREMENTAL.value,
        )

        assert incremental_job.export_type == ExportType.INCREMENTAL.value
        assert incremental_job.date_range_start is not None
        assert incremental_job.date_range_end is not None
        # Start should be around the completed_at time
        assert incremental_job.date_range_start >= completed_job.completed_at
        # End should be close to now
        assert incremental_job.date_range_end >= before_create


class TestGetIncrementalDateRange:
    """Tests for get_incremental_range method."""

    def test_returns_none_none_when_no_prior_export(
        self,
        db_session: Session,
        export_company: Company,
        export_service: ExportService,
    ) -> None:
        """Test that (None, None) is returned when no prior export exists."""
        start, end = export_service.get_incremental_range(export_company.id)

        assert start is None
        assert end is None

    def test_returns_range_from_last_completed_export(
        self,
        db_session: Session,
        export_company: Company,
        export_service: ExportService,
    ) -> None:
        """Test that range is calculated from last completed export."""
        # Create and complete an export
        job = export_service.create_job(company_id=export_company.id)
        completed = export_service.mark_complete(job.id, "https://example.com/export.zip", 1024)

        before_range = datetime.now()
        start, end = export_service.get_incremental_range(export_company.id)

        assert start == completed.completed_at
        assert end >= before_range

    def test_ignores_pending_exports(
        self,
        db_session: Session,
        export_company: Company,
        export_service: ExportService,
    ) -> None:
        """Test that pending exports are ignored for incremental range."""
        # Create a pending export (not completed)
        export_service.create_job(company_id=export_company.id)

        start, end = export_service.get_incremental_range(export_company.id)

        assert start is None
        assert end is None

    def test_uses_most_recent_completed_export(
        self,
        db_session: Session,
        export_company: Company,
        export_service: ExportService,
    ) -> None:
        """Test that the most recent completed export is used."""
        # Create and complete first export
        job1 = export_service.create_job(company_id=export_company.id)
        completed1 = export_service.mark_complete(job1.id, "https://example.com/export1.zip", 1024)

        # Create and complete second export (more recent)
        job2 = export_service.create_job(company_id=export_company.id)
        completed2 = export_service.mark_complete(job2.id, "https://example.com/export2.zip", 2048)

        start, end = export_service.get_incremental_range(export_company.id)

        # Should use the most recent completed_at
        assert start == completed2.completed_at
        assert start > completed1.completed_at

    def test_isolated_per_company(
        self,
        db_session: Session,
        export_service: ExportService,
    ) -> None:
        """Test that incremental range is isolated per company."""
        # Create two companies
        company1 = Company(name="Export Co 1", slug="export-co-1")
        company2 = Company(name="Export Co 2", slug="export-co-2")
        db_session.add_all([company1, company2])
        db_session.commit()
        db_session.refresh(company1)
        db_session.refresh(company2)

        # Complete export for company1 only
        job = export_service.create_job(company_id=company1.id)
        export_service.mark_complete(job.id, "https://example.com/export.zip", 1024)

        range1 = export_service.get_incremental_range(company1.id)
        range2 = export_service.get_incremental_range(company2.id)

        assert range1[0] is not None
        assert range2[0] is None


class TestGetPendingJobs:
    """Tests for get_pending_jobs method."""

    def test_returns_pending_jobs(
        self,
        db_session: Session,
        export_company: Company,
        export_service: ExportService,
    ) -> None:
        """Test that pending jobs are returned."""
        # Create multiple jobs
        job1 = export_service.create_job(company_id=export_company.id)
        job2 = export_service.create_job(company_id=export_company.id)
        # Complete one
        export_service.mark_complete(job2.id, "https://example.com/export.zip", 1024)

        pending = export_service.get_pending_jobs()

        assert len(pending) >= 1
        assert job1.id in [j.id for j in pending]
        assert job2.id not in [j.id for j in pending]

    def test_respects_limit(
        self,
        db_session: Session,
        export_company: Company,
        export_service: ExportService,
    ) -> None:
        """Test that limit parameter is respected."""
        # Create many pending jobs
        for _ in range(150):
            export_service.create_job(company_id=export_company.id)

        pending = export_service.get_pending_jobs(limit=50)

        assert len(pending) == 50

    def test_orders_by_created_at(
        self,
        db_session: Session,
        export_company: Company,
        export_service: ExportService,
    ) -> None:
        """Test that jobs are ordered by created_at ascending."""
        job1 = export_service.create_job(company_id=export_company.id)
        job2 = export_service.create_job(company_id=export_company.id)
        job3 = export_service.create_job(company_id=export_company.id)

        pending = export_service.get_pending_jobs()

        # Should be in creation order
        ids = [j.id for j in pending if j.id in [job1.id, job2.id, job3.id]]
        assert ids == sorted(ids)

    def test_excludes_non_pending_jobs(
        self,
        db_session: Session,
        export_company: Company,
        export_service: ExportService,
    ) -> None:
        """Test that non-pending jobs are excluded."""
        # Create jobs in different states
        pending_job = export_service.create_job(company_id=export_company.id)
        processing_job = export_service.create_job(company_id=export_company.id)
        export_service.mark_processing(processing_job.id)
        failed_job = export_service.create_job(company_id=export_company.id)
        export_service.mark_failed(failed_job.id, "Test error")

        pending = export_service.get_pending_jobs()

        pending_ids = [j.id for j in pending]
        assert pending_job.id in pending_ids
        assert processing_job.id not in pending_ids
        assert failed_job.id not in pending_ids


class TestMarkJobProcessing:
    """Tests for mark_processing method."""

    def test_updates_status_to_processing(
        self,
        db_session: Session,
        export_company: Company,
        export_service: ExportService,
    ) -> None:
        """Test that status is updated to processing."""
        job = export_service.create_job(company_id=export_company.id)

        updated = export_service.mark_processing(job.id)

        assert updated.status == ExportStatus.PROCESSING.value

    def test_raises_error_for_nonexistent_job(
        self,
        db_session: Session,
        export_service: ExportService,
    ) -> None:
        """Test that error is raised for nonexistent job."""
        with pytest.raises(ValueError, match="not found"):
            export_service.mark_processing(99999)


class TestMarkJobComplete:
    """Tests for mark_complete method."""

    def test_updates_job_as_complete(
        self,
        db_session: Session,
        export_company: Company,
        export_service: ExportService,
    ) -> None:
        """Test that job is marked as complete with all fields."""
        job = export_service.create_job(company_id=export_company.id)

        updated = export_service.mark_complete(
            job.id,
            download_url="https://example.com/exports/export_123.zip",
            file_size=5_242_880,  # 5 MB
        )

        assert updated.status == ExportStatus.COMPLETE.value
        assert updated.download_url == "https://example.com/exports/export_123.zip"
        assert updated.file_size_bytes == 5_242_880
        assert updated.completed_at is not None
        assert updated.expires_at is not None

    def test_sets_expiration_7_days_ahead(
        self,
        db_session: Session,
        export_company: Company,
        export_service: ExportService,
    ) -> None:
        """Test that expires_at is set to 7 days from completion."""
        job = export_service.create_job(company_id=export_company.id)

        before_complete = datetime.now()
        updated = export_service.mark_complete(job.id, "https://example.com/export.zip", 1024)

        # Check expiration is approximately 7 days
        expected_expiration_min = before_complete + timedelta(days=7)
        expected_expiration_max = datetime.now() + timedelta(days=7)

        assert updated.expires_at >= expected_expiration_min
        assert updated.expires_at <= expected_expiration_max + timedelta(minutes=1)

    def test_raises_error_for_nonexistent_job(
        self,
        db_session: Session,
        export_service: ExportService,
    ) -> None:
        """Test that error is raised for nonexistent job."""
        with pytest.raises(ValueError, match="not found"):
            export_service.mark_complete(99999, "https://example.com/export.zip", 1024)


class TestMarkJobFailed:
    """Tests for mark_failed method."""

    def test_updates_job_as_failed(
        self,
        db_session: Session,
        export_company: Company,
        export_service: ExportService,
    ) -> None:
        """Test that job is marked as failed with error message."""
        job = export_service.create_job(company_id=export_company.id)

        updated = export_service.mark_failed(job.id, "Database connection timeout")

        assert updated.status == ExportStatus.FAILED.value
        assert updated.error_message == "Database connection timeout"
        assert updated.completed_at is not None

    def test_raises_error_for_nonexistent_job(
        self,
        db_session: Session,
        export_service: ExportService,
    ) -> None:
        """Test that error is raised for nonexistent job."""
        with pytest.raises(ValueError, match="not found"):
            export_service.mark_failed(99999, "Test error")


class TestGetCompanyExportHistory:
    """Tests for get_company_history method."""

    def test_returns_company_jobs_ordered_by_created_desc(
        self,
        db_session: Session,
        export_company: Company,
        export_service: ExportService,
    ) -> None:
        """Test that history is returned in descending order."""
        job1 = export_service.create_job(company_id=export_company.id)
        job2 = export_service.create_job(company_id=export_company.id)
        job3 = export_service.create_job(company_id=export_company.id)

        history = export_service.get_company_history(export_company.id)

        # Should be most recent first
        ids = [j.id for j in history if j.id in [job1.id, job2.id, job3.id]]
        assert ids == sorted(ids, reverse=True)

    def test_respects_limit(
        self,
        db_session: Session,
        export_company: Company,
        export_service: ExportService,
    ) -> None:
        """Test that limit parameter is respected."""
        # Create many jobs
        for _ in range(30):
            export_service.create_job(company_id=export_company.id)

        history = export_service.get_company_history(export_company.id, limit=10)

        assert len(history) == 10

    def test_isolated_per_company(
        self,
        db_session: Session,
        export_service: ExportService,
    ) -> None:
        """Test that history is isolated per company."""
        company1 = Company(name="History Co 1", slug="history-co-1")
        company2 = Company(name="History Co 2", slug="history-co-2")
        db_session.add_all([company1, company2])
        db_session.commit()
        db_session.refresh(company1)
        db_session.refresh(company2)

        # Create jobs for both companies
        job1 = export_service.create_job(company_id=company1.id)
        job2 = export_service.create_job(company_id=company2.id)

        history1 = export_service.get_company_history(company1.id)
        history2 = export_service.get_company_history(company2.id)

        assert job1.id in [j.id for j in history1]
        assert job2.id not in [j.id for j in history1]
        assert job2.id in [j.id for j in history2]
        assert job1.id not in [j.id for j in history2]

    def test_includes_all_statuses(
        self,
        db_session: Session,
        export_company: Company,
        export_service: ExportService,
    ) -> None:
        """Test that history includes jobs of all statuses."""
        pending = export_service.create_job(company_id=export_company.id)
        processing = export_service.create_job(company_id=export_company.id)
        export_service.mark_processing(processing.id)
        complete = export_service.create_job(company_id=export_company.id)
        export_service.mark_complete(complete.id, "https://example.com/export.zip", 1024)
        failed = export_service.create_job(company_id=export_company.id)
        export_service.mark_failed(failed.id, "Error")

        history = export_service.get_company_history(export_company.id)

        history_ids = [j.id for j in history]
        assert pending.id in history_ids
        assert processing.id in history_ids
        assert complete.id in history_ids
        assert failed.id in history_ids


class TestGetJob:
    """Tests for get_job method."""

    def test_returns_job_by_id(
        self,
        db_session: Session,
        export_company: Company,
        export_service: ExportService,
    ) -> None:
        """Test that job is returned by ID."""
        created = export_service.create_job(company_id=export_company.id)

        found = export_service.get_job(created.id)

        assert found is not None
        assert found.id == created.id

    def test_returns_none_for_nonexistent_job(
        self,
        db_session: Session,
        export_service: ExportService,
    ) -> None:
        """Test that None is returned for nonexistent job."""
        found = export_service.get_job(99999)

        assert found is None


class TestIsJobExpired:
    """Tests for is_job_expired method."""

    def test_returns_false_for_non_expired_job(
        self,
        db_session: Session,
        export_company: Company,
        export_service: ExportService,
    ) -> None:
        """Test that False is returned for non-expired job."""
        job = export_service.create_job(company_id=export_company.id)
        completed = export_service.mark_complete(job.id, "https://example.com/export.zip", 1024)

        assert export_service.is_job_expired(completed) is False

    def test_returns_true_for_expired_job(
        self,
        db_session: Session,
        export_company: Company,
        export_service: ExportService,
    ) -> None:
        """Test that True is returned for expired job."""
        job = export_service.create_job(company_id=export_company.id)
        completed = export_service.mark_complete(job.id, "https://example.com/export.zip", 1024)

        # Manually set expires_at to the past
        completed.expires_at = datetime.now() - timedelta(days=1)
        db_session.commit()
        db_session.refresh(completed)

        assert export_service.is_job_expired(completed) is True

    def test_returns_false_when_no_expiration(
        self,
        db_session: Session,
        export_company: Company,
        export_service: ExportService,
    ) -> None:
        """Test that False is returned when expires_at is None."""
        job = export_service.create_job(company_id=export_company.id)

        assert job.expires_at is None
        assert export_service.is_job_expired(job) is False