"""Fiscal calendar service — SAT filing deadlines, period awareness."""
from __future__ import annotations
import logging
from datetime import date, timedelta
from typing import Any
from sqlalchemy.orm import Session
from packages.modules.admin.service.accounting_setup_service import get_accounting_setup

_log = logging.getLogger(__name__)

_SAT_DEADLINES: list[dict[str, Any]] = [
    {"name": "Declaración anual PF", "month": 4, "day": 30, "frequency": "annual", "applies_to": "pf"},
    {"name": "Declaración anual PM", "month": 3, "day": 31, "frequency": "annual", "applies_to": "pm"},
    {"name": "Pago provisional ISR (mensual)", "day": 17, "frequency": "monthly", "applies_to": "all"},
    {"name": "DIOT", "day": 17, "frequency": "monthly", "applies_to": "all"},
    {"name": "Contabilidad electrónica (XML)", "day": 5, "frequency": "monthly", "applies_to": "pm"},
    {"name": "Declaración informativa sueldos", "month": 2, "day": 15, "frequency": "annual", "applies_to": "all"},
]


def get_upcoming_deadlines(db: Session, company_id: int, *, months_ahead: int = 3) -> list[dict[str, Any]]:
    today = date.today()
    deadlines = []
    for dl in _SAT_DEADLINES:
        freq = dl.get("frequency", "monthly")
        if freq == "monthly":
            for m_offset in range(months_ahead + 1):
                target_month = today.month + m_offset
                target_year = today.year
                while target_month > 12:
                    target_month -= 12
                    target_year += 1
                target_day = dl.get("day", 17)
                try:
                    target_date = date(target_year, target_month, target_day)
                except ValueError:
                    continue
                if target_date >= today:
                    days_remaining = (target_date - today).days
                    deadlines.append({"name": dl["name"], "date": target_date.isoformat(),
                        "days_remaining": days_remaining,
                        "urgency": "critical" if days_remaining <= 3 else ("warn" if days_remaining <= 7 else "ok"),
                        "frequency": freq, "applies_to": dl.get("applies_to", "all")})
        elif freq == "annual":
            target_month = dl.get("month", 1)
            target_day = dl.get("day", 17)
            for year_offset in range(2):
                target_year = today.year + year_offset
                try:
                    target_date = date(target_year, target_month, target_day)
                except ValueError:
                    continue
                if target_date >= today:
                    days_remaining = (target_date - today).days
                    deadlines.append({"name": dl["name"], "date": target_date.isoformat(),
                        "days_remaining": days_remaining,
                        "urgency": "critical" if days_remaining <= 5 else ("warn" if days_remaining <= 14 else "ok"),
                        "frequency": freq, "applies_to": dl.get("applies_to", "all")})
    deadlines.sort(key=lambda d: d["days_remaining"])
    return deadlines


def get_current_period(db: Session, company_id: int) -> dict[str, Any]:
    today = date.today()
    setup = get_accounting_setup(db, company_id)
    fiscal_start_month = 1
    if setup:
        fiscal_start_month = getattr(setup, "fiscal_year_start_month", 1) or 1
    fiscal_year = today.year if today.month >= fiscal_start_month else today.year - 1
    if fiscal_start_month == 1:
        fiscal_year_end = date(today.year, 12, 31)
    else:
        end_month = fiscal_start_month - 1 or 12
        fy_end_year = today.year + (1 if today.month < fiscal_start_month else 0)
        fiscal_year_end = date(fy_end_year, end_month, _last_day(fy_end_year, end_month))
    days_in_fy = (fiscal_year_end - date(fiscal_year, fiscal_start_month, 1)).days
    days_elapsed = (today - date(fiscal_year, fiscal_start_month, 1)).days
    return {"today": today.isoformat(), "fiscal_year": fiscal_year,
        "fiscal_year_start": f"{fiscal_year}-{fiscal_start_month:02d}-01",
        "fiscal_year_end": fiscal_year_end.isoformat(),
        "current_month": today.month, "current_period": f"{today.year}-{today.month:02d}",
        "days_elapsed_in_fy": max(0, days_elapsed), "days_in_fy": max(1, days_in_fy),
        "fy_progress_pct": round(min(100, max(0, days_elapsed / max(1, days_in_fy) * 100)), 1)}


def _last_day(year: int, month: int) -> int:
    if month == 12:
        return 31
    return (date(year, month + 1, 1) - timedelta(days=1)).day
