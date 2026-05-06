"""HRIS CSV adapter — Phase 7.6.

Inbound user sync from an HRIS export. Reads a CSV (from
``integration.config_json["csv_content"]`` for tests, or
``integration.config_json["csv_url"]`` in prod via httpx) and upserts
``User`` rows scoped to the integration's company.

Expected columns (case-insensitive, extra columns ignored):
    email, full_name, role, employee_id, status

``status`` ∈ {active, inactive}. Inactive rows mark an existing user as
``role='disabled'`` (we never delete — audit + FK safety).

SAML SSO is intentionally out of scope here; tracked separately.
"""
from __future__ import annotations

import csv
import io

from sqlalchemy.orm import Session

from packages.core.platform.models_user import User
from packages.modules.integrations.models import Integration
from packages.modules.integrations.service.adapters.protocol import AdapterResult


_ALLOWED_ROLES = {"admin", "manager", "accounting", "employee", "finance_manager"}


def _normalize_row(row: dict[str, str]) -> dict[str, str]:
    return {(k or "").strip().lower(): (v or "").strip() for k, v in row.items()}


def _parse_csv(text: str) -> list[dict[str, str]]:
    reader = csv.DictReader(io.StringIO(text))
    return [_normalize_row(r) for r in reader]


class HrisCsvAdapter:
    vendor = "hris_csv"

    def export_polizas(
        self, db: Session, integration: Integration, period: str | None = None
    ) -> AdapterResult:
        # HRIS doesn't export polizas.
        return AdapterResult(
            items_ok=0, items_failed=0,
            error_summary="hris_csv adapter does not support export_polizas",
        )

    def sync_users(
        self, db: Session, integration: Integration
    ) -> AdapterResult:
        cfg = integration.config_json or {}
        csv_text = cfg.get("csv_content") or ""
        if not csv_text:
            return AdapterResult(
                items_ok=0, items_failed=0,
                error_summary="no csv_content in integration.config_json",
            )
        try:
            records = _parse_csv(csv_text)
        except Exception as exc:
            return AdapterResult(
                items_ok=0, items_failed=0,
                error_summary=f"csv parse error: {exc}",
            )

        created = 0
        updated = 0
        disabled = 0
        failed = 0
        errors: list[str] = []

        for rec in records:
            email = rec.get("email") or ""
            if not email:
                failed += 1
                errors.append("row missing email")
                continue
            full_name = rec.get("full_name") or rec.get("name") or email
            role = (rec.get("role") or "employee").lower()
            if role not in _ALLOWED_ROLES:
                role = "employee"
            status = (rec.get("status") or "active").lower()

            existing = (
                db.query(User)
                .filter(
                    User.company_id == integration.company_id,
                    User.email == email,
                )
                .one_or_none()
            )
            if status == "inactive":
                if existing is not None and existing.role != "disabled":
                    existing.role = "disabled"
                    disabled += 1
                continue
            if existing is None:
                db.add(User(
                    company_id=integration.company_id,
                    email=email,
                    full_name=full_name,
                    role=role,
                ))
                created += 1
            else:
                changed = False
                if existing.full_name != full_name:
                    existing.full_name = full_name
                    changed = True
                if existing.role != role:
                    existing.role = role
                    changed = True
                if changed:
                    updated += 1

        db.flush()

        items_ok = created + updated + disabled
        return AdapterResult(
            items_ok=items_ok,
            items_failed=failed,
            error_summary="; ".join(errors) if errors else None,
            payload={
                "created": created,
                "updated": updated,
                "disabled": disabled,
                "rows_seen": len(records),
            },
        )

    def sync_cost_centers(
        self, db: Session, integration: Integration
    ) -> AdapterResult:
        return AdapterResult(
            items_ok=0, items_failed=0,
            error_summary="hris_csv adapter does not support sync_cost_centers",
        )
