"""User salary/hourly rate configuration for time cost calculation.

Accountants configure salary data per user so that time entries can be
costed.  Only users with accounting:configure permission can manage this.
"""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    Boolean, Date, DateTime, ForeignKey, Index, Integer,
    Numeric, String, func,
)
from sqlalchemy.orm import Mapped, mapped_column

from apps.api.db import Base


class UserSalaryConfig(Base):
    """Hourly rate and salary info for a user, configured by accounting.

    Multiple rows per user are allowed for historical rate changes.
    The *active* row is the one with `is_active = True` and the most
    recent `effective_date`.
    """
    __tablename__ = "user_salary_configs"
    __table_args__ = (
        Index("idx_salary_company_user", "company_id", "user_id"),
        Index("idx_salary_active", "company_id", "is_active"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    company_id: Mapped[int] = mapped_column(Integer, nullable=False)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False)

    # The employee's hourly rate (MXN). Used to calculate cost = hours x rate.
    hourly_rate: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)

    # Optional monthly salary for reference / display.
    monthly_salary: Mapped[Decimal | None] = mapped_column(Numeric(14, 2), nullable=True)

    # Currency (default MXN)
    currency: Mapped[str] = mapped_column(String(3), default="MXN")

    # When this rate takes effect
    effective_date: Mapped[date] = mapped_column(Date, nullable=False)

    # Whether this is the current active rate for the user
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    # Role at company (for display)
    role_title: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Cost center / project default for salary allocation
    default_cost_center_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    default_project_id: Mapped[int | None] = mapped_column(Integer, nullable=True)

    notes: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_by: Mapped[int | None] = mapped_column(Integer, ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())
