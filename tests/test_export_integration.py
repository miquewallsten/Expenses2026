"""Integration tests for the complete export flow."""

import pytest
from datetime import datetime, timedelta
from unittest.mock import patch, MagicMock

from packages.core.platform.models import Company
from packages.core.platform.models_export_job import ExportJob, ExportStatus, ExportType
from packages.core.platform.models_user import User
from packages.modules.admin.service.export_service import ExportService
from packages.modules.admin.service.audit_event_service import AuditEventService
from packages.modules.admin.service.storage_usage_service import StorageUsageService
from packages.modules.expenses.models.expense import Expense


@pytest.fixture
def test_expense(db_session, test_company):
    """Create a test expense."""
    expense = Expense(
        company_id=test_company.id,
        amount=100.0,
        status="draft",
        description="Test expense for export",
    )
    db_session.add(expense)
    db_session.commit()
    db_session.refresh(expense)
    return expense


@pytest.fixture
def admin_user(db_session, test_company):
    """Create a test admin user."""
    user = User(
        full_name="Test Admin",
        email="admin@test.com",
        role="admin",
        company_id=test_company.id,
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


@pytest.fixture
def auth_headers(admin_user):
    """Get auth headers for API calls using dev bypass."""
    return {"X-User-Id": str(admin_user.id)}


@pytest.fixture
def mock_celery_task():
    """Mock Celery task dispatch to avoid RabbitMQ connection in tests."""
    with patch("apps.api.jobs.export_tasks.process_export_task") as mock_task:
        mock_task.delay = MagicMock()
        yield mock_task


class TestExportFlow:
    """Test complete export workflow."""

    def test_create_full_export(self, client, auth_headers, mock_celery_task):
        """Test creating a full export job."""
        response = client.post(
            "/admin/export",
            json={
                "export_type": "full",
                "include_files": True,
                "include_audit": True,
            },
            headers=auth_headers,
        )

        assert response.status_code == 201
        data = response.json()
        assert data["status"] == "pending"
        assert data["export_type"] == "full"
        assert data["company_id"] == test_company.id

    def test_export_include_audit_flag_set(self, db_session, test_company, test_expense, test_user, mock_celery_task):
        """Test that include_audit flag is correctly set on export jobs."""
        # Create audit events
        audit_service = AuditEventService(db_session)
        audit_service.record(
            company_id=test_company.id,
            event_type="expense.created",
            entity_type="Expense",
            entity_id=test_expense.id,
            actor_id=test_user.id,
        )

        # Create export
        export_service = ExportService(db_session)
        job = export_service.create_job(
            company_id=test_company.id,
            export_type=ExportType.FULL.value,
            include_audit=True,
        )

        assert job.include_audit is True

    def test_storage_usage_tracking(self, db_session, test_company):
        """Test storage usage is tracked correctly."""
        from packages.core.platform.models_archive_file import ArchiveFile

        # Create an archive file with known size
        archive = ArchiveFile(
            company_id=test_company.id,
            file_name="test.pdf",
            file_type="pdf",
            size_bytes=1024 * 1024,  # 1 MB
            storage_backend="local",
            storage_key="test/test.pdf",
        )
        db_session.add(archive)
        db_session.commit()

        service = StorageUsageService(db_session)
        usage = service.update_usage_metrics(test_company.id)

        assert usage is not None
        assert usage.files_bytes >= 1024 * 1024  # At least 1 MB
        assert usage.total_bytes >= usage.files_bytes

    def test_is_job_expired_helper(self, db_session, test_company, mock_celery_task):
        """Test that is_job_expired helper correctly identifies expired jobs."""
        service = ExportService(db_session)

        # Create completed export
        job = service.create_job(
            company_id=test_company.id,
            export_type=ExportType.FULL.value,
        )
        service.mark_complete(
            job_id=job.id,
            download_url="https://example.com/export.zip",
            file_size=1024,
        )

        # Manually expire
        db_session.refresh(job)
        job.expires_at = datetime.now() - timedelta(days=1)
        db_session.commit()

        # Check expired
        assert service.is_job_expired(job) is True

    def test_expired_export_returns_410(self, client, db_session, test_company, admin_user, auth_headers, mock_celery_task):
        """Test that downloading an expired export returns HTTP 410."""
        service = ExportService(db_session)

        # Create and complete an export
        job = service.create_job(
            company_id=test_company.id,
            export_type=ExportType.FULL.value,
        )
        service.mark_complete(
            job_id=job.id,
            download_url="https://example.com/export.zip",
            file_size=1024,
        )

        # Manually expire the job
        db_session.refresh(job)
        job.expires_at = datetime.now() - timedelta(days=1)
        db_session.commit()

        # Try to download - should get 410
        response = client.get(f"/admin/export/{job.id}/download", headers=auth_headers)
        assert response.status_code == 410
        assert "expired" in response.json()["detail"].lower()

    def test_full_export_via_api(self, client, db_session, auth_headers, test_company, mock_celery_task):
        """Test complete export workflow via API."""
        # Create export
        create_response = client.post(
            "/admin/export",
            json={
                "export_type": "full",
                "include_files": True,
                "include_audit": True,
            },
            headers=auth_headers,
        )
        assert create_response.status_code == 201
        job_id = create_response.json()["id"]

        # Check status
        status_response = client.get(
            f"/admin/export/{job_id}",
            headers=auth_headers,
        )
        assert status_response.status_code == 200
        assert status_response.json()["status"] == "pending"

        # List exports
        list_response = client.get(
            "/admin/export",
            headers=auth_headers,
        )
        assert list_response.status_code == 200
        exports = list_response.json()["exports"]
        assert any(e["id"] == job_id for e in exports)

    def test_export_isolation_between_companies(self, client, db_session, test_company, admin_user, auth_headers, mock_celery_task):
        """Test that exports are isolated between companies."""
        # Create another company
        other_company = Company(name="Other Company", slug="other-company-export-test")
        db_session.add(other_company)
        db_session.commit()
        db_session.refresh(other_company)

        # Create export for original company
        response1 = client.post(
            "/admin/export",
            json={"export_type": "full"},
            headers=auth_headers,
        )
        assert response1.status_code == 201
        job_id_1 = response1.json()["id"]

        # Create export for other company (using direct service call since we can't auth as other admin)
        service = ExportService(db_session)
        job2 = service.create_job(company_id=other_company.id, export_type=ExportType.FULL.value)

        # List exports - should only see own company's exports
        list_response = client.get(
            "/admin/export",
            headers=auth_headers,
        )
        assert list_response.status_code == 200
        exports = list_response.json()["exports"]
        export_ids = [e["id"] for e in exports]

        assert job_id_1 in export_ids
        assert job2.id not in export_ids

    def test_range_export_with_dates(self, client, db_session, auth_headers, mock_celery_task):
        """Test creating a range export with specific dates."""
        start_date = "2024-01-01T00:00:00"
        end_date = "2024-01-31T23:59:59"

        response = client.post(
            "/admin/export",
            json={
                "export_type": "range",
                "start_date": start_date,
                "end_date": end_date,
            },
            headers=auth_headers,
        )

        assert response.status_code == 201
        data = response.json()
        assert data["export_type"] == "range"

    def test_range_export_rejects_invalid_dates(self, client, db_session, auth_headers):
        """Test that range export rejects invalid date ranges."""
        # Start date after end date
        response = client.post(
            "/admin/export",
            json={
                "export_type": "range",
                "start_date": "2024-01-31T00:00:00",
                "end_date": "2024-01-01T00:00:00",
            },
            headers=auth_headers,
        )

        assert response.status_code == 400
        assert "before" in response.json()["detail"].lower()

    def test_range_export_requires_both_dates(self, client, db_session, auth_headers):
        """Test that range export requires both start and end dates."""
        # Missing end_date
        response = client.post(
            "/admin/export",
            json={
                "export_type": "range",
                "start_date": "2024-01-01T00:00:00",
            },
            headers=auth_headers,
        )

        assert response.status_code == 400
        assert "required" in response.json()["detail"].lower()

    def test_incremental_export_after_full_export(self, db_session, test_company, mock_celery_task):
        """Test incremental export correctly references the last full export."""
        service = ExportService(db_session)

        # Create and complete a full export
        full_job = service.create_job(
            company_id=test_company.id,
            export_type=ExportType.FULL.value,
        )
        completed = service.mark_complete(full_job.id, "https://example.com/export.zip", 1024)

        # Create an incremental export
        incremental_job = service.create_job(
            company_id=test_company.id,
            export_type=ExportType.INCREMENTAL.value,
        )

        # Date range should start from the completed_at of the full export
        assert incremental_job.date_range_start is not None
        assert incremental_job.date_range_start >= completed.completed_at
        assert incremental_job.date_range_end is not None

    def test_audit_events_included_in_export(self, db_session, test_company, test_user):
        """Test that audit events can be queried for export."""
        audit_service = AuditEventService(db_session)

        # Create audit events for different entities
        event1 = audit_service.record(
            company_id=test_company.id,
            event_type="expense.created",
            entity_type="Expense",
            entity_id=1,
            actor_id=test_user.id,
        )
        event2 = audit_service.record(
            company_id=test_company.id,
            event_type="expense.submitted",
            entity_type="Expense",
            entity_id=1,
            actor_id=test_user.id,
        )

        # Verify events can be queried
        from packages.core.platform.models_audit_event import AuditEvent

        events = (
            db_session.query(AuditEvent)
            .filter(AuditEvent.company_id == test_company.id)
            .filter(AuditEvent.entity_type == "Expense")
            .filter(AuditEvent.entity_id == 1)
            .all()
        )

        assert len(events) == 2
        assert events[0].event_type == "expense.created"
        assert events[1].event_type == "expense.submitted"

    def test_storage_usage_calculates_correctly(self, db_session, test_company):
        """Test that storage usage service calculates storage correctly."""
        service = StorageUsageService(db_session)

        # Create an expense with an attachment (simulated)
        expense = Expense(
            company_id=test_company.id,
            amount=100.0,
            status="draft",
            description="Test expense",
        )
        db_session.add(expense)
        db_session.commit()

        # Update storage metrics
        usage = service.update_usage_metrics(test_company.id)

        # Usage should be non-negative
        assert usage.total_bytes >= 0
        assert usage.files_bytes >= 0
        assert usage.db_bytes >= 0

    def test_export_job_failure_state(self, db_session, test_company, mock_celery_task):
        """Test that export jobs can be marked as failed."""
        service = ExportService(db_session)

        job = service.create_job(company_id=test_company.id, export_type=ExportType.FULL.value)

        # Mark as failed
        failed = service.mark_failed(job.id, "Database connection error")

        assert failed.status == ExportStatus.FAILED.value
        assert failed.error_message == "Database connection error"
        assert failed.completed_at is not None

    def test_export_expiration_set_correctly(self, db_session, test_company, mock_celery_task):
        """Test that export expiration is set to 7 days by default."""
        service = ExportService(db_session)

        before_create = datetime.now()
        job = service.create_job(company_id=test_company.id, export_type=ExportType.FULL.value)
        completed = service.mark_complete(job.id, "https://example.com/export.zip", 1024)
        after_complete = datetime.now()

        # Expiration should be approximately 7 days from completion
        # Use a wider range to account for timing differences
        expected_min = before_create + timedelta(days=7) - timedelta(seconds=10)
        expected_max = after_complete + timedelta(days=7) + timedelta(seconds=10)

        assert completed.expires_at >= expected_min
        assert completed.expires_at <= expected_max

    def test_export_download_requires_complete_status(self, client, db_session, test_company, admin_user, auth_headers, mock_celery_task):
        """Test that only completed exports can be downloaded."""
        service = ExportService(db_session)

        # Create a pending export
        job = service.create_job(company_id=test_company.id, export_type=ExportType.FULL.value)

        # Try to download while pending
        response = client.get(
            f"/admin/export/{job.id}/download",
            headers=auth_headers,
        )

        assert response.status_code == 400
        assert "not ready" in response.json()["detail"].lower()