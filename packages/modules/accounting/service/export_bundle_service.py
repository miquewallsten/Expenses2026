"""export_bundle_service.py

Assembles a read-only export bundle for a company.

The bundle groups accounting events and archive file metadata for all
expenses that are eligible for export (status = "approved").
Nothing is persisted here -- callers decide what to do with the returned
dict (write to disk, push to a downstream system, etc.).
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone

from sqlalchemy.orm import Session

import re

from packages.core.platform.models_archive_file import ArchiveFile
from packages.core.platform.models_export_bundle_config import ExportBundleConfig
from packages.modules.expenses.models.expense import Expense
from packages.modules.accounting.service.accounting_event_service import generate_accounting_event

_DEFAULT_BUNDLE_PATTERN = "company{company_id}_{date}_export_bundle"

_log = logging.getLogger(__name__)


def _render_bundle_name(pattern: str, context: dict) -> str:
    """Replace {token} placeholders in *pattern* with values from *context*.

    Unknown tokens are left as-is so partial contexts never produce silent
    empty segments.
    """
    def _replace(m: re.Match) -> str:
        key = m.group(1)
        return str(context[key]) if key in context else m.group(0)

    return re.sub(r"\{(\w+)\}", _replace, pattern)

# Expenses in this status are candidates for bundle inclusion.
# Only approved expenses are ready for accounting export.
# Excludes: draft (incomplete), submitted (pending approval),
# manager_approved (pending accounting review), rejected (terminal failure).
_ELIGIBLE_STATUSES = ("approved",)


def _empty_bundle(company_id: int, generated_at: str) -> dict:
    """Return a valid, empty bundle dict."""
    return {
        "company_id":    company_id,
        "bundle_name":   _render_bundle_name(_DEFAULT_BUNDLE_PATTERN, {
            "company_id": company_id,
            "date":       generated_at[:10],
            "year":       generated_at[:4],
            "month":      generated_at[5:7],
        }),
        "generated_at":  generated_at,
        "expense_count": 0,
        "events":        [],
        "archive_files": [],
        "manifest": {
            "event_count":        0,
            "archive_file_count": 0,
            "expenses":           [],
        },
    }


def build_export_bundle(db: Session, company_id: int) -> dict:
    """Build an export bundle for *company_id*.

    Always returns a valid dict -- never raises.  Per-expense failures are
    recorded in manifest.expenses[].error; infrastructure failures fall back
    to an empty bundle logged at ERROR level.
    """
    generated_at = datetime.now(tz=timezone.utc).isoformat()

    # -- 1. Eligible expenses ------------------------------------------------
    try:
        all_company_expenses = db.query(Expense).filter(Expense.company_id == company_id).all()
        approved_company_expenses = db.query(Expense).filter(
            Expense.company_id == company_id,
            Expense.status == "approved",
        ).all()

        _log.debug("[export_bundle] company_id=%s total=%s approved=%s",
                   company_id, len(all_company_expenses), len(approved_company_expenses))

        expenses = approved_company_expenses
        _log.debug("[export_bundle] final_candidate_expenses=%s", len(expenses))

    except Exception as exc:  # noqa: BLE001
        _log.error("[export_bundle] company=%s failed to load expenses: %s", company_id, exc)
        return _empty_bundle(company_id, generated_at)

    expense_ids = [e.id for e in expenses]

    # -- 2. Archive metadata for those expenses ------------------------------
    try:
        archive_rows: list[ArchiveFile] = (
            db.query(ArchiveFile)
            .filter(
                ArchiveFile.company_id == company_id,
                ArchiveFile.expense_id.in_(expense_ids),
            )
            .order_by(ArchiveFile.expense_id, ArchiveFile.id)
            .all()
        ) if expense_ids else []
    except Exception as exc:  # noqa: BLE001
        _log.error("[export_bundle] company=%s failed to load archive rows: %s", company_id, exc)
        archive_rows = []

    # Index by expense_id for quick manifest look-ups
    archive_by_expense: dict[int, list[ArchiveFile]] = {}
    for af in archive_rows:
        archive_by_expense.setdefault(af.expense_id, []).append(af)  # type: ignore[arg-type]

    # -- 3. Accounting events (per-expense, never crash the loop) ------------
    events: list[dict] = []
    event_expense_ids: set[int] = set()
    event_errors: dict[int, str] = {}  # expense_id -> error message

    for expense in expenses:
        try:
            event = generate_accounting_event(db, expense.id)
            events.append(event)
            event_expense_ids.add(expense.id)
        except Exception as exc:  # noqa: BLE001
            msg = str(exc) or type(exc).__name__
            event_errors[expense.id] = msg
            _log.debug("[export_bundle] event skip expense=%s error=%r", expense.id, msg)

    if event_errors:
        _log.debug("[export_bundle] company=%s skipped %s expense(s)", company_id, len(event_errors))

    # -- 4. Bundle name from stored config -----------------------------------
    try:
        config: ExportBundleConfig | None = (
            db.query(ExportBundleConfig)
            .filter(ExportBundleConfig.company_id == company_id)
            .first()
        )
        pattern = config.bundle_name_pattern if config else _DEFAULT_BUNDLE_PATTERN
    except Exception:  # noqa: BLE001
        pattern = _DEFAULT_BUNDLE_PATTERN

    now = datetime.now(tz=timezone.utc)
    bundle_ctx = {
        "company_id": company_id,
        "date":       now.strftime("%Y-%m-%d"),
        "year":       now.strftime("%Y"),
        "month":      now.strftime("%m"),
    }
    bundle_name = _render_bundle_name(pattern, bundle_ctx)

    # -- 5. Manifest ---------------------------------------------------------
    manifest_expenses: list[dict] = []
    for expense in expenses:
        af_ids = [af.id for af in archive_by_expense.get(expense.id, [])]
        entry: dict = {
            "expense_id":                expense.id,
            "accounting_event_included": expense.id in event_expense_ids,
            "archive_file_ids":          af_ids,
        }
        if expense.id in event_errors:
            entry["error"] = event_errors[expense.id]
        manifest_expenses.append(entry)

    manifest = {
        "event_count":        len(events),
        "archive_file_count": len(archive_rows),
        "expenses":           manifest_expenses,
    }

    # -- 6. Archive file list (JSON-safe) ------------------------------------
    archive_files_out: list[dict] = []
    for af in archive_rows:
        try:
            archive_files_out.append({
                "id":              af.id,
                "expense_id":      af.expense_id,
                "file_name":       af.file_name,
                "file_type":       af.file_type,
                "source_type":     af.source_type,
                "storage_backend": af.storage_backend,
                "storage_key":     af.storage_key,
                "created_at":      af.created_at.isoformat() if af.created_at else None,
            })
        except Exception:  # noqa: BLE001 - skip malformed rows
            pass

    return {
        "company_id":    company_id,
        "bundle_name":   bundle_name,
        "generated_at":  generated_at,
        "expense_count": len(expenses),
        "events":        events,
        "archive_files": archive_files_out,
        "manifest":      manifest,
    }
