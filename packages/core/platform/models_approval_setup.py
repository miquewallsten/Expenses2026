from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from apps.api.db import Base


class ApprovalSetup(Base):
    __tablename__ = "approval_setup"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    company_id: Mapped[int] = mapped_column(Integer, ForeignKey("companies.id"), unique=True, index=True, nullable=False)

    # Approval Model
    # approval_mode: "none" | "manager_only" | "accounting_only" | "manager_then_accounting" | "threshold_based"
    approval_mode: Mapped[str] = mapped_column(String(50), default="none", nullable=False)
    manager_threshold_amount: Mapped[float | None] = mapped_column(Float, nullable=True)
    accounting_threshold_amount: Mapped[float | None] = mapped_column(Float, nullable=True)

    # Routing Rules
    require_manager_for_all_employees: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    require_accounting_for_all_expenses: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    allow_self_submission_without_manager: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    allow_resubmission_after_rejection: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # Escalation / Exceptions
    escalate_policy_failures_to_accounting: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    escalate_international_to_accounting: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    escalate_missing_documents_to_manager: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    # AI Assistance
    ai_approval_assist_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    ai_approval_notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Audit
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)
