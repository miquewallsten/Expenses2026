"""Oracle / JD Edwards adapter — Phase 7.4.

JDE imports journal entries via the F0911Z1 batch interface table — one CSV
row per movement (debit/credit line), grouped by ``EDOC`` (batch document
number). The customer's JDE batch processor reads the file and runs the
Journal Entry Batch Processor (R09110Z) to post.
"""
from __future__ import annotations

import csv
import io
from decimal import Decimal

from sqlalchemy.orm import Session

from packages.core.platform.models_cost_center import CostCenter
from packages.core.platform.models_user import User
from packages.modules.accounting.service.bulk_simulator_service import bulk_simulate
from packages.modules.integrations.models import Integration
from packages.modules.integrations.service.adapters.protocol import AdapterResult


# Canonical F0911Z1 columns used by most JDE installs.
_F0911Z1_HEADERS = (
    "EDUS",   # User ID
    "EDBT",   # Batch Number
    "EDTN",   # Transaction Number
    "EDLN",   # Line Number
    "EDOC",   # Document Number (one per poliza)
    "EDCT",   # Document Type ('JE')
    "EDDJ",   # G/L Date (ISO)
    "EXR",    # Explanation - Remark
    "ANI",    # Account Number
    "AA",     # Amount (signed: debit positive, credit negative)
    "U",      # Units
    "CRR",    # Currency Code
)


def _signed_amount(debit: object, credit: object) -> str:
    d = Decimal(str(debit or 0))
    c = Decimal(str(credit or 0))
    return f"{(d - c):.2f}"


def _render_jde_z_file(bulk: dict) -> str:
    rows = bulk.get("rows") or []
    buf = io.StringIO()
    writer = csv.writer(buf, lineterminator="\n")
    writer.writerow(_F0911Z1_HEADERS)
    for r in rows:
        eid = str(r.get("expense_id") or "")
        edoc = eid
        gl_date = r.get("date") or ""
        memo = (r.get("description") or "")[:30]  # JDE EXR is 30 chars
        for idx, line in enumerate(r.get("lines") or [], start=1):
            writer.writerow([
                "EXPSYS",                # EDUS
                edoc,                    # EDBT (1 batch per expense)
                eid,                     # EDTN
                idx,                     # EDLN
                edoc,                    # EDOC
                "JE",                    # EDCT
                gl_date,                 # EDDJ
                memo,                    # EXR
                line.get("account_code") or "",  # ANI
                _signed_amount(line.get("debit"), line.get("credit")),  # AA
                "",                      # U
                "MXN",                   # CRR
            ])
    return buf.getvalue()


class OracleJDEAdapter:
    vendor = "oracle"

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
            csv_text = _render_jde_z_file(bulk)
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
            artifacts={"F0911Z1.csv": csv_text.encode("utf-8")},
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
                "AN8": u.id,           # JDE Address Book Number
                "MLNM": u.full_name,   # Mailing Name
                "EMAL": u.email,
                "ROLE": u.role,
            }
            for u in rows
        ]
        return AdapterResult(items_ok=len(records), payload={"address_book": records})

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
        records = [{"MCU": c.code, "DL01": c.name} for c in rows]
        return AdapterResult(
            items_ok=len(records), payload={"business_units": records}
        )
