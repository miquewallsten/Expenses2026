"""Phase 5.4 — anomaly detection for expenses.

Pure SQLAlchemy + statistics. No external service calls.

Baseline: per-company, per-category mean + standard deviation over an N-day
trailing window of approved expenses. Flag types:

  • amount_outlier   — amount > mean + 3·σ for its category
  • new_category     — no prior expenses in this category within the window
  • velocity_spike   — > N expenses in the past T hours for the company
"""

from __future__ import annotations

import statistics
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Any

from sqlalchemy import and_
from sqlalchemy.orm import Session

from packages.modules.expenses.models.expense import Expense


_DEFAULT_WINDOW_DAYS = 90
_DEFAULT_SIGMA = 3.0
_DEFAULT_VELOCITY_HOURS = 2
_DEFAULT_VELOCITY_THRESHOLD = 5
_BASELINE_STATUSES = ("approved", "manager_approved")


@dataclass(frozen=True)
class AnomalyFlag:
    kind: str
    severity: str  # "warn" | "alert"
    message: str
    detail: dict[str, Any]


def compute_baseline(
    db: Session,
    *,
    company_id: int,
    window_days: int = _DEFAULT_WINDOW_DAYS,
    today: date | None = None,
) -> dict[str, dict[str, float | int]]:
    """Return {category_code: {mean, stddev, count, sample_min, sample_max}}.

    Categories with fewer than 3 samples get stddev=0.0 (suppresses outlier
    flagging) and a tiny count. ``None`` category code is excluded.
    """
    today = today or date.today()
    cutoff = today - timedelta(days=max(1, window_days))
    rows = (
        db.query(Expense.category_code, Expense.amount)
        .filter(
            Expense.company_id == company_id,
            Expense.status.in_(_BASELINE_STATUSES),
            Expense.expense_date.is_not(None),
            Expense.expense_date >= cutoff,
            Expense.expense_date <= today,
        )
        .all()
    )
    by_cat: dict[str, list[float]] = {}
    for cat, amount in rows:
        if not cat:
            continue
        by_cat.setdefault(cat, []).append(float(amount or 0))

    out: dict[str, dict[str, float | int]] = {}
    for cat, vals in by_cat.items():
        mean = statistics.fmean(vals)
        stddev = statistics.stdev(vals) if len(vals) >= 3 else 0.0
        out[cat] = {
            "mean": round(mean, 2),
            "stddev": round(stddev, 2),
            "count": len(vals),
            "sample_min": round(min(vals), 2),
            "sample_max": round(max(vals), 2),
        }
    return out


def detect_anomalies(
    db: Session,
    *,
    company_id: int,
    amount: Decimal,
    category_code: str | None,
    expense_date: date | None = None,
    expense_id: int | None = None,
    sigma: float = _DEFAULT_SIGMA,
    velocity_hours: int = _DEFAULT_VELOCITY_HOURS,
    velocity_threshold: int = _DEFAULT_VELOCITY_THRESHOLD,
    window_days: int = _DEFAULT_WINDOW_DAYS,
    baseline: dict[str, dict[str, float | int]] | None = None,
    now: datetime | None = None,
) -> list[AnomalyFlag]:
    """Return list of flags (possibly empty) for the proposed expense."""
    flags: list[AnomalyFlag] = []
    amt = float(Decimal(str(amount)))
    today = (expense_date or date.today())

    bl = baseline if baseline is not None else compute_baseline(
        db, company_id=company_id, window_days=window_days, today=today,
    )

    # ── amount_outlier / new_category ────────────────────────────────────────
    if category_code:
        cat = bl.get(category_code)
        if cat is None:
            flags.append(AnomalyFlag(
                kind="new_category",
                severity="warn",
                message=f"First expense in category {category_code} in last {window_days}d",
                detail={"category_code": category_code, "window_days": window_days},
            ))
        else:
            threshold = float(cat["mean"]) + sigma * float(cat["stddev"])
            if cat["count"] >= 3 and float(cat["stddev"]) > 0 and amt > threshold:
                flags.append(AnomalyFlag(
                    kind="amount_outlier",
                    severity="alert",
                    message=(
                        f"Amount {amt:.2f} exceeds mean+{sigma:g}σ "
                        f"({threshold:.2f}) for {category_code}"
                    ),
                    detail={
                        "category_code": category_code,
                        "amount": round(amt, 2),
                        "mean": cat["mean"],
                        "stddev": cat["stddev"],
                        "threshold": round(threshold, 2),
                        "sample_count": cat["count"],
                    },
                ))

    # ── velocity_spike (company-wide, recent created_at) ────────────────────
    now = now or datetime.utcnow()
    since = now - timedelta(hours=max(0, velocity_hours))
    q = db.query(Expense).filter(
        Expense.company_id == company_id,
        Expense.created_at >= since,
    )
    if expense_id is not None:
        q = q.filter(Expense.id != expense_id)
    recent = q.count()
    # +1 to count the current proposed expense
    if recent + 1 > velocity_threshold:
        flags.append(AnomalyFlag(
            kind="velocity_spike",
            severity="warn",
            message=(
                f"{recent + 1} expenses for company in past {velocity_hours}h "
                f"(threshold {velocity_threshold})"
            ),
            detail={
                "recent_count": recent + 1,
                "window_hours": velocity_hours,
                "threshold": velocity_threshold,
            },
        ))

    return flags
