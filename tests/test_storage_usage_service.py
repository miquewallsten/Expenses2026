"""Tests for StorageUsageService — storage calculation and tracking."""

from datetime import date, timedelta

import pytest
from sqlalchemy.orm import Session

from packages.core.platform.models import Company
from packages.core.platform.models_archive_file import ArchiveFile
from packages.core.platform.models_storage_usage import StorageUsage
from packages.modules.admin.service.storage_usage_service import StorageUsageService
from packages.modules.expenses.models.expense import Expense


@pytest.fixture
def storage_company(db_session: Session) -> Company:
    """Create a test company for storage tests."""
    company = Company(name="Storage Service Co", slug="storage-service-co")
    db_session.add(company)
    db_session.commit()
    db_session.refresh(company)
    return company


@pytest.fixture
def storage_service(db_session: Session) -> StorageUsageService:
    """Create a StorageUsageService instance."""
    return StorageUsageService(db_session)


class TestGetOrCreateMonthlyRecord:
    """Tests for get_or_create_monthly_record method."""

    def test_creates_new_record(
        self, db_session: Session, storage_company: Company, storage_service: StorageUsageService
    ) -> None:
        """Test creating a new monthly storage record."""
        period_date = date(2024, 5, 15)

        usage = storage_service.get_or_create_monthly_record(
            company_id=storage_company.id,
            period_date=period_date,
        )

        assert usage.id is not None
        assert usage.company_id == storage_company.id
        assert usage.period_start == date(2024, 5, 1)
        assert usage.period_end == date(2024, 5, 31)
        assert usage.included_bytes == StorageUsageService.DEFAULT_INCLUDED_BYTES
        assert usage.files_bytes == 0
        assert usage.db_bytes == 0

    def test_gets_existing_record(
        self, db_session: Session, storage_company: Company, storage_service: StorageUsageService
    ) -> None:
        """Test retrieving an existing monthly record."""
        # Create first record
        usage1 = storage_service.get_or_create_monthly_record(
            company_id=storage_company.id,
            period_date=date(2024, 5, 15),
        )

        # Request for same month should return same record
        usage2 = storage_service.get_or_create_monthly_record(
            company_id=storage_company.id,
            period_date=date(2024, 5, 20),  # Different day, same month
        )

        assert usage1.id == usage2.id

    def test_different_months_create_different_records(
        self, db_session: Session, storage_company: Company, storage_service: StorageUsageService
    ) -> None:
        """Test that different months create different records."""
        usage_may = storage_service.get_or_create_monthly_record(
            company_id=storage_company.id,
            period_date=date(2024, 5, 15),
        )

        usage_june = storage_service.get_or_create_monthly_record(
            company_id=storage_company.id,
            period_date=date(2024, 6, 15),
        )

        assert usage_may.id != usage_june.id
        assert usage_may.period_start == date(2024, 5, 1)
        assert usage_june.period_start == date(2024, 6, 1)

    def test_custom_included_bytes(
        self, db_session: Session, storage_company: Company, storage_service: StorageUsageService
    ) -> None:
        """Test creating record with custom included_bytes."""
        custom_quota = 20_000_000_000  # 20 GB

        usage = storage_service.get_or_create_monthly_record(
            company_id=storage_company.id,
            period_date=date(2024, 5, 15),
            included_bytes=custom_quota,
        )

        assert usage.included_bytes == custom_quota

    def test_default_today_if_no_period(
        self, db_session: Session, storage_company: Company, storage_service: StorageUsageService
    ) -> None:
        """Test that today's date is used if period_date not provided."""
        today = date.today()
        expected_start = date(today.year, today.month, 1)

        usage = storage_service.get_or_create_monthly_record(
            company_id=storage_company.id,
        )

        assert usage.period_start == expected_start

    def test_handles_february(
        self, db_session: Session, storage_company: Company, storage_service: StorageUsageService
    ) -> None:
        """Test that February period_end is calculated correctly."""
        usage = storage_service.get_or_create_monthly_record(
            company_id=storage_company.id,
            period_date=date(2024, 2, 15),  # 2024 is leap year
        )

        assert usage.period_start == date(2024, 2, 1)
        assert usage.period_end == date(2024, 2, 29)  # Leap year


class TestCalculateFileStorage:
    """Tests for calculate_file_storage method."""

    def test_empty_storage(
        self, db_session: Session, storage_company: Company, storage_service: StorageUsageService
    ) -> None:
        """Test calculation with no files."""
        storage = storage_service.calculate_file_storage(storage_company.id)

        assert storage == 0

    def test_estimates_by_file_count(
        self, db_session: Session, storage_company: Company, storage_service: StorageUsageService
    ) -> None:
        """Test that file storage is estimated based on file count."""
        # Create multiple archive files
        for i in range(10):
            file = ArchiveFile(
                company_id=storage_company.id,
                file_name=f"test_{i}.pdf",
                file_type="pdf",
                storage_backend="local",
                storage_key=f"/files/{i}.pdf",
            )
            db_session.add(file)
        db_session.commit()

        storage = storage_service.calculate_file_storage(storage_company.id)

        # 10 files * 250 KB estimate
        expected = 10 * StorageUsageService.ESTIMATED_BYTES_PER_FILE
        assert storage == expected

    def test_isolated_per_company(
        self, db_session: Session, storage_service: StorageUsageService
    ) -> None:
        """Test that file storage is isolated per company."""
        # Create two companies
        company1 = Company(name="Files Co 1", slug="files-co-1")
        company2 = Company(name="Files Co 2", slug="files-co-2")
        db_session.add_all([company1, company2])
        db_session.commit()
        db_session.refresh(company1)
        db_session.refresh(company2)

        # Add files to company1 only
        for i in range(5):
            file = ArchiveFile(
                company_id=company1.id,
                file_name=f"file_{i}.pdf",
                file_type="pdf",
                storage_backend="local",
                storage_key=f"/files/{i}.pdf",
            )
            db_session.add(file)
        db_session.commit()

        storage1 = storage_service.calculate_file_storage(company1.id)
        storage2 = storage_service.calculate_file_storage(company2.id)

        assert storage1 == 5 * StorageUsageService.ESTIMATED_BYTES_PER_FILE
        assert storage2 == 0


class TestEstimateDbStorage:
    """Tests for estimate_db_storage method."""

    def test_empty_db(
        self, db_session: Session, storage_company: Company, storage_service: StorageUsageService
    ) -> None:
        """Test estimation with no expenses."""
        storage = storage_service.estimate_db_storage(storage_company.id)

        assert storage == 0

    def test_estimates_by_expense_count(
        self, db_session: Session, storage_company: Company, storage_service: StorageUsageService
    ) -> None:
        """Test that DB storage is estimated based on expense count."""
        from decimal import Decimal

        # Create multiple expenses
        for i in range(20):
            expense = Expense(
                company_id=storage_company.id,
                amount=Decimal("100.00"),
                description=f"Test expense {i}",
                status="draft",
            )
            db_session.add(expense)
        db_session.commit()

        storage = storage_service.estimate_db_storage(storage_company.id)

        # 20 expenses * 500 bytes * 5x multiplier
        expected = 20 * StorageUsageService.ESTIMATED_BYTES_PER_EXPENSE * StorageUsageService.EXPENSE_RELATED_MULTIPLIER
        assert storage == expected

    def test_isolated_per_company(
        self, db_session: Session, storage_service: StorageUsageService
    ) -> None:
        """Test that DB storage is isolated per company."""
        from decimal import Decimal

        # Create two companies
        company1 = Company(name="DB Co 1", slug="db-co-1")
        company2 = Company(name="DB Co 2", slug="db-co-2")
        db_session.add_all([company1, company2])
        db_session.commit()
        db_session.refresh(company1)
        db_session.refresh(company2)

        # Add expenses to company1 only
        for i in range(10):
            expense = Expense(
                company_id=company1.id,
                amount=Decimal("50.00"),
                description=f"Expense {i}",
                status="draft",
            )
            db_session.add(expense)
        db_session.commit()

        storage1 = storage_service.estimate_db_storage(company1.id)
        storage2 = storage_service.estimate_db_storage(company2.id)

        assert storage1 == 10 * StorageUsageService.ESTIMATED_BYTES_PER_EXPENSE * StorageUsageService.EXPENSE_RELATED_MULTIPLIER
        assert storage2 == 0


class TestUpdateUsageMetrics:
    """Tests for update_usage_metrics method."""

    def test_updates_all_metrics(
        self, db_session: Session, storage_company: Company, storage_service: StorageUsageService
    ) -> None:
        """Test that update_usage_metrics calculates and stores all metrics."""
        from decimal import Decimal

        # Create some files and expenses
        file = ArchiveFile(
            company_id=storage_company.id,
            file_name="receipt.pdf",
            file_type="pdf",
            storage_backend="local",
            storage_key="/files/receipt.pdf",
        )
        expense = Expense(
            company_id=storage_company.id,
            amount=Decimal("100.00"),
            description="Test expense",
            status="draft",
        )
        db_session.add_all([file, expense])
        db_session.commit()

        usage = storage_service.update_usage_metrics(storage_company.id)

        assert usage.id is not None
        assert usage.files_bytes == StorageUsageService.ESTIMATED_BYTES_PER_FILE
        assert usage.db_bytes == StorageUsageService.ESTIMATED_BYTES_PER_EXPENSE * StorageUsageService.EXPENSE_RELATED_MULTIPLIER
        assert usage.total_bytes == usage.files_bytes + usage.db_bytes
        assert usage.overage_bytes == 0  # Under quota

    def test_calculates_overage(
        self, db_session: Session, storage_company: Company, storage_service: StorageUsageService
    ) -> None:
        """Test that overage is calculated when usage exceeds quota."""
        from decimal import Decimal

        # Set a low quota for testing
        low_quota = 1_000  # 1 KB

        # Create many expenses to exceed quota
        for i in range(100):
            expense = Expense(
                company_id=storage_company.id,
                amount=Decimal("10.00"),
                description=f"Expense {i}",
                status="draft",
            )
            db_session.add(expense)
        db_session.commit()

        usage = storage_service.update_usage_metrics(
            company_id=storage_company.id,
            included_bytes=low_quota,
        )

        assert usage.included_bytes == low_quota
        assert usage.total_bytes > low_quota
        assert usage.overage_bytes == usage.total_bytes - low_quota

    def test_zero_overage_when_under_quota(
        self, db_session: Session, storage_company: Company, storage_service: StorageUsageService
    ) -> None:
        """Test that overage is zero when total under quota."""
        usage = storage_service.update_usage_metrics(storage_company.id)

        assert usage.total_bytes == 0
        assert usage.overage_bytes == 0


class TestGetUsageSummary:
    """Tests for get_usage_summary method."""

    def test_returns_summary_dict(
        self, db_session: Session, storage_company: Company, storage_service: StorageUsageService
    ) -> None:
        """Test that get_usage_summary returns properly formatted dict."""
        summary = storage_service.get_usage_summary(storage_company.id)

        assert "files_gb" in summary
        assert "db_gb" in summary
        assert "total_gb" in summary
        assert "included_gb" in summary
        assert "overage_gb" in summary
        assert "overage_percent" in summary
        assert "period_start" in summary
        assert "period_end" in summary
        assert "calculated_at" in summary

    def test_converts_bytes_to_gb(
        self, db_session: Session, storage_company: Company, storage_service: StorageUsageService
    ) -> None:
        """Test that bytes are correctly converted to GB."""
        from decimal import Decimal

        # Create known amount of files
        for i in range(4):
            file = ArchiveFile(
                company_id=storage_company.id,
                file_name=f"file_{i}.pdf",
                file_type="pdf",
                storage_backend="local",
                storage_key=f"/files/{i}.pdf",
            )
            db_session.add(file)
        db_session.commit()

        summary = storage_service.get_usage_summary(storage_company.id)

        # 4 files * 250KB = 1MB = 0.001 GB
        expected_files_gb = round((4 * 250_000) / 1_000_000_000, 2)
        assert summary["files_gb"] == expected_files_gb
        assert summary["total_gb"] == summary["files_gb"] + summary["db_gb"]

    def test_overage_percent_calculation(
        self, db_session: Session, storage_company: Company, storage_service: StorageUsageService
    ) -> None:
        """Test that overage_percent is calculated correctly."""
        from decimal import Decimal

        # Create enough expenses to exceed low quota
        low_quota = 100_000  # 100 KB

        for i in range(500):
            expense = Expense(
                company_id=storage_company.id,
                amount=Decimal("5.00"),
                description=f"Expense {i}",
                status="draft",
            )
            db_session.add(expense)
        db_session.commit()

        usage = storage_service.get_or_create_monthly_record(
            company_id=storage_company.id,
            included_bytes=low_quota,
        )

        summary = storage_service.get_usage_summary(storage_company.id)

        # Should have overage since we created many expenses
        if summary["overage_gb"] > 0:
            assert summary["overage_percent"] > 0

    def test_zero_overage_percent_under_quota(
        self, db_session: Session, storage_company: Company, storage_service: StorageUsageService
    ) -> None:
        """Test that overage_percent is 0 when under quota."""
        summary = storage_service.get_usage_summary(storage_company.id)

        assert summary["overage_percent"] == 0.0