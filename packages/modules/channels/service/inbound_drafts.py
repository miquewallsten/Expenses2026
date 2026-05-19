"""Phase 1.6 — turn inbound CFDI XML attachments into draft Expense rows.

When an inbound email lands and contains a CFDI 4.0 XML attachment, we
parse the bare-minimum fields needed to create a usable draft expense:

* ``cfd:Comprobante/@Total``   → ``expense.amount``
* ``cfd:Comprobante/@Folio`` or UUID → ``expense.description``
* The XML bytes are stashed under ``storage/cfdi-inbound/<company_id>/``
  so a later step (or the user from the UI) can pair the document.

This is intentionally conservative: we do not attempt to map the CFDI to
a legal entity, validate the XML signature, or call SAT — that lives in
the regular CFDI pairing flow. The point here is "an email with a CFDI
attachment never gets dropped on the floor; it always becomes a draft
expense the user can finish from the web UI."
"""

from __future__ import annotations

import base64
import logging
import os
import re
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from pathlib import Path

from sqlalchemy.orm import Session

from packages.core.platform.service_audit import log_event
from packages.modules.channels.schemas import (
    InboundAttachment,
    NormalizedMessage,
)
from packages.modules.expenses.models.expense import Expense

log = logging.getLogger(__name__)

CFDI_NS = "{http://www.sat.gob.mx/cfd/4}"
TFD_NS = "{http://www.sat.gob.mx/TimbreFiscalDigital}"

_STORAGE_ROOT = Path(os.environ.get("STORAGE_ROOT", "storage"))


def _is_cfdi_xml(att: InboundAttachment) -> bool:
    name = (att.filename or "").lower()
    ctype = (att.content_type or "").lower()
    if name.endswith(".xml"):
        return True
    if "xml" in ctype:
        return True
    return False


def _safe_filename(name: str) -> str:
    return re.sub(r"[^A-Za-z0-9._-]+", "_", name) or "cfdi.xml"


def _decode(att: InboundAttachment) -> bytes | None:
    if not att.content_b64:
        return None
    try:
        return base64.b64decode(att.content_b64)
    except Exception:
        log.exception("Failed to b64-decode inbound attachment %s", att.filename)
        return None


def _parse_cfdi(xml_bytes: bytes) -> dict:
    """Extract the few fields we need; returns {} on any parse failure."""
    try:
        root = ET.fromstring(xml_bytes)
    except ET.ParseError:
        return {}

    info: dict = {
        "total": root.attrib.get("Total"),
        "folio": root.attrib.get("Folio"),
        "fecha": root.attrib.get("Fecha"),
    }
    # Issuer / receptor RFCs (best-effort; namespace required).
    emisor = root.find(f"{CFDI_NS}Emisor")
    receptor = root.find(f"{CFDI_NS}Receptor")
    info["emisor_rfc"] = emisor.attrib.get("Rfc") if emisor is not None else None
    info["receptor_rfc"] = receptor.attrib.get("Rfc") if receptor is not None else None

    # UUID lives inside Complemento/TimbreFiscalDigital.
    complemento = root.find(f"{CFDI_NS}Complemento")
    if complemento is not None:
        tfd = complemento.find(f"{TFD_NS}TimbreFiscalDigital")
        if tfd is not None:
            info["uuid"] = tfd.attrib.get("UUID")
    return info


def _persist_xml(company_id: int, filename: str, xml_bytes: bytes) -> str:
    target_dir = _STORAGE_ROOT / "cfdi-inbound" / str(company_id)
    target_dir.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now(tz=timezone.utc).strftime("%Y%m%dT%H%M%S")
    safe = _safe_filename(filename)
    path = target_dir / f"{timestamp}_{safe}"
    path.write_bytes(xml_bytes)
    return str(path)


def try_create_draft_from_email(
    db: Session, norm: NormalizedMessage
) -> Expense | None:
    """Best-effort: scan attachments and create a draft expense from the first CFDI.

    Returns the created ``Expense`` or ``None`` (no XML, parse failure, no Total
    field, or any unexpected exception). Caller should never let exceptions
    bubble up — the inbound webhook returns 200 regardless.
    """
    cfdi_atts = [a for a in (norm.attachments or []) if _is_cfdi_xml(a)]
    for att in cfdi_atts:
        xml_bytes = _decode(att)
        if not xml_bytes:
            continue
        info = _parse_cfdi(xml_bytes)
        if not info or not info.get("total"):
            continue
        try:
            amount = Decimal(str(info["total"]))
        except (InvalidOperation, TypeError):
            continue

        try:
            stored_at = _persist_xml(
                norm.company_id, att.filename or "cfdi.xml", xml_bytes
            )
        except Exception:
            log.exception(
                "CFDI persist failed for company %s — creating draft anyway",
                norm.company_id,
            )
            stored_at = None

        uuid = info.get("uuid")
        folio = info.get("folio")
        emisor = info.get("emisor_rfc")
        descr_label = uuid or folio or "inbound email"
        descr = f"CFDI {descr_label}"
        if emisor:
            descr += f" — {emisor}"

        try:
            expense = Expense(
                company_id=norm.company_id,
                amount=amount,
                description=descr[:255],
                status="draft",
            )
            db.add(expense)
            db.commit()
            db.refresh(expense)

            log_event(
                db=db,
                entity_type="expense",
                entity_id=expense.id,
                action="created_from_email",
                actor_user_id=None,
                detail_text=(
                    f"sender={norm.sender_ref} cfdi_uuid={uuid or 'n/a'} "
                    f"path={stored_at or 'unstored'}"
                ),
                company_id=norm.company_id,
            )
            return expense
        except Exception:
            log.exception(
                "Failed to create draft expense from inbound CFDI for company %s",
                norm.company_id,
            )
            db.rollback()
            return None

    return None



# ── PDF / Image Receipt Handling ──────────────────────────────────────────────

def _is_receipt_attachment(att: InboundAttachment) -> bool:
    """Check if attachment looks like a receipt (PDF or image)."""
    name = (att.filename or "").lower()
    ctype = (att.content_type or "").lower()
    # PDFs
    if name.endswith(".pdf") or "pdf" in ctype:
        return True
    # Images
    if name.endswith((".jpg", ".jpeg", ".png", ".heic", ".webp")):
        return True
    if ctype in ("image/jpeg", "image/png", "image/heic", "image/webp"):
        return True
    return False


def _persist_attachment(company_id: int, filename: str, data: bytes) -> str:
    """Save a binary attachment to disk and return the path."""
    target_dir = _STORAGE_ROOT / "inbound-attachments" / str(company_id)
    target_dir.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now(tz=timezone.utc).strftime("%Y%m%dT%H%M%S")
    safe = re.sub(r"[^A-Za-z0-9._-]+", "_", filename) or "attachment"
    path = target_dir / f"{timestamp}_{safe}"
    path.write_bytes(data)
    return str(path)


def try_create_draft_from_receipt(
    db: Session, norm: NormalizedMessage, extracted_data: dict | None = None
) -> Expense | None:
    """Create a draft expense from a PDF/image receipt attachment.

    This is for international or non-CFDI expenses where the receipt is a
    photo or PDF but not a Mexican CFDI XML. Uses AI receipt extraction if
    available, falls back to minimal data from the email body.

    Args:
        db: Database session
        norm: Normalized message with attachments
        extracted_data: Optional pre-extracted data dict with keys:
            amount, description, currency, supplier, date

    Returns:
        Created Expense or None if no receipt attachments found.
    """
    receipt_atts = [a for a in (norm.attachments or []) if _is_receipt_attachment(a)]

    if not receipt_atts:
        return None

    for att in receipt_atts:
        att_bytes = _decode(att)
        if not att_bytes:
            continue

        # Persist the file
        try:
            stored_at = _persist_attachment(
                norm.company_id, att.filename or "receipt", att_bytes
            )
        except Exception:
            log.exception("Receipt persist failed for company %s", norm.company_id)
            stored_at = None

        # Use extracted data if available (from AI receipt extraction service)
        amount = None
        description = f"Receipt from email — {att.filename or 'attachment'}"
        currency = "MXN"
        supplier = None

        if extracted_data:
            try:
                from decimal import Decimal, InvalidOperation as _IE
                if extracted_data.get("amount"):
                    amount = Decimal(str(extracted_data["amount"]))
                description = extracted_data.get("description", description)
                currency = extracted_data.get("currency", "MXN")
                supplier = extracted_data.get("supplier")
            except Exception:
                pass

        # If no extracted data, try to use AI receipt extraction
        if amount is None:
            try:
                from packages.modules.expenses.service.ai_receipt_extraction_service import (
                    AIReceiptExtractionService,
                )
                ai_svc = AIReceiptExtractionService()
                ai_result = ai_svc.extract_from_bytes(att_bytes, att.filename or "receipt")
                if ai_result and ai_result.get("amount"):
                    amount = ai_result["amount"]
                    if ai_result.get("supplier"):
                        supplier = ai_result["supplier"]
                        description = f"Receipt — {supplier}"
                    if ai_result.get("currency"):
                        currency = ai_result["currency"]
            except Exception:
                log.info("AI receipt extraction not available or failed, creating minimal draft")

        if amount is None:
            # Create a placeholder draft with zero amount — user must fill in
            amount = Decimal("0")
            description = f"[Review needed] Receipt from email — {att.filename or 'attachment'}"

        try:
            expense = Expense(
                company_id=norm.company_id,
                amount=amount,
                description=description[:255],
                status="draft",
                currency=currency,
                notes=f"sender={norm.sender_ref} path={stored_at or 'unstored'}"
                + (f" supplier={supplier}" if supplier else ""),
            )
            db.add(expense)
            db.commit()
            db.refresh(expense)

            log_event(
                db=db,
                entity_type="expense",
                entity_id=expense.id,
                action="created_from_email_receipt",
                actor_user_id=None,
                detail_text=(
                    f"sender={norm.sender_ref} file={att.filename or 'n/a'} "
                    f"path={stored_at or 'unstored'} currency={currency}"
                ),
                company_id=norm.company_id,
            )
            return expense
        except Exception:
            log.exception(
                "Failed to create draft expense from receipt for company %s",
                norm.company_id,
            )
            db.rollback()
            return None

    return None
