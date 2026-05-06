"""export_router.py

POST /accounting/export/{company_id}

Loads all submitted expenses for a company, generates an accounting event for
each one that has sufficient data, and returns the full export payload with
rendered filename and folder path derived from ExportConfig.

No file I/O is performed — callers receive the payload in the response body
and are responsible for writing to disk, S3, etc.

Response shape
--------------
{
    "filename": str,
    "folder":   str,
    "format":   str,        # "csv" | "json"
    "data": [
        {
            "expense_id": int,
            "event":      dict | None,   # None when event generation failed
            "error":      str | None,    # populated when event is None
        },
        ...
    ],
}
"""

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from apps.api.deps import get_db
from packages.core.platform.models_export_config import ExportConfig
from packages.modules.expenses.models.expense import Expense
from packages.modules.accounting.service.accounting_event_service import generate_accounting_event
from packages.modules.accounting.service.export_config_service import (
    render_filename,
    render_folder,
)

router = APIRouter(prefix="/accounting/export", tags=["accounting-export"])

# Default config values used when no ExportConfig row exists for the company.
_DEFAULT_FILE_PATTERN   = "{company}_{date}_{batch_id}.csv"
_DEFAULT_FOLDER_PATTERN = "{year}/{month}/"
_DEFAULT_EXPORT_FORMAT  = "csv"


def _get_or_default_config(db: Session, company_id: int) -> ExportConfig:
    """Return the ExportConfig for *company_id*, or a transient default instance."""
    existing = (
        db.query(ExportConfig)
        .filter(ExportConfig.company_id == company_id)
        .first()
    )
    if existing is not None:
        return existing
    # Build an unsaved default so the rendering functions still work.
    cfg = ExportConfig()
    cfg.file_pattern   = _DEFAULT_FILE_PATTERN
    cfg.folder_pattern = _DEFAULT_FOLDER_PATTERN
    cfg.export_format  = _DEFAULT_EXPORT_FORMAT
    cfg.date_format    = None
    return cfg


def _build_context(company_id: int, batch_id: str, date_fmt: str | None) -> dict:
    now = datetime.utcnow()
    fmt = date_fmt or "%Y-%m-%d"
    return {
        "company":  str(company_id),
        "date":     now.strftime(fmt),
        "batch_id": batch_id,
        "year":     now.strftime("%Y"),
        "month":    now.strftime("%m"),
    }


@router.post("/{company_id}")
def export_accounting_events(
    company_id: int,
    db: Session = Depends(get_db),
):
    """Generate accounting events for all approved expenses of *company_id*
    and return the export payload with rendered filename/folder.
    """
    # ── Load approved expenses ───────────────────────────────────────────────
    expenses: list[Expense] = (
        db.query(Expense)
        .filter(
            Expense.company_id == company_id,
            Expense.status == "approved",
        )
        .order_by(Expense.id)
        .all()
    )

    if not expenses:
        raise HTTPException(
            status_code=404,
            detail=f"No approved expenses found for company {company_id}.",
        )

    # ── Generate events ───────────────────────────────────────────────────────
    data: list[dict] = []
    for expense in expenses:
        try:
            event = generate_accounting_event(db, expense.id)
            data.append({"expense_id": expense.id, "event": event, "error": None})
        except (ValueError, Exception) as exc:
            data.append({"expense_id": expense.id, "event": None, "error": str(exc)})

    # ── Apply naming from ExportConfig ────────────────────────────────────────
    config  = _get_or_default_config(db, company_id)
    batch_id = f"{len(data):04d}"       # zero-padded item count as a simple batch key
    context  = _build_context(company_id, batch_id, config.date_format)

    filename = render_filename(config, context)
    folder   = render_folder(config, context)

    return {
        "filename": filename,
        "folder":   folder,
        "format":   config.export_format,
        "data":     data,
    }
