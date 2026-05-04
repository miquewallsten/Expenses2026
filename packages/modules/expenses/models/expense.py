from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import Boolean, CheckConstraint, Date, DateTime, Index, Integer, Numeric, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from apps.api.db import Base

# Allowed values for settlement_type
SETTLEMENT_TYPES = ("reimbursable", "corporate_card", "advance")

# Allowed expense status values — enforced at DB level.
EXPENSE_STATUSES = ("draft", "submitted", "manager_approved", "approved", "rejected")


class Expense(Base):
    __tablename__ = "expenses"
    __table_args__ = (
        CheckConstraint(
            "status IN ('draft','submitted','manager_approved','approved','rejected')",
            name="ck_expense_status_valid",
        ),
        CheckConstraint(
            "settlement_type IN ('reimbursable','corporate_card','advance')",
            name="ck_expense_settlement_type_valid",
        ),
        CheckConstraint(
            "amount >= 0",
            name="ck_expense_amount_non_negative",
        ),
        # Composite indexes for common query patterns
        Index('idx_expense_company_status', 'company_id', 'status'),
        Index('idx_expense_company_created', 'company_id', 'created_at'),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    company_id: Mapped[int] = mapped_column(index=True)
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    description: Mapped[str] = mapped_column(String(255), nullable=False)
    status: Mapped[str] = mapped_column(String(50), default="draft")
    # How this expense is settled.  Allowed: "reimbursable", "corporate_card",
    # "advance".  server_default ensures existing DB rows get the value when
    # the column is added via create_all / ALTER TABLE.
    settlement_type: Mapped[str] = mapped_column(
        String(20), default="reimbursable", server_default="reimbursable", nullable=False
    )
    mapping_snapshot: Mapped[str | None] = mapped_column(String(5000), nullable=True)
    detected_category: Mapped[str | None] = mapped_column(String(100), nullable=True)
    report_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    account_code: Mapped[str | None] = mapped_column(String(50), nullable=True)
    # Soft reference to AccountingCategory.code — no FK constraint yet.
    category_code: Mapped[str | None] = mapped_column(String(50), nullable=True)
    expense_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    # User-editable fields
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    tags: Mapped[str | None] = mapped_column(String(1000), nullable=True)  # JSON array of strings
    expense_type: Mapped[str | None] = mapped_column(String(100), nullable=True)
    # Phase 4.8 — SAT CFDI lifecycle (Anexo 24 + cancel watcher)
    cfdi_uuid: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    cfdi_status: Mapped[str | None] = mapped_column(String(20), nullable=True)
    cfdi_last_checked_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    cfdi_amount_mismatch: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default="false", nullable=False
    )
