from datetime import date, datetime

from sqlalchemy import Date, DateTime, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from apps.api.db import Base


class ExpenseReport(Base):
    __tablename__ = "expense_reports"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    company_id: Mapped[int] = mapped_column(Integer, index=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    status: Mapped[str] = mapped_column(String(50), default="draft")

    # Per-user report: which user's expenses are bundled here.
    # Null for manually composed multi-user reports.
    user_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)

    # The calendar period this bundle covers.
    period_start: Mapped[date | None] = mapped_column(Date, nullable=True)
    period_end: Mapped[date | None] = mapped_column(Date, nullable=True)

    # How this report was created: "auto" (scheduled cycle), "manual" (admin trigger), "user"
    triggered_by: Mapped[str] = mapped_column(String(20), default="user", server_default="user")

    # FK back to the cycle settings row that generated this report (nullable for user-created)
    cycle_settings_id: Mapped[int | None] = mapped_column(Integer, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
