"""bulk_simulator_service.py — run simulate_poliza over a window of real expenses.

Returns one aggregated payload the UI renders as a variance grid:

  {
    "company_id":   int,
    "count":        int,           # expenses processed
    "balanced":     int,           # how many had balanced=True
    "unmapped":     int,           # how many had a "Sin categoría mapeada" warning
    "missing_iva":  int,           # how many had "tasa de IVA" warning
    "total_debit":  "12345.67",
    "total_credit": "12345.67",
    "rows": [
        {
            "expense_id":     int,
            "date":           ISO date or None,
            "description":    str,
            "amount":         "1856.00",
            "category_code":  str | None,
            "balanced":       bool,
            "warning_count":  int,
            "warnings":       list[str],
            "lines":          list[Line],   # full simulator output for export
        },
        ...
    ],
  }
"""

from __future__ import annotations

from decimal import Decimal
from typing import Any

from sqlalchemy.orm import Session

from packages.modules.expenses.models.expense import Expense
from packages.modules.accounting.service.poliza_simulator_service import simulate_poliza


def bulk_simulate(
    db: Session,
    company_id: int,
    limit: int = 50,
    statuses: tuple[str, ...] = ("submitted", "manager_approved", "approved"),
) -> dict[str, Any]:
    rows_q = (
        db.query(Expense)
        .filter(Expense.company_id == company_id, Expense.status.in_(statuses))
        .order_by(Expense.id.desc())
        .limit(max(1, min(limit, 500)))
    )
    expenses = list(rows_q)

    rows: list[dict[str, Any]] = []
    total_debit  = Decimal("0")
    total_credit = Decimal("0")
    balanced_n   = 0
    unmapped_n   = 0
    missing_iva  = 0

    for e in expenses:
        sim = simulate_poliza(db, company_id, {
            "amount":        float(e.amount or 0),
            "category_code": e.category_code or "",
            "description":   e.description,
            "date":          e.expense_date.isoformat() if e.expense_date else None,
        })
        warnings = sim.get("warnings") or []
        if sim.get("balanced"):  balanced_n += 1
        if any("Sin categoría" in w for w in warnings):  unmapped_n  += 1
        if any("IVA" in w for w in warnings):            missing_iva += 1
        total_debit  += Decimal(sim.get("total_debit")  or "0")
        total_credit += Decimal(sim.get("total_credit") or "0")

        rows.append({
            "expense_id":    e.id,
            "date":          e.expense_date.isoformat() if e.expense_date else None,
            "description":   e.description,
            "amount":        f"{Decimal(str(e.amount or 0)):.2f}",
            "category_code": e.category_code,
            "cfdi_uuid":     getattr(e, "cfdi_uuid", None),
            "cfdi_status":   getattr(e, "cfdi_status", None),
            "balanced":      bool(sim.get("balanced")),
            "warning_count": len(warnings),
            "warnings":      warnings,
            "lines":         sim.get("lines") or [],
        })

    return {
        "company_id":   company_id,
        "count":        len(rows),
        "balanced":     balanced_n,
        "unmapped":     unmapped_n,
        "missing_iva":  missing_iva,
        "total_debit":  f"{total_debit:.2f}",
        "total_credit": f"{total_credit:.2f}",
        "rows":         rows,
    }
