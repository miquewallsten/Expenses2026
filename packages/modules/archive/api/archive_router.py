"""archive_router.py

Upload endpoints for the archive module.

Developer smoke-test (run against a live local server)
-------------------------------------------------------
Replace ``1`` / ``42`` with real company_id / expense_id values from your
local DB seed.  Run the steps in order — each builds on the previous result.

── Step 1 · Read (or auto-create) archive config ─────────────────────────────

    curl -s http://localhost:8000/admin/archive-config/1 \\
      -H "X-User-Id: 1" | python3 -m json.tool
    # Expect 200 with {"company_id": 1, "file_pattern": "...", "folder_pattern": "..."}
    # A default row is created automatically if none exists — never 404.

── Step 2 · Update archive config ────────────────────────────────────────────

    curl -s -X PUT http://localhost:8000/admin/archive-config/1 \\
      -H "Content-Type: application/json" \\
      -H "X-User-Id: 1" \\
      -d '{"folder_pattern": "{year}/{month}/expenses", "file_pattern": "expense_{expense_id}_{date}"}' \\
      | python3 -m json.tool
    # Expect 200 with updated patterns.

── Step 3a · Generic archive upload (company + optional expense, free source_type) ──

    curl -s -X POST http://localhost:8000/archive/upload \\
      -H "X-User-Id: 1" \\
      -F "company_id=1" \\
      -F "expense_id=42" \\
      -F "source_type=upload" \\
      -F "file=@/tmp/test_receipt.pdf" | python3 -m json.tool
    # Expect 201: {"id": <int>, "storage_backend": "local",
    #              "storage_key": "1/<folder>/<file>.pdf",
    #              "expense_id": 42, "source_type": "upload", ...}

── Step 3b · Expense-linked archive upload (typed route, source_type fixed) ──

    curl -s -X POST http://localhost:8000/archive/upload/1/expense/42 \\
      -H "X-User-Id: 1" \\
      -F "file=@/tmp/test_receipt.pdf" | python3 -m json.tool
    # Expect 201: same shape as 3a but source_type is always "expense".

── Step 4 · Query archive by expense ─────────────────────────────────────────

    curl -s http://localhost:8000/archive/query/expense/42 \\
      -H "X-User-Id: 1" | python3 -m json.tool
    # Expect: {"expense_id": 42, "items": [...]} — newest first.
    # Both uploads from steps 3a and 3b should appear.

── Step 5 · Confirm local file path derived from config ──────────────────────

    # storage_key is relative to ARCHIVE_LOCAL_STORAGE_DIR (default: ./storage)
    ls -lh ./storage/<storage_key from step 3b>
    # Expect: file present, non-zero size.
    # The path should reflect the folder_pattern + file_pattern set in step 2:
    #   storage/1/<year>/<month>/expenses/expense_42_<date>.pdf

── Step 6 · Confirm DB metadata row ──────────────────────────────────────────

    # In psql:
    SELECT id, company_id, expense_id, file_name, file_type,
           source_type, storage_backend, storage_key, created_at
    FROM archive_files
    ORDER BY id DESC LIMIT 5;
    # Expect rows from steps 3a and 3b.
    # Check:
    #   storage_backend  = "local"
    #   storage_key      = matches path confirmed in step 5
    #   expense_id       = 42  (populated for both routes)
    #   source_type      = "upload" for 3a, "expense" for 3b
"""

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session

from apps.api.deps import get_db
from packages.modules.archive.schemas.archive_file import ArchiveFileRead
from packages.modules.archive.service.archive_service import store_file

router = APIRouter(prefix="/archive", tags=["archive"])


# ── Helpers ────────────────────────────────────────────────────────────────────


def _extract_content_text(filename: str, file_bytes: bytes) -> str | None:
    """Best-effort text extraction from uploaded file bytes.

    XML  → decode as UTF-8 (latin-1 fallback) and return the full text.
    PDF  → no extraction library is available; return None.
    Other → None.

    Never raises.
    """
    try:
        ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
        if ext == "xml":
            try:
                return file_bytes.decode("utf-8")
            except UnicodeDecodeError:
                return file_bytes.decode("latin-1", errors="replace")
    except Exception:
        pass
    return None


# ── Routes ─────────────────────────────────────────────────────────────────────


@router.post("/upload", response_model=ArchiveFileRead, status_code=201)
async def upload_file(
    company_id:  int        = Form(...),
    expense_id:  int | None = Form(None),
    source_type: str        = Form("expense"),
    file:        UploadFile = File(...),
    db:          Session    = Depends(get_db),
):
    """Generic archive upload.

    Accepts multipart form data.  Use the typed expense route
    ``POST /archive/upload/{company_id}/expense/{expense_id}`` when the
    expense association is known at upload time.
    """
    if source_type not in ("expense", "manual", "import"):
        raise HTTPException(
            status_code=422,
            detail="source_type must be one of: expense, manual, import",
        )

    file_bytes = await file.read()
    content_text = _extract_content_text(file.filename or "upload", file_bytes)

    record = store_file(
        db=db,
        company_id=company_id,
        original_filename=file.filename or "upload",
        file_bytes=file_bytes,
        expense_id=expense_id,
        source_type=source_type,
        content_text=content_text,
    )
    return record


@router.post(
    "/upload/{company_id}/expense/{expense_id}",
    response_model=ArchiveFileRead,
    status_code=201,
)
async def upload_expense_file(
    company_id: int,
    expense_id: int,
    file:       UploadFile = File(...),
    db:         Session    = Depends(get_db),
):
    """Attach an original file to a specific expense.

    Preferred route when uploading a receipt, invoice, or supporting
    document that belongs to a known expense.  ``company_id`` and
    ``expense_id`` are taken from the URL path; ``source_type`` is fixed
    to ``"expense"``.
    """
    file_bytes = await file.read()
    content_text = _extract_content_text(file.filename or "upload", file_bytes)

    record = store_file(
        db=db,
        company_id=company_id,
        original_filename=file.filename or "upload",
        file_bytes=file_bytes,
        expense_id=expense_id,
        source_type="expense",
        content_text=content_text,
    )
    return record

