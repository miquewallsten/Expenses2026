"""Generic CSV/JSON adapter — produces a zip artifact for any ERP."""
from __future__ import annotations

import csv
import io
import json
import zipfile
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy.orm import Session

from packages.modules.expenses.models.expense import Expense
from packages.modules.integrations.models import Integration
from packages.modules.integrations.service.adapters.protocol import AdapterResult


def _json_default(value: object) -> str:
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, Decimal):
        return f"{value:.2f}"
    raise TypeError(f"Unserializable: {type(value)!r}")


class GenericCsvJsonAdapter:
    """Bundles approved expenses as expenses.csv + expenses.json inside zip."""

    vendor = "custom"

    def _approved(self, db: Session, integration: Integration) -> list[Expense]:
        return (
            db.query(Expense)
            .filter(
                Expense.company_id == integration.company_id,
                Expense.status == "approved",
            )
            .order_by(Expense.id.asc())
            .all()
        )

    def export_polizas(
        self, db: Session, integration: Integration, period: str | None = None
    ) -> AdapterResult:
        rows = self._approved(db, integration)
        records = [
            {
                "id": e.id,
                "amount": str(e.amount or Decimal("0")),
                "description": e.description,
                "category_code": e.category_code,
                "expense_date": e.expense_date,
                "status": e.status,
            }
            for e in rows
        ]

        csv_buf = io.StringIO()
        writer = csv.DictWriter(
            csv_buf,
            fieldnames=["id", "amount", "description", "category_code", "expense_date", "status"],
        )
        writer.writeheader()
        for r in records:
            writer.writerow({**r, "expense_date": r["expense_date"].isoformat() if r["expense_date"] else ""})

        json_bytes = json.dumps(
            {"period": period, "count": len(records), "expenses": records},
            default=_json_default,
            separators=(",", ":"),
        ).encode("utf-8")

        zip_buf = io.BytesIO()
        with zipfile.ZipFile(zip_buf, "w", zipfile.ZIP_DEFLATED) as zf:
            zf.writestr("expenses.csv", csv_buf.getvalue())
            zf.writestr("expenses.json", json_bytes)

        return AdapterResult(
            items_ok=len(records),
            payload={"period": period, "count": len(records)},
            artifacts={"export.zip": zip_buf.getvalue()},
        )

    def sync_users(
        self, db: Session, integration: Integration
    ) -> AdapterResult:
        return AdapterResult(
            items_ok=0,
            error_summary="sync_users not supported by generic adapter",
        )

    def sync_cost_centers(
        self, db: Session, integration: Integration
    ) -> AdapterResult:
        return AdapterResult(
            items_ok=0,
            error_summary="sync_cost_centers not supported by generic adapter",
        )
