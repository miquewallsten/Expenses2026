"""
Backfill utility for expense data derived from uploaded CFDI XML documents.

Repairs expenses with amount=0, filename-as-description, or missing expense_date
when a valid CFDI XML document is already linked to the expense.

Run once on startup (idempotent) or invoke directly:

    python -c "
    from apps.api.db import SessionLocal
    from packages.modules.expenses.service.backfill_service import backfill_expenses_from_xml
    db = SessionLocal()
    n = backfill_expenses_from_xml(db)
    print(f'Backfilled {n} expenses')
    db.close()
    "
"""

import logging
from datetime import date as _date, datetime
from decimal import Decimal, InvalidOperation

from sqlalchemy.orm import Session

from packages.modules.expenses.models.document import ExpenseDocument
from packages.modules.expenses.models.expense import Expense
from packages.modules.expenses.service.xml_extraction_service import extract_xml_fields

_log = logging.getLogger(__name__)


def _parse_date(value: str | None) -> _date | None:
    if not value:
        return None
    try:
        return datetime.strptime(str(value).split("T")[0].strip(), "%Y-%m-%d").date()
    except (ValueError, TypeError):
        _log.warning("backfill: could not parse date from: %r", value)
        return None

# Prefixes that indicate raw file bytes used as description — i.e. garbage.
_GARBAGE_PREFIXES = ("<?xml", "%PDF", "<cfdi", "<Comprobante")


def _is_garbage(text: str | None) -> bool:
    if not text:
        return False
    return any(text.lstrip().startswith(p) for p in _GARBAGE_PREFIXES)


def _good_desc(*candidates: str | None) -> str | None:
    for c in candidates:
        if c and c.strip() and not _is_garbage(c):
            return c.strip()
    return None


def backfill_expenses_from_xml(db: Session) -> int:
    """
    Fix all draft expenses where XML data was not properly applied.

    Criteria for "needs backfill":
      - amount == 0  OR
      - description looks like a filename (contains a dot, no spaces), OR
      - expense_date is None

    AND the expense has a linked cfdi_xml document with valid extracted XML.

    Returns the number of expenses updated.
    """
    count = 0

    expenses = (
        db.query(Expense)
        .filter(Expense.status == "draft")
        .all()
    )

    for expense in expenses:
        # Determine whether this expense needs backfill.
        needs_amount = expense.amount == 0
        needs_desc = (
            not expense.description
            or _is_garbage(expense.description)
            or (
                "." in expense.description
                and " " not in expense.description
            )
        )
        needs_date = expense.expense_date is None

        if not (needs_amount or needs_desc or needs_date):
            continue

        xml_doc = (
            db.query(ExpenseDocument)
            .filter(
                ExpenseDocument.expense_id == expense.id,
                ExpenseDocument.document_type == "cfdi_xml",
            )
            .first()
        )
        if not xml_doc:
            continue

        # Strip any appended [XML_EXTRACTED] metadata block before parsing —
        # ET.fromstring() fails when the stored content_text contains both
        # the raw XML and the extraction annotation block.
        raw_content = xml_doc.content_text or ""
        marker_idx = raw_content.find("[XML_EXTRACTED]")
        if marker_idx != -1:
            raw_content = raw_content[:marker_idx].rstrip()

        extracted = extract_xml_fields(raw_content)
        if not extracted.get("is_xml"):
            continue

        changed = False

        if needs_amount:
            raw_total = extracted.get("total")
            if raw_total is not None:
                try:
                    expense.amount = Decimal(str(raw_total).replace(",", ""))
                    changed = True
                except (InvalidOperation, TypeError):
                    pass

        if needs_desc:
            desc = _good_desc(
                extracted.get("descripcion"),
                extracted.get("conceptos_summary"),
                extracted.get("emisor_nombre"),
                "CFDI Invoice",
            )
            if desc:
                expense.description = desc
                changed = True

        if needs_date:
            fecha = extracted.get("fecha")
            parsed_date = _parse_date(fecha)
            if parsed_date is not None:
                expense.expense_date = parsed_date
                changed = True

        if changed:
            try:
                db.commit()
                count += 1
                _log.info("Backfilled expense id=%s from XML doc id=%s", expense.id, xml_doc.id)
            except Exception:  # noqa: BLE001
                db.rollback()
                _log.exception("Failed to backfill expense id=%s", expense.id)

    return count
