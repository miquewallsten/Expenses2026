"""Business logic for the Amex Reconciliation module."""
from __future__ import annotations

import logging
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy.orm import Session

from packages.modules.amex.csv_parser import ParsedStatement, parse_amex_csv
from packages.modules.amex.matching import DocLike, LineLike, compute_matches
from packages.modules.amex.models import (
    AmexCfdiDocument,
    AmexStatement,
    AmexStatementLine,
)
from packages.modules.archive.service.archive_service import store_file
from packages.modules.expenses.models.expense import Expense
from packages.modules.expenses.models.report import ExpenseReport
from packages.modules.expenses.service.xml_extraction_service import extract_xml_fields

_log = logging.getLogger(__name__)


# ── CSV upload ────────────────────────────────────────────────────────────────


def create_statement_from_csv(
    db: Session,
    *,
    company_id: int,
    reconciler_id: int | None,
    filename: str,
    csv_bytes: bytes,
) -> AmexStatement:
    """Parse CSV and persist statement + lines in one transaction."""
    parsed: ParsedStatement = parse_amex_csv(csv_bytes)
    stmt = AmexStatement(
        company_id=company_id,
        reconciler_id=reconciler_id,
        filename=filename,
        period_start=parsed.period_start,
        period_end=parsed.period_end,
        card_last4=parsed.card_last4,
        currency=parsed.currency,
        total_amount=parsed.total_amount,
        line_count=len(parsed.lines),
        status="draft",
    )
    db.add(stmt)
    db.flush()

    for pl in parsed.lines:
        # Skip credit lines — reconciliation is about charges.
        if pl.is_credit:
            continue
        db.add(
            AmexStatementLine(
                statement_id=stmt.id,
                company_id=company_id,
                line_no=pl.line_no,
                posted_date=pl.posted_date,
                description=pl.description,
                merchant=pl.merchant,
                amount=pl.amount,
                currency=pl.currency,
                reference=pl.reference,
                status="unmatched",
                match_confidence="none",
            )
        )
    db.commit()
    db.refresh(stmt)
    return stmt


# ── CFDI document upload ──────────────────────────────────────────────────────


def _dec(v) -> Decimal | None:
    if v is None or v == "":
        return None
    try:
        return Decimal(str(v)).quantize(Decimal("0.01"))
    except Exception:
        return None


def _parse_iso_date(raw: str | None) -> date | None:
    if not raw:
        return None
    try:
        return datetime.fromisoformat(str(raw)[:19]).date()
    except Exception:
        return None


def ingest_xml_document(
    db: Session,
    *,
    company_id: int,
    statement_id: int,
    filename: str,
    xml_bytes: bytes,
) -> AmexCfdiDocument:
    """Store an XML, extract CFDI fields, persist an AmexCfdiDocument row.

    If a document with the same UUID already exists on this statement, update
    it instead of duplicating.
    """
    try:
        xml_text = xml_bytes.decode("utf-8", errors="replace")
    except Exception:
        xml_text = xml_bytes.decode("latin-1", errors="replace")

    fields = extract_xml_fields(xml_text)
    archive = store_file(
        db,
        company_id=company_id,
        original_filename=filename,
        file_bytes=xml_bytes,
        source_type="xml",
        content_text=xml_text,
    )

    uuid = (fields.get("uuid") or "").strip() or None
    existing: AmexCfdiDocument | None = None
    if uuid:
        existing = (
            db.query(AmexCfdiDocument)
            .filter(
                AmexCfdiDocument.statement_id == statement_id,
                AmexCfdiDocument.uuid == uuid,
            )
            .first()
        )

    total = _dec(fields.get("total"))
    subtotal = _dec(fields.get("subtotal"))
    inv_date = _parse_iso_date(fields.get("fecha"))
    validation_status = "valid" if fields.get("is_xml") and uuid else "invalid"
    validation_error = None if validation_status == "valid" else "XML missing UUID or malformed"

    if existing:
        existing.xml_filename = filename
        existing.xml_storage_key = archive.storage_key
        existing.xml_content = xml_text
        existing.emisor_rfc = fields.get("emisor_rfc")
        existing.emisor_name = fields.get("emisor_nombre")
        existing.receptor_rfc = fields.get("receptor_rfc")
        existing.total = total
        existing.subtotal = subtotal
        existing.invoice_date = inv_date
        existing.validation_status = validation_status
        existing.validation_error = validation_error
        db.commit()
        db.refresh(existing)
        return existing

    doc = AmexCfdiDocument(
        statement_id=statement_id,
        company_id=company_id,
        xml_filename=filename,
        xml_storage_key=archive.storage_key,
        xml_content=xml_text,
        uuid=uuid,
        emisor_rfc=fields.get("emisor_rfc"),
        emisor_name=fields.get("emisor_nombre"),
        receptor_rfc=fields.get("receptor_rfc"),
        total=total,
        subtotal=subtotal,
        invoice_date=inv_date,
        validation_status=validation_status,
        validation_error=validation_error,
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)
    return doc


def ingest_pdf_document(
    db: Session,
    *,
    company_id: int,
    statement_id: int,
    filename: str,
    pdf_bytes: bytes,
) -> AmexCfdiDocument:
    """Store a PDF and attach it to an existing CFDI doc (by filename stem)
    or create a new doc row awaiting its XML."""
    archive = store_file(
        db,
        company_id=company_id,
        original_filename=filename,
        file_bytes=pdf_bytes,
        source_type="upload",
    )
    stem = filename.rsplit(".", 1)[0].lower()
    # Try to match an existing CFDI whose xml_filename shares the stem.
    candidates = (
        db.query(AmexCfdiDocument)
        .filter(AmexCfdiDocument.statement_id == statement_id)
        .all()
    )
    target: AmexCfdiDocument | None = None
    for c in candidates:
        if c.xml_filename and c.xml_filename.rsplit(".", 1)[0].lower() == stem:
            target = c
            break
    if target is None:
        target = AmexCfdiDocument(
            statement_id=statement_id,
            company_id=company_id,
            validation_status="pending",
        )
        db.add(target)

    target.pdf_filename = filename
    target.pdf_storage_key = archive.storage_key
    db.commit()
    db.refresh(target)
    return target


# ── Matching ──────────────────────────────────────────────────────────────────


def auto_match(db: Session, *, statement_id: int) -> tuple[int, int, int]:
    """Run deterministic matching for all unmatched lines.

    Returns ``(matched_this_run, total_lines, total_documents)``.
    """
    lines = (
        db.query(AmexStatementLine)
        .filter(
            AmexStatementLine.statement_id == statement_id,
            AmexStatementLine.status == "unmatched",
        )
        .all()
    )
    # Documents that are valid and not yet matched to another line.
    assigned_doc_ids = {
        lid
        for (lid,) in db.query(AmexStatementLine.matched_document_id)
        .filter(
            AmexStatementLine.statement_id == statement_id,
            AmexStatementLine.matched_document_id.isnot(None),
        )
        .all()
    }
    docs = (
        db.query(AmexCfdiDocument)
        .filter(
            AmexCfdiDocument.statement_id == statement_id,
            AmexCfdiDocument.validation_status == "valid",
        )
        .all()
    )
    docs_free = [d for d in docs if d.id not in assigned_doc_ids]

    line_objs = [LineLike(id=l.id, amount=l.amount, posted_date=l.posted_date) for l in lines]
    doc_objs = [DocLike(id=d.id, total=d.total, invoice_date=d.invoice_date) for d in docs_free]

    matches = compute_matches(line_objs, doc_objs)
    line_by_id = {l.id: l for l in lines}
    for m in matches:
        line = line_by_id.get(m.line_id)
        if line is None:
            continue
        line.matched_document_id = m.doc_id
        line.status = "matched"
        line.match_confidence = "auto"

    db.commit()
    total_docs = len(docs)
    total_lines = (
        db.query(AmexStatementLine)
        .filter(AmexStatementLine.statement_id == statement_id)
        .count()
    )
    return len(matches), total_lines, total_docs


def manual_match(db: Session, *, line_id: int, document_id: int) -> AmexStatementLine:
    line = db.query(AmexStatementLine).filter(AmexStatementLine.id == line_id).first()
    if line is None:
        raise ValueError("line not found")
    doc = db.query(AmexCfdiDocument).filter(AmexCfdiDocument.id == document_id).first()
    if doc is None or doc.statement_id != line.statement_id:
        raise ValueError("document not found on this statement")
    # Unassign if the document is already paired elsewhere.
    other = (
        db.query(AmexStatementLine)
        .filter(
            AmexStatementLine.matched_document_id == document_id,
            AmexStatementLine.id != line_id,
        )
        .first()
    )
    if other is not None:
        other.matched_document_id = None
        other.status = "unmatched"
        other.match_confidence = "none"
    line.matched_document_id = document_id
    line.status = "matched"
    line.match_confidence = "manual"
    db.commit()
    db.refresh(line)
    return line


def unmatch(db: Session, *, line_id: int) -> AmexStatementLine:
    line = db.query(AmexStatementLine).filter(AmexStatementLine.id == line_id).first()
    if line is None:
        raise ValueError("line not found")
    line.matched_document_id = None
    line.match_confidence = "none"
    if line.status == "matched":
        line.status = "unmatched"
    db.commit()
    db.refresh(line)
    return line


# ── Summary counts ────────────────────────────────────────────────────────────


def summarise_statement(db: Session, stmt: AmexStatement) -> dict:
    counts = {"matched": 0, "unmatched": 0, "no_invoice": 0, "missing": 0}
    rows = (
        db.query(AmexStatementLine.status)
        .filter(AmexStatementLine.statement_id == stmt.id)
        .all()
    )
    for (s,) in rows:
        counts[s] = counts.get(s, 0) + 1
    doc_count = (
        db.query(AmexCfdiDocument)
        .filter(AmexCfdiDocument.statement_id == stmt.id)
        .count()
    )
    return {
        "matched_count": counts.get("matched", 0),
        "unmatched_count": counts.get("unmatched", 0),
        "no_invoice_count": counts.get("no_invoice", 0),
        "missing_count": counts.get("missing", 0),
        "document_count": doc_count,
    }


# ── Submission ────────────────────────────────────────────────────────────────


def can_submit(db: Session, stmt: AmexStatement) -> tuple[bool, str | None]:
    summary = summarise_statement(db, stmt)
    if summary["unmatched_count"] > 0:
        return False, "Hay cargos sin conciliar."
    if summary["missing_count"] > 0:
        return False, "Hay cargos marcados como factura pendiente."
    return True, None


def submit_statement(db: Session, stmt: AmexStatement) -> tuple[Expense, ExpenseReport]:
    """Bundle the statement into one Expense + ExpenseReport for approval."""
    ok, reason = can_submit(db, stmt)
    if not ok:
        raise ValueError(reason or "statement not ready")

    period = None
    if stmt.period_start and stmt.period_end:
        period = f"{stmt.period_start.isoformat()} – {stmt.period_end.isoformat()}"
    title = f"Estado de cuenta Amex" + (f" • {stmt.card_last4}" if stmt.card_last4 else "")
    if period:
        title = f"{title} ({period})"

    report = ExpenseReport(
        company_id=stmt.company_id,
        title=title,
        status="draft",
        user_id=stmt.reconciler_id,
        period_start=stmt.period_start,
        period_end=stmt.period_end,
        triggered_by="user",
    )
    db.add(report)
    db.flush()

    expense = Expense(
        company_id=stmt.company_id,
        amount=stmt.total_amount,
        description=title,
        status="submitted",
        settlement_type="corporate_card",
        report_id=report.id,
        expense_date=stmt.period_end or stmt.period_start,
        notes=f"Amex reconciliation statement #{stmt.id} ({stmt.line_count} charges)",
    )
    db.add(expense)
    db.flush()

    stmt.status = "submitted"
    stmt.submitted_at = datetime.utcnow()
    stmt.expense_id = expense.id
    stmt.report_id = report.id
    db.commit()
    db.refresh(expense)
    db.refresh(report)
    return expense, report
