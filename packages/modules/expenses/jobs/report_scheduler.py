"""Expense Report Auto-Generation Scheduler.

Reads ReportCycleSettings for each company and generates expense reports
on the configured schedule (weekly, biweekly, monthly, or manual).

Intended to be called from a cron/scheduler (e.g. Celery beat, APScheduler, or
a simple while-true loop in a worker process).
"""
from __future__ import annotations

import logging
from datetime import date, datetime, timedelta, timezone
from typing import Any

from sqlalchemy.orm import Session

from apps.api.deps import get_db_session
from packages.core.platform.models_report_cycle import ReportCycleSettings
from packages.modules.expenses.models.expense import Expense
from packages.modules.expenses.models.report import ExpenseReport

log = logging.getLogger(__name__)


def should_generate_report(settings: ReportCycleSettings, today: date | None = None) -> bool:
    """Return True if a report should be generated today based on the cycle settings.

    Rules:
    - manual: never auto-generate
    - weekly: generate on the configured day_of_week (0=Monday)
    - biweekly: generate on the configured day_of_week every other week
    - monthly: generate on the configured day_of_month
    """
    if not settings.enabled:
        return False

    today = today or date.today()
    freq = settings.frequency

    if freq == "manual":
        return False

    if freq == "weekly":
        return today.weekday() == (settings.day_of_week or 0)

    if freq == "biweekly":
        # Generate every other week on the configured day
        if today.weekday() != (settings.day_of_week or 0):
            return False
        # Check if this is an even or odd week number
        week_num = today.isocalendar()[1]
        return week_num % 2 == 0

    if freq == "monthly":
        day = settings.day_of_month or 1
        # Clamp to 28 if the month doesn't have enough days
        last_day = (today.replace(day=28) + timedelta(days=4)).replace(day=1) - timedelta(days=1)
        target_day = min(day, last_day.day)
        return today.day == target_day

    return False


def generate_reports_for_company(db: Session, company_id: int) -> dict[str, Any]:
    """Generate expense reports for a single company if the cycle says so.

    Returns a summary dict with counts.
    """
    settings = db.query(ReportCycleSettings).filter(
        ReportCycleSettings.company_id == company_id
    ).first()

    if not settings or not should_generate_report(settings):
        return {"company_id": company_id, "generated": 0, "skipped": True}

    today = date.today()

    # Find all expenses that are in a bundleable status and not already in a report
    bundle_statuses = [
        s.strip() for s in (settings.bundle_statuses or "submitted,manager_approved").split(",")
        if s.strip()
    ]

    unbundled = (
        db.query(Expense)
        .filter(
            Expense.company_id == company_id,
            Expense.status.in_(bundle_statuses),
            Expense.report_id == None,
            Expense.is_deleted == False,
        )
        .order_by(Expense.expense_date.asc())
        .all()
    )

    if not unbundled:
        return {"company_id": company_id, "generated": 0, "skipped": False, "reason": "no_expenses"}

    # Create a report
    total = sum(float(e.amount_mxn or e.amount) for e in unbundled)

    report = ExpenseReport(
        company_id=company_id,
        title=f"Report {today.isoformat()}",
        status="submitted" if settings.auto_submit else "draft",
        total_amount=total,
        expense_count=len(unbundled),
        generated_at=datetime.now(timezone.utc),
    )
    db.add(report)
    db.flush()

    # Link expenses to the report
    for expense in unbundled:
        expense.report_id = report.id

    db.commit()

    log.info(
        "Generated report %s for company %s with %d expenses ($%.2f)",
        report.id, company_id, len(unbundled), total,
    )

    return {
        "company_id": company_id,
        "generated": 1,
        "report_id": report.id,
        "expense_count": len(unbundled),
        "total": total,
        "skipped": False,
    }


def run_report_scheduler() -> list[dict[str, Any]]:
    """Main entry point: iterate all companies and generate reports as needed.

    Call this from a scheduler (Celery beat, cron, APScheduler, etc.).
    """
    db = get_db_session()
    try:
        # Get all companies with report cycle settings
        all_settings = db.query(ReportCycleSettings).all()
        results = []
        for settings in all_settings:
            result = generate_reports_for_company(db, settings.company_id)
            results.append(result)
        return results
    finally:
        db.close()
