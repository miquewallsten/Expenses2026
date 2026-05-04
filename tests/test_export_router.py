"""Tests for export_router API endpoints."""

from datetime import datetime, timedelta

import pytest
from packages.core.platform.models import Company
from packages.core.platform.models_export_job import ExportJob, ExportStatus, ExportType
from packages.core.platform.models_user import User


class TestExportRouter:
    """Tests for /admin/export endpoints."""

    def test_create_export_requires_auth(self, client):
        """Unauthenticated requests should return 401."""
        r = client.post("/admin/export", json={"export_type": "full"})
        assert r.status_code == 401

    def test_create_export_requires_admin(self, client, db_session, test_company):
        """Non-admin users should get 403."""
        user = User(
            full_name="Employee",
            email="employee@test.com",
            role="employee",
            company_id=test_company.id,
        )
        db_session.add(user)
        db_session.commit()

        r = client.post(
            "/admin/export",
            json={"export_type": "full"},
            headers={"X-User-Id": str(user.id)},
        )
        assert r.status_code == 403

    def test_create_full_export(self, client, db_session, test_company):
        """Admin can create a full export job."""
        admin = User(
            full_name="Admin",
            email="admin@test.com",
            role="admin",
            company_id=test_company.id,
        )
        db_session.add(admin)
        db_session.commit()

        r = client.post(
            "/admin/export",
            json={"export_type": "full"},
            headers={"X-User-Id": str(admin.id)},
        )
        assert r.status_code == 201
        data = r.json()
        assert data["company_id"] == test_company.id
        assert data["status"] == "pending"
        assert data["export_type"] == "full"

    def test_create_range_export_validates_dates(self, client, db_session, test_company):
        """Range export requires start_date and end_date."""
        admin = User(
            full_name="Admin",
            email="admin@test.com",
            role="admin",
            company_id=test_company.id,
        )
        db_session.add(admin)
        db_session.commit()

        # Missing dates
        r = client.post(
            "/admin/export",
            json={"export_type": "range"},
            headers={"X-User-Id": str(admin.id)},
        )
        assert r.status_code == 400
        assert "required" in r.json()["detail"].lower()

        # Invalid date range (start >= end)
        r = client.post(
            "/admin/export",
            json={
                "export_type": "range",
                "start_date": "2024-01-10T00:00:00",
                "end_date": "2024-01-05T00:00:00",
            },
            headers={"X-User-Id": str(admin.id)},
        )
        assert r.status_code == 400
        assert "before" in r.json()["detail"].lower()

    def test_create_range_export_success(self, client, db_session, test_company):
        """Range export with valid dates succeeds."""
        admin = User(
            full_name="Admin",
            email="admin@test.com",
            role="admin",
            company_id=test_company.id,
        )
        db_session.add(admin)
        db_session.commit()

        r = client.post(
            "/admin/export",
            json={
                "export_type": "range",
                "start_date": "2024-01-01T00:00:00",
                "end_date": "2024-01-31T23:59:59",
            },
            headers={"X-User-Id": str(admin.id)},
        )
        assert r.status_code == 201
        data = r.json()
        assert data["export_type"] == "range"

    def test_list_exports_requires_auth(self, client):
        """Unauthenticated requests should return 401."""
        r = client.get("/admin/export")
        assert r.status_code == 401

    def test_list_exports_empty(self, client, db_session, test_company):
        """Admin can list exports (empty list initially)."""
        admin = User(
            full_name="Admin",
            email="admin@test.com",
            role="admin",
            company_id=test_company.id,
        )
        db_session.add(admin)
        db_session.commit()

        r = client.get(
            "/admin/export",
            headers={"X-User-Id": str(admin.id)},
        )
        assert r.status_code == 200
        data = r.json()
        assert data["exports"] == []
        assert data["total"] == 0
        assert data["page"] == 1
        assert data["page_size"] == 20

    def test_list_exports_with_jobs(self, client, db_session, test_company):
        """List exports returns jobs for current company only."""
        # Create two companies
        other_company = Company(name="Other", slug="other-co")
        db_session.add(other_company)
        db_session.commit()

        admin = User(
            full_name="Admin",
            email="admin@test.com",
            role="admin",
            company_id=test_company.id,
        )
        db_session.add(admin)
        db_session.commit()

        # Create export jobs for both companies
        job1 = ExportJob(
            company_id=test_company.id,
            export_type=ExportType.FULL.value,
            status=ExportStatus.PENDING.value,
        )
        job2 = ExportJob(
            company_id=other_company.id,
            export_type=ExportType.FULL.value,
            status=ExportStatus.COMPLETE.value,
            download_url="https://example.com/export.zip",
        )
        db_session.add_all([job1, job2])
        db_session.commit()

        r = client.get(
            "/admin/export",
            headers={"X-User-Id": str(admin.id)},
        )
        assert r.status_code == 200
        data = r.json()
        assert data["total"] == 1
        assert len(data["exports"]) == 1
        assert data["exports"][0]["id"] == job1.id

    def test_list_exports_pagination(self, client, db_session, test_company):
        """Pagination works correctly."""
        admin = User(
            full_name="Admin",
            email="admin@test.com",
            role="admin",
            company_id=test_company.id,
        )
        db_session.add(admin)
        db_session.commit()

        # Create 25 export jobs
        for i in range(25):
            job = ExportJob(
                company_id=test_company.id,
                export_type=ExportType.FULL.value,
                status=ExportStatus.PENDING.value,
            )
            db_session.add(job)
        db_session.commit()

        # First page
        r = client.get(
            "/admin/export?page=1&page_size=10",
            headers={"X-User-Id": str(admin.id)},
        )
        assert r.status_code == 200
        data = r.json()
        assert len(data["exports"]) == 10
        assert data["total"] == 25
        assert data["page"] == 1
        assert data["page_size"] == 10

        # Second page
        r = client.get(
            "/admin/export?page=2&page_size=10",
            headers={"X-User-Id": str(admin.id)},
        )
        assert r.status_code == 200
        data = r.json()
        assert len(data["exports"]) == 10
        assert data["page"] == 2

        # Third page (remaining 5)
        r = client.get(
            "/admin/export?page=3&page_size=10",
            headers={"X-User-Id": str(admin.id)},
        )
        assert r.status_code == 200
        data = r.json()
        assert len(data["exports"]) == 5

    def test_get_export_status_requires_auth(self, client):
        """Unauthenticated requests should return 401."""
        r = client.get("/admin/export/1")
        assert r.status_code == 401

    def test_get_export_status_not_found(self, client, db_session, test_company):
        """Non-existent export returns 404."""
        admin = User(
            full_name="Admin",
            email="admin@test.com",
            role="admin",
            company_id=test_company.id,
        )
        db_session.add(admin)
        db_session.commit()

        r = client.get(
            "/admin/export/99999",
            headers={"X-User-Id": str(admin.id)},
        )
        assert r.status_code == 404

    def test_get_export_status_cross_company(self, client, db_session, test_company):
        """Cannot access export from another company."""
        other_company = Company(name="Other", slug="other-co2")
        db_session.add(other_company)
        db_session.commit()

        admin = User(
            full_name="Admin",
            email="admin@test.com",
            role="admin",
            company_id=test_company.id,
        )
        db_session.add(admin)
        db_session.commit()

        # Create export for other company
        job = ExportJob(
            company_id=other_company.id,
            export_type=ExportType.FULL.value,
            status=ExportStatus.COMPLETE.value,
        )
        db_session.add(job)
        db_session.commit()

        r = client.get(
            f"/admin/export/{job.id}",
            headers={"X-User-Id": str(admin.id)},
        )
        assert r.status_code == 403

    def test_get_export_status_success(self, client, db_session, test_company):
        """Can get status of own company's export."""
        admin = User(
            full_name="Admin",
            email="admin@test.com",
            role="admin",
            company_id=test_company.id,
        )
        db_session.add(admin)
        db_session.commit()

        job = ExportJob(
            company_id=test_company.id,
            export_type=ExportType.FULL.value,
            status=ExportStatus.PROCESSING.value,
        )
        db_session.add(job)
        db_session.commit()

        r = client.get(
            f"/admin/export/{job.id}",
            headers={"X-User-Id": str(admin.id)},
        )
        assert r.status_code == 200
        data = r.json()
        assert data["id"] == job.id
        assert data["status"] == "processing"

    def test_download_export_requires_auth(self, client):
        """Unauthenticated requests should return 401."""
        r = client.get("/admin/export/1/download")
        assert r.status_code == 401

    def test_download_export_not_found(self, client, db_session, test_company):
        """Non-existent export returns 404."""
        admin = User(
            full_name="Admin",
            email="admin@test.com",
            role="admin",
            company_id=test_company.id,
        )
        db_session.add(admin)
        db_session.commit()

        r = client.get(
            "/admin/export/99999/download",
            headers={"X-User-Id": str(admin.id)},
        )
        assert r.status_code == 404

    def test_download_export_not_ready(self, client, db_session, test_company):
        """Pending/processing exports return 400."""
        admin = User(
            full_name="Admin",
            email="admin@test.com",
            role="admin",
            company_id=test_company.id,
        )
        db_session.add(admin)
        db_session.commit()

        job = ExportJob(
            company_id=test_company.id,
            export_type=ExportType.FULL.value,
            status=ExportStatus.PENDING.value,
        )
        db_session.add(job)
        db_session.commit()

        r = client.get(
            f"/admin/export/{job.id}/download",
            headers={"X-User-Id": str(admin.id)},
        )
        assert r.status_code == 400
        assert "not ready" in r.json()["detail"].lower()

    def test_download_export_expired(self, client, db_session, test_company):
        """Expired download URL returns 410."""
        admin = User(
            full_name="Admin",
            email="admin@test.com",
            role="admin",
            company_id=test_company.id,
        )
        db_session.add(admin)
        db_session.commit()

        # Create completed export with expired URL
        job = ExportJob(
            company_id=test_company.id,
            export_type=ExportType.FULL.value,
            status=ExportStatus.COMPLETE.value,
            download_url="https://example.com/expired.zip",
            expires_at=datetime.now() - timedelta(days=1),
        )
        db_session.add(job)
        db_session.commit()

        r = client.get(
            f"/admin/export/{job.id}/download",
            headers={"X-User-Id": str(admin.id)},
        )
        assert r.status_code == 410

    def test_download_export_success(self, client, db_session, test_company):
        """Valid complete export returns download URL."""
        admin = User(
            full_name="Admin",
            email="admin@test.com",
            role="admin",
            company_id=test_company.id,
        )
        db_session.add(admin)
        db_session.commit()

        job = ExportJob(
            company_id=test_company.id,
            export_type=ExportType.FULL.value,
            status=ExportStatus.COMPLETE.value,
            download_url="https://example.com/export.zip",
            expires_at=datetime.now() + timedelta(days=7),
        )
        db_session.add(job)
        db_session.commit()

        r = client.get(
            f"/admin/export/{job.id}/download",
            headers={"X-User-Id": str(admin.id)},
        )
        assert r.status_code == 200
        data = r.json()
        assert data["download_url"] == "https://example.com/export.zip"

    def test_storage_usage_requires_auth(self, client):
        """Unauthenticated requests should return 401."""
        r = client.get("/admin/export/storage")
        assert r.status_code == 401

    def test_storage_usage_success(self, client, db_session, test_company):
        """Admin can get storage usage for their company."""
        admin = User(
            full_name="Admin",
            email="admin@test.com",
            role="admin",
            company_id=test_company.id,
        )
        db_session.add(admin)
        db_session.commit()

        r = client.get(
            "/admin/export/storage",
            headers={"X-User-Id": str(admin.id)},
        )
        assert r.status_code == 200
        data = r.json()
        assert "files_gb" in data
        assert "db_gb" in data
        assert "total_gb" in data
        assert "included_gb" in data
        assert "overage_gb" in data
        assert "overage_percent" in data
        assert "period_start" in data
        assert "period_end" in data

    def test_create_incremental_export(self, client, db_session, test_company):
        """Test creating an incremental export (data since last export)."""
        admin = User(
            full_name="Admin",
            email="admin@test.com",
            role="admin",
            company_id=test_company.id,
        )
        db_session.add(admin)
        db_session.commit()

        # First create a completed export to serve as the "last export"
        last_export = ExportJob(
            company_id=test_company.id,
            export_type=ExportType.FULL.value,
            status=ExportStatus.COMPLETE.value,
            completed_at=datetime.now() - timedelta(days=7),
            download_url="https://example.com/last-export.zip",
            expires_at=datetime.now() + timedelta(days=7),
        )
        db_session.add(last_export)
        db_session.commit()

        # Create an incremental export
        r = client.post(
            "/admin/export",
            json={"export_type": "incremental"},
            headers={"X-User-Id": str(admin.id)},
        )
        assert r.status_code == 201
        data = r.json()
        assert data["company_id"] == test_company.id
        assert data["status"] == "pending"
        assert data["export_type"] == "incremental"

        # Verify the incremental export's date_range_start is set to the previous export's completed_at
        # by querying the database directly (since response doesn't include date_range fields)
        incremental_job = (
            db_session.query(ExportJob)
            .filter(ExportJob.id == data["id"])
            .first()
        )
        assert incremental_job is not None
        assert incremental_job.date_range_start is not None
        # The date_range_start should match the last export's completed_at
        assert incremental_job.date_range_start == last_export.completed_at