"""QuickBooks Online adapter — Phase 7.5.

Emits a QBO-compatible ``journal_entries.json`` payload — a list of
``JournalEntry`` records each with a ``Line[]`` array. Customer's
QBO integration POSTs each entry to ``/v3/company/<realmId>/journalentry``.
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


def _render_qbo_journal_entries(bulk: dict) -> bytes:
    entries = []
    for r in bulk.get("rows") or []:
        memo = (r.get("description") or "")[:4000]
        tran_date = r.get("date") or ""
        eid = r.get("expense_id")
        line_items: list[dict] = []
        for line in r.get("lines") or []:
            debit = _money(line.get("debit"))
            credit = _money(line.get("credit"))
            posting = "Debit" if debit > 0 else "Credit"
            amount = debit if debit > 0 else credit
            line_items.append({
                "Amount": amount,
                "DetailType": "JournalEntryLineDetail",
                "Description": (line.get("note") or memo)[:4000],
                "JournalEntryLineDetail": {
                    "PostingType": posting,
                    "AccountRef": {"value": line.get("account_code") or ""},
                },
            })
        entries.append({
            "DocNumber": f"expense-{eid}",
            "TxnDate": tran_date,
            "PrivateNote": memo,
            "Line": line_items,
        })
    return json.dumps({"JournalEntries": entries}, separators=(",", ":")).encode("utf-8")


class QuickBooksAdapter:
    vendor = "quickbooks"

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
            payload_bytes = _render_qbo_journal_entries(bulk)
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
            artifacts={"journal_entries.json": payload_bytes},
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
                "Id": str(u.id),
                "DisplayName": u.full_name,
                "PrimaryEmailAddr": {"Address": u.email},
                "Role": u.role,
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
                "Id": str(c.id),
                "Name": c.name,
                "ClassRef": c.code,
            }
            for c in rows
        ]
        return AdapterResult(
            items_ok=len(records), payload={"Classes": records}
        )
