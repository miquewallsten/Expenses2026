"""
Report Cycle Service
====================
Handles:
  - get / create default settings per company
  - update settings
  - bundle_expenses: core logic that groups validated (held) expenses by user
    and creates one ExpenseReport per user per cycle run
  - compute_next_run_at: calculates when the next automatic run should occur
"""
from __future__ import annotations

import logging
from datetime import date, datetime, timezone, timedelta
from typing import Optional

from sqlalchemy import text
from sqlalchemy.orm import Session

from packages.core.platform.models_report_cycle import ReportCycleSettings
from packages.modules.expenses.models.expense import Expense
from packages.modules.expenses.models.report import ExpenseReport
from packages.modules.admin.schemas.report_cycle import (
    BundleResult,
    ReportCycleSettingsUpdate,
)

_log = logging.getLogger(__name__)

_DEFAULTS = {
    "enabled": True,
    "frequency": "monthly",
    "day_of_week": None,
    "day_of_month": 1,
    "time_of_day": "18:00",
    "auto_submit": True,
    "bundle_statuses": "submitted,manager_approved",
    "report_name_template": "{user} — {month} {year}",
}


# ── Settings CRUD ─────────────────────────────────────────────────────────────

def get_report_cycle_settings(db: Session, company_id: int) -> ReportCycleSettings | None:
    return (
        db.query(ReportCycleSettings)
        .filter(ReportCycleSettings.company_id == company_id)
        .first()
    )


def get_or_create_report_cycle_settings(db: Session, company_id: int) -> ReportCycleSettings:
    settings = get_report_cycle_settings(db, company_id)
    if settings:
        return settings
    settings = ReportCycleSettings(company_id=company_id, **_DEFAULTS)
    db.add(settings)
    db.commit()
    db.refresh(settings)
    return settings


def update_report_cycle_settings(
    db: Session,
    company_id: int,
    payload: ReportCycleSettingsUpdate,
) -> ReportCycleSettings:
    settings = get_report_cycle_settings(db, company_id)
    if not settings:
        settings = ReportCycleSettings(company_id=company_id, **_DEFAULTS)
        db.add(settings)

    data = payload.model_dump(exclude_unset=True)
    for field, value in data.items():
        setattr(settings, field, value)

    # Recompute next_run_at whenever schedule fields change
    schedule_fields = {"frequency", "day_of_week", "day_of_month", "time_of_day", "enabled"}
    if schedule_fields & set(data.keys()):
        settings.next_run_at = _compute_next_run(settings)

    db.commit()
    db.refresh(settings)
    return settings


# ── Scheduling helpers ────────────────────────────────────────────────────────

def _compute_next_run(settings: ReportCycleSettings) -> Optional[datetime]:
    """Return the next UTC datetime this cycle should fire, or None for manual."""
    if not settings.enabled or settings.frequency == "manual":
        return None

    now = datetime.now(tz=timezone.utc)
    try:
        h, m = (int(x) for x in settings.time_of_day.split(":"))
    except Exception:
        h, m = 18, 0

    if settings.frequency in ("weekly", "biweekly"):
        target_dow = settings.day_of_week if settings.day_of_week is not None else 4  # Friday
        days_ahead = (target_dow - now.weekday()) % 7
        if days_ahead == 0:
            days_ahead = 7
        candidate = now.replace(hour=h, minute=m, second=0, microsecond=0) + timedelta(days=days_ahead)
        if settings.frequency == "biweekly":
            candidate += timedelta(weeks=1)
        return candidate

    if settings.frequency == "monthly":
        dom = settings.day_of_month if settings.day_of_month else 1
        dom = max(1, min(dom, 28))
        # Next occurrence of that day-of-month
        candidate = now.replace(day=dom, hour=h, minute=m, second=0, microsecond=0)
        if candidate <= now:
            # Roll forward one month
            month = candidate.month + 1
            year = candidate.year + (month - 1) // 12
            month = ((month - 1) % 12) + 1
            candidate = candidate.replace(year=year, month=month)
        return candidate

    return None


# ── Core bundling logic ───────────────────────────────────────────────────────

def bundle_expenses(
    db: Session,
    company_id: int,
    triggered_by: str = "manual",
    cycle_settings_id: Optional[int] = None,
) -> BundleResult:
    """
    Bundle all qualifying held expenses into per-user ExpenseReports.

    A qualifying expense is one that:
      - belongs to company_id
      - has a status in bundle_statuses (from cycle settings)
      - has no report_id yet (not already bundled)

    Returns a BundleResult summary.
    """
    settings = get_or_create_report_cycle_settings(db, company_id)
    bundle_statuses = [s.strip() for s in settings.bundle_statuses.split(",") if s.strip()]

    # Query all qualifying expenses
    expenses = (
        db.query(Expense)
        .filter(
            Expense.company_id == company_id,
            Expense.status.in_(bundle_statuses),
            Expense.report_id.is_(None),
        )
        .all()
    )

    if not expenses:
        # Update timestamps even if nothing to bundle
        settings.last_run_at = datetime.now(tz=timezone.utc)
        settings.next_run_at = _compute_next_run(settings)
        db.commit()
        return BundleResult(
            reports_created=0,
            expenses_bundled=0,
            users_processed=0,
            skipped_users=0,
            report_ids=[],
            triggered_by=triggered_by,
        )

    # Group by user — expenses without a user_id are grouped under None
    from collections import defaultdict
    groups: dict[Optional[int], list[Expense]] = defaultdict(list)
    for exp in expenses:
        uid = getattr(exp, "user_id", None)
        groups[uid].append(exp)

    now_utc = datetime.now(tz=timezone.utc)
    period_end = now_utc.date()
    period_start = (
        settings.last_run_at.date()
        if settings.last_run_at
        else date(now_utc.year, now_utc.month, 1)
    )

    report_ids: list[int] = []
    total_bundled = 0
    skipped = 0

    for user_id, user_expenses in groups.items():
        if not user_expenses:
            skipped += 1
            continue

        # Resolve display name for the report title
        user_label = _resolve_user_label(db, user_id)
        title = _render_template(settings.report_name_template, user_label, now_utc)

        initial_status = "submitted" if settings.auto_submit else "draft"

        report = ExpenseReport(
            company_id=company_id,
            title=title,
            status=initial_status,
            user_id=user_id,
            period_start=period_start,
            period_end=period_end,
            triggered_by=triggered_by,
            cycle_settings_id=cycle_settings_id or settings.id,
        )
        db.add(report)
        db.flush()  # get report.id without committing

        for exp in user_expenses:
            exp.report_id = report.id

        report_ids.append(report.id)
        total_bundled += len(user_expenses)

    # Update cycle timestamps
    settings.last_run_at = now_utc
    settings.next_run_at = _compute_next_run(settings)

    db.commit()

    _log.info(
        "bundle_expenses: company=%s triggered_by=%s reports=%s expenses=%s",
        company_id, triggered_by, len(report_ids), total_bundled,
    )

    return BundleResult(
        reports_created=len(report_ids),
        expenses_bundled=total_bundled,
        users_processed=len([u for u in groups if groups[u]]),
        skipped_users=skipped,
        report_ids=report_ids,
        triggered_by=triggered_by,
    )


# ── Helpers ───────────────────────────────────────────────────────────────────

def _resolve_user_label(db: Session, user_id: Optional[int]) -> str:
    if user_id is None:
        return "Unassigned"
    try:
        row = db.execute(
            text("SELECT full_name, email FROM users WHERE id = :uid"),
            {"uid": user_id},
        ).first()
        if row:
            return row.full_name or row.email or f"User {user_id}"
    except Exception:
        pass
    return f"User {user_id}"


_MONTH_NAMES = [
    "", "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
]


def _render_template(template: str, user_label: str, dt: datetime) -> str:
    return (
        template
        .replace("{user}", user_label)
        .replace("{email}", user_label)
        .replace("{month}", _MONTH_NAMES[dt.month])
        .replace("{year}", str(dt.year))
        .replace("{date}", dt.strftime("%Y-%m-%d"))
    )
