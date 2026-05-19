from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from apps.api.db import Base


class AccountingSetup(Base):
    __tablename__ = "accounting_setup"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    company_id: Mapped[int] = mapped_column(Integer, ForeignKey("companies.id"), unique=True, index=True, nullable=False)

    # Setup mode: "setup" = accountants can modify config, "locked" = requires admin permission
    setup_mode: Mapped[str] = mapped_column(String(20), default="setup", nullable=False)

    # Who configured what - tracks which fields were set by accountants
    # so admin knows not to modify them
    configured_by: Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON: {"field": "accountant"|"admin", ...}
    last_configured_by: Mapped[str | None] = mapped_column(String(20), nullable=True)  # "accountant" or "admin"
    last_configured_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    # Accounting Operating Model
    # accounting_review_mode: "all" | "exceptions_only" | "none"
    accounting_review_mode: Mapped[str] = mapped_column(String(50), default="all", nullable=False)
    # manager_approval_mode: "disabled" | "all" | "threshold_only"
    manager_approval_mode: Mapped[str] = mapped_column(String(50), default="disabled", nullable=False)
    manager_approval_threshold_amount: Mapped[float | None] = mapped_column(Float, nullable=True)
    reimbursement_entity_required: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    poliza_required: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    archive_retention_years: Mapped[int] = mapped_column(Integer, default=5, nullable=False)

    # Expense Control Rules
    account_code_required: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    subaccount_required: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    auto_account_suggestion_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    cost_center_required: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    project_required: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    client_required: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    # Validation / Override
    allow_accounting_override: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    allow_submit_with_warnings: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    require_final_accounting_review_before_export: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # AI Assistance
    ai_accounting_assist_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    ai_accounting_notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Audit
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)
