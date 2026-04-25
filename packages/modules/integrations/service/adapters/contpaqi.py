"""Contpaqi adapter — wraps ``render_contpaqi`` poliza XML output."""
from __future__ import annotations

from sqlalchemy.orm import Session

from packages.core.platform.models_cost_center import CostCenter
from packages.core.platform.models_user import User
from packages.modules.accounting.service.bulk_simulator_service import bulk_simulate
from packages.modules.accounting.service.poliza_export_service import render_contpaqi
from packages.modules.integrations.models import Integration
from packages.modules.integrations.service.adapters.protocol import AdapterResult


class ContpaqiAdapter:
    vendor = "contpaqi"

    def export_polizas(
        self, db: Session, integration: Integration, period: str | None = None
    ) -> AdapterResult:
        bulk = bulk_simulate(db, integration.company_id, limit=200)
        rows = bulk.get("rows") or []
        if not rows:
            return AdapterResult(items_ok=0, items_failed=0, payload={"period": period})
        try:
            xml = render_contpaqi(bulk)
        except Exception as exc:  # pragma: no cover - defensive
            return AdapterResult(
                items_ok=0,
                items_failed=len(rows),
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
            artifacts={"polizas.xml": xml.encode("utf-8")},
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
        return AdapterResult(items_ok=len(records), payload={"cost_centers": records})
