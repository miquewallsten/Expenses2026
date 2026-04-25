"""NetSuite adapter — Phase 7.3.

Emits a NetSuite SuiteTalk REST-compatible ``journalentry.json`` payload —
a list of ``JournalEntry`` records with a ``line.items`` collection per
record. Customer's NetSuite integration POSTs each entry to
``/services/rest/record/v1/journalentry``.
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


def _render_netsuite_journal_entries(bulk: dict) -> bytes:
    entries = []
    for r in bulk.get("rows") or []:
        memo = (r.get("description") or "")[:999]
        tran_date = r.get("date") or ""
        items = []
        for line in r.get("lines") or []:
            debit = _money(line.get("debit"))
            credit = _money(line.get("credit"))
            items.append({
                "account": {"refName": line.get("account_code") or ""},
                "debit": debit,
                "credit": credit,
                "memo": (line.get("note") or memo)[:999],
            })
        entries.append({
            "tranDate": tran_date,
            "memo": memo,
            "externalId": f"expense-{r.get('expense_id')}",
            "line": {"items": items},
        })
    return json.dumps({"journalEntries": entries}, separators=(",", ":")).encode("utf-8")


class NetSuiteAdapter:
    vendor = "netsuite"

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
            payload_bytes = _render_netsuite_journal_entries(bulk)
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
            artifacts={"journalentry.json": payload_bytes},
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
                "externalId": f"user-{u.id}",
                "email": u.email,
                "entityName": u.full_name,
                "role": u.role,
            }
            for u in rows
        ]
        return AdapterResult(items_ok=len(records), payload={"employees": records})

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
            {"externalId": f"cc-{c.id}", "name": c.name, "subsidiaryRef": c.code}
            for c in rows
        ]
        return AdapterResult(
            items_ok=len(records), payload={"departments": records}
        )
