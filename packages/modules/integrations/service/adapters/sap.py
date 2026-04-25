"""SAP / SAP Business One adapter — Phase 7.2.

Emits a SAP Business One Service Layer-compatible ``JournalEntries.json``
payload with one ``JournalEntry`` per expense and ``JournalEntryLines``
per simulator line. Also returns ``users.json`` and ``cost_centers.json``
from the matching sync endpoints. SAP imports are POSTed by the customer's
Service Layer integration; this adapter only produces the artifact.
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


def _money(v: object) -> float:
    if v in (None, ""):
        return 0.0
    return float(Decimal(str(v)))


def _render_sap_journal_entries(bulk: dict) -> bytes:
    """Build SAP B1 Service Layer JournalEntries payload."""
    entries = []
    for r in bulk.get("rows") or []:
        memo = (r.get("description") or "")[:50]  # SAP Memo limit is 50
        ref_date = r.get("date") or ""
        lines = []
        for idx, line in enumerate(r.get("lines") or []):
            lines.append({
                "Line_ID": idx,
                "AccountCode": line.get("account_code") or "",
                "Debit": _money(line.get("debit")),
                "Credit": _money(line.get("credit")),
                "LineMemo": (line.get("note") or memo)[:50],
            })
        entries.append({
            "ReferenceDate": ref_date,
            "DueDate": ref_date,
            "TaxDate": ref_date,
            "Memo": memo,
            "Reference": str(r.get("expense_id") or ""),
            "JournalEntryLines": lines,
        })
    payload = {"JournalEntries": entries}
    return json.dumps(payload, separators=(",", ":")).encode("utf-8")


class SapAdapter:
    vendor = "sap"

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
            payload_bytes = _render_sap_journal_entries(bulk)
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
            artifacts={"JournalEntries.json": payload_bytes},
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
                "EmployeeID": u.id,
                "Email": u.email,
                "Name": u.full_name,
                "Role": u.role,
            }
            for u in rows
        ]
        return AdapterResult(items_ok=len(records), payload={"users": records})

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
            {"CostingCode": c.code, "CostingCodeName": c.name}
            for c in rows
        ]
        return AdapterResult(
            items_ok=len(records), payload={"cost_centers": records}
        )
