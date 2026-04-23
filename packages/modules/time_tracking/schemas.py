"""
Pydantic schemas for the Time & Activity Allocation module.
"""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict


# ── Projects ───────────────────────────────────────────────────────────────────

class TimeProjectCreate(BaseModel):
    code: str | None = None
    name: str
    description: str | None = None
    client: str | None = None
    cost_center: str | None = None
    discipline: str | None = None
    status: str = "active"
    budget_hours: Decimal | None = None
    start_date: date | None = None
    end_date: date | None = None


class TimeProjectUpdate(BaseModel):
    code: str | None = None
    name: str | None = None
    description: str | None = None
    client: str | None = None
    cost_center: str | None = None
    discipline: str | None = None
    status: str | None = None
    budget_hours: Decimal | None = None
    start_date: date | None = None
    end_date: date | None = None


class TimeProjectRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    company_id: int
    code: str | None
    name: str
    description: str | None
    client: str | None
    cost_center: str | None
    discipline: str | None
    status: str
    budget_hours: Decimal | None
    start_date: date | None
    end_date: date | None
    created_at: datetime
    updated_at: datetime


# ── Activities ─────────────────────────────────────────────────────────────────

class TimeActivityCreate(BaseModel):
    code: str | None = None
    name: str
    discipline: str | None = None
    is_active: bool = True


class TimeActivityRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    company_id: int
    code: str | None
    name: str
    discipline: str | None
    is_active: bool
    created_at: datetime


# ── Assignments ────────────────────────────────────────────────────────────────

class TimeAssignmentCreate(BaseModel):
    user_id: int
    user_name: str | None = None
    role: str = "team_member"
    budget_hours: Decimal | None = None


class TimeAssignmentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    company_id: int
    project_id: int
    user_id: int
    user_name: str | None
    role: str
    budget_hours: Decimal | None
    is_active: bool
    created_at: datetime


# ── Time entries ───────────────────────────────────────────────────────────────

class TimeEntryUpsert(BaseModel):
    """Create or update a single time entry."""
    project_id: int
    activity_id: int | None = None
    entry_date: date
    hours: Decimal
    description: str | None = None


class TimeEntryRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    company_id: int
    user_id: int
    user_name: str | None
    project_id: int
    activity_id: int | None
    entry_date: date
    hours: Decimal
    description: str | None
    status: str
    week_start: date
    submitted_at: datetime | None
    reviewed_at: datetime | None
    reviewer_id: int | None
    reviewer_name: str | None
    reviewer_notes: str | None
    rejection_reason: str | None
    created_at: datetime
    updated_at: datetime


# ── Week view ──────────────────────────────────────────────────────────────────

class WeekRow(BaseModel):
    """One project row in the weekly timesheet grid."""
    project_id: int
    project_name: str
    project_code: str | None
    activity_id: int | None
    activity_name: str | None
    # Map of ISO date string → entry id (None if no entry exists yet)
    entry_ids: dict[str, int | None]
    # Map of ISO date string → hours (0 if no entry)
    hours: dict[str, Decimal]
    # Map of ISO date string → status ('draft'/'submitted'/'approved'/'rejected'/'')
    statuses: dict[str, str]


class WeekView(BaseModel):
    """Full weekly timesheet for one user."""
    week_start: date  # Monday
    week_end: date    # Sunday
    days: list[date]  # [Mon, Tue, Wed, Thu, Fri, Sat, Sun]
    rows: list[WeekRow]
    daily_totals: dict[str, Decimal]
    week_total: Decimal
    # Overall submission state for this week
    week_status: str  # 'empty' | 'draft' | 'submitted' | 'approved' | 'rejected' | 'partial'


# ── Reviewer actions ───────────────────────────────────────────────────────────

class ReviewAction(BaseModel):
    notes: str | None = None
    rejection_reason: str | None = None


# ── Incoming (coordinator) ─────────────────────────────────────────────────────

class SubmittedWeek(BaseModel):
    """Summary row shown in the coordinator's incoming queue."""
    user_id: int
    user_name: str | None
    week_start: date
    total_hours: Decimal
    entry_count: int
    status: str  # 'submitted' | 'partially_approved' | 'approved' | 'rejected'
    entry_ids: list[int]


# ── Reports ────────────────────────────────────────────────────────────────────

class ProjectReport(BaseModel):
    project_id: int
    project_name: str
    project_code: str | None
    budget_hours: Decimal | None
    logged_hours: Decimal
    approved_hours: Decimal
    utilization_pct: float | None  # approved / budget * 100
    user_breakdown: list[dict]  # [{user_id, user_name, hours}]


class UserReport(BaseModel):
    user_id: int
    user_name: str | None
    total_hours: Decimal
    approved_hours: Decimal
    project_breakdown: list[dict]  # [{project_id, project_name, hours}]
