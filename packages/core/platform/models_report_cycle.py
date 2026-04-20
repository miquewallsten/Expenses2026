from datetime import datetime

from sqlalchemy import Boolean, DateTime, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from apps.api.db import Base


class ReportCycleSettings(Base):
    """Per-company configuration for automatic expense report generation."""

    __tablename__ = "report_cycle_settings"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    company_id: Mapped[int] = mapped_column(Integer, unique=True, index=True, nullable=False)

    # Master switch
    enabled: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")

    # Schedule — "weekly" | "biweekly" | "monthly" | "manual"
    frequency: Mapped[str] = mapped_column(String(20), default="monthly", server_default="monthly")

    # day_of_week: 0=Monday … 6=Sunday (used for weekly / biweekly)
    day_of_week: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # day_of_month: 1–28 (used for monthly)
    day_of_month: Mapped[int | None] = mapped_column(Integer, nullable=True, default=1, server_default="1")

    # HH:MM in 24-hour format, interpreted in the company's timezone
    time_of_day: Mapped[str] = mapped_column(String(5), default="18:00", server_default="18:00")

    # If True, reports are automatically submitted to the approval flow after bundling.
    # If False, reports are created as "draft" so the admin can review first.
    auto_submit: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")

    # Comma-separated list of expense statuses to include in the bundle.
    # Default: submitted,manager_approved — expenses that have passed validation
    # and are waiting in the holding pattern.
    bundle_statuses: Mapped[str] = mapped_column(
        String(200),
        default="submitted,manager_approved",
        server_default="submitted,manager_approved",
    )

    # Jinja-style template for report titles.
    # Tokens: {user}, {email}, {month}, {year}, {date}
    report_name_template: Mapped[str] = mapped_column(
        String(255),
        default="{user} — {month} {year}",
        server_default="{user} — {month} {year}",
    )

    last_run_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    next_run_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )
