"""Storage usage tracking for billing and quota enforcement.

Tracks monthly storage consumption per tenant:
- Files uploaded (receipts, documents)
- Database records
- Total consumption vs included quota
- Overage for billing

Records are created once per billing period per company.
"""

from datetime import date, datetime

from sqlalchemy import BigInteger, Date, DateTime, ForeignKey, Index, Integer, Boolean, func
from sqlalchemy.orm import Mapped, mapped_column

from apps.api.db import Base


class StorageUsage(Base):
    """Monthly storage usage record for a tenant.

    Attributes:
        company_id: Tenant identifier
        period_start: Start of billing period
        period_end: End of billing period
        files_bytes: Storage used by uploaded files
        db_bytes: Storage used by database records
        total_bytes: Total storage (files + db)
        included_bytes: Quota included in plan (default 10 GB)
        overage_bytes: Bytes over quota (for billing)
        calculated_at: When this record was computed
        billed: Whether overage has been billed
        billed_at: When overage was billed

    Unique constraint ensures one record per company per period.
    """

    __tablename__ = "storage_usage"
    __table_args__ = (
        Index(
            "ix_storage_usage_company_period",
            "company_id",
            "period_start",
            "period_end",
            unique=True,
        ),
    )

    # Primary key
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)

    # Tenant identifier
    company_id: Mapped[int] = mapped_column(Integer, ForeignKey("companies.id"), nullable=False, index=True)

    # Billing period
    period_start: Mapped[date] = mapped_column(Date, nullable=False)
    period_end: Mapped[date] = mapped_column(Date, nullable=False)

    # Metrics (in bytes)
    files_bytes: Mapped[int] = mapped_column(BigInteger, default=0)
    db_bytes: Mapped[int] = mapped_column(BigInteger, default=0)
    total_bytes: Mapped[int] = mapped_column(BigInteger, default=0)

    # Billing
    included_bytes: Mapped[int] = mapped_column(
        BigInteger, default=10_000_000_000
    )  # 10 GB default
    overage_bytes: Mapped[int] = mapped_column(BigInteger, default=0)

    # Status
    calculated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False
    )
    billed: Mapped[bool] = mapped_column(default=False)
    billed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)