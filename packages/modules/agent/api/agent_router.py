"""HTTP surface for the unified Agent.

Endpoints (all mounted under /agent):

    POST /agent/chat/{cid}                     → run one user turn
    GET  /agent/sessions/{cid}                 → list recent sessions
    GET  /agent/sessions/{cid}/{session_id}    → full transcript for one session
    POST /agent/confirm                        → apply a pending receipt
    POST /agent/reject                         → discard a pending receipt
    GET  /agent/receipts/{cid}/{receipt_id}    → fetch a receipt for the UI
    GET  /agent/audit/{cid}                    → recent tool-call audit rows
    POST /agent/upload/{cid}                   → attach a file to a session

``cid`` = company_id. Every endpoint cross-checks it against the caller's
``User.company_id`` via :func:`require_same_company`.
"""

from __future__ import annotations

import json
import os
import secrets
from typing import Any, Literal

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

from apps.api.auth import get_current_user, require_admin, require_same_company
from apps.api.deps import get_db
from packages.core.platform.models_user import User

from ..core import memory as memory_api
from ..core import receipts as receipts_api
from ..core.appliers import get_applier
from ..core.audit import list_for_company as list_audit
from ..core.context import AgentContext, Persona
from ..core.engine import run_turn
from ..insights import run_scanners
from ..models import (
    AgentInsight,
    AgentPendingAction,
    AgentSession,
    AgentToolCall,
    AgentUpload,
)
from ..tools import registry_all  # noqa: F401 — triggers tool registration


router = APIRouter(prefix="/agent", tags=["agent"])


# ── Schemas ────────────────────────────────────────────────────────────────

class ChatRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    message:    str = Field(..., min_length=1, max_length=8000)
    session_id: str | None = None
    persona:    Persona = "admin"
    hard_mode:  bool = False


class ChatResponse(BaseModel):
    ok:         bool
    session_id: str
    content:    str
    tool_calls: list[dict[str, Any]]
    pending:    list[dict[str, Any]]
    error:      str | None = None


class ConfirmRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    receipt_id: str
    company_id: int


class RejectRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    receipt_id: str
    company_id: int


# ── POST /agent/chat/{cid} ─────────────────────────────────────────────────

@router.post("/chat/{cid}", response_model=ChatResponse)
def chat(
    cid: int,
    body: ChatRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ChatResponse:
    require_same_company(cid, current_user)

    # Admin-only personas.
    if body.persona in ("admin",) and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin persona requires admin role")

    result = run_turn(
        db=db,
        user=current_user,
        company_id=cid,
        persona=body.persona,
        user_message=body.message,
        session_id=body.session_id,
        hard_mode=body.hard_mode,
    )
    return ChatResponse(**result)


# ── GET /agent/sessions/{cid} ───────────────────────────────────────────────

@router.get("/sessions/{cid}")
def list_sessions(
    cid: int,
    limit: int = 20,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_same_company(cid, current_user)
    rows = (
        db.query(AgentSession)
        .filter(AgentSession.company_id == cid)
        .order_by(AgentSession.updated_at.desc())
        .limit(max(1, min(limit, 200)))
        .all()
    )
    return [
        {
            "session_id": r.session_id,
            "persona":    r.persona,
            "user_id":    r.user_id,
            "created_at": r.created_at,
            "updated_at": r.updated_at,
            "turn_count": len(json.loads(r.turns or "[]")),
        }
        for r in rows
    ]


@router.get("/sessions/{cid}/{session_id}")
def get_session(
    cid: int,
    session_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_same_company(cid, current_user)
    row = (
        db.query(AgentSession)
        .filter(AgentSession.company_id == cid, AgentSession.session_id == session_id)
        .one_or_none()
    )
    if row is None:
        raise HTTPException(status_code=404, detail="session not found")
    return {
        "session_id": row.session_id,
        "persona":    row.persona,
        "user_id":    row.user_id,
        "created_at": row.created_at,
        "updated_at": row.updated_at,
        "turns":      json.loads(row.turns or "[]"),
    }


# ── Receipts ────────────────────────────────────────────────────────────────

@router.get("/receipts/{cid}/{receipt_id}")
def get_receipt(
    cid: int,
    receipt_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_same_company(cid, current_user)
    row = receipts_api.get_receipt(db, receipt_id, company_id=cid)
    if row is None:
        raise HTTPException(status_code=404, detail="receipt not found")
    return _receipt_payload(row)


@router.post("/confirm")
def confirm(
    body: ConfirmRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    require_same_company(body.company_id, current_user)
    row = receipts_api.get_receipt(db, body.receipt_id, company_id=body.company_id)
    if row is None:
        raise HTTPException(status_code=404, detail="receipt not found")
    if row.status != "pending":
        raise HTTPException(status_code=409, detail=f"receipt is {row.status}")

    applier = get_applier(row.tool_name)
    if applier is None:
        raise HTTPException(status_code=400, detail=f"no applier registered for tool {row.tool_name}")

    ctx = AgentContext(
        db=db,
        company_id=body.company_id,
        user_id=current_user.id,
        user_email=current_user.email,
        user_role=current_user.role,
        persona="admin",
        session_id=row.session_id,
    )

    try:
        args = json.loads(row.args)
        result = applier(ctx, args)
    except Exception as exc:  # noqa: BLE001
        receipts_api.mark_failed(db, row, error=str(exc))
        raise HTTPException(status_code=500, detail=f"apply failed: {exc}")

    receipts_api.mark_confirmed(db, row, confirmed_by=current_user.email, result=result)
    return {"ok": True, "receipt": _receipt_payload(row), "result": result}


@router.post("/reject")
def reject(
    body: RejectRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    require_same_company(body.company_id, current_user)
    row = receipts_api.get_receipt(db, body.receipt_id, company_id=body.company_id)
    if row is None:
        raise HTTPException(status_code=404, detail="receipt not found")
    if row.status != "pending":
        raise HTTPException(status_code=409, detail=f"receipt is {row.status}")
    receipts_api.mark_rejected(db, row, confirmed_by=current_user.email)
    return {"ok": True, "receipt": _receipt_payload(row)}


def _receipt_payload(row: AgentPendingAction) -> dict[str, Any]:
    return {
        "receipt_id":  row.receipt_id,
        "company_id":  row.company_id,
        "session_id":  row.session_id,
        "tool_name":   row.tool_name,
        "args":        json.loads(row.args),
        "preview":     json.loads(row.preview),
        "status":      row.status,
        "expires_at":  row.expires_at,
        "created_at":  row.created_at,
        "confirmed_at": row.confirmed_at,
        "confirmed_by": row.confirmed_by,
        "result":      json.loads(row.result) if row.result else None,
        "error":       row.error,
    }


# ── Audit ────────────────────────────────────────────────────────────────

@router.get("/audit/{cid}")
def audit(
    cid: int,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    require_same_company(cid, current_user)
    rows = list_audit(db, cid, limit=max(1, min(limit, 500)))
    return [
        {
            "id":          r.id,
            "session_id":  r.session_id,
            "persona":     r.persona,
            "tool_name":   r.tool_name,
            "status":      r.status,
            "summary":     r.result_summary,
            "error":       r.error,
            "duration_ms": r.duration_ms,
            "created_at":  r.created_at,
        }
        for r in rows
    ]


# ── Upload ───────────────────────────────────────────────────────────────

_UPLOAD_ROOT = os.environ.get("AGENT_UPLOAD_ROOT", "storage/agent_uploads")
_MAX_BYTES = 25 * 1024 * 1024  # 25 MB hard limit per file

_ALLOWED_MIME = {
    "text/csv", "text/plain", "application/pdf",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
}


@router.post("/upload/{cid}")
async def upload(
    cid: int,
    file: UploadFile = File(...),
    session_id: str | None = Form(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    require_same_company(cid, current_user)

    content_type = (file.content_type or "").split(";")[0].strip()
    if content_type not in _ALLOWED_MIME:
        raise HTTPException(status_code=415, detail=f"unsupported content type {content_type!r}")

    data = await file.read()
    if len(data) > _MAX_BYTES:
        raise HTTPException(status_code=413, detail="file exceeds 25 MB limit")

    file_id = secrets.token_urlsafe(24)[:36]
    dir_path = os.path.join(_UPLOAD_ROOT, str(cid))
    os.makedirs(dir_path, exist_ok=True)
    storage_path = os.path.join(dir_path, f"{file_id}__{os.path.basename(file.filename or 'upload')}")
    with open(storage_path, "wb") as fh:
        fh.write(data)

    row = AgentUpload(
        file_id=file_id,
        company_id=cid,
        filename=file.filename or "upload",
        content_type=content_type,
        size_bytes=len(data),
        storage_path=storage_path,
        uploaded_by=current_user.id,
    )
    db.add(row)
    db.commit()

    return {
        "file_id":      file_id,
        "filename":     row.filename,
        "content_type": row.content_type,
        "size_bytes":   row.size_bytes,
        "session_id":   session_id,
    }


# ── Streaming chat (SSE) ───────────────────────────────────────────────────

@router.post("/chat/{cid}/stream")
def chat_stream(
    cid: int,
    body: ChatRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """SSE wrapper around :func:`run_turn`.

    We don't have a true token-streaming engine yet, so this endpoint
    *progressively emits* the lifecycle events around a single ``run_turn`` call:
    ``start`` → ``tool_call`` (one per tool) → ``final``. A future upgrade can
    replace the body with a truly streaming loop without changing the client.
    """
    require_same_company(cid, current_user)
    if body.persona == "admin" and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin persona requires admin role")

    def _event(kind: str, payload: dict[str, Any]) -> str:
        return f"event: {kind}\ndata: {json.dumps(payload, default=str)}\n\n"

    def gen():
        yield _event("start", {"session_id": body.session_id, "persona": body.persona})
        try:
            result = run_turn(
                db=db,
                user=current_user,
                company_id=cid,
                persona=body.persona,
                user_message=body.message,
                hard_mode=body.hard_mode,
                session_id=body.session_id,
            )
        except Exception as exc:  # noqa: BLE001
            yield _event("error", {"error": str(exc)[:500]})
            return
        for tc in result.get("tool_calls", []):
            yield _event("tool_call", tc)
        for p in result.get("pending", []):
            yield _event("receipt_created", p)
        yield _event("final", {
            "session_id": result.get("session_id"),
            "content":    result.get("content", ""),
            "ok":         result.get("ok", True),
            "error":      result.get("error"),
        })

    return StreamingResponse(
        gen(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ── Insights ────────────────────────────────────────────────────────────────

@router.get("/insights/{cid}")
def list_insights(
    cid: int,
    refresh: bool = False,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    require_same_company(cid, current_user)
    if refresh:
        run_scanners(db, cid)
    rows = (
        db.query(AgentInsight)
        .filter(AgentInsight.company_id == cid, AgentInsight.status == "open")
        .order_by(AgentInsight.severity.desc(), AgentInsight.created_at.desc())
        .limit(200)
        .all()
    )
    return [
        {
            "id": r.id,
            "kind": r.kind,
            "severity": r.severity,
            "title": r.title,
            "body": r.body,
            "data": json.loads(r.data_json) if r.data_json else None,
            "suggested_prompt": r.suggested_prompt,
            "status": r.status,
            "created_at": r.created_at,
        }
        for r in rows
    ]


class InsightStatusRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    status: Literal["acknowledged", "resolved", "dismissed"]


@router.post("/insights/{cid}/{insight_id}/status")
def set_insight_status(
    cid: int,
    insight_id: int,
    body: InsightStatusRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    require_same_company(cid, current_user)
    row = (
        db.query(AgentInsight)
        .filter(AgentInsight.company_id == cid, AgentInsight.id == insight_id)
        .one_or_none()
    )
    if row is None:
        raise HTTPException(status_code=404, detail="insight not found")
    row.status = body.status
    if body.status in ("resolved", "dismissed"):
        from datetime import datetime as _dt
        row.resolved_at = _dt.utcnow()
    db.commit()
    return {"ok": True, "id": row.id, "status": row.status}


# ── Memory ──────────────────────────────────────────────────────────────────

@router.get("/memory/{cid}")
def list_memory(
    cid: int,
    kind: str | None = None,
    limit: int = 50,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    require_same_company(cid, current_user)
    rows = memory_api.list_memories(db, company_id=cid, kind=kind, limit=limit)
    return [
        {
            "id": r.id,
            "kind": r.kind,
            "key": r.key,
            "value": (json.loads(r.value_json) if r.value_json else None),
            "user_id": r.user_id,
            "created_at": r.created_at,
            "expires_at": r.expires_at,
        }
        for r in rows
    ]


class MemoryCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    kind:  Literal["fact", "preference", "decision"] = "fact"
    key:   str = Field(..., min_length=1, max_length=255)
    value: Any
    scope: Literal["company", "user"] = "company"


@router.post("/memory/{cid}")
def create_memory(
    cid: int,
    body: MemoryCreateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    require_same_company(cid, current_user)
    user_id = current_user.id if body.scope == "user" else None
    row = memory_api.remember(
        db, company_id=cid, key=body.key, value=body.value,
        kind=body.kind, user_id=user_id,
    )
    return {"ok": True, "id": row.id, "key": row.key, "kind": row.kind}


@router.delete("/memory/{cid}/{mem_id}")
def delete_memory(
    cid: int,
    mem_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    require_same_company(cid, current_user)
    from ..models import AgentMemory
    row = db.query(AgentMemory).filter(
        AgentMemory.company_id == cid, AgentMemory.id == mem_id,
    ).one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="memory not found")
    db.delete(row)
    db.commit()
    return {"ok": True, "id": mem_id}


# ── Usage ───────────────────────────────────────────────────────────────────

@router.get("/usage/{cid}")
def list_usage(
    cid: int,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    require_same_company(cid, current_user)
    from ..models import AgentUsage
    rows = (
        db.query(AgentUsage)
        .filter(AgentUsage.company_id == cid)
        .order_by(AgentUsage.created_at.desc())
        .limit(max(1, min(limit, 500)))
        .all()
    )
    return [
        {
            "id":          r.id,
            "session_id":  r.session_id,
            "persona":     r.persona,
            "model":       r.model,
            "provider":    r.provider,
            "tool_count":  r.tool_count,
            "iterations":  r.iterations,
            "duration_ms": r.duration_ms,
            "ok":          r.ok,
            "created_at":  r.created_at,
        }
        for r in rows
    ]
