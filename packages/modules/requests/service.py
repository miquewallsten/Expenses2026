from __future__ import annotations

import json
import os
import uuid
from datetime import datetime, timezone

from fastapi import UploadFile
from sqlalchemy import func
from sqlalchemy.orm import Session

from packages.core.platform.models_purchase_request import PurchaseRequest
from packages.core.platform.models_request_attachment import RequestAttachment
from packages.modules.requests.schemas import AttachmentRead, ChatMessage, PurchaseRequestRead

# ── Allowed MIME types for file uploads ───────────────────────────────────────
_ALLOWED_MIME_PREFIXES = (
    "image/",
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats",
    "application/vnd.ms-excel",
    "application/vnd.ms-powerpoint",
    "application/vnd.oasis",
    "text/plain",
    "text/csv",
)
_MAX_FILE_BYTES = 20 * 1024 * 1024  # 20 MB


def _uploads_dir() -> str:
    base = os.environ.get("UPLOADS_DIR", "./uploads")
    path = os.path.join(base, "requests")
    os.makedirs(path, exist_ok=True)
    return path


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _parse_details(r: PurchaseRequest) -> dict | None:
    if r.details_json:
        try:
            return json.loads(r.details_json)
        except Exception:
            return None
    return None


def _parse_conversation(r: PurchaseRequest) -> list[ChatMessage]:
    if r.conversation_json:
        try:
            raw = json.loads(r.conversation_json)
            return [ChatMessage(**m) for m in raw]
        except Exception:
            return []
    return []


def _parse_research(r: PurchaseRequest) -> list[dict] | None:
    if r.research_json:
        try:
            return json.loads(r.research_json)
        except Exception:
            return None
    return None


def _to_read(r: PurchaseRequest) -> PurchaseRequestRead:
    return PurchaseRequestRead(
        id=r.id,
        company_id=r.company_id,
        requester_id=r.requester_id,
        requester_name=r.requester_name,
        request_no=r.request_no,
        request_type=r.request_type,
        title=r.title,
        status=r.status,
        priority=r.priority,
        estimated_amount=r.estimated_amount,
        currency=r.currency,
        details=_parse_details(r),
        conversation=_parse_conversation(r),
        research=_parse_research(r),
        assigned_team=r.assigned_team,
        reviewer_notes=r.reviewer_notes,
        rejection_reason=r.rejection_reason,
        submitted_at=r.submitted_at,
        viewed_at=r.viewed_at,
        reviewed_at=r.reviewed_at,
        fulfilled_at=r.fulfilled_at,
        created_at=r.created_at,
        updated_at=r.updated_at,
    )


def list_requests(db: Session, company_id: int, requester_id: int) -> list[PurchaseRequestRead]:
    rows = (
        db.query(PurchaseRequest)
        .filter(
            PurchaseRequest.company_id == company_id,
            PurchaseRequest.requester_id == requester_id,
        )
        .order_by(PurchaseRequest.created_at.desc())
        .all()
    )
    return [_to_read(r) for r in rows]


def list_incoming(db: Session, company_id: int) -> list[PurchaseRequestRead]:
    """All non-draft, non-cancelled requests for the company (accounting/manager view)."""
    rows = (
        db.query(PurchaseRequest)
        .filter(
            PurchaseRequest.company_id == company_id,
            PurchaseRequest.status.notin_(["draft", "cancelled"]),
        )
        .order_by(PurchaseRequest.submitted_at.desc())
        .all()
    )
    return [_to_read(r) for r in rows]


def get_request(db: Session, company_id: int, request_id: int) -> PurchaseRequest | None:
    return (
        db.query(PurchaseRequest)
        .filter(
            PurchaseRequest.company_id == company_id,
            PurchaseRequest.id == request_id,
        )
        .first()
    )


def _generate_request_no(db: Session, company_id: int) -> str:
    """Generate a global per-company sequential PR number: PR-YYYY-NNNNN.

    Industry standard (SAP/Oracle/Ariba style): scoped to company + fiscal year,
    global across all users.  Sequence resets each calendar year.
    """
    year = datetime.now(timezone.utc).year
    prefix = f"PR-{year}-"
    # Count existing requests for this company in the current year
    count: int = (
        db.query(func.count(PurchaseRequest.id))
        .filter(
            PurchaseRequest.company_id == company_id,
            PurchaseRequest.request_no.like(f"{prefix}%"),
        )
        .scalar()
        or 0
    )
    return f"{prefix}{count + 1:05d}"


def create_request(
    db: Session,
    company_id: int,
    requester_id: int,
    requester_name: str | None,
) -> PurchaseRequest:
    req = PurchaseRequest(
        company_id=company_id,
        requester_id=requester_id,
        requester_name=requester_name,
        # request_no is assigned at submit time, not on draft creation
        status="draft",
        priority="normal",
    )
    db.add(req)
    db.commit()
    db.refresh(req)
    return req


def submit_request(db: Session, req: PurchaseRequest) -> PurchaseRequest:
    if not req.request_no:
        req.request_no = _generate_request_no(db, req.company_id)
    req.status = "submitted"
    req.submitted_at = _now()
    db.commit()
    db.refresh(req)
    return req


def cancel_request(db: Session, req: PurchaseRequest) -> PurchaseRequest:
    req.status = "cancelled"
    db.commit()
    db.refresh(req)
    return req


def approve_request(db: Session, req: PurchaseRequest, notes: str | None) -> PurchaseRequest:
    req.status = "approved"
    req.reviewed_at = _now()
    if notes:
        req.reviewer_notes = notes
    db.commit()
    db.refresh(req)
    return req


def reject_request(db: Session, req: PurchaseRequest, reason: str | None) -> PurchaseRequest:
    req.status = "rejected"
    req.reviewed_at = _now()
    if reason:
        req.rejection_reason = reason
    db.commit()
    db.refresh(req)
    return req


def fulfill_request(db: Session, req: PurchaseRequest, notes: str | None) -> PurchaseRequest:
    req.status = "fulfilled"
    req.fulfilled_at = _now()
    if notes:
        req.reviewer_notes = notes
    db.commit()
    db.refresh(req)
    return req


def can_delete(req: PurchaseRequest) -> bool:
    """A request can be deleted when it has never been seen by a reviewer."""
    return req.status in ("draft",) or (req.status == "submitted" and req.viewed_at is None)


def delete_request(db: Session, req: PurchaseRequest) -> None:
    db.delete(req)
    db.commit()


def mark_viewed(db: Session, req: PurchaseRequest) -> PurchaseRequest:
    """Record first-view timestamp and advance status draft→under_review."""
    if req.viewed_at is None:
        req.viewed_at = _now()
    if req.status == "submitted":
        req.status = "under_review"
    db.commit()
    db.refresh(req)
    return req


def update_request(db: Session, req: PurchaseRequest, payload: "PurchaseRequestUpdate") -> PurchaseRequest:
    """Apply a partial update to a draft request."""
    from packages.modules.requests.schemas import PurchaseRequestUpdate  # local import avoids circular
    if payload.title is not None:
        req.title = payload.title
    if payload.request_type is not None:
        req.request_type = payload.request_type
    if payload.priority is not None:
        req.priority = payload.priority
    if payload.estimated_amount is not None:
        req.estimated_amount = payload.estimated_amount
    if payload.currency is not None:
        req.currency = payload.currency
    if payload.details is not None:
        req.details_json = json.dumps(payload.details)
    req.updated_at = _now()
    db.commit()
    db.refresh(req)
    return req


# ── Attachment service ────────────────────────────────────────────────────────

def list_attachments(db: Session, company_id: int, request_id: int) -> list[RequestAttachment]:
    return (
        db.query(RequestAttachment)
        .filter(
            RequestAttachment.company_id == company_id,
            RequestAttachment.request_id == request_id,
        )
        .order_by(RequestAttachment.created_at.asc())
        .all()
    )


async def add_file_attachment(
    db: Session,
    company_id: int,
    request_id: int,
    uploader_id: int,
    file: UploadFile,
    label: str | None,
) -> RequestAttachment:
    mime = file.content_type or ""
    if not any(mime.startswith(p) for p in _ALLOWED_MIME_PREFIXES):
        raise ValueError(f"File type not allowed: {mime}")

    contents = await file.read()
    if len(contents) > _MAX_FILE_BYTES:
        raise ValueError("File exceeds 20 MB limit")

    ext = os.path.splitext(file.filename or "")[1]
    stored_name = f"{uuid.uuid4().hex}{ext}"
    stored_path = os.path.join(_uploads_dir(), stored_name)
    with open(stored_path, "wb") as f:
        f.write(contents)

    att = RequestAttachment(
        request_id=request_id,
        company_id=company_id,
        uploader_id=uploader_id,
        attachment_type="file",
        original_name=file.filename,
        stored_path=stored_path,
        file_size=len(contents),
        mime_type=mime,
        label=label,
    )
    db.add(att)
    db.commit()
    db.refresh(att)
    return att


def add_url_attachment(
    db: Session,
    company_id: int,
    request_id: int,
    uploader_id: int,
    url: str,
    label: str | None,
) -> RequestAttachment:
    att = RequestAttachment(
        request_id=request_id,
        company_id=company_id,
        uploader_id=uploader_id,
        attachment_type="url",
        url=url,
        label=label,
    )
    db.add(att)
    db.commit()
    db.refresh(att)
    return att


def delete_attachment(
    db: Session,
    company_id: int,
    attachment_id: int,
    requester_id: int,
) -> bool:
    att = (
        db.query(RequestAttachment)
        .filter(
            RequestAttachment.id == attachment_id,
            RequestAttachment.company_id == company_id,
            RequestAttachment.uploader_id == requester_id,
        )
        .first()
    )
    if not att:
        return False
    if att.stored_path and os.path.exists(att.stored_path):
        try:
            os.remove(att.stored_path)
        except OSError:
            pass
    db.delete(att)
    db.commit()
    return True


def get_attachment(db: Session, company_id: int, attachment_id: int) -> RequestAttachment | None:
    return (
        db.query(RequestAttachment)
        .filter(
            RequestAttachment.id == attachment_id,
            RequestAttachment.company_id == company_id,
        )
        .first()
    )


def to_attachment_read(att: RequestAttachment) -> AttachmentRead:
    return AttachmentRead(
        id=att.id,
        request_id=att.request_id,
        attachment_type=att.attachment_type,
        original_name=att.original_name,
        file_size=att.file_size,
        mime_type=att.mime_type,
        url=att.url,
        label=att.label,
        created_at=att.created_at,
    )
