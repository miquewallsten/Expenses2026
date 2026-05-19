"""time_tracking_integration_service.py — link time entries to cost centers/projects.

When time tracking is enabled, this service:
  1. Reads time entries with project/cost center assignments
  2. Generates proportional expense allocations from time-based costs
  3. Provides reports on time allocation vs. expense allocation per project
"""
from __future__ import annotations

from typing import Any

from sqlalchemy import func
from sqlalchemy.orm import Session

from packages.core.platform.models_project import Project
from packages.core.platform.models_cost_center import CostCenter


def get_time_allocation_summary(
    db: Session,
    company_id: int,
    project_id: int | None = None,
    cost_center_id: int | None = None,
) -> dict[str, Any]:
    """Return time allocation summary for accounting.

    Aggregates hours and costs from time_tracking entries and maps them
    to their project/cost center for póliza generation.
    """
    try:
        from packages.modules.time_tracking.models.time_entry import TimeEntry
    except ImportError:
        return {"entries": [], "total_hours": 0, "total_cost": 0, "note": "Time tracking module not available"}

    q = db.query(TimeEntry).filter(TimeEntry.company_id == company_id)

    if project_id:
        q = q.filter(TimeEntry.project_id == project_id)
    if cost_center_id:
        q = q.filter(TimeEntry.cost_center_id == cost_center_id)

    entries = q.all()
    total_hours = sum(float(e.hours or 0) for e in entries)
    total_cost = sum(float(e.cost or 0) for e in entries)

    # Group by project
    by_project: dict[int, dict] = {}
    for e in entries:
        pid = e.project_id
        if pid not in by_project:
            proj = db.query(Project).get(pid) if pid else None
            by_project[pid] = {
                "project_id": pid,
                "project_code": proj.code if proj else None,
                "project_name": proj.name if proj else "No project",
                "hours": 0,
                "cost": 0,
            }
        by_project[pid]["hours"] += float(e.hours or 0)
        by_project[pid]["cost"] += float(e.cost or 0)

    return {
        "entries": list(by_project.values()),
        "total_hours": total_hours,
        "total_cost": total_cost,
    }
