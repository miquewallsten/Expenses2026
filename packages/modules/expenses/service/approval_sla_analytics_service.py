"""Phase 5.7 — approval SLA analytics.

Computes time-to-approve distribution from AuditLog status_change events.
For each expense, finds first ``→ submitted`` and last ``→ approved`` timestamps,
then aggregates per-company percentiles plus per-status open age.
"""

from __future__ import annotations

import statistics
from datetime import datetime
from typing import Any

from sqlalchemy import func
from sqlalchemy.orm import Session

from packages.core.platform.models_audit import AuditLog
from packages.modules.expenses.models.expense import Expense


def _percentile(values: list[float], pct: float) -> float:
    if not values:
        return 0.0
    if len(values) == 1:
        return round(values[0], 2)
    qs = statistics.quantiles(values, n=100, method="inclusive")
    # quantiles returns 99 cutpoints for n=100; index pct-1
    idx = max(0, min(98, int(pct) - 1))
    return round(qs[idx], 2)


def compute_sla_distribution(
    db: Session, *, company_id: int, now: datetime | None = None,
) -> dict[str, Any]:
    """Return time-to-approve percentiles in hours, plus open-age stats."""
    now = now or datetime.utcnow()

    # ── time-to-approve: submitted → approved ───────────────────────────────
    submitted_rows = (
        db.query(
            AuditLog.entity_id.label("eid"),
            func.min(AuditLog.created_at).label("ts"),
        )
        .filter(
            AuditLog.company_id == company_id,
            AuditLog.entity_type == "expense",
            AuditLog.action == "status_change",
            AuditLog.detail_text.like("%→ submitted%"),
        )
        .group_by(AuditLog.entity_id)
        .all()
    )
    approved_rows = (
        db.query(
            AuditLog.entity_id.label("eid"),
            func.max(AuditLog.created_at).label("ts"),
        )
        .filter(
            AuditLog.company_id == company_id,
            AuditLog.entity_type == "expense",
            AuditLog.action == "status_change",
            AuditLog.detail_text.like("%→ approved%"),
        )
        .group_by(AuditLog.entity_id)
        .all()
    )
    submitted_map = {r.eid: r.ts for r in submitted_rows}
    approved_map = {r.eid: r.ts for r in approved_rows}
    deltas_h: list[float] = []
    for eid, sub_ts in submitted_map.items():
        app_ts = approved_map.get(eid)
        if app_ts and app_ts >= sub_ts:
            deltas_h.append((app_ts - sub_ts).total_seconds() / 3600.0)

    # ── open age: still pending (submitted/manager_approved) ────────────────
    pending = (
        db.query(Expense.id, Expense.status)
        .filter(
            Expense.company_id == company_id,
            Expense.status.in_(("submitted", "manager_approved")),
        )
        .all()
    )
    open_ages: list[float] = []
    for exp_id, _status in pending:
        ts = submitted_map.get(exp_id)
        if ts is not None:
            open_ages.append((now - ts).total_seconds() / 3600.0)

    return {
        "approved_count": len(deltas_h),
        "p50_hours": _percentile(deltas_h, 50),
        "p75_hours": _percentile(deltas_h, 75),
        "p95_hours": _percentile(deltas_h, 95),
        "max_hours": round(max(deltas_h), 2) if deltas_h else 0.0,
        "open_count": len(open_ages),
        "open_p50_hours": _percentile(open_ages, 50),
        "open_p95_hours": _percentile(open_ages, 95),
        "open_max_hours": round(max(open_ages), 2) if open_ages else 0.0,
    }
