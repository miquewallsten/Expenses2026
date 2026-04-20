"""
SQLAlchemy models for the Time & Activity Allocation module.

Tables:
  time_projects     — Projects (or work-orders) that staff log time against.
  time_activities   — Global activity / discipline catalog per company.
  time_assignments  — Which users are assigned to which projects (and their budget hours).
  time_entries      — Individual time-log lines (user × project × activity × day × hours).
"""

from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from apps.api.db import Base


# ── Projects ───────────────────────────────────────────────────────────────────

class TimeProject(Base):
    __tablename__ = "time_projects"
    __table_args__ = (
        CheckConstraint(
            "status IN ('active','inactive','completed','on_hold')",
            name="ck_time_project_status_valid",
        ),
        Index("ix_time_projects_company", "company_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    company_id: Mapped[int] = mapped_column(Integer, nullable=False)

    code: Mapped[str | None] = mapped_column(String(50), nullable=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    client: Mapped[str | None] = mapped_column(String(255), nullable=True)
    cost_center: Mapped[str | None] = mapped_column(String(100), nullable=True)
    discipline: Mapped[str | None] = mapped_column(String(100), nullable=True)

    status: Mapped[str] = mapped_column(String(20), default="active", nullable=False)

    budget_hours: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), nullable=True)
    start_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    end_date: Mapped[date | None] = mapped_column(Date, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


# ── Activity catalog ───────────────────────────────────────────────────────────

class TimeActivity(Base):
    __tablename__ = "time_activities"
    __table_args__ = (
        Index("ix_time_activities_company", "company_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    company_id: Mapped[int] = mapped_column(Integer, nullable=False)

    code: Mapped[str | None] = mapped_column(String(50), nullable=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    discipline: Mapped[str | None] = mapped_column(String(100), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


# ── Project assignments ────────────────────────────────────────────────────────

class TimeAssignment(Base):
    __tablename__ = "time_assignments"
    __table_args__ = (
        CheckConstraint(
            "role IN ('team_member','lead','coordinator')",
            name="ck_time_assignment_role_valid",
        ),
        UniqueConstraint("project_id", "user_id", name="uq_time_assignment_project_user"),
        Index("ix_time_assignments_project", "project_id"),
        Index("ix_time_assignments_user", "user_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    company_id: Mapped[int] = mapped_column(Integer, nullable=False)
    project_id: Mapped[int] = mapped_column(Integer, ForeignKey("time_projects.id", ondelete="CASCADE"), nullable=False)
    user_id: Mapped[int] = mapped_column(Integer, nullable=False)
    user_name: Mapped[str | None] = mapped_column(String(255), nullable=True)

    role: Mapped[str] = mapped_column(String(20), default="team_member", nullable=False)
    budget_hours: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


# ── Time entries ───────────────────────────────────────────────────────────────

class TimeEntry(Base):
    __tablename__ = "time_entries"
    __table_args__ = (
        CheckConstraint(
            "status IN ('draft','submitted','approved','rejected')",
            name="ck_time_entry_status_valid",
        ),
        CheckConstraint("hours > 0 AND hours <= 24", name="ck_time_entry_hours_range"),
        Index("ix_time_entries_company_user", "company_id", "user_id"),
        Index("ix_time_entries_project", "project_id"),
        Index("ix_time_entries_entry_date", "entry_date"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    company_id: Mapped[int] = mapped_column(Integer, nullable=False)
    user_id: Mapped[int] = mapped_column(Integer, nullable=False)
    user_name: Mapped[str | None] = mapped_column(String(255), nullable=True)

    project_id: Mapped[int] = mapped_column(Integer, ForeignKey("time_projects.id", ondelete="CASCADE"), nullable=False)
    activity_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("time_activities.id", ondelete="SET NULL"), nullable=True)

    entry_date: Mapped[date] = mapped_column(Date, nullable=False)
    hours: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    status: Mapped[str] = mapped_column(String(20), default="draft", nullable=False)

    # Week grouping helper — always Monday of the entry's ISO week
    week_start: Mapped[date] = mapped_column(Date, nullable=False, index=True)

    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    reviewer_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    reviewer_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    reviewer_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    rejection_reason: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
