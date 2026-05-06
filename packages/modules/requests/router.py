from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from apps.api.deps import get_db
from packages.core.platform.module_gate import require_module
from packages.modules.requests.schemas import (
    AddUrlAttachment,
    AIChatRequest,
    AIChatResponse,
    AttachmentRead,
    PurchaseRequestRead,
    PurchaseRequestUpdate,
    ReviewAction,
)
from packages.modules.requests.service import (
    _to_read,
    add_file_attachment,
    add_url_attachment,
    approve_request,
    cancel_request,
    can_delete,
    create_request,
    delete_attachment,
    delete_request,
    fulfill_request,
    get_attachment,
    get_request,
    list_attachments,
    list_incoming,
    list_requests,
    mark_viewed,
    reject_request,
    submit_request,
    to_attachment_read,
    update_request,
)
from packages.modules.requests import agent as req_agent

router = APIRouter(
    prefix="/requests",
    tags=["requests"],
    dependencies=[Depends(require_module("purchase_requests"))],
)


@router.get("/{company_id}/my", response_model=list[PurchaseRequestRead])
def get_my_requests(
    company_id: int, 
    requester_id: int | None = None, 
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    require_same_company(company_id, current_user)
    
    # If requester_id not provided, default to current user
    eff_requester_id = requester_id or current_user.id
    
    # Permission check: can only see own requests unless secretary for the requested user
    if eff_requester_id != current_user.id:
        is_boss = db.query(User).filter(User.id == eff_requester_id, User.delegates_for_user_id == current_user.id).first()
        if not is_boss and not has_permission(db, current_user, "purchase_request:read:any"):
            eff_requester_id = current_user.id

    return list_requests(db, company_id, eff_requester_id)


@router.get("/{company_id}/incoming", response_model=list[PurchaseRequestRead])
def get_incoming_requests(
    company_id: int, 
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    require_same_company(company_id, current_user)
    # Only managers/accounting/admins should see incoming
    if current_user.role not in ("admin", "manager", "accounting", "executive"):
        raise HTTPException(status_code=403, detail="Not authorized to view company requests")
        
    return list_incoming(db, company_id)


@router.post("/{company_id}/new", response_model=PurchaseRequestRead)
def create_new_request(
    company_id: int,
    requester_id: int | None = None,
    requester_name: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    require_same_company(company_id, current_user)
    
    eff_requester_id = requester_id or current_user.id
    eff_requester_name = requester_name or current_user.full_name
    
    if eff_requester_id != current_user.id:
        # Secretary check
        boss = db.query(User).filter(User.id == eff_requester_id, User.delegates_for_user_id == current_user.id).first()
        if not boss and not has_permission(db, current_user, "purchase_request:create:any"):
            raise HTTPException(status_code=403, detail="Not authorized to create for this user")
        if boss:
            eff_requester_name = boss.full_name

    req = create_request(db, company_id, eff_requester_id, eff_requester_name)
    req_agent.get_initial_greeting(db, req)
    return _to_read(req)


@router.post("/{company_id}/{request_id}/chat", response_model=AIChatResponse)
def chat(
    company_id: int,
    request_id: int,
    body: AIChatRequest,
    db: Session = Depends(get_db),
):
    req = get_request(db, company_id, request_id)
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
    if req.status != "draft":
        raise HTTPException(status_code=400, detail="Only draft requests can be continued")
    result = req_agent.process_chat(db, req, body.message, do_research=body.research)
    return AIChatResponse(
        reply=result["reply"],
        extracted_fields=result.get("extracted_fields"),
        ready_to_submit=result.get("ready_to_submit", False),
        research_results=result.get("research_results"),
        request_id=req.id,
        title=req.title,
        request_type=req.request_type,
    )


@router.post("/{company_id}/{request_id}/submit", response_model=PurchaseRequestRead)
def submit(company_id: int, request_id: int, db: Session = Depends(get_db)):
    req = get_request(db, company_id, request_id)
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
    if req.status != "draft":
        raise HTTPException(status_code=400, detail="Only draft requests can be submitted")
    return _to_read(submit_request(db, req))


@router.post("/{company_id}/{request_id}/cancel", response_model=PurchaseRequestRead)
def cancel(company_id: int, request_id: int, db: Session = Depends(get_db)):
    req = get_request(db, company_id, request_id)
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
    if req.status in ("fulfilled", "cancelled"):
        raise HTTPException(status_code=400, detail="Cannot cancel a fulfilled or already cancelled request")
    return _to_read(cancel_request(db, req))


@router.post("/{company_id}/{request_id}/approve", response_model=PurchaseRequestRead)
def approve(company_id: int, request_id: int, body: ReviewAction, db: Session = Depends(get_db)):
    req = get_request(db, company_id, request_id)
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
    if req.status not in ("submitted", "under_review"):
        raise HTTPException(status_code=400, detail="Request is not pending review")
    return _to_read(approve_request(db, req, body.notes))


@router.post("/{company_id}/{request_id}/reject", response_model=PurchaseRequestRead)
def reject(company_id: int, request_id: int, body: ReviewAction, db: Session = Depends(get_db)):
    req = get_request(db, company_id, request_id)
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
    if req.status not in ("submitted", "under_review"):
        raise HTTPException(status_code=400, detail="Request is not pending review")
    return _to_read(reject_request(db, req, body.rejection_reason))


@router.post("/{company_id}/{request_id}/fulfill", response_model=PurchaseRequestRead)
def fulfill(company_id: int, request_id: int, body: ReviewAction, db: Session = Depends(get_db)):
    req = get_request(db, company_id, request_id)
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
    if req.status != "approved":
        raise HTTPException(status_code=400, detail="Only approved requests can be fulfilled")
    return _to_read(fulfill_request(db, req, body.notes))


@router.delete("/{company_id}/{request_id}", status_code=204)
def delete(company_id: int, request_id: int, db: Session = Depends(get_db)):
    req = get_request(db, company_id, request_id)
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
    if not can_delete(req):
        raise HTTPException(status_code=409, detail="Request can no longer be deleted — it has been seen by a reviewer")
    delete_request(db, req)


@router.post("/{company_id}/{request_id}/view", response_model=PurchaseRequestRead)
def view_request(company_id: int, request_id: int, db: Session = Depends(get_db)):
    """Called when a reviewer opens the request detail — marks it as viewed."""
    req = get_request(db, company_id, request_id)
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
    return _to_read(mark_viewed(db, req))


@router.patch("/{company_id}/{request_id}", response_model=PurchaseRequestRead)
def patch_request(company_id: int, request_id: int, payload: PurchaseRequestUpdate, db: Session = Depends(get_db)):
    """Manually edit a draft request (from the form)."""
    req = get_request(db, company_id, request_id)
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
    if req.status != "draft":
        raise HTTPException(status_code=400, detail="Only draft requests can be edited")
    return _to_read(update_request(db, req, payload))


@router.patch("/{company_id}/{request_id}", response_model=PurchaseRequestRead)
def patch_request(company_id: int, request_id: int, payload: PurchaseRequestUpdate, db: Session = Depends(get_db)):
    """Manually edit a draft request (from the form)."""
    req = get_request(db, company_id, request_id)
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
    if req.status != "draft":
        raise HTTPException(status_code=400, detail="Only draft requests can be edited")
    return _to_read(update_request(db, req, payload))


# ── Attachments ────────────────────────────────────────────────────────────────

@router.get("/{company_id}/{request_id}/attachments", response_model=list[AttachmentRead])
def get_attachments(company_id: int, request_id: int, db: Session = Depends(get_db)):
    req = get_request(db, company_id, request_id)
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
    return [to_attachment_read(a) for a in list_attachments(db, company_id, request_id)]


@router.post("/{company_id}/{request_id}/attachments/file", response_model=AttachmentRead)
async def upload_file_attachment(
    company_id: int,
    request_id: int,
    uploader_id: int,
    file: UploadFile = File(...),
    label: str | None = Form(default=None),
    db: Session = Depends(get_db),
):
    req = get_request(db, company_id, request_id)
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
    try:
        att = await add_file_attachment(db, company_id, request_id, uploader_id, file, label)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    return to_attachment_read(att)


@router.post("/{company_id}/{request_id}/attachments/url", response_model=AttachmentRead)
def add_url(
    company_id: int,
    request_id: int,
    uploader_id: int,
    body: AddUrlAttachment,
    db: Session = Depends(get_db),
):
    req = get_request(db, company_id, request_id)
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
    att = add_url_attachment(db, company_id, request_id, uploader_id, body.url, body.label)
    return to_attachment_read(att)


@router.delete("/{company_id}/{request_id}/attachments/{attachment_id}", status_code=204)
def remove_attachment(
    company_id: int,
    request_id: int,
    attachment_id: int,
    requester_id: int,
    db: Session = Depends(get_db),
):
    deleted = delete_attachment(db, company_id, attachment_id, requester_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Attachment not found or not yours")


@router.get("/{company_id}/attachments/{attachment_id}/download")
def download_attachment(company_id: int, attachment_id: int, db: Session = Depends(get_db)):
    att = get_attachment(db, company_id, attachment_id)
    if not att or att.attachment_type != "file" or not att.stored_path:
        raise HTTPException(status_code=404, detail="File not found")
    import os
    if not os.path.exists(att.stored_path):
        raise HTTPException(status_code=404, detail="File not found on disk")
    return FileResponse(
        att.stored_path,
        media_type=att.mime_type or "application/octet-stream",
        filename=att.original_name or "download",
    )
