import asyncio
from decimal import Decimal

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from pydantic import BaseModel
from sqlalchemy.orm import Session

from apps.api.auth import get_current_user, require_manager_or_accountant, require_same_company
from packages.core.platform.module_gate import require_module
from apps.api.deps import get_db
from packages.core.platform.models_user import User
from packages.core.platform.service_permissions import has_permission
from packages.modules.expenses.schemas.expense import ExpenseCreate, ExpenseRead
from packages.modules.expenses.schemas.expense_update import ExpenseUpdate
from packages.modules.expenses.service.expense_service import create_expense, delete_expense, get_expense, get_expense_summary, list_expenses, list_expenses_paginated, update_expense
from packages.modules.expenses.service.config_reader import get_account_mapping_config
from packages.modules.expenses.schemas.document import ExpenseDocumentCreate, ExpenseDocumentRead
from packages.modules.expenses.schemas.document_update import ExpenseDocumentUpdate
from packages.modules.expenses.schemas.validation_result import ValidationResultRead
from packages.modules.expenses.service.document_service import create_document, get_document, list_documents, list_documents_by_expense, update_document
from packages.modules.expenses.service.document_validation_service import validate_document
from packages.modules.expenses.models.document import ExpenseDocument
from packages.modules.expenses.models.expense import Expense
from packages.modules.expenses.models.poliza import Poliza
from packages.modules.expenses.models.report import ExpenseReport
from packages.modules.expenses.models.validation_result import ValidationResult
from packages.modules.expenses.models.tag import ExpenseTag
from packages.modules.expenses.schemas.report import ExpenseReportCreate, ExpenseReportRead
from packages.modules.expenses.schemas.poliza import PolizaRead
from packages.modules.expenses.service.report_service import add_expense_to_report, approve_report, create_report, get_report, get_report_summary, list_report_expenses, list_reports, reject_report, submit_report
from packages.modules.expenses.service.poliza_service import approve_poliza, generate_poliza_for_report, get_poliza, get_poliza_by_report, get_poliza_summary, list_polizas, reject_poliza
from packages.core.platform.schemas_org_units import ProjectCreate, ProjectRead, ClientCreate, ClientRead, CostCenterCreate, CostCenterRead
from packages.core.platform.service_org_units import create_project, list_projects, create_client, list_clients, create_cost_center, list_cost_centers
from packages.modules.expenses.schemas.expense_allocation import ExpenseAllocationCreate, ExpenseAllocationRead
from packages.modules.expenses.schemas.expense_attachment import ExpenseAttachmentCreate, ExpenseAttachmentRead
from packages.modules.expenses.service.allocation_service import create_expense_allocation, list_expense_allocations
from packages.modules.expenses.service.attachment_service import create_expense_attachment, list_expense_attachments
from packages.core.platform.models_accounting_category import AccountingCategory
from packages.modules.expenses.service.accounting_learning_service import find_learning_match
from packages.modules.accounting.service.accounting_explanation_service import explain_accounting_decision
from packages.modules.expenses.service.sat_validation_service import run_sat_validation
from packages.modules.expenses.service.policy_service import get_or_create_company_expense_policy
from packages.modules.archive.service.archive_service import purge_archive_files_for_expense

router = APIRouter(
    prefix="/expenses",
    tags=["expenses"],
    dependencies=[Depends(require_module("expenses"))],
)


class PaginatedExpenseResponse(BaseModel):
    items: list[ExpenseRead]
    total: int
    page: int
    pages: int


class PaginatedDocumentResponse(BaseModel):
    items: list[ExpenseDocumentRead]
    total: int
    page: int
    pages: int


class PaginatedReportResponse(BaseModel):
    items: list[ExpenseReportRead]
    total: int
    page: int
    pages: int


class PaginatedPolizaResponse(BaseModel):
    items: list[PolizaRead]
    total: int
    page: int
    pages: int


@router.post("/", response_model=ExpenseRead)
def create_expense_route(payload: ExpenseCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    try:
        require_same_company(payload.company_id, current_user)
        # If user_id is provided, verify permissions for "create on behalf of"
        if payload.user_id and payload.user_id != current_user.id:
            # Check if secretary relationship exists
            is_delegated = db.query(User).filter(User.id == payload.user_id, User.delegates_for_user_id == current_user.id).first()
            # Check delegation date range if present
            if is_delegated and is_delegated.delegation_starts_at:
                from datetime import datetime, timezone
                now = datetime.now(timezone.utc)
                if is_delegated.delegation_ends_at and now > is_delegated.delegation_ends_at:
                    is_delegated = None  # Delegation has expired
                if is_delegated and now < is_delegated.delegation_starts_at:
                    is_delegated = None  # Delegation hasn't started yet
            if not is_delegated and not has_permission(db, current_user, "expense:create:any"):
                raise HTTPException(status_code=403, detail="Not authorized to create for this user")
        
        # Default to current user if not specified
        if not payload.user_id:
            payload.user_id = current_user.id
            
        return create_expense(db, payload)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/", response_model=PaginatedExpenseResponse)
def list_expenses_route(
    company_id: int | None = None,
    user_id: int | None = Query(None),
    page: int = Query(1, ge=1, description="Page number (1-indexed)"),
    limit: int = Query(50, ge=1, le=100, description="Items per page (max 100)"),
    status: str | None = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List expenses with pagination."""
    # Non-admin users are scoped to their own company. Admins may pass an explicit company_id.
    if not has_permission(db, current_user, "expense:read:any"):
        company_id = current_user.company_id
        
        # Regular employees (not managers/accounting) only see their own expenses
        # or expenses for users they delegate for.
        if not has_permission(db, current_user, "expense:read:company"):
            if user_id and user_id != current_user.id:
                # Is it their boss?
                 is_boss = db.query(User).filter(User.id == user_id, User.delegates_for_user_id == current_user.id).first()
                 if not is_boss:
                     user_id = current_user.id
            else:
                # If no user_id filter requested, and not manager, default to self
                if not user_id:
                    user_id = current_user.id

    result = list_expenses_paginated(
        db=db,
        company_id=company_id,
        user_id=user_id,
        status=status,
        page=page,
        limit=limit,
    )

    return PaginatedExpenseResponse(
        items=[ExpenseRead.model_validate(e) for e in result["items"]],
        total=result["total"],
        page=result["page"],
        pages=result["pages"],
    )


@router.get("/summary")
def get_expense_summary_route(company_id: int | None = None, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if not has_permission(db, current_user, "expense:read:any"):
        company_id = current_user.company_id
    return get_expense_summary(db, company_id)


@router.post("/documents", response_model=ExpenseDocumentRead)
def create_document_route(payload: ExpenseDocumentCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    # NOTE: This endpoint receives JSON (content_text only). No file bytes are available.
    # Binary upload path should archive the original file here.
    try:
        require_same_company(payload.company_id, current_user)
        document = create_document(db, payload)

        # Policy check: if tickets are not allowed and this doc is a ticket,
        # mark it failed without rejecting the HTTP response.
        if document.document_type == "ticket":
            policy = get_or_create_company_expense_policy(db, document.company_id)
            if not policy.tickets_allowed:
                document.validation_status = "failed"
                db.add(ValidationResult(
                    document_id=document.id,
                    source="policy",
                    rule_code="TICKET_NOT_ALLOWED",
                    status="failed",
                    message="Company policy does not allow ticket/receipt documents.",
                ))
                db.commit()
                db.refresh(document)

        return document
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


def _extract_text_from_upload(filename: str, data: bytes) -> str:
    """Return best-effort ``content_text`` for the uploaded file.

    * ``.xml`` / ``.txt`` — UTF-8 decode with error replacement.
    * ``.pdf``             — pdfplumber text extraction of every page.
    * ``.jpg`` / ``.jpeg`` / ``.png``  — tesseract OCR (Spanish + English), best-effort.
    * Anything else        — a minimal ``[BINARY_FILE]`` placeholder so the
      document row can still be created + classified server-side.
    """
    lower = (filename or "").lower()
    if lower.endswith(".xml") or lower.endswith(".txt"):
        try:
            return data.decode("utf-8", errors="replace")
        except Exception:
            return ""
    if lower.endswith(".pdf"):
        try:
            import io
            import pdfplumber
            with pdfplumber.open(io.BytesIO(data)) as pdf:
                return "\n".join((p.extract_text() or "") for p in pdf.pages)
        except Exception:
            return f"[BINARY_FILE]\nfilename: {filename}\nsize: {len(data)}"
    if lower.endswith((".jpg", ".jpeg", ".png")):
        # Best-effort OCR via pytesseract; spa+eng covers MX ticket receipts.
        # Falls back silently when tesseract binary or language packs are
        # missing so uploads never break.
        try:
            import io
            import pytesseract
            from PIL import Image
            img = Image.open(io.BytesIO(data))
            text = pytesseract.image_to_string(img, lang="spa+eng")
            if text and text.strip():
                return text
        except Exception:  # noqa: BLE001 — OCR is optional
            pass
        return f"[BINARY_FILE]\nfilename: {filename}\nsize: {len(data)}"
    return f"[BINARY_FILE]\nfilename: {filename}\nsize: {len(data)}"


@router.post("/documents/upload", response_model=ExpenseDocumentRead)
async def upload_document_route(
    company_id: int = Form(...),
    expense_id: int | None = Form(None),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Multipart upload for XML/PDF/image receipts.

    Accepts raw file bytes and extracts ``content_text`` server-side so PDFs
    (which cannot be decoded as text in the browser) produce a real,
    classifiable document.
    """
    try:
        require_same_company(company_id, current_user)
        data = await file.read()
        if not data:
            raise HTTPException(status_code=400, detail="Empty file")

        # ── Upload size & MIME validation ───────────────────────────────────
        _MAX_UPLOAD_SIZE = 25 * 1024 * 1024  # 25 MB
        _ALLOWED_MIME_TYPES = {
            "application/pdf",
            "text/xml",
            "application/xml",
            "image/jpeg",
            "image/png",
            "image/webp",
            "image/heic",
            "image/heif",
        }
        _ALLOWED_EXTENSIONS = {".pdf", ".xml", ".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif"}

        if len(data) > _MAX_UPLOAD_SIZE:
            raise HTTPException(status_code=413, detail=f"File too large. Maximum size is {_MAX_UPLOAD_SIZE // (1024*1024)} MB")

        import os as _os
        _ext = _os.path.splitext(file.filename or "")[1].lower()
        if _ext and _ext not in _ALLOWED_EXTENSIONS:
            raise HTTPException(status_code=415, detail=f"File type {_ext} not allowed. Allowed: {', '.join(sorted(_ALLOWED_EXTENSIONS))}")

        if file.content_type and file.content_type not in _ALLOWED_MIME_TYPES:
            # Allow common variants
            _variants = {
                "application/x-pdf": "application/pdf",
                "text/plain": None,  # .xml may come as text/plain
            }
            if file.content_type not in _variants:
                raise HTTPException(status_code=415, detail=f"MIME type {file.content_type} not allowed")
        content_text = await asyncio.to_thread(_extract_text_from_upload, file.filename or "upload", data)

        # ── Storage dedup ──────────────────────────────────────────────────
        # Prevent the same bytes from being archived repeatedly when a user
        # drags the same file in more than once. We match by (company_id,
        # filename, content_text) because those together uniquely identify an
        # XML/PDF — content_text is the decoded XML body or the PDF's
        # extracted text, so byte-equal re-uploads collapse to a single row.
        existing = (
            db.query(ExpenseDocument)
            .filter(
                ExpenseDocument.company_id == company_id,
                ExpenseDocument.filename == (file.filename or "upload"),
                ExpenseDocument.content_text == content_text,
            )
            .first()
        )
        if existing is not None:
            # No new archive row, no new expense — just hand back the existing one.
            return existing

        # ── Bidirectional auto-link by CFDI identity ─────────────────────
        # When caller didn't specify an expense_id, try to attach the new
        # upload to the complementary document (PDF↔XML) that shares the
        # same CFDI identity (UUID / issuer RFC / receiver RFC / total).
        # This is what pairs files regardless of upload order.
        effective_expense_id = expense_id
        if effective_expense_id is None:
            try:
                from packages.modules.expenses.service.cfdi_qr_service import extract_cfdi_qr_identity
                from packages.modules.expenses.service.document_identity_service import extract_xml_identity
                from packages.modules.expenses.service.cfdi_pairing_service import match_pdf_to_xml_by_cfdi_identity

                fname = (file.filename or "").lower()

                # Path A — uploaded PDF → find matching XML already attached to a draft.
                if fname.endswith(".pdf"):
                    pdf_identity = extract_cfdi_qr_identity(file.filename or "upload", content_text)
                    if pdf_identity and pdf_identity.get("is_cfdi_qr"):
                        xml_candidates = (
                            db.query(ExpenseDocument)
                            .filter(
                                ExpenseDocument.company_id == company_id,
                                ExpenseDocument.document_type == "cfdi_xml",
                                ExpenseDocument.expense_id.isnot(None),
                            )
                            .all()
                        )
                        for xml_doc in xml_candidates:
                            xml_identity = extract_xml_identity(
                                filename=xml_doc.filename,
                                content_text=xml_doc.content_text or "",
                            )
                            m = match_pdf_to_xml_by_cfdi_identity(xml_identity, pdf_identity)
                            if m.get("is_match") and m.get("confidence") == "high":
                                effective_expense_id = xml_doc.expense_id
                                break

                # Path B — uploaded XML → find matching PDF already attached to a draft.
                # Covers the reverse case: user uploaded the PDF first, then the XML.
                elif fname.endswith(".xml"):
                    xml_identity = extract_xml_identity(
                        filename=file.filename or "upload",
                        content_text=content_text or "",
                    )
                    if xml_identity and xml_identity.get("uuid"):
                        pdf_candidates = (
                            db.query(ExpenseDocument)
                            .filter(
                                ExpenseDocument.company_id == company_id,
                                ExpenseDocument.document_type.in_(
                                    ["cfdi_pdf", "pdf_unclassified", "ticket"]
                                ),
                                ExpenseDocument.expense_id.isnot(None),
                            )
                            .all()
                        )
                        # Pre-fetch expense IDs that already have an XML doc to
                        # avoid an N+1 query inside the loop below.
                        xml_paired_expense_ids = {
                            row[0]
                            for row in db.query(ExpenseDocument.expense_id)
                            .filter(
                                ExpenseDocument.company_id == company_id,
                                ExpenseDocument.document_type == "cfdi_xml",
                                ExpenseDocument.expense_id.isnot(None),
                            )
                            .all()
                        }
                        for pdf_doc in pdf_candidates:
                            # Skip PDFs whose expense already has an XML attached
                            # (don't hijack an existing pair).
                            if pdf_doc.expense_id in xml_paired_expense_ids:
                                continue

                            pdf_identity = extract_cfdi_qr_identity(
                                pdf_doc.filename, pdf_doc.content_text or ""
                            )
                            if not (pdf_identity and pdf_identity.get("is_cfdi_qr")):
                                continue
                            m = match_pdf_to_xml_by_cfdi_identity(xml_identity, pdf_identity)
                            if m.get("is_match") and m.get("confidence") == "high":
                                effective_expense_id = pdf_doc.expense_id
                                break
            except Exception:  # noqa: BLE001 — pairing is best-effort
                pass

        payload = ExpenseDocumentCreate(
            company_id=company_id,
            expense_id=effective_expense_id,
            filename=file.filename or "upload",
            content_text=content_text,
        )
        document = create_document(db, payload, file_bytes=data)

        # If this PDF was attached to an existing expense that already has an
        # XML doc, re-validate the XML so its stale "MISSING_PDF" warning is
        # replaced with "PDF_PAIRED".
        if document.expense_id is not None and document.document_type in ("cfdi_pdf", "pdf_unclassified", "ticket"):
            try:
                from packages.modules.expenses.service.document_validation_service import validate_document as _revalidate
                xml_sibling = (
                    db.query(ExpenseDocument)
                    .filter(
                        ExpenseDocument.expense_id == document.expense_id,
                        ExpenseDocument.document_type == "cfdi_xml",
                        ExpenseDocument.id != document.id,
                    )
                    .first()
                )
                if xml_sibling is not None:
                    _revalidate(db, xml_sibling.id)
            except Exception:  # noqa: BLE001 — revalidation is best-effort
                pass

        # Mirror the JSON-endpoint ticket-policy guard.
        if document.document_type == "ticket":
            policy = get_or_create_company_expense_policy(db, document.company_id)
            if not policy.tickets_allowed:
                document.validation_status = "failed"
                db.add(ValidationResult(
                    document_id=document.id,
                    source="policy",
                    rule_code="TICKET_NOT_ALLOWED",
                    status="failed",
                    message="Company policy does not allow ticket/receipt documents.",
                ))
                db.commit()
                db.refresh(document)

        return document
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Upload failed: {e}")


@router.get("/documents", response_model=PaginatedDocumentResponse)
def list_documents_route(
    company_id: int | None = None,
    page: int = Query(1, ge=1, description="Page number (1-indexed)"),
    limit: int = Query(50, ge=1, le=100, description="Items per page (max 100)"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List expense documents with pagination."""
    if not has_permission(db, current_user, "document:read:any"):
        company_id = current_user.company_id

    limit = min(limit, 100)
    offset = (page - 1) * limit

    query = db.query(ExpenseDocument)
    if company_id is not None:
        query = query.filter(ExpenseDocument.company_id == company_id)

    total = query.count()
    items = query.order_by(ExpenseDocument.created_at.desc()).offset(offset).limit(limit).all()

    return PaginatedDocumentResponse(
        items=[ExpenseDocumentRead.model_validate(d) for d in items],
        total=total,
        page=page,
        pages=(total + limit - 1) // limit if limit > 0 else 0,
    )


@router.get("/documents/{document_id}", response_model=ExpenseDocumentRead)
def get_document_route(document_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    document = get_document(db, document_id)

    if document is None:
        raise HTTPException(status_code=404, detail="Document not found")

    if document.company_id != current_user.company_id and not has_permission(db, current_user, "document:read:any"):
        raise HTTPException(status_code=403, detail="Cross-company access is not allowed")

    return document


@router.get("/documents/{document_id}/file")
def get_document_file_route(
    document_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Stream the original archived bytes for *document_id*.

    Used by the frontend to embed PDF thumbnails / inline previews. Returns
    404 when the file has no archive row or the backend cannot read it.
    """
    from fastapi.responses import Response
    from packages.core.platform.models_archive_file import ArchiveFile
    from packages.core.platform.models_storage_config import StorageConfig
    from packages.modules.archive.service.storage_backend import get_storage_backend

    document = get_document(db, document_id)
    if document is None:
        raise HTTPException(status_code=404, detail="Document not found")
    if document.company_id != current_user.company_id and not has_permission(db, current_user, "document:read:any"):
        raise HTTPException(status_code=403, detail="Cross-company access is not allowed")

    # Find the archive row. Prefer one bound to this expense_id, but fall
    # back to (company_id, filename) only — archive rows are sometimes saved
    # before the document's expense_id is resolved (see document_service).
    archive_row = None
    if document.expense_id is not None:
        archive_row = (
            db.query(ArchiveFile)
            .filter(
                ArchiveFile.company_id == document.company_id,
                ArchiveFile.expense_id == document.expense_id,
                ArchiveFile.file_name == document.filename,
            )
            .order_by(ArchiveFile.id.desc())
            .first()
        )
    if archive_row is None:
        archive_row = (
            db.query(ArchiveFile)
            .filter(
                ArchiveFile.company_id == document.company_id,
                ArchiveFile.file_name == document.filename,
            )
            .order_by(ArchiveFile.id.desc())
            .first()
        )
    if archive_row is None:
        raise HTTPException(status_code=404, detail="Archived file not found")

    # Resolve storage config to hit the correct backend.
    scfg = (
        db.query(StorageConfig).filter(StorageConfig.company_id == document.company_id).first()
        or db.query(StorageConfig).filter(StorageConfig.company_id == 0).first()
    )
    db_cfg = None
    if scfg:
        db_cfg = {
            "backend":         scfg.backend,
            "local_path":      scfg.local_path,
            "endpoint_url":    scfg.endpoint_url,
            "bucket":          scfg.bucket,
            "prefix":          scfg.prefix,
            "region":          scfg.region,
            "azure_account":   scfg.azure_account,
            "azure_container": scfg.azure_container,
        }
    backend = get_storage_backend(db_cfg=db_cfg)
    data = backend.read_bytes(archive_row.storage_key)
    if data is None:
        # Bytes lost (e.g. storage volume reset). Return 204 instead of 404 so
        # inline thumbnail fetches don't pollute the browser console with red
        # network errors — the frontend handles 204 as "no preview available".
        return Response(status_code=204)

    ext = (archive_row.file_type or "").lower()
    content_type = {
        "pdf": "application/pdf",
        "xml": "application/xml",
        "jpg": "image/jpeg",
        "jpeg": "image/jpeg",
        "png": "image/png",
        "gif": "image/gif",
        "webp": "image/webp",
    }.get(ext, "application/octet-stream")

    return Response(
        content=data,
        media_type=content_type,
        headers={
            "Content-Disposition": f'inline; filename="{archive_row.file_name}"',
            "Cache-Control": "private, max-age=3600",
        },
    )


@router.delete("/documents/{document_id}", status_code=204)
def delete_document_route(document_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    document = get_document(db, document_id)
    if document is None:
        raise HTTPException(status_code=404, detail="Document not found")
    if document.company_id != current_user.company_id and not has_permission(db, current_user, "document:delete"):
        raise HTTPException(status_code=403, detail="Cross-company access is not allowed")

    # Block deletion once the expense has left draft OR has been bundled into
    # a report — the document is part of an immutable accounting record.
    if document.expense_id is not None:
        expense = db.query(Expense).filter(Expense.id == document.expense_id).first()
        if expense is not None:
            if expense.report_id is not None:
                raise HTTPException(
                    status_code=409,
                    detail="Document belongs to an expense already bundled into a report and cannot be deleted.",
                )
            if (expense.status or "").lower() != "draft":
                raise HTTPException(
                    status_code=409,
                    detail="Document belongs to a submitted expense and cannot be deleted.",
                )

    # Permanent purge: validation results → archived file bytes/rows → document.
    db.query(ValidationResult).filter(ValidationResult.document_id == document_id).delete(synchronize_session=False)
    try:
        purge_archive_files_for_expense(
            db,
            company_id=document.company_id,
            expense_id=document.expense_id or 0,
            filename=document.filename,
        )
    except Exception:  # noqa: BLE001 — DB row removal still proceeds
        db.rollback()
    linked_expense_id = document.expense_id
    db.delete(document)
    db.commit()

    # If the linked draft expense no longer has any documents, remove it too
    # so the XML/PDF leaves no trace (matches user expectation for a hard delete).
    if linked_expense_id is not None:
        expense = db.query(Expense).filter(Expense.id == linked_expense_id).first()
        if expense is not None and (expense.status or "").lower() == "draft" and expense.report_id is None:
            remaining = (
                db.query(ExpenseDocument)
                .filter(ExpenseDocument.expense_id == linked_expense_id)
                .count()
            )
            if remaining == 0:
                db.query(ExpenseTag).filter(ExpenseTag.expense_id == linked_expense_id).delete(synchronize_session=False)
                db.delete(expense)
                db.commit()

@router.patch("/documents/{document_id}", response_model=ExpenseDocumentRead)
def update_document_route(document_id: int, payload: ExpenseDocumentUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    try:
        document = get_document(db, document_id)
        if document is None:
            raise HTTPException(status_code=404, detail="Document not found")
        if document.company_id != current_user.company_id and not has_permission(db, current_user, "document:read:any"):
            raise HTTPException(status_code=403, detail="Cross-company access is not allowed")
        document = update_document(db, document_id, payload)
        return document
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/documents/by-expense/{expense_id}", response_model=list[ExpenseDocumentRead])
def list_documents_by_expense_route(expense_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    from packages.modules.expenses.api._security import get_expense_for_user
    get_expense_for_user(expense_id, db, current_user)
    return list_documents_by_expense(db, expense_id)


@router.post("/documents/{document_id}/validate", response_model=list[ValidationResultRead])
def validate_document_route(document_id: int, db: Session = Depends(get_db), _user: User = Depends(get_current_user)):
    results = validate_document(db, document_id)

    if results is None:
        raise HTTPException(status_code=404, detail="Document not found")

    return results


@router.get("/documents/{document_id}/validation-results", response_model=list[ValidationResultRead])
def list_validation_results_route(document_id: int, db: Session = Depends(get_db), _user: User = Depends(get_current_user)):
    return (
        db.query(ValidationResult)
        .filter(ValidationResult.document_id == document_id)
        .order_by(ValidationResult.id.desc())
        .all()
    )


@router.post("/reports", response_model=ExpenseReportRead)
def create_report_route(payload: ExpenseReportCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    try:
        require_same_company(payload.company_id, current_user)
        return create_report(db, payload)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/reports", response_model=PaginatedReportResponse)
def list_reports_route(
    company_id: int | None = None,
    page: int = Query(1, ge=1, description="Page number (1-indexed)"),
    limit: int = Query(50, ge=1, le=100, description="Items per page (max 100)"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List expense reports with pagination."""
    if not has_permission(db, current_user, "expense:read:any"):
        company_id = current_user.company_id

    limit = min(limit, 100)
    offset = (page - 1) * limit

    query = db.query(ExpenseReport)
    if company_id is not None:
        query = query.filter(ExpenseReport.company_id == company_id)

    total = query.count()
    items = query.order_by(ExpenseReport.created_at.desc()).offset(offset).limit(limit).all()

    return PaginatedReportResponse(
        items=[ExpenseReportRead.model_validate(r) for r in items],
        total=total,
        page=page,
        pages=(total + limit - 1) // limit if limit > 0 else 0,
    )


@router.get("/reports/summary")
def get_report_summary_route(company_id: int | None = None, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if not has_permission(db, current_user, "expense:read:any"):
        company_id = current_user.company_id
    return get_report_summary(db, company_id)


@router.get("/reports/{report_id}", response_model=ExpenseReportRead)
def get_report_route(report_id: int, db: Session = Depends(get_db), _user: User = Depends(get_current_user)):
    report = get_report(db, report_id)

    if report is None:
        raise HTTPException(status_code=404, detail="Report not found")

    return report


@router.post("/reports/{report_id}/expenses/{expense_id}", response_model=ExpenseRead)
def add_expense_to_report_route(report_id: int, expense_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    from packages.modules.expenses.api._security import get_expense_for_user
    get_expense_for_user(expense_id, db, current_user)
    try:
        expense = add_expense_to_report(db, expense_id=expense_id, report_id=report_id)

        if expense is None:
            raise HTTPException(status_code=404, detail="Expense not found")

        return expense
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/reports/{report_id}/expenses", response_model=list[ExpenseRead])
def list_report_expenses_route(report_id: int, db: Session = Depends(get_db), _user: User = Depends(get_current_user)):
    return list_report_expenses(db, report_id)


@router.post("/reports/{report_id}/submit", response_model=ExpenseReportRead)
def submit_report_route(report_id: int, db: Session = Depends(get_db), _user: User = Depends(get_current_user)):
    try:
        report = submit_report(db, report_id)

        if report is None:
            raise HTTPException(status_code=404, detail="Report not found")

        return report
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/reports/{report_id}/approve", response_model=ExpenseReportRead)
def approve_report_route(report_id: int, db: Session = Depends(get_db), current_user: User = Depends(require_manager_or_accountant)):
    try:
        report = approve_report(db, report_id)

        if report is None:
            raise HTTPException(status_code=404, detail="Report not found")

        return report
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/reports/{report_id}/reject", response_model=ExpenseReportRead)
def reject_report_route(report_id: int, db: Session = Depends(get_db), current_user: User = Depends(require_manager_or_accountant)):
    try:
        report = reject_report(db, report_id)

        if report is None:
            raise HTTPException(status_code=404, detail="Report not found")

        return report
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/reports/{report_id}/generate-poliza", response_model=PolizaRead)
def generate_poliza_route(report_id: int, db: Session = Depends(get_db), _user: User = Depends(require_manager_or_accountant)):
    try:
        result = generate_poliza_for_report(db, report_id)

        if result is None:
            raise HTTPException(status_code=404, detail="Report not found")

        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/polizas", response_model=PaginatedPolizaResponse)
def list_polizas_route(
    company_id: int | None = None,
    page: int = Query(1, ge=1, description="Page number (1-indexed)"),
    limit: int = Query(50, ge=1, le=100, description="Items per page (max 100)"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List polizas with pagination."""
    if not has_permission(db, current_user, "accounting:work"):
        company_id = current_user.company_id

    limit = min(limit, 100)
    offset = (page - 1) * limit

    query = db.query(Poliza)
    if company_id is not None:
        query = query.filter(Poliza.company_id == company_id)

    total = query.count()
    items = query.order_by(Poliza.created_at.desc()).offset(offset).limit(limit).all()

    return PaginatedPolizaResponse(
        items=[PolizaRead.model_validate(p) for p in items],
        total=total,
        page=page,
        pages=(total + limit - 1) // limit if limit > 0 else 0,
    )


@router.get("/polizas/summary")
def get_poliza_summary_route(company_id: int | None = None, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if not has_permission(db, current_user, "accounting:work"):
        company_id = current_user.company_id
    return get_poliza_summary(db, company_id)


@router.get("/polizas/{poliza_id}", response_model=PolizaRead)
def get_poliza_route(poliza_id: int, db: Session = Depends(get_db), _user: User = Depends(get_current_user)):
    poliza = get_poliza(db, poliza_id)

    if poliza is None:
        raise HTTPException(status_code=404, detail="Poliza not found")

    return poliza


@router.post("/polizas/{poliza_id}/approve", response_model=PolizaRead)
def approve_poliza_route(poliza_id: int, db: Session = Depends(get_db), current_user: User = Depends(require_manager_or_accountant)):
    try:
        poliza = approve_poliza(db, poliza_id)

        if poliza is None:
            raise HTTPException(status_code=404, detail="Poliza not found")

        return poliza
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/polizas/{poliza_id}/reject", response_model=PolizaRead)
def reject_poliza_route(poliza_id: int, db: Session = Depends(get_db), current_user: User = Depends(require_manager_or_accountant)):
    try:
        poliza = reject_poliza(db, poliza_id)

        if poliza is None:
            raise HTTPException(status_code=404, detail="Poliza not found")

        return poliza
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/reports/{report_id}/poliza", response_model=PolizaRead)
def get_poliza_by_report_route(report_id: int, db: Session = Depends(get_db), _user: User = Depends(get_current_user)):
    poliza = get_poliza_by_report(db, report_id)

    if poliza is None:
        raise HTTPException(status_code=404, detail="Poliza not found")

    return poliza


class SubmissionFromDocumentsPayload(BaseModel):
    company_id: int
    document_ids: list[int]


@router.post("/submissions/from-documents")
def create_submission_from_documents_route(
    payload: SubmissionFromDocumentsPayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_same_company(payload.company_id, current_user)

    documents = (
        db.query(ExpenseDocument)
        .filter(ExpenseDocument.id.in_(payload.document_ids))
        .all()
    )

    found_ids = {d.id for d in documents}
    if any(doc_id not in found_ids for doc_id in payload.document_ids):
        raise HTTPException(status_code=400, detail="Only passed documents can be submitted")

    if any(
        d.company_id != payload.company_id or d.validation_status != "passed"
        for d in documents
    ):
        raise HTTPException(status_code=400, detail="Only passed documents can be submitted")

    report = ExpenseReport(
        company_id=payload.company_id,
        title="Submission",
        status="draft",
    )
    db.add(report)
    db.flush()

    for doc in documents:
        amount: Decimal = Decimal(0)
        for line in (doc.content_text or "").splitlines():
            if line.lower().startswith("total:"):
                raw = line.split(":", 1)[1].strip()
                try:
                    amount = Decimal(raw)
                except Exception:
                    pass
                break
        expense = Expense(
            company_id=payload.company_id,
            description=doc.filename,
            amount=amount,
            mapping_snapshot=None,
            detected_category=None,
            report_id=report.id,
        )
        db.add(expense)
        db.flush()
        doc.expense_id = expense.id

    db.commit()

    return {"report_id": report.id, "documents_linked": len(documents)}


# ── Projects ─────────────────────────────────────────────────────────────────

@router.post("/projects", response_model=ProjectRead)
def create_project_route(payload: ProjectCreate, db: Session = Depends(get_db), _user: User = Depends(get_current_user)):
    return create_project(db, payload)


@router.get("/projects", response_model=list[ProjectRead])
def list_projects_route(company_id: int | None = None, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if not has_permission(db, current_user, "expense:read:any"):
        company_id = current_user.company_id
    return list_projects(db, company_id)


# ── Clients ───────────────────────────────────────────────────────────────────

@router.post("/clients", response_model=ClientRead)
def create_client_route(payload: ClientCreate, db: Session = Depends(get_db), _user: User = Depends(get_current_user)):
    return create_client(db, payload)


@router.get("/clients", response_model=list[ClientRead])
def list_clients_route(company_id: int | None = None, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if not has_permission(db, current_user, "expense:read:any"):
        company_id = current_user.company_id
    return list_clients(db, company_id)


# ── Cost Centers ──────────────────────────────────────────────────────────────

@router.post("/cost-centers", response_model=CostCenterRead)
def create_cost_center_route(payload: CostCenterCreate, db: Session = Depends(get_db), _user: User = Depends(get_current_user)):
    return create_cost_center(db, payload)


@router.get("/cost-centers", response_model=list[CostCenterRead])
def list_cost_centers_route(company_id: int | None = None, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if not has_permission(db, current_user, "expense:read:any"):
        company_id = current_user.company_id
    return list_cost_centers(db, company_id)


# ── Allocations ───────────────────────────────────────────────────────────────

@router.post("/allocations", response_model=ExpenseAllocationRead)
def create_allocation_route(payload: ExpenseAllocationCreate, db: Session = Depends(get_db), _user: User = Depends(get_current_user)):
    return create_expense_allocation(db, payload)


@router.get("/allocations/{expense_id}", response_model=list[ExpenseAllocationRead])
def list_allocations_route(expense_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    from packages.modules.expenses.api._security import get_expense_for_user
    get_expense_for_user(expense_id, db, current_user)
    return list_expense_allocations(db, expense_id)


# ── Attachments ───────────────────────────────────────────────────────────────

@router.post("/attachments", response_model=ExpenseAttachmentRead)
def create_attachment_route(payload: ExpenseAttachmentCreate, db: Session = Depends(get_db), _user: User = Depends(get_current_user)):
    return create_expense_attachment(db, payload)


@router.get("/attachments/{expense_id}", response_model=list[ExpenseAttachmentRead])
def list_attachments_route(expense_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    from packages.modules.expenses.api._security import get_expense_for_user
    get_expense_for_user(expense_id, db, current_user)
    return list_expense_attachments(db, expense_id)


# ── SAT Validation ────────────────────────────────────────────────────────────

class SatValidationPayload(BaseModel):
    content_text: str


@router.post("/validate-sat")
def validate_sat_route(payload: SatValidationPayload):
    return run_sat_validation(payload.content_text)


# ── Tags ──────────────────────────────────────────────────────────────────────
# Must be declared BEFORE /{expense_id} — FastAPI matches routes in order and
# "tags" would otherwise be parsed as an integer expense_id, returning 422.

@router.get("/tags")
def list_tags_route(company_id: int, db: Session = Depends(get_db), _user: User = Depends(get_current_user)):
    return db.query(ExpenseTag).filter(ExpenseTag.company_id == company_id).order_by(ExpenseTag.name).all()


@router.post("/tags")
def create_tag_route(payload: dict, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    tag = ExpenseTag(
        company_id=payload.get("company_id") or current_user.company_id,
        name=payload["name"],
        color=payload.get("color"),
    )
    db.add(tag)
    db.commit()
    db.refresh(tag)
    return tag


# ── Expense by ID ─────────────────────────────────────────────────────────────

@router.get("/{expense_id}", response_model=ExpenseRead)
def get_expense_route(expense_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    from packages.modules.expenses.api._security import get_expense_for_user
    expense = get_expense_for_user(expense_id, db, current_user)

    # Load category and learning match for explanation
    category = None
    if expense.category_code:
        category = (
            db.query(AccountingCategory)
            .filter(
                AccountingCategory.company_id == expense.company_id,
                AccountingCategory.code == expense.category_code,
                AccountingCategory.is_active.is_(True),
            )
            .first()
        )

    learning_match = find_learning_match(db, expense.company_id, expense.description)

    data = ExpenseRead.model_validate(expense).model_dump()
    data["accounting_explanation"] = explain_accounting_decision(expense, category, learning_match)
    return data


@router.patch("/{expense_id}", response_model=ExpenseRead)
def update_expense_route(expense_id: int, payload: ExpenseUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    try:
        existing = get_expense(db, expense_id)
        if existing is None:
            raise HTTPException(status_code=404, detail="Expense not found")
        if existing.company_id != current_user.company_id and not has_permission(db, current_user, "expense:update:any"):
            raise HTTPException(status_code=403, detail="Cross-company access is not allowed")
        expense = update_expense(db, expense_id, payload)
        return expense
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


# Legacy /expenses/{id}/submit, /approve, /reject endpoints have been removed.
# All expense status transitions are handled exclusively by
# /expenses/review-actions/* (review_actions_router.py → transition_service.py).


@router.get("/config/account-mapping/{setup_session_id}")
def get_account_mapping_config_route(setup_session_id: int, db: Session = Depends(get_db), _user: User = Depends(get_current_user)):
    config_text = get_account_mapping_config(db, setup_session_id)

    if config_text is None:
        raise HTTPException(status_code=404, detail="Account mapping config not found")

    return {"setup_session_id": setup_session_id, "config_text": config_text}


@router.delete("/{expense_id}")
def delete_expense_route(expense_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    try:
        result = delete_expense(db, expense_id)

        if result is False:
            raise HTTPException(status_code=404, detail="Expense not found")

        return {"status": "deleted"}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


# ── Phase 4.8 — SAT cancel watcher admin endpoints ───────────────────────────

@router.get("/cfdi/cancelled")
def list_cancelled_cfdis_route(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Admin-scoped list of expenses whose CFDI has flipped to Cancelado.

    Used by /admin/cfdi-watcher to drive the reversal workflow. Cross-company
    isolation enforced via company_id filter; admin role is required because
    the underlying ``cfdi:recheck`` permission is admin-only by default.
    """
    from packages.core.platform.service_permissions import has_permission as _hp
    if not _hp(db, current_user, "cfdi:recheck"):
        raise HTTPException(status_code=403, detail="Admin permission required")
    rows = (
        db.query(Expense)
        .filter(
            Expense.company_id == current_user.company_id,
            Expense.cfdi_status == "Cancelado",
        )
        .order_by(Expense.cfdi_last_checked_at.desc().nullslast())
        .limit(200)
        .all()
    )
    return [
        {
            "id": r.id,
            "description": r.description,
            "amount": float(r.amount),
            "status": r.status,
            "expense_date": r.expense_date,
            "cfdi_uuid": r.cfdi_uuid,
            "cfdi_status": r.cfdi_status,
            "cfdi_last_checked_at": r.cfdi_last_checked_at,
            "cfdi_amount_mismatch": bool(getattr(r, "cfdi_amount_mismatch", False)),
        }
        for r in rows
    ]


@router.post("/cfdi/recheck/{expense_id}")
def recheck_cfdi_route(
    expense_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Manually re-query SAT for one expense's CFDI status."""
    from packages.core.platform.service_permissions import has_permission as _hp
    from packages.modules.expenses.service.cfdi_lifecycle_service import recheck_expense_cfdi
    if not _hp(db, current_user, "cfdi:recheck"):
        raise HTTPException(status_code=403, detail="Admin permission required")
    expense = (
        db.query(Expense)
        .filter(Expense.id == expense_id, Expense.company_id == current_user.company_id)
        .one_or_none()
    )
    if expense is None:
        raise HTTPException(status_code=404, detail="Expense not found")
    res = recheck_expense_cfdi(db, expense)
    return {
        "ok": True,
        "expense_id": expense_id,
        "cfdi_status": expense.cfdi_status,
        "cfdi_last_checked_at": expense.cfdi_last_checked_at,
        "changed": bool(res.get("changed")),
        "cancelled": bool(res.get("cancelled")),
    }


@router.post("/cfdi/recheck-pending")
def recheck_pending_route(
    stale_after_days: int = 7,
    batch_size: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Manually trigger the company-scoped CFDI recheck batch (mirror of the
    daily 03:00 UTC cron). Useful for ops + dry-run testing."""
    from packages.core.platform.service_permissions import has_permission as _hp
    from packages.modules.expenses.service.cfdi_lifecycle_service import recheck_pending
    if not _hp(db, current_user, "cfdi:recheck"):
        raise HTTPException(status_code=403, detail="Admin permission required")
    stale = max(0, min(int(stale_after_days), 365))
    batch = max(1, min(int(batch_size), 1000))
    totals = recheck_pending(
        db,
        company_id=current_user.company_id,
        stale_after_days=stale,
        batch_size=batch,
    )
    return {
        "ok": True,
        "company_id": current_user.company_id,
        "stale_after_days": stale,
        "batch_size": batch,
        **totals,
    }


# ── Expense-level validation results (all docs for this expense) ─────────────

@router.get("/{expense_id}/validations", response_model=list[ValidationResultRead])
def list_expense_validations_route(expense_id: int, db: Session = Depends(get_db), _user: User = Depends(get_current_user)):
    doc_ids = [
        row[0] for row in
        db.query(ExpenseDocument.id).filter(ExpenseDocument.expense_id == expense_id).all()
    ]
    if not doc_ids:
        return []
    return (
        db.query(ValidationResult)
        .filter(ValidationResult.document_id.in_(doc_ids))
        .order_by(ValidationResult.created_at.desc())
        .all()
    )


# ── Unified policy checks — admin-configured rules + live status ─────────────

@router.get("/{expense_id}/policy-checks")
def list_expense_policy_checks_route(
    expense_id: int,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    from packages.modules.expenses.service.policy_checks_service import compute_policy_checks

    expense = get_expense(db, expense_id)
    if expense is None:
        raise HTTPException(status_code=404, detail=f"Expense {expense_id} not found.")
    return compute_policy_checks(db, expense)
