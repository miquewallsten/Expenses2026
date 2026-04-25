from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from apps.api.db import Base


class CompanySetup(Base):
    __tablename__ = "company_setup"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    company_id: Mapped[int] = mapped_column(Integer, ForeignKey("companies.id"), unique=True, index=True, nullable=False)

    # Identity
    display_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    logo_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    country_code: Mapped[str | None] = mapped_column(String(10), nullable=True)
    base_currency: Mapped[str | None] = mapped_column(String(10), nullable=True)
    timezone: Mapped[str | None] = mapped_column(String(100), nullable=True)
    language_code: Mapped[str | None] = mapped_column(String(20), nullable=True)
    industry: Mapped[str | None] = mapped_column(String(100), nullable=True)

    # Organization
    employee_count_range: Mapped[str | None] = mapped_column(String(50), nullable=True)
    has_managers: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    # Operating Model
    allocation_dimensions: Mapped[str] = mapped_column(String(255), default="project_client_cost_center", nullable=False)
    allow_split_allocations: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # Modules
    expenses_module_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    time_allocation_module_enabled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    subcontractor_module_enabled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    approvals_module_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    accounting_module_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    archive_module_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    purchase_requests_module_enabled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    amex_reconciliation_module_enabled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    # AI context (fed to Copilot prompts; not behavioral)
    ai_setup_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    ai_setup_last_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    company_profile_narrative: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Audit
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)
