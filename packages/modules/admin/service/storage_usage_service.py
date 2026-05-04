"""Service for calculating and tracking storage usage metrics."""

from calendar import monthrange
from datetime import UTC, date, datetime

from sqlalchemy import func
from sqlalchemy.orm import Session

from packages.core.platform.models_archive_file import ArchiveFile
from packages.core.platform.models_storage_usage import StorageUsage
from packages.modules.expenses.models.expense import Expense


class StorageUsageService:
    """Service for calculating and tracking storage usage.

    Provides methods to:
    - Calculate file storage (ArchiveFile)
    - Estimate database storage (Expense + related tables)
    - Track monthly usage metrics
    - Compute overage for billing
    """

    DEFAULT_INCLUDED_BYTES = 10_000_000_000  # 10 GB
    ESTIMATED_BYTES_PER_FILE = 250_000  # 250 KB default when size unknown
    ESTIMATED_BYTES_PER_EXPENSE = 500  # Base row size
    EXPENSE_RELATED_MULTIPLIER = 5  # Account for documents, approvals, etc.

    def __init__(self, db: Session):
        self.db = db

    def get_or_create_monthly_record(
        self,
        company_id: int,
        period_date: date | None = None,
        included_bytes: int | None = None,
    ) -> StorageUsage:
        """Get or create the usage record for a specific month.

        Args:
            company_id: Tenant identifier
            period_date: Any date in the billing period (defaults to today)
            included_bytes: Storage quota (defaults to 10 GB)

        Returns:
            StorageUsage record for the period
        """
        if period_date is None:
            period_date = date.today()

        # Calculate period boundaries (first day to last day of month)
        period_start = date(period_date.year, period_date.month, 1)
        _, last_day = monthrange(period_date.year, period_date.month)
        period_end = date(period_date.year, period_date.month, last_day)

        # Try to get existing record
        existing = (
            self.db.query(StorageUsage)
            .filter(StorageUsage.company_id == company_id)
            .filter(StorageUsage.period_start == period_start)
            .filter(StorageUsage.period_end == period_end)
            .first()
        )

        if existing:
            return existing

        # Create new record with defaults
        if included_bytes is None:
            included_bytes = self.DEFAULT_INCLUDED_BYTES

        usage = StorageUsage(
            company_id=company_id,
            period_start=period_start,
            period_end=period_end,
            files_bytes=0,
            db_bytes=0,
            total_bytes=0,
            included_bytes=included_bytes,
            overage_bytes=0,
        )
        self.db.add(usage)
        self.db.commit()
        self.db.refresh(usage)

        return usage

    def calculate_file_storage(self, company_id: int) -> int:
        """Calculate total file storage for a company.

        Sums file sizes from ArchiveFile records. If size_bytes is not
        available (legacy data), estimates based on file count.

        Args:
            company_id: Tenant identifier

        Returns:
            Total bytes used by files
        """
        # Try to sum actual sizes first
        total_size = (
            self.db.query(func.sum(ArchiveFile.size_bytes))
            .filter(ArchiveFile.company_id == company_id)
            .scalar()
        )

        if total_size:
            return total_size

        # Fallback for legacy data without size_bytes: estimate based on count
        file_count = (
            self.db.query(func.count(ArchiveFile.id))
            .filter(ArchiveFile.company_id == company_id)
            .scalar()
        )

        if file_count == 0:
            return 0

        # Estimate: 250 KB per file
        return file_count * self.ESTIMATED_BYTES_PER_FILE

    def estimate_db_storage(self, company_id: int) -> int:
        """Estimate database storage for a company.

        Estimates based on Expense count and related tables.
        Uses a multiplier to account for documents, approvals, tags, etc.

        Args:
            company_id: Tenant identifier

        Returns:
            Estimated bytes used by database records
        """
        # Count expenses for this company
        expense_count = (
            self.db.query(func.count(Expense.id))
            .filter(Expense.company_id == company_id)
            .scalar()
        )

        if expense_count == 0:
            return 0

        # Estimate: base row size * count * multiplier for related tables
        # Related tables: ExpenseDocument, ExpenseAttachment, ValidationResult, etc.
        base_estimate = expense_count * self.ESTIMATED_BYTES_PER_EXPENSE
        return base_estimate * self.EXPENSE_RELATED_MULTIPLIER

    def update_usage_metrics(
        self,
        company_id: int,
        included_bytes: int | None = None,
    ) -> StorageUsage:
        """Update storage metrics for a company.

        Recalculates file storage, DB storage, total, and overage.
        Creates a new monthly record if needed.

        Args:
            company_id: Tenant identifier
            included_bytes: Storage quota (defaults to 10 GB)

        Returns:
            Updated StorageUsage record
        """
        # Get or create monthly record
        usage = self.get_or_create_monthly_record(
            company_id=company_id,
            included_bytes=included_bytes,
        )

        # Calculate metrics
        files_bytes = self.calculate_file_storage(company_id)
        db_bytes = self.estimate_db_storage(company_id)
        total_bytes = files_bytes + db_bytes

        # Calculate overage
        overage_bytes = max(0, total_bytes - usage.included_bytes)

        # Update record
        usage.files_bytes = files_bytes
        usage.db_bytes = db_bytes
        usage.total_bytes = total_bytes
        usage.overage_bytes = overage_bytes
        usage.calculated_at = datetime.now(UTC)

        self.db.commit()
        self.db.refresh(usage)

        return usage

    def get_usage_summary(self, company_id: int) -> dict:
        """Get a human-readable summary of storage usage.

        Returns:
            Dict with files_gb, db_gb, total_gb, included_gb, overage_gb, overage_percent
        """
        usage = self.update_usage_metrics(company_id)

        def bytes_to_gb(b: int) -> float:
            """Convert bytes to gigabytes (decimal)."""
            return round(b / 1_000_000_000, 2)

        total_gb = bytes_to_gb(usage.total_bytes)
        included_gb = bytes_to_gb(usage.included_bytes)

        # Calculate overage percentage (0-100+)
        if usage.total_bytes <= usage.included_bytes:
            overage_percent = 0.0
        else:
            overage_percent = round(
                (usage.overage_bytes / usage.included_bytes) * 100, 1
            )

        return {
            "files_gb": bytes_to_gb(usage.files_bytes),
            "db_gb": bytes_to_gb(usage.db_bytes),
            "total_gb": total_gb,
            "included_gb": included_gb,
            "overage_gb": bytes_to_gb(usage.overage_bytes),
            "overage_percent": overage_percent,
            "period_start": usage.period_start.isoformat(),
            "period_end": usage.period_end.isoformat(),
            "calculated_at": usage.calculated_at.isoformat(),
        }