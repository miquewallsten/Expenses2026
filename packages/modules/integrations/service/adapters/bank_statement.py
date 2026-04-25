"""Bank statement ingest adapter — Phase 7.7.

Read-only adapter that parses a bank/credit-card statement file into a
normalised list of transactions. Reuses the Amex CSV parser
(`parse_amex_csv`) — its header-alias resolution is generic enough for most
Mexican bank exports (BBVA, Santander, Banorte, HSBC) and Amex itself.

Adapter does NOT post to the GL — payments stay with the ERP. Output is
intended to drive AMEX-style reconciliation: the customer matches each line
to an approved expense via the existing matching service.

Input shape (`integration.config_json`):
    {
        "csv_content": "<utf-8 csv text>",   # required (or csv_url in prod)
    }

Output payload:
    {
        "currency": "MXN",
        "card_last4": "1234" | null,
        "period_start": "YYYY-MM-DD" | null,
        "period_end": "YYYY-MM-DD" | null,
        "total_amount": "12345.67",
        "lines": [
            {
                "line_no": int,
                "posted_date": ISO | null,
                "description": str,
                "merchant": str | null,
                "amount": str,         # positive
                "is_credit": bool,
                "currency": str,
                "reference": str | null,
            }, ...
        ],
    }
"""
from __future__ import annotations

from sqlalchemy.orm import Session

from packages.modules.amex.csv_parser import parse_amex_csv
from packages.modules.integrations.models import Integration
from packages.modules.integrations.service.adapters.protocol import AdapterResult


def _line_to_dict(line) -> dict:  # ParsedLine
    return {
        "line_no": line.line_no,
        "posted_date": line.posted_date.isoformat() if line.posted_date else None,
        "description": line.description,
        "merchant": line.merchant,
        "amount": f"{line.amount:.2f}",
        "is_credit": line.is_credit,
        "currency": line.currency,
        "reference": line.reference,
    }


class BankStatementAdapter:
    vendor = "bank_statement"

    def export_polizas(
        self, db: Session, integration: Integration, period: str | None = None
    ) -> AdapterResult:
        return AdapterResult(
            items_ok=0, items_failed=0,
            error_summary="bank_statement adapter does not support export_polizas",
        )

    def sync_users(
        self, db: Session, integration: Integration
    ) -> AdapterResult:
        return AdapterResult(
            items_ok=0, items_failed=0,
            error_summary="bank_statement adapter does not support sync_users",
        )

    def sync_cost_centers(
        self, db: Session, integration: Integration
    ) -> AdapterResult:
        return AdapterResult(
            items_ok=0, items_failed=0,
            error_summary="bank_statement adapter does not support sync_cost_centers",
        )

    def ingest_statement(
        self, db: Session, integration: Integration
    ) -> AdapterResult:
        """Parse the CSV in config_json into normalised line records."""
        cfg = integration.config_json or {}
        csv_text = cfg.get("csv_content") or ""
        if not csv_text:
            return AdapterResult(
                items_ok=0, items_failed=0,
                error_summary="no csv_content in integration.config_json",
            )
        try:
            parsed = parse_amex_csv(csv_text.encode("utf-8"))
        except Exception as exc:
            return AdapterResult(
                items_ok=0, items_failed=0,
                error_summary=f"parse error: {exc}",
            )
        return AdapterResult(
            items_ok=len(parsed.lines),
            items_failed=0,
            payload={
                "currency": parsed.currency,
                "card_last4": parsed.card_last4,
                "period_start": parsed.period_start.isoformat()
                if parsed.period_start else None,
                "period_end": parsed.period_end.isoformat()
                if parsed.period_end else None,
                "total_amount": f"{parsed.total_amount:.2f}",
                "lines": [_line_to_dict(line) for line in parsed.lines],
            },
        )
