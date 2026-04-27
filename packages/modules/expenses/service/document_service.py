import logging
import re
from datetime import date as _date
from decimal import Decimal, InvalidOperation

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

_log = logging.getLogger(__name__)

from packages.core.platform.models import Company
from packages.modules.expenses.models.expense import Expense
from packages.modules.expenses.models.document import ExpenseDocument
from packages.modules.expenses.schemas.document import ExpenseDocumentCreate
from packages.modules.expenses.schemas.document_update import ExpenseDocumentUpdate
from packages.modules.expenses.service.document_classifier import classify_document
from packages.modules.expenses.service.pdf_intake_service import analyze_pdf_intake
from packages.modules.expenses.service.xml_extraction_service import extract_xml_fields
from packages.modules.expenses.service.pdf_ticket_extraction_service import extract_ticket_signals
from packages.modules.archive.service.archive_service import store_file as archive_store_file
from packages.modules.archive.service.expense_archive_link_service import archive_uploaded_expense_file
from packages.modules.expenses.service.document_triage_service import triage_uploaded_document
from packages.modules.expenses.service.document_validation_service import validate_document

# Prefixes that indicate raw file bytes — must never be used as a human description.
_GARBAGE_PREFIXES = ("<?xml", "%PDF", "<cfdi", "<Comprobante")


def _is_garbage(text: str | None) -> bool:
    """Return True when *text* starts with a known raw-content prefix."""
    if not text:
        return False
    return any(text.lstrip().startswith(p) for p in _GARBAGE_PREFIXES)


def _good_desc(*candidates: str | None) -> str | None:
    """Return the first non-empty, non-garbage candidate, or None."""
    for c in candidates:
        if c and c.strip() and not _is_garbage(c):
            return c.strip()
    return None


def _parse_date(value: str | None) -> _date | None:
    """
    Convert an XML fecha string to a ``datetime.date`` object.

    Accepts the two formats SAT CFDI 4.0 emits:
      - full datetime:  "2026-03-08T21:38:25"
      - date only:       "2026-03-08"

    Returns None if value is falsy or cannot be parsed, so callers can
    safely skip assignment rather than crashing on a bad input.
    """
    if not value:
        return None
    try:
        from datetime import datetime
        # Take the date part only (before any 'T'), then parse.
        date_part = str(value).split("T")[0].strip()
        return datetime.strptime(date_part, "%Y-%m-%d").date()
    except (ValueError, TypeError):
        _log.warning("Could not parse expense_date from: %r", value)
        return None


def _parse_amount(raw) -> Decimal | None:
    """Convert a raw amount value (string or number) to Decimal, or None."""
    if raw is None:
        return None
    try:
        return Decimal(str(raw).replace(",", ""))
    except InvalidOperation:
        return None


def _pairing_key(filename: str) -> str:
    """Return a normalised key used to match XML and PDF files for the same invoice."""
    name = (filename or "").lower().strip()
    # remove extension
    name = re.sub(r"\.(xml|pdf)$", "", name)
    # remove common prefixes
    name = re.sub(r"^(complemento|recibo|factura|invoice)[-_ ]*", "", name)
    # normalize separators
    name = name.replace("_", "-").replace(" ", "-")
    # keep only alnum and dash
    name = re.sub(r"[^a-z0-9\-]", "", name)
    return name.strip("-")


def find_matching_draft_expense(db: Session, company_id: int, filename: str) -> Expense | None:
    """Return the best-matching draft expense for *filename* in *company_id*, or None."""
    target = _pairing_key(filename)
    if not target:
        return None

    drafts = (
        db.query(Expense)
        .filter(Expense.company_id == company_id, Expense.status == "draft")
        .all()
    )
    if not drafts:
        return None

    expense_ids = [exp.id for exp in drafts]
    docs_by_expense: dict[int, list[ExpenseDocument]] = {exp.id: [] for exp in drafts}
    for doc in (
        db.query(ExpenseDocument)
        .filter(ExpenseDocument.expense_id.in_(expense_ids))
        .all()
    ):
        docs_by_expense[doc.expense_id].append(doc)

    xml_match: Expense | None = None
    any_match: Expense | None = None

    for exp in drafts:
        for doc in docs_by_expense[exp.id]:
            doc_key = _pairing_key(doc.filename)
            if doc_key and doc_key == target:
                if doc.document_type == "cfdi_xml":
                    xml_match = exp
                elif any_match is None:
                    any_match = exp
                break

    return xml_match or any_match


# ---------------------------------------------------------------------------
# Triage summary builder
# ---------------------------------------------------------------------------

_KIND_LABEL: dict[str, str] = {
    "cfdi_xml":            "CFDI XML detected",
    "cfdi_pdf":            "CFDI PDF detected via SAT QR",
    "receipt_pdf":         "Receipt PDF",
    "supporting_document": "Supporting document",
    "unknown":             "Unknown document",
}

_ACTION_LABEL: dict[str, str] = {
    "wait_for_pair":          "waiting for paired {other}",
    "create_expense_with_pair": "paired {other} found",
    "attach_to_existing":     "matched to existing {other}",
    "create_expense":         "new expense created",
    "store_as_evidence":      "stored as evidence",
    "ask_user":               "user confirmation needed",
}


def _triage_summary(triage: dict) -> str:
    """Convert a triage result dict to a compact human-readable summary line.

    Examples::

        CFDI XML detected | waiting for paired PDF
        CFDI PDF detected via SAT QR | exact XML match candidate found
        Receipt PDF | new expense created
        Supporting document | stored as evidence
        Unknown document | user confirmation needed
    """
    kind   = triage.get("document_kind", "unknown")
    lane   = triage.get("expense_lane", "unknown")
    action = triage.get("recommended_action", "ask_user")
    match  = triage.get("match_candidate")

    kind_label   = _KIND_LABEL.get(kind, kind)
    action_tmpl  = _ACTION_LABEL.get(action, action)

    # Determine the "other" counterpart label for pair-related actions
    if kind == "cfdi_xml":
        other = "PDF"
    elif kind in ("cfdi_pdf", "receipt_pdf"):
        other = "XML"
    else:
        other = "counterpart"

    action_label = action_tmpl.replace("{other}", other)

    # Refine attach/pair label when we have a confirmed match
    if match and action in ("attach_to_existing", "create_expense_with_pair"):
        conf = match.get("confidence") or match.get("match_level", "")
        if conf == "high" or conf == "strong":
            action_label = f"exact {other} match candidate found"
        elif conf in ("medium", "possible"):
            action_label = f"possible {other} match candidate found"

    # International receipt variant
    if kind == "receipt_pdf" and lane == "international_receipt":
        kind_label = "International receipt"

    return f"{kind_label} | {action_label}"


def create_document(
    db: Session,
    payload: ExpenseDocumentCreate,
    file_bytes: bytes | None = None,
) -> ExpenseDocument:
    # NOTE FOR FUTURE BYTE-BASED UPLOAD PATH:
    # When file_bytes is provided (e.g. from a multipart upload endpoint),
    # the original binary is archived via archive_service before extraction.
    # The JSON-body endpoint (POST /expenses/documents) only receives
    # content_text and cannot archive — do NOT pass synthesised bytes.
    company = db.query(Company).filter(Company.id == payload.company_id).first()
    if not company:
        raise ValueError("Company not found")

    if payload.expense_id is not None:
        expense = db.query(Expense).filter(Expense.id == payload.expense_id).first()
        if not expense:
            raise ValueError("Expense not found")

        # ── Deduplication: same filename already linked to this expense ────────
        # This prevents duplicate rows when the same file is submitted twice
        # (e.g. double-click, two UI upload surfaces, or retry after error).
        existing = (
            db.query(ExpenseDocument)
            .filter(
                ExpenseDocument.expense_id == payload.expense_id,
                ExpenseDocument.filename   == payload.filename,
            )
            .first()
        )
        if existing:
            return existing

    document = ExpenseDocument(
        company_id=payload.company_id,
        expense_id=payload.expense_id,
        filename=payload.filename,
        content_text=payload.content_text,
        document_type=classify_document(payload.filename, payload.content_text),
    )
    try:
        db.add(document)
        db.commit()
        db.refresh(document)
    except IntegrityError:
        db.rollback()
        existing = (
            db.query(ExpenseDocument)
            .filter(
                ExpenseDocument.expense_id == payload.expense_id,
                ExpenseDocument.filename   == payload.filename,
            )
            .first()
        )
        if existing:
            return existing
        raise

    # ── Archive original bytes (only when real file bytes are available) ──────
    if file_bytes is not None:
        try:
            if document.expense_id is not None:
                archive_uploaded_expense_file(
                    db=db,
                    company_id=document.company_id,
                    expense_id=document.expense_id,
                    file_bytes=file_bytes,
                    original_filename=document.filename,
                    source_type="upload",
                )
            else:
                # expense_id not yet resolved (auto-match runs below); archive
                # without an expense link so the original is never lost.
                archive_store_file(
                    db=db,
                    company_id=document.company_id,
                    original_filename=document.filename,
                    file_bytes=file_bytes,
                    expense_id=None,
                    source_type="upload",
                )
        except Exception:  # noqa: BLE001 — archiving must never break document creation
            pass

    # ── PDF intake: promote pdf_unclassified when confidence allows ────────────
    if document.document_type == "pdf_unclassified":
        intake = analyze_pdf_intake(document.filename, document.content_text, None)
        if (
            intake["suggested_type"] == "cfdi_pdf"
            and intake["suggested_action"] == "pair_with_xml"
            and intake["confidence"] in ("high", "medium")
        ):
            document.document_type = "cfdi_pdf"
            db.commit()
            db.refresh(document)
        # else: leave as pdf_unclassified — employee decides later

    if payload.expense_id is None:
        matched = find_matching_draft_expense(db, payload.company_id, payload.filename)
        if matched:
            # Dedup: reject if same filename is already linked to the matched expense
            dup = (
                db.query(ExpenseDocument)
                .filter(
                    ExpenseDocument.expense_id == matched.id,
                    ExpenseDocument.filename   == payload.filename,
                    ExpenseDocument.id         != document.id,
                )
                .first()
            )
            if dup:
                db.delete(document)
                db.commit()
                return dup

            document.expense_id = matched.id
            db.commit()
            db.refresh(document)
        else:
            new_expense = Expense(
                company_id=payload.company_id,
                description=payload.filename,
                amount=Decimal("0"),
                status="draft",
            )
            db.add(new_expense)
            db.commit()
            db.refresh(new_expense)

            document.expense_id = new_expense.id
            db.commit()
            db.refresh(document)

    # ── Extract XML fields (once — canonical call) ───────────────────────────
    # Computed here so both the enrichment block and validate_document can use
    # the same result without a second parse of content_text.
    extracted = extract_xml_fields(payload.content_text or "")

    # ── Enrich linked expense from extracted data ──────────────────────────────
    if document.expense_id is not None:
        if extracted["is_xml"]:
            # ── CFDI XML path ──────────────────────────────────────────────────
            expense = db.query(Expense).filter(Expense.id == document.expense_id).first()
            if expense is not None:
                # Amount: always update from XML total (authoritative source)
                raw_total = extracted.get("total")
                parsed_amount = _parse_amount(raw_total)
                if parsed_amount is not None:
                    expense.amount = parsed_amount

                # Description priority:
                #   1. extracted.descripcion
                #   2. extracted.conceptos_summary
                #   3. extracted.emisor_nombre
                #   4. "CFDI Invoice"
                new_desc = _good_desc(
                    extracted.get("descripcion"),
                    extracted.get("conceptos_summary"),
                    extracted.get("emisor_nombre"),
                    "CFDI Invoice",
                )
                if new_desc:
                    expense.description = new_desc

                # Expense date: always overwrite from XML fecha (authoritative source).
                # fecha format: "2024-01-15T12:00:00" — take the date part only.
                # Must be a datetime.date object; the column is Date-typed.
                fecha = extracted.get("fecha")
                parsed_date = _parse_date(fecha)
                if parsed_date is not None:
                    expense.expense_date = parsed_date

                try:
                    db.commit()
                    db.refresh(expense)
                except Exception:
                    db.rollback()
                    _log.exception(
                        "Enrichment commit failed for expense id=%s — "
                        "expense fields not persisted",
                        expense.id,
                    )

        else:
            # ── PDF / ticket path ──────────────────────────────────────────────
            # Do not overwrite XML-derived description/amount if expense already
            # has an XML document attached.
            has_xml_doc = (
                db.query(ExpenseDocument)
                .filter(
                    ExpenseDocument.expense_id == document.expense_id,
                    ExpenseDocument.document_type == "cfdi_xml",
                    ExpenseDocument.id != document.id,
                )
                .first()
            ) is not None

            if not has_xml_doc:
                signals = extract_ticket_signals(payload.content_text or "")
                expense = db.query(Expense).filter(Expense.id == document.expense_id).first()
                if expense is not None:
                    raw_amount = signals.get("amount")
                    parsed_amount = _parse_amount(raw_amount)
                    if parsed_amount is not None:
                        expense.amount = parsed_amount

                    vendor_name = signals.get("vendor_name")
                    new_desc = _good_desc(vendor_name, payload.filename, "Uploaded Document")
                    if new_desc:
                        expense.description = new_desc

                    probable_category = signals.get("probable_category")
                    if probable_category and probable_category != "unknown" and not expense.detected_category:
                        expense.detected_category = probable_category

                    db.commit()
                    db.refresh(expense)

    # -- Triage: classify and match (routing only — validation_summary is
    # owned by validate_document which runs immediately after).
    try:
        triage_uploaded_document(
            db=db,
            company_id=document.company_id,
            document_id=document.id,
        )
    except Exception:  # noqa: BLE001
        _log.exception("Triage failed for document %s — creation unaffected", document.id)

    # ── Validate (single call — passes pre-computed extracted to skip re-parse)
    try:
        validate_document(db, document.id, extracted=extracted)
    except Exception:  # noqa: BLE001
        _log.exception("Validation failed for document %s — creation unaffected", document.id)

    return document


def list_documents(db: Session, company_id: int | None = None) -> list[ExpenseDocument]:
    query = db.query(ExpenseDocument)
    if company_id is not None:
        query = query.filter(ExpenseDocument.company_id == company_id)
    return query.all()


def get_document(db: Session, document_id: int) -> ExpenseDocument | None:
    return db.query(ExpenseDocument).filter(ExpenseDocument.id == document_id).first()


def update_document(db: Session, document_id: int, payload: ExpenseDocumentUpdate) -> ExpenseDocument | None:
    document = db.query(ExpenseDocument).filter(ExpenseDocument.id == document_id).first()

    if not document:
        return None

    if payload.expense_id is not None:
        expense = db.query(Expense).filter(Expense.id == payload.expense_id).first()
        if not expense:
            raise ValueError("Expense not found")
        document.expense_id = payload.expense_id

    if payload.extraction_status is not None:
        document.extraction_status = payload.extraction_status

    if payload.validation_status is not None:
        document.validation_status = payload.validation_status

    db.commit()
    db.refresh(document)
    return document


def list_documents_by_expense(db: Session, expense_id: int) -> list[ExpenseDocument]:
    return db.query(ExpenseDocument).filter(ExpenseDocument.expense_id == expense_id).all()
