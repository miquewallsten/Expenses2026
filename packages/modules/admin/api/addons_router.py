"""Add-on module data counts — used by the uninstall confirmation dialog."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func as sa_func, text
from sqlalchemy.orm import Session

from apps.api.auth import get_current_user, require_admin, require_same_company
from apps.api.deps import get_db
from packages.core.platform.models_user import User

router = APIRouter(
    prefix="/admin/addons",
    tags=["admin-addons"],
    dependencies=[Depends(require_admin)],
)

# Maps module key → list of (table_name, label) for data counting.
# Only tables that the module *owns* (not shared core tables).
_MODULE_TABLES: dict[str, list[str]] = {
    "archive": ["archive_files"],
    "time_allocation": ["time_projects", "time_activities", "time_entries", "time_assignments"],
    "purchase_requests": ["purchase_requests", "request_attachments"],
    "amex_reconciliation": ["amex_statements", "amex_statement_lines", "amex_cfdi_documents"],
    "subcontractor": [],  # uses shared Client table — no module-specific tables
}


@router.get("/{company_id}/data-counts")
def get_addon_data_counts(
    company_id: int,
    module: str = Query(..., description="Add-on module key"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return row counts for tables owned by the given add-on module.

    Used by the uninstall confirmation dialog to show the admin how many
    rows will be preserved (not deleted) when disabling the module.
    """
    require_same_company(company_id, current_user)

    tables = _MODULE_TABLES.get(module, [])
    result: dict[str, int] = {}

    for table_name in tables:
        # Use raw SQL for flexibility — these tables all have company_id
        try:
            count = db.execute(
                text(f"SELECT COUNT(*) FROM {table_name} WHERE company_id = :cid"),
                {"cid": company_id},
            ).scalar()
            result[table_name] = count or 0
        except Exception:
            result[table_name] = -1  # table might not exist yet

    return result
