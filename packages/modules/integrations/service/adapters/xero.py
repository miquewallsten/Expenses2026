"""Xero adapter — Phase 7.5.

Emits a Xero-compatible ``manual_journals.json`` payload — a list of
``ManualJournal`` records each with a ``JournalLines[]`` array.
Convention: positive ``LineAmount`` = debit, negative = credit.
Customer's Xero integration POSTs to ``/api.xro/2.0/ManualJournals``.
"""
from __future__ import annotations

import json
from decimal import Decimal

from sqlalchemy.orm import Session

from packages.core.platform.models_cost_center import CostCenter
from packages.core.platform.models_user import User
from packages.modules.accounting.service.bulk_simulator_service import bulk_simulate
from packages.modules.integrations.models import Integration
from packages.modules.integrations.service.adapters.protocol import AdapterResult


def _money(v: object) -> Decimal:
    if v in (None, ""):
        return Decimal("0")
    return Decimal(str(v))


def _render_xero_manual_journals(bulk: dict) -> bytes:
    journals = []
    for r in bulk.get("rows") or []:
        narration = (r.get("description") or f"Expense {r.get('expense_id')}")[:255]
        date = r.get("date") or ""
        lines = []
        for line in r.get("lines") or []:
            debit = _money(line.get("debit"))
            credit = _money(line.get("credit"))
            line_amount = debit - credit  # +ve = debit, -ve = credit
            lines.append({
                "LineAmount": float(line_amount),
                "AccountCode": line.get("account_code") or "",
                "Description": (line.get("note") or narration)[:4000],
            })
        journals.append({
            "Narration": narration,
            "Date": date,
            "Status": "DRAFT",
            "JournalLines": lines,
        })
    return json.dumps({"ManualJournals": journals}, separators=(",", ":")).encode("utf-8")


class XeroAdapter:
    vendor = "xero"

    def export_polizas(
        self, db: Session, integration: Integration, period: str | None = None
    ) -> AdapterResult:
        bulk = bulk_simulate(db, integration.company_id, limit=200)
        rows = bulk.get("rows") or []
        if not rows:
            return AdapterResult(
                items_ok=0, items_failed=0, payload={"period": period}
            )
        try:
            payload_bytes = _render_xero_manual_journals(bulk)
        except Exception as exc:  # pragma: no cover
            return AdapterResult(
                items_ok=0, items_failed=len(rows),
                error_summary=f"render error: {exc}",
            )
        return AdapterResult(
            items_ok=len(rows),
            items_failed=0,
            payload={
                "period": period,
                "count": len(rows),
                "total_debit": bulk.get("total_debit"),
                "total_credit": bulk.get("total_credit"),
            },
            artifacts={"manual_journals.json": payload_bytes},
        )

    def sync_users(
        self, db: Session, integration: Integration
    ) -> AdapterResult:
        rows = (
            db.query(User)
            .filter(User.company_id == integration.company_id)
            .order_by(User.id.asc())
            .all()
        )
        records = [
            {
                "EmployeeID": str(u.id),
                "FirstName": (u.full_name or "").split(" ", 1)[0],
                "LastName": (u.full_name or "").split(" ", 1)[1] if " " in (u.full_name or "") else "",
                "Email": u.email,
                "Status": "ACTIVE" if u.role else "INACTIVE",
            }
            for u in rows
        ]
        return AdapterResult(items_ok=len(records), payload={"Employees": records})

    def sync_cost_centers(
        self, db: Session, integration: Integration
    ) -> AdapterResult:
        rows = (
            db.query(CostCenter)
            .filter(
                CostCenter.company_id == integration.company_id,
                CostCenter.status == "active",
            )
            .order_by(CostCenter.id.asc())
            .all()
        )
        records = [
            {
                "TrackingCategoryID": str(c.id),
                "Name": c.name,
                "Option": c.code,
            }
            for c in rows
        ]
        return AdapterResult(
            items_ok=len(records), payload={"TrackingCategories": records}
        )
