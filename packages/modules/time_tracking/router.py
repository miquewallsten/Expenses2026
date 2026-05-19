"""
FastAPI router for the Time & Activity Allocation module.

URL prefix: /time
"""

from __future__ import annotations

from datetime import date, datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict
from sqlalchemy.orm import Session

from apps.api.deps import get_db
from packages.core.platform.module_gate import require_module
from packages.modules.time_tracking import service as svc
from packages.modules.time_tracking.schemas import (
    ProjectReport,
    ReviewAction,
    SubmittedWeek,
    TimeActivityCreate,
    TimeActivityRead,
    TimeAssignmentCreate,
    TimeAssignmentRead,
    TimeEntryRead,
    TimeEntryUpsert,
    TimeProjectCreate,
    TimeProjectRead,
    TimeProjectUpdate,
    UserReport,
    WeekView,
)

router = APIRouter(
    prefix="/time",
    tags=["time-tracking"],
    dependencies=[Depends(require_module("time_allocation"))],
)


# ── Projects ───────────────────────────────────────────────────────────────────

@router.get("/{company_id}/projects", response_model=list[TimeProjectRead])
def list_projects(company_id: int, db: Session = Depends(get_db)):
    return svc.list_projects(db, company_id)


@router.post("/{company_id}/projects", response_model=TimeProjectRead)
def create_project(company_id: int, data: TimeProjectCreate, db: Session = Depends(get_db)):
    return svc.create_project(db, company_id, data)


@router.put("/{company_id}/projects/{project_id}", response_model=TimeProjectRead)
def update_project(company_id: int, project_id: int, data: TimeProjectUpdate, db: Session = Depends(get_db)):
    result = svc.update_project(db, company_id, project_id, data)
    if not result:
        raise HTTPException(404, "Project not found")
    return result


# ── Activities ─────────────────────────────────────────────────────────────────

@router.get("/{company_id}/activities", response_model=list[TimeActivityRead])
def list_activities(company_id: int, active_only: bool = True, db: Session = Depends(get_db)):
    return svc.list_activities(db, company_id, active_only)


@router.post("/{company_id}/activities", response_model=TimeActivityRead)
def create_activity(company_id: int, data: TimeActivityCreate, db: Session = Depends(get_db)):
    return svc.create_activity(db, company_id, data)


@router.patch("/{company_id}/activities/{activity_id}/active", response_model=TimeActivityRead)
def toggle_activity(company_id: int, activity_id: int, is_active: bool, db: Session = Depends(get_db)):
    result = svc.update_activity_active(db, company_id, activity_id, is_active)
    if not result:
        raise HTTPException(404, "Activity not found")
    return result


# ── Assignments ────────────────────────────────────────────────────────────────

@router.get("/{company_id}/projects/{project_id}/assignments", response_model=list[TimeAssignmentRead])
def list_assignments(company_id: int, project_id: int, db: Session = Depends(get_db)):
    return svc.list_assignments(db, company_id, project_id)


@router.post("/{company_id}/projects/{project_id}/assignments", response_model=TimeAssignmentRead)
def assign_user(company_id: int, project_id: int, data: TimeAssignmentCreate, db: Session = Depends(get_db)):
    return svc.assign_user(db, company_id, project_id, data)


@router.delete("/{company_id}/assignments/{assignment_id}", status_code=204)
def remove_assignment(company_id: int, assignment_id: int, db: Session = Depends(get_db)):
    ok = svc.remove_assignment(db, company_id, assignment_id)
    if not ok:
        raise HTTPException(404, "Assignment not found")


# ── Time entries — employee ────────────────────────────────────────────────────

@router.get("/{company_id}/entries/week", response_model=WeekView)
def get_week(
    company_id: int,
    user_id: int,
    week_start: date,
    db: Session = Depends(get_db),
):
    return svc.get_week_view(db, company_id, user_id, week_start)


@router.post("/{company_id}/entries", response_model=TimeEntryRead)
def upsert_entry(
    company_id: int,
    user_id: int,
    data: TimeEntryUpsert,
    user_name: Optional[str] = None,
    db: Session = Depends(get_db),
):
    try:
        return svc.upsert_entry(db, company_id, user_id, user_name, data)
    except ValueError as exc:
        raise HTTPException(409, str(exc))


@router.delete("/{company_id}/entries/{entry_id}", status_code=204)
def delete_entry(company_id: int, entry_id: int, user_id: int, db: Session = Depends(get_db)):
    ok = svc.delete_entry(db, company_id, user_id, entry_id)
    if not ok:
        raise HTTPException(404, "Entry not found or not editable")


@router.post("/{company_id}/entries/submit-week", response_model=dict)
def submit_week(company_id: int, user_id: int, week_start: date, db: Session = Depends(get_db)):
    count = svc.submit_week(db, company_id, user_id, week_start)
    return {"submitted": count}


# ── Coordinator ────────────────────────────────────────────────────────────────

@router.get("/{company_id}/incoming", response_model=list[SubmittedWeek])
def list_incoming(company_id: int, db: Session = Depends(get_db)):
    return svc.list_incoming(db, company_id)


@router.get("/{company_id}/incoming/entries", response_model=list[TimeEntryRead])
def get_week_entries(
    company_id: int,
    user_id: int,
    week_start: date,
    db: Session = Depends(get_db),
):
    return svc.get_week_entries(db, company_id, user_id, week_start)


@router.post("/{company_id}/entries/approve", response_model=dict)
def approve_entries(
    company_id: int,
    reviewer_id: int,
    entry_ids: list[int],
    data: ReviewAction,
    reviewer_name: Optional[str] = None,
    db: Session = Depends(get_db),
):
    count = svc.approve_entries(db, company_id, entry_ids, reviewer_id, reviewer_name, data)
    return {"approved": count}


@router.post("/{company_id}/entries/reject", response_model=dict)
def reject_entries(
    company_id: int,
    reviewer_id: int,
    entry_ids: list[int],
    data: ReviewAction,
    reviewer_name: Optional[str] = None,
    db: Session = Depends(get_db),
):
    count = svc.reject_entries(db, company_id, entry_ids, reviewer_id, reviewer_name, data)
    return {"rejected": count}


# ── Reports ────────────────────────────────────────────────────────────────────

@router.get("/{company_id}/reports/project", response_model=ProjectReport)
def project_report(
    company_id: int,
    project_id: int,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    db: Session = Depends(get_db),
):
    result = svc.project_report(db, company_id, project_id, date_from, date_to)
    if not result:
        raise HTTPException(404, "Project not found")
    return result


@router.get("/{company_id}/reports/user", response_model=UserReport)
def user_report(
    company_id: int,
    user_id: int,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    db: Session = Depends(get_db),
):
    return svc.user_report(db, company_id, user_id, date_from, date_to)


# ── Salary configuration ───────────────────────────────────────────────────────
from packages.core.platform.models_user import User  # noqa: E402
from apps.api.auth import get_current_user, require_same_company  # noqa: E402
from decimal import Decimal  # noqa: E402
from pydantic import BaseModel, ConfigDict  # noqa: E402

from packages.modules.time_tracking.models_salary import UserSalaryConfig  # noqa: E402
from packages.modules.time_tracking.salary_service import (  # noqa: E402
    set_salary as svc_set_salary,
    list_salary_configs as svc_list_salary,
    get_active_salary as svc_get_salary,
    calculate_time_cost,
    batch_time_costs,
)


class SalaryCreate(BaseModel):
    user_id: int
    hourly_rate: Decimal
    monthly_salary: Decimal | None = None
    currency: str = "MXN"
    effective_date: date | None = None
    role_title: str | None = None
    default_cost_center_id: int | None = None
    default_project_id: int | None = None
    notes: str | None = None


class SalaryRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    company_id: int
    user_id: int
    hourly_rate: Decimal
    monthly_salary: Decimal | None
    currency: str
    effective_date: date
    is_active: bool
    role_title: str | None
    default_cost_center_id: int | None
    default_project_id: int | None
    notes: str | None
    created_by: int | None
    created_at: datetime
    updated_at: datetime


class TimeCostRequest(BaseModel):
    """Request body for calculating time costs."""
    entries: list[dict]  # [{user_id: int, hours: Decimal}]


class TimeCostResponse(BaseModel):
    costs: dict[str, Decimal]  # {"user_id": total_cost}


@router.get("/{company_id}/salaries", response_model=list[SalaryRead])
def list_salaries(
    company_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List all active salary configs for a company. Accounting/admin only."""
    require_same_company(company_id, current_user)
    configs = svc_list_salary(db, company_id)
    return [SalaryRead.model_validate(c) for c in configs]


@router.get("/{company_id}/salaries/{user_id}", response_model=SalaryRead | None)
def get_salary(
    company_id: int,
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get the active salary config for a specific user."""
    require_same_company(company_id, current_user)
    config = svc_get_salary(db, company_id, user_id)
    return SalaryRead.model_validate(config) if config else None


@router.post("/{company_id}/salaries", response_model=SalaryRead, status_code=201)
def create_salary(
    company_id: int,
    data: SalaryCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Set or update the hourly rate for a user. Accounting/admin only."""
    require_same_company(company_id, current_user)
    config = svc_set_salary(
        db,
        company_id=company_id,
        user_id=data.user_id,
        hourly_rate=data.hourly_rate,
        monthly_salary=data.monthly_salary,
        currency=data.currency,
        effective_date=data.effective_date,
        role_title=data.role_title,
        default_cost_center_id=data.default_cost_center_id,
        default_project_id=data.default_project_id,
        notes=data.notes,
        created_by=current_user.id,
    )
    return SalaryRead.model_validate(config)


@router.post("/{company_id}/salaries/calculate-costs", response_model=TimeCostResponse)
def calculate_costs(
    company_id: int,
    data: TimeCostRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Calculate time costs for multiple users based on their hourly rates.

    Accepts a list of {user_id, hours} entries and returns
    a mapping of user_id -> total_cost.
    """
    require_same_company(company_id, current_user)
    user_hours = [
        (int(e["user_id"]), Decimal(str(e["hours"])))
        for e in data.entries
    ]
    costs = batch_time_costs(db, company_id, user_hours)
    return TimeCostResponse(
        costs={str(uid): cost for uid, cost in costs.items()}
    )
