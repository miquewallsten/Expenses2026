"""Aspel COI adapter — Phase 7.1.

Aspel COI imports polizas from a flat CSV in the shape:

    Tipo,Numero,Fecha,Concepto,Cuenta,Debe,Haber,Concepto_Mov,Referencia

One row per movement (debit/credit line); the polizas header repeats for each
movement of the same poliza, which is how Aspel's import module groups them.
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


_ASPEL_HEADERS = (
    "Tipo", "Numero", "Fecha", "Concepto",
    "Cuenta", "Debe", "Haber", "Concepto_Mov", "Referencia",
)


def _money(v: object) -> str:
    if v in (None, "", 0):
        return "0.00"
    return f"{Decimal(str(v)):.2f}"


def _render_aspel_csv(bulk: dict) -> str:
    rows = bulk.get("rows") or []
    buf = io.StringIO()
    writer = csv.writer(buf, lineterminator="\n")
    writer.writerow(_ASPEL_HEADERS)
    for r in rows:
        # Aspel COI: 1 = "Diario" (journal). Concepto = expense description.
        # Numero = expense_id, Fecha = ISO date or empty.
        tipo = "Dr"
        numero = str(r.get("expense_id") or "")
        fecha = r.get("date") or ""
        concepto = (r.get("description") or "")[:200]
        ref = r.get("category_code") or ""
        for line in r.get("lines") or []:
            writer.writerow([
                tipo, numero, fecha, concepto,
                line.get("account_code") or "",
                _money(line.get("debit")),
                _money(line.get("credit")),
                (line.get("note") or "")[:200],
                ref,
            ])
    return buf.getvalue()


class AspelAdapter:
    vendor = "aspel"

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
            csv_text = _render_aspel_csv(bulk)
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
            artifacts={"polizas_aspel.csv": csv_text.encode("utf-8")},
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
            {"id": u.id, "email": u.email, "full_name": u.full_name, "role": u.role}
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
        records = [{"id": c.id, "code": c.code, "name": c.name} for c in rows]
        return AdapterResult(
            items_ok=len(records), payload={"cost_centers": records}
        )
