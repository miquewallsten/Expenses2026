"""export_bundle_router.py

POST /accounting/export-bundles/{company_id}

Builds and returns a full export bundle for a company: accounting events,
archive file metadata, and a per-expense manifest.  The bundle is returned
in the response body — no file I/O is performed here.

If no eligible expenses exist the endpoint still returns a valid, empty bundle
(HTTP 200) rather than an error — callers should inspect ``expense_count``.
"""

import logging

from fastapi import APIRouter, Depends, Depends, HTTPException
from sqlalchemy.orm import Session

from packages.core.platform.module_gate import require_module
from apps.api.auth import require_admin, require_same_company, get_current_user
from apps.api.deps import get_db
from packages.modules.accounting.service.export_bundle_service import build_export_bundle

_log = logging.getLogger(__name__)

router = APIRouter(prefix="/accounting/export-bundles", dependencies=[Depends(require_admin), Depends(require_module("accounting"))], tags=["accounting"])


@router.post("/{company_id}")
def create_export_bundle(
    company_id: int,
    db: Session = Depends(get_db),
) -> dict:
    """Build an export bundle for *company_id*.

    Gathers all approved expenses, generates accounting events, and collects
    linked archive file metadata.  Expenses that fail event generation are
    included in the manifest with ``accounting_event_included: false`` and an
    ``error`` field — the bundle is never aborted by a single bad expense.
    """
    try:
        return build_export_bundle(db=db, company_id=company_id)
    except Exception:
        _log.exception("Unexpected error building export bundle for company %s", company_id)
        raise HTTPException(status_code=500, detail="Failed to build export bundle.")


# ── DEV SMOKE TEST ────────────────────────────────────────────────────────────
# Run against a local server (uvicorn) with X-User-Id: 1.
#
# 1. Create an exportable expense (status must end up as "approved"):
#
#    curl -s -X POST http://127.0.0.1:8000/expenses/ \
#         -H "Content-Type: application/json" \
#         -H "X-User-Id: 1" \
#         -d '{"company_id":1,"amount":99.00,"description":"smoke test","currency":"USD"}' \
#    | python3 -m json.tool
#
#    Note the returned "id" (EXPENSE_ID).  Then advance its status to approved
#    via the review/accounting approve endpoints, or patch it directly in the
#    DB for dev purposes.
#
# 2. Confirm an accounting event can be generated for that expense:
#
#    curl -s -X POST http://127.0.0.1:8000/accounting/work/$EXPENSE_ID/generate-event \
#         -H "X-User-Id: 1" | python3 -m json.tool
#
#    Expect: { "accounting_event": { ... }, "expense_id": $EXPENSE_ID }
#
# 3. Attach an archive file so archive metadata appears in the bundle:
#
#    curl -s -X POST http://127.0.0.1:8000/archive/upload/1/expense/$EXPENSE_ID \
#         -F "file=@/path/to/receipt.pdf" | python3 -m json.tool
#
#    Expect: { "id": ARCHIVE_ID, "expense_id": $EXPENSE_ID, ... }
#
# 4. Call the export bundle endpoint:
#
#    curl -s -X POST http://127.0.0.1:8000/accounting/export-bundles/1 \
#         -H "X-User-Id: 1" | python3 -m json.tool
#
# 5. Verify the response shape:
#
#    {
#      "bundle_name":   "company1_2026-04-18_export_bundle",   ← rendered pattern
#      "expense_count": 1,
#      "events": [ { "expense_id": $EXPENSE_ID, ... } ],        ← at least one entry
#      "archive_files": [ { "id": ARCHIVE_ID, ... } ],          ← attached file present
#      "manifest": {
#        "event_count":        1,
#        "archive_file_count": 1,
#        "expenses": [
#          {
#            "expense_id":                $EXPENSE_ID,
#            "accounting_event_included": true,
#            "archive_file_ids":          [ARCHIVE_ID]
#            // "error" key only present when event generation failed
#          }
#        ]
#      }
#    }
#
#    If an expense failed event generation its manifest row will have:
#      "accounting_event_included": false,
#      "error": "<exception message>"
#    The bundle is still returned (HTTP 200) — partial failures never abort.
# ─────────────────────────────────────────────────────────────────────────────
