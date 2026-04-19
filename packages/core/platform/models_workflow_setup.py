from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from apps.api.db import Base


class WorkflowSetup(Base):
    __tablename__ = "workflow_setup"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    company_id: Mapped[int] = mapped_column(Integer, ForeignKey("companies.id"), unique=True, index=True, nullable=False)

    # Workflow Behavior
    # default_expense_workflow_mode: "standard" | "manager_only" | "accounting_only" |
    #   "manager_then_accounting" | "direct_accounting" | "policy_driven"
    default_expense_workflow_mode: Mapped[str] = mapped_column(String(50), default="standard", nullable=False)
    auto_submit_on_complete_upload: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    block_submit_on_failed_validation: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    allow_submit_with_warnings: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    auto_assign_review_stage: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # Review Routing
    # route_policy_failures_to: "manager" | "accounting" | "employee" | "none"
    route_policy_failures_to: Mapped[str] = mapped_column(String(50), default="accounting", nullable=False)
    # route_missing_documents_to: "manager" | "accounting" | "employee" | "none"
    route_missing_documents_to: Mapped[str] = mapped_column(String(50), default="employee", nullable=False)
    # route_international_expenses_to: "manager" | "accounting" | "employee" | "none"
    route_international_expenses_to: Mapped[str] = mapped_column(String(50), default="accounting", nullable=False)

    # Employee Experience
    allow_draft_save: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    allow_resubmit_after_return: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    show_next_action_guidance: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # AI Assistance
    ai_workflow_assist_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    ai_workflow_notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Audit
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)
