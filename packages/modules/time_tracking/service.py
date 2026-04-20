"""
Service layer for the Time & Activity Allocation module.

All DB mutations go through functions here; routers stay thin.
"""

from __future__ import annotations

from datetime import date, datetime, timezone
from decimal import Decimal

from sqlalchemy import func as sqlfunc
from sqlalchemy.orm import Session

from packages.core.platform.models_time_tracking import (
    TimeActivity,
    TimeAssignment,
    TimeEntry,
    TimeProject,
)
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
    WeekRow,
    WeekView,
)


# ── Helpers ────────────────────────────────────────────────────────────────────

def _iso_monday(d: date) -> date:
    """Return the ISO Monday of the week containing *d*."""
    return d - __import__("datetime").timedelta(days=d.weekday())


def _week_days(monday: date) -> list[date]:
    from datetime import timedelta
    return [monday + timedelta(days=i) for i in range(7)]


# ── Projects ───────────────────────────────────────────────────────────────────

def list_projects(db: Session, company_id: int) -> list[TimeProjectRead]:
    rows = db.query(TimeProject).filter(TimeProject.company_id == company_id).order_by(TimeProject.name).all()
    return [TimeProjectRead.model_validate(r) for r in rows]


def create_project(db: Session, company_id: int, data: TimeProjectCreate) -> TimeProjectRead:
    proj = TimeProject(company_id=company_id, **data.model_dump())
    db.add(proj)
    db.commit()
    db.refresh(proj)
    return TimeProjectRead.model_validate(proj)


def update_project(db: Session, company_id: int, project_id: int, data: TimeProjectUpdate) -> TimeProjectRead | None:
    proj = db.query(TimeProject).filter(TimeProject.id == project_id, TimeProject.company_id == company_id).first()
    if not proj:
        return None
    for k, v in data.model_dump(exclude_none=True).items():
        setattr(proj, k, v)
    db.commit()
    db.refresh(proj)
    return TimeProjectRead.model_validate(proj)


def get_project(db: Session, company_id: int, project_id: int) -> TimeProjectRead | None:
    proj = db.query(TimeProject).filter(TimeProject.id == project_id, TimeProject.company_id == company_id).first()
    return TimeProjectRead.model_validate(proj) if proj else None


# ── Activities ─────────────────────────────────────────────────────────────────

def list_activities(db: Session, company_id: int, active_only: bool = True) -> list[TimeActivityRead]:
    q = db.query(TimeActivity).filter(TimeActivity.company_id == company_id)
    if active_only:
        q = q.filter(TimeActivity.is_active.is_(True))
    return [TimeActivityRead.model_validate(r) for r in q.order_by(TimeActivity.name).all()]


def create_activity(db: Session, company_id: int, data: TimeActivityCreate) -> TimeActivityRead:
    act = TimeActivity(company_id=company_id, **data.model_dump())
    db.add(act)
    db.commit()
    db.refresh(act)
    return TimeActivityRead.model_validate(act)


def update_activity_active(db: Session, company_id: int, activity_id: int, is_active: bool) -> TimeActivityRead | None:
    act = db.query(TimeActivity).filter(TimeActivity.id == activity_id, TimeActivity.company_id == company_id).first()
    if not act:
        return None
    act.is_active = is_active
    db.commit()
    db.refresh(act)
    return TimeActivityRead.model_validate(act)


# ── Assignments ────────────────────────────────────────────────────────────────

def list_assignments(db: Session, company_id: int, project_id: int) -> list[TimeAssignmentRead]:
    rows = (
        db.query(TimeAssignment)
        .filter(TimeAssignment.project_id == project_id, TimeAssignment.company_id == company_id)
        .order_by(TimeAssignment.user_name)
        .all()
    )
    return [TimeAssignmentRead.model_validate(r) for r in rows]


def assign_user(db: Session, company_id: int, project_id: int, data: TimeAssignmentCreate) -> TimeAssignmentRead:
    from sqlalchemy.dialects.postgresql import insert as pg_insert

    # Upsert: if the user is already assigned, update the record
    existing = (
        db.query(TimeAssignment)
        .filter(TimeAssignment.project_id == project_id, TimeAssignment.user_id == data.user_id)
        .first()
    )
    if existing:
        existing.user_name = data.user_name or existing.user_name
        existing.role = data.role
        existing.budget_hours = data.budget_hours
        existing.is_active = True
        db.commit()
        db.refresh(existing)
        return TimeAssignmentRead.model_validate(existing)

    asgn = TimeAssignment(
        company_id=company_id,
        project_id=project_id,
        **data.model_dump(),
    )
    db.add(asgn)
    db.commit()
    db.refresh(asgn)
    return TimeAssignmentRead.model_validate(asgn)


def remove_assignment(db: Session, company_id: int, assignment_id: int) -> bool:
    asgn = db.query(TimeAssignment).filter(
        TimeAssignment.id == assignment_id, TimeAssignment.company_id == company_id
    ).first()
    if not asgn:
        return False
    asgn.is_active = False
    db.commit()
    return True


def get_user_project_ids(db: Session, company_id: int, user_id: int) -> list[int]:
    """Return project_ids where the user has an active assignment."""
    rows = (
        db.query(TimeAssignment.project_id)
        .filter(
            TimeAssignment.company_id == company_id,
            TimeAssignment.user_id == user_id,
            TimeAssignment.is_active.is_(True),
        )
        .all()
    )
    return [r[0] for r in rows]


# ── Week view ──────────────────────────────────────────────────────────────────

def get_week_view(db: Session, company_id: int, user_id: int, week_start: date) -> WeekView:
    """Build the full weekly timesheet grid for a user."""
    from datetime import timedelta

    monday = _iso_monday(week_start)
    days = _week_days(monday)
    sunday = days[-1]

    # Fetch all entries for this user/week
    entries: list[TimeEntry] = (
        db.query(TimeEntry)
        .filter(
            TimeEntry.company_id == company_id,
            TimeEntry.user_id == user_id,
            TimeEntry.entry_date >= monday,
            TimeEntry.entry_date <= sunday,
        )
        .all()
    )

    # Collect unique (project_id, activity_id) pairs — from entries + assignments
    pairs: set[tuple[int, int | None]] = set()
    for e in entries:
        pairs.add((e.project_id, e.activity_id))

    # Also add active assignments so users always see their projects even if empty
    project_ids = get_user_project_ids(db, company_id, user_id)
    for pid in project_ids:
        if not any(p == pid for p, _ in pairs):
            pairs.add((pid, None))

    # Fetch project names
    proj_map: dict[int, TimeProject] = {}
    all_pids = {p for p, _ in pairs}
    if all_pids:
        for proj in db.query(TimeProject).filter(TimeProject.id.in_(all_pids)).all():
            proj_map[proj.id] = proj

    # Fetch activity names
    act_map: dict[int, TimeActivity] = {}
    all_aids = {a for _, a in pairs if a is not None}
    if all_aids:
        for act in db.query(TimeActivity).filter(TimeActivity.id.in_(all_aids)).all():
            act_map[act.id] = act

    # Build entry lookup: (project_id, activity_id, date) → entry
    entry_lookup: dict[tuple[int, int | None, date], TimeEntry] = {}
    for e in entries:
        entry_lookup[(e.project_id, e.activity_id, e.entry_date)] = e

    day_strs = [str(d) for d in days]
    zero = Decimal("0")

    rows: list[WeekRow] = []
    for project_id, activity_id in sorted(pairs):
        proj = proj_map.get(project_id)
        act = act_map.get(activity_id) if activity_id else None

        entry_ids: dict[str, int | None] = {}
        hours_map: dict[str, Decimal] = {}
        statuses: dict[str, str] = {}

        for d, ds in zip(days, day_strs):
            e = entry_lookup.get((project_id, activity_id, d))
            entry_ids[ds] = e.id if e else None
            hours_map[ds] = e.hours if e else zero
            statuses[ds] = e.status if e else ""

        rows.append(WeekRow(
            project_id=project_id,
            project_name=proj.name if proj else f"Project {project_id}",
            project_code=proj.code if proj else None,
            activity_id=activity_id,
            activity_name=act.name if act else None,
            entry_ids=entry_ids,
            hours=hours_map,
            statuses=statuses,
        ))

    # Daily totals
    daily_totals: dict[str, Decimal] = {ds: zero for ds in day_strs}
    for e in entries:
        ds = str(e.entry_date)
        daily_totals[ds] = daily_totals.get(ds, zero) + e.hours

    week_total = sum(daily_totals.values(), zero)

    # Overall week status
    all_statuses = [e.status for e in entries]
    if not all_statuses:
        week_status = "empty"
    elif all(s == "approved" for s in all_statuses):
        week_status = "approved"
    elif any(s == "rejected" for s in all_statuses):
        week_status = "rejected"
    elif all(s == "submitted" for s in all_statuses):
        week_status = "submitted"
    elif any(s == "submitted" for s in all_statuses):
        week_status = "partial"
    else:
        week_status = "draft"

    return WeekView(
        week_start=monday,
        week_end=sunday,
        days=days,
        rows=rows,
        daily_totals=daily_totals,
        week_total=week_total,
        week_status=week_status,
    )


# ── Entry mutations ────────────────────────────────────────────────────────────

def upsert_entry(
    db: Session,
    company_id: int,
    user_id: int,
    user_name: str | None,
    data: TimeEntryUpsert,
) -> TimeEntryRead:
    """Create or update a time entry. Only editable when status is 'draft'."""
    monday = _iso_monday(data.entry_date)

    existing = (
        db.query(TimeEntry)
        .filter(
            TimeEntry.company_id == company_id,
            TimeEntry.user_id == user_id,
            TimeEntry.project_id == data.project_id,
            TimeEntry.activity_id == data.activity_id,
            TimeEntry.entry_date == data.entry_date,
        )
        .first()
    )

    if existing:
        if existing.status not in ("draft", "rejected"):
            raise ValueError("Cannot edit an entry that has already been submitted or approved.")
        existing.hours = data.hours
        existing.description = data.description
        existing.activity_id = data.activity_id
        existing.status = "draft"
        db.commit()
        db.refresh(existing)
        return TimeEntryRead.model_validate(existing)

    entry = TimeEntry(
        company_id=company_id,
        user_id=user_id,
        user_name=user_name,
        project_id=data.project_id,
        activity_id=data.activity_id,
        entry_date=data.entry_date,
        hours=data.hours,
        description=data.description,
        week_start=monday,
        status="draft",
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return TimeEntryRead.model_validate(entry)


def delete_entry(db: Session, company_id: int, user_id: int, entry_id: int) -> bool:
    entry = db.query(TimeEntry).filter(
        TimeEntry.id == entry_id,
        TimeEntry.company_id == company_id,
        TimeEntry.user_id == user_id,
    ).first()
    if not entry or entry.status not in ("draft", "rejected"):
        return False
    db.delete(entry)
    db.commit()
    return True


def submit_week(
    db: Session,
    company_id: int,
    user_id: int,
    week_start: date,
) -> int:
    """Submit all draft entries for a given week. Returns count submitted."""
    monday = _iso_monday(week_start)
    from datetime import timedelta
    sunday = monday + timedelta(days=6)

    entries = (
        db.query(TimeEntry)
        .filter(
            TimeEntry.company_id == company_id,
            TimeEntry.user_id == user_id,
            TimeEntry.week_start == monday,
            TimeEntry.status == "draft",
        )
        .all()
    )
    now = datetime.now(tz=timezone.utc)
    for e in entries:
        e.status = "submitted"
        e.submitted_at = now
    db.commit()
    return len(entries)


# ── Coordinator actions ────────────────────────────────────────────────────────

def list_incoming(db: Session, company_id: int) -> list[SubmittedWeek]:
    """Return submitted weeks grouped by (user_id, week_start) for the coordinator."""
    rows = (
        db.query(
            TimeEntry.user_id,
            TimeEntry.user_name,
            TimeEntry.week_start,
            sqlfunc.sum(TimeEntry.hours).label("total_hours"),
            sqlfunc.count(TimeEntry.id).label("entry_count"),
        )
        .filter(
            TimeEntry.company_id == company_id,
            TimeEntry.status.in_(["submitted", "approved", "rejected"]),
        )
        .group_by(TimeEntry.user_id, TimeEntry.user_name, TimeEntry.week_start)
        .order_by(TimeEntry.week_start.desc(), TimeEntry.user_name)
        .all()
    )

    result = []
    for r in rows:
        entry_ids = [
            e.id for e in db.query(TimeEntry.id).filter(
                TimeEntry.company_id == company_id,
                TimeEntry.user_id == r.user_id,
                TimeEntry.week_start == r.week_start,
                TimeEntry.status.in_(["submitted", "approved", "rejected"]),
            ).all()
        ]
        # Aggregate status for the group
        statuses_in_group = [
            e.status for e in db.query(TimeEntry.status).filter(
                TimeEntry.id.in_(entry_ids)
            ).all()
        ]
        if all(s == "approved" for s in statuses_in_group):
            agg_status = "approved"
        elif all(s == "rejected" for s in statuses_in_group):
            agg_status = "rejected"
        elif any(s == "submitted" for s in statuses_in_group):
            agg_status = "submitted"
        else:
            agg_status = "partial"

        result.append(SubmittedWeek(
            user_id=r.user_id,
            user_name=r.user_name,
            week_start=r.week_start,
            total_hours=Decimal(str(r.total_hours)),
            entry_count=r.entry_count,
            status=agg_status,
            entry_ids=entry_ids,
        ))
    return result


def get_week_entries(db: Session, company_id: int, user_id: int, week_start: date) -> list[TimeEntryRead]:
    monday = _iso_monday(week_start)
    entries = (
        db.query(TimeEntry)
        .filter(
            TimeEntry.company_id == company_id,
            TimeEntry.user_id == user_id,
            TimeEntry.week_start == monday,
            TimeEntry.status.in_(["submitted", "approved", "rejected"]),
        )
        .order_by(TimeEntry.entry_date, TimeEntry.project_id)
        .all()
    )
    return [TimeEntryRead.model_validate(e) for e in entries]


def approve_entries(
    db: Session,
    company_id: int,
    entry_ids: list[int],
    reviewer_id: int,
    reviewer_name: str | None,
    action: ReviewAction,
) -> int:
    now = datetime.now(tz=timezone.utc)
    entries = db.query(TimeEntry).filter(
        TimeEntry.id.in_(entry_ids),
        TimeEntry.company_id == company_id,
        TimeEntry.status == "submitted",
    ).all()
    for e in entries:
        e.status = "approved"
        e.reviewed_at = now
        e.reviewer_id = reviewer_id
        e.reviewer_name = reviewer_name
        e.reviewer_notes = action.notes
    db.commit()
    return len(entries)


def reject_entries(
    db: Session,
    company_id: int,
    entry_ids: list[int],
    reviewer_id: int,
    reviewer_name: str | None,
    action: ReviewAction,
) -> int:
    now = datetime.now(tz=timezone.utc)
    entries = db.query(TimeEntry).filter(
        TimeEntry.id.in_(entry_ids),
        TimeEntry.company_id == company_id,
        TimeEntry.status == "submitted",
    ).all()
    for e in entries:
        e.status = "rejected"
        e.reviewed_at = now
        e.reviewer_id = reviewer_id
        e.reviewer_name = reviewer_name
        e.reviewer_notes = action.notes
        e.rejection_reason = action.rejection_reason
    db.commit()
    return len(entries)


# ── Reports ────────────────────────────────────────────────────────────────────

def project_report(
    db: Session,
    company_id: int,
    project_id: int,
    date_from: date | None = None,
    date_to: date | None = None,
) -> ProjectReport | None:
    proj = db.query(TimeProject).filter(
        TimeProject.id == project_id, TimeProject.company_id == company_id
    ).first()
    if not proj:
        return None

    q = db.query(TimeEntry).filter(
        TimeEntry.company_id == company_id,
        TimeEntry.project_id == project_id,
    )
    if date_from:
        q = q.filter(TimeEntry.entry_date >= date_from)
    if date_to:
        q = q.filter(TimeEntry.entry_date <= date_to)

    entries = q.all()
    logged = sum(e.hours for e in entries)
    approved = sum(e.hours for e in entries if e.status == "approved")

    # User breakdown
    from collections import defaultdict
    user_hours: dict[tuple, Decimal] = defaultdict(Decimal)
    for e in entries:
        user_hours[(e.user_id, e.user_name)] += e.hours

    util = float(approved / proj.budget_hours * 100) if proj.budget_hours else None

    return ProjectReport(
        project_id=proj.id,
        project_name=proj.name,
        project_code=proj.code,
        budget_hours=proj.budget_hours,
        logged_hours=logged,
        approved_hours=approved,
        utilization_pct=util,
        user_breakdown=[
            {"user_id": uid, "user_name": uname, "hours": float(h)}
            for (uid, uname), h in sorted(user_hours.items(), key=lambda x: -x[1])
        ],
    )


def user_report(
    db: Session,
    company_id: int,
    user_id: int,
    date_from: date | None = None,
    date_to: date | None = None,
) -> UserReport:
    q = db.query(TimeEntry).filter(
        TimeEntry.company_id == company_id,
        TimeEntry.user_id == user_id,
    )
    if date_from:
        q = q.filter(TimeEntry.entry_date >= date_from)
    if date_to:
        q = q.filter(TimeEntry.entry_date <= date_to)

    entries = q.all()
    total = sum(e.hours for e in entries)
    approved = sum(e.hours for e in entries if e.status == "approved")

    from collections import defaultdict
    proj_hours: dict[tuple, Decimal] = defaultdict(Decimal)
    proj_names: dict[int, str] = {}
    for e in entries:
        proj_hours[(e.project_id,)] += e.hours

    # Fetch project names
    pids = {e.project_id for e in entries}
    if pids:
        for p in db.query(TimeProject).filter(TimeProject.id.in_(pids)).all():
            proj_names[p.id] = p.name

    user_name = entries[0].user_name if entries else None

    return UserReport(
        user_id=user_id,
        user_name=user_name,
        total_hours=total,
        approved_hours=approved,
        project_breakdown=[
            {"project_id": pid, "project_name": proj_names.get(pid, f"Project {pid}"), "hours": float(h)}
            for (pid,), h in sorted(proj_hours.items(), key=lambda x: -x[1])
        ],
    )
