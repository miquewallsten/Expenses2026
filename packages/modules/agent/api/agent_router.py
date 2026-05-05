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

import asyncio
import json
import os
import secrets
from typing import Any, Dict, Literal

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

from apps.api.auth import get_current_user, require_admin, require_super_admin, require_same_company
from apps.api.deps import get_db
from packages.core.platform.models_user import User
from packages.core.platform.service_permissions import has_permission

from ..core import memory as memory_api
from ..core.memory import TenantMemoryService
from ..core import receipts as receipts_api
from ..core.appliers import get_applier
from ..core.audit import list_for_company as list_audit
from ..core.context import AgentContext, Persona
from ..core.engine import run_turn
from ..core.orchestrator import ORCHESTRATOR, AgentOrchestrator
from ..core.workflow import WORKFLOW_SERVICE
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
    if body.persona in ("admin", "finance_manager") and not has_permission(db, current_user, f"agent:chat:{body.persona}"):
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


# ── GET /agent/stream/{cid} ────────────────────────────────────────────────
#
# Phase 8.9 — Server-Sent Events streaming wrapper around `run_turn`. The
# engine is synchronous, so we run it in a threadpool and chunk the final
# content into ``text_delta`` events (≥2 deltas guaranteed). Tool calls
# recorded during the turn are surfaced as discrete events afterward, in
# order. The client may cancel by closing the EventSource — the request is
# polled for disconnect between yields and the generator returns within
# ~150ms.
#
# Event shapes (all framed as `event: <name>\ndata: <json>\n\n`):
#   text_delta       {"delta": "..."}
#   tool_call_start  {"tool": "...", "args_summary": "..."}
#   tool_call_done   {"tool": "...", "status": "...", "summary": "...", "duration_ms": int}
#   final            {"ok": bool, "session_id": "...", "content": "...", "tool_calls": [...], "pending": [...], "error": str|None}
#   cancelled        {"reason": "client_disconnected"}

from fastapi import Request as _FastApiRequest


def _sse_pack(event: str, payload: dict) -> bytes:
    return f"event: {event}\ndata: {json.dumps(payload, default=str)}\n\n".encode()


def _chunk_text(text: str, size: int = 60) -> list[str]:
    """Split text into ≥2 deltas where possible; preserves all bytes."""
    if not text:
        return [""]
    chunks = [text[i:i + size] for i in range(0, len(text), size)]
    if len(chunks) == 1 and len(text) > 1:
        # Force ≥2 deltas so consumers can verify streaming behaviour.
        mid = max(1, len(text) // 2)
        return [text[:mid], text[mid:]]
    return chunks


@router.get("/stream/{cid}")
async def stream_turn(
    cid: int,
    request: _FastApiRequest,
    prompt: str,
    persona: Persona = "admin",
    session_id: str | None = None,
    hard_mode: bool = False,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """SSE streaming variant of /agent/chat — emits incremental events."""
    require_same_company(cid, current_user)
    if persona in ("admin", "finance_manager") and not has_permission(db, current_user, f"agent:chat:{persona}"):
        raise HTTPException(status_code=403, detail="Admin persona requires admin role")

    async def event_gen():
        # Run the synchronous engine off the event loop so we can monitor
        # the request for client disconnects in parallel.
        from starlette.concurrency import run_in_threadpool

        turn_task = asyncio.create_task(
            run_in_threadpool(
                run_turn,
                db=db,
                user=current_user,
                company_id=cid,
                persona=persona,
                user_message=prompt,
                session_id=session_id,
                hard_mode=hard_mode,
            )
        )

        # Heartbeat-style poll: wait for the turn while watching for disconnect.
        while not turn_task.done():
            if await request.is_disconnected():
                turn_task.cancel()
                yield _sse_pack("cancelled", {"reason": "client_disconnected"})
                return
            try:
                await asyncio.wait_for(asyncio.shield(turn_task), timeout=0.1)
            except asyncio.TimeoutError:
                continue
            except asyncio.CancelledError:
                yield _sse_pack("cancelled", {"reason": "client_disconnected"})
                return

        try:
            result = turn_task.result()
        except Exception as exc:  # pragma: no cover - defensive
            yield _sse_pack("final", {"ok": False, "error": str(exc), "content": "", "tool_calls": [], "pending": []})
            return

        # Replay tool calls in order as discrete events.
        for call in result.get("tool_calls") or []:
            if await request.is_disconnected():
                yield _sse_pack("cancelled", {"reason": "client_disconnected"})
                return
            yield _sse_pack("tool_call_start", {
                "tool": call.get("tool"),
                "args_summary": call.get("summary", "")[:120],
            })
            yield _sse_pack("tool_call_done", {
                "tool":        call.get("tool"),
                "status":      call.get("status"),
                "summary":     call.get("summary"),
                "duration_ms": call.get("duration_ms"),
            })

        # Stream the final content as text deltas.
        for delta in _chunk_text(result.get("content") or ""):
            if await request.is_disconnected():
                yield _sse_pack("cancelled", {"reason": "client_disconnected"})
                return
            yield _sse_pack("text_delta", {"delta": delta})

        yield _sse_pack("final", {
            "ok":         result.get("ok", False),
            "error":      result.get("error"),
            "session_id": result.get("session_id"),
            "content":    result.get("content", ""),
            "tool_calls": result.get("tool_calls") or [],
            "pending":    result.get("pending") or [],
        })

    return StreamingResponse(
        event_gen(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


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
    # Atomic claim: pending → confirming in a single UPDATE WHERE to prevent
    # two concurrent confirms from double-applying the same mutation.
    row = receipts_api.claim_receipt(db, body.receipt_id, company_id=body.company_id)
    if row is None:
        # Check whether the receipt exists at all to give a precise error.
        existing = receipts_api.get_receipt(db, body.receipt_id, company_id=body.company_id)
        if existing is None:
            raise HTTPException(status_code=404, detail="receipt not found")
        raise HTTPException(status_code=409, detail=f"receipt is {existing.status}")

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
        # Capability flags — control what modules the user can access
        can_create_expenses=getattr(current_user, "can_create_expenses", True),
        can_access_accounting=getattr(current_user, "can_access_accounting", False),
        can_view_analytics=getattr(current_user, "can_view_analytics", False),
        is_amex_reconciler=getattr(current_user, "is_amex_reconciler", False),
        has_executive_reporting=getattr(current_user, "has_executive_reporting", False),
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
    storage_path = os.path.join(dir_path, f"{file_id}__{os.path.basename(file.filename or 'upload')}")

    def _write_file() -> None:
        os.makedirs(dir_path, exist_ok=True)
        with open(storage_path, "wb") as fh:
            fh.write(data)

    await asyncio.to_thread(_write_file)

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
    if body.persona in ("admin", "finance_manager") and not has_permission(db, current_user, f"agent:chat:{body.persona}"):
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

@router.post("/insights/run")
def trigger_insight_run(
    send_digest: bool = False,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_super_admin),
):
    """Phase 8.5 — cross-tenant insight rescan. Super-admin only.

    Rescans every company in the platform; customer admins must use the
    per-company endpoint (``GET /insights/{cid}?refresh=true``) instead.
    When ``send_digest=true`` the daily digest job runs after the rescan.
    """
    from ..insights import run_for_all_companies as _run_all

    out = _run_all(db)

    digest_count = 0
    if send_digest:
        from ..jobs.insight_digest import run_daily_insight_digest

        try:
            digest_count = run_daily_insight_digest(db, rescan=False)
        except Exception as exc:  # noqa: BLE001
            return {"ok": False, "scanned": out, "error": str(exc)[:500]}

    return {"ok": True, "scanned": out, "digest_dispatched": digest_count}


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


# ── Tenant Agent Memory ─────────────────────────────────────────────────────

TENANT_MEMORY_SERVICE = TenantMemoryService


@router.get("/tenant-memory/{cid}")
def list_tenant_memory(
    cid: int,
    agent_key: str = "admin",
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """List tenant agent memories for a company.

    Args:
        cid: Company ID
        agent_key: Agent key to filter by (default: "admin")

    Returns:
        List of memory entries with id, agent_key, key, value, confidence, timestamps
    """
    require_same_company(cid, current_user)
    service = TENANT_MEMORY_SERVICE(db)
    rows = service.list_for_agent(company_id=cid, agent_key=agent_key)
    return [
        {
            "id": r.id,
            "agent_key": r.agent_key,
            "key": r.key,
            "value": r.value,
            "confidence": r.confidence,
            "created_at": r.created_at,
            "updated_at": r.updated_at,
            "last_used_at": r.last_used_at,
        }
        for r in rows
    ]


@router.delete("/tenant-memory/{cid}/{key}")
def delete_tenant_memory(
    cid: int,
    key: str,
    agent_key: str = "admin",
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """Delete a specific tenant agent memory entry.

    Args:
        cid: Company ID
        key: Memory key to delete
        agent_key: Agent key (default: "admin")

    Returns:
        Confirmation with deleted key
    """
    require_same_company(cid, current_user)
    service = TENANT_MEMORY_SERVICE(db)
    deleted = service.delete(company_id=cid, agent_key=agent_key, key=key)
    if not deleted:
        raise HTTPException(status_code=404, detail="memory not found")
    return {"ok": True, "key": key}


# ── Super Admin Agent Management Endpoints ─────────────────────────────────

class AgentTeamStatus(BaseModel):
    name: str
    description: str
    active: bool
    request_count: int
    success_rate: float


class AgentPerformanceReport(BaseModel):
    teams: Dict[str, Dict[str, Any]]
    total_requests: int
    success_rate: float


@router.get("/admin/status/{cid}", response_model=Dict[str, AgentTeamStatus])
def get_agent_status(
    cid: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_super_admin),
):
    """Get status of all agent teams for Super Admin."""
    require_same_company(cid, current_user)
    return ORCHESTRATOR.get_team_status()


@router.get("/admin/performance/{cid}", response_model=AgentPerformanceReport)
def get_agent_performance(
    cid: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_super_admin),
):
    """Get performance report for Super Admin."""
    require_same_company(cid, current_user)
    return ORCHESTRATOR.get_performance_report()


@router.post("/admin/reset/{cid}")
def reset_agent_metrics(
    cid: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_super_admin),
):
    """Reset agent performance metrics for Super Admin."""
    require_same_company(cid, current_user)
    # For now, we'll recreate the orchestrator to reset metrics
    # In production, this would have proper reset methods
    global ORCHESTRATOR
    ORCHESTRATOR = AgentOrchestrator()
    return {"ok": True, "message": "Agent metrics reset successfully"}


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


@router.get("/usage/{cid}/rollup")
def usage_rollup(
    cid: int,
    days: int = 30,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """Phase 8.6 — aggregate agent usage for cost/latency dashboards.

    Returns totals, p50/p95 latency, success rate, and tool-call breakdown
    over the last ``days`` days for company ``cid``.
    """
    from datetime import datetime, timedelta
    from sqlalchemy import Integer as _SaInt, cast as sa_cast, func as sa_func

    from ..models import AgentUsage

    require_same_company(cid, current_user)
    days = max(1, min(days, 365))
    since = datetime.utcnow() - timedelta(days=days)

    base = db.query(AgentUsage).filter(
        AgentUsage.company_id == cid,
        AgentUsage.created_at >= since,
    )

    durations = sorted(r for (r,) in base.with_entities(AgentUsage.duration_ms).all())
    n = len(durations)

    def _pct(p: float) -> int:
        if not durations:
            return 0
        idx = min(n - 1, int(round((p / 100.0) * (n - 1))))
        return int(durations[idx])

    totals = base.with_entities(
        sa_func.count(AgentUsage.id),
        sa_func.coalesce(sa_func.sum(AgentUsage.tool_count), 0),
        sa_func.coalesce(sa_func.sum(AgentUsage.iterations), 0),
        sa_func.coalesce(sa_func.sum(sa_cast(AgentUsage.ok, _SaInt)), 0),
    ).one()
    total_calls, total_tool_calls, total_iterations, ok_count = totals

    by_model = (
        base.with_entities(AgentUsage.model, sa_func.count(AgentUsage.id))
        .group_by(AgentUsage.model)
        .all()
    )
    by_persona = (
        base.with_entities(AgentUsage.persona, sa_func.count(AgentUsage.id))
        .group_by(AgentUsage.persona)
        .all()
    )

    tool_breakdown = (
        db.query(AgentToolCall.tool_name, sa_func.count(AgentToolCall.id))
        .filter(
            AgentToolCall.company_id == cid,
            AgentToolCall.created_at >= since,
        )
        .group_by(AgentToolCall.tool_name)
        .order_by(sa_func.count(AgentToolCall.id).desc())
        .limit(20)
        .all()
    )

    return {
        "company_id":       cid,
        "since":            since.isoformat(),
        "days":             days,
        "total_calls":      int(total_calls or 0),
        "total_tool_calls": int(total_tool_calls or 0),
        "total_iterations": int(total_iterations or 0),
        "ok_rate":          (float(ok_count) / total_calls) if total_calls else 0.0,
        "p50_latency_ms":   _pct(50),
        "p95_latency_ms":   _pct(95),
        "by_model":         [{"model": m, "count": int(c)} for m, c in by_model],
        "by_persona":       [{"persona": p, "count": int(c)} for p, c in by_persona],
        "tool_breakdown":   [{"tool_name": t, "count": int(c)} for t, c in tool_breakdown],
    }


# ── Workflow State Machine ────────────────────────────────────────────────

class WorkflowStartRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    workflow_key: str = Field(..., min_length=1, max_length=128)
    total_steps: int = Field(..., ge=1, le=100)
    context: dict[str, Any] | None = None


class WorkflowAdvanceRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    workflow_key: str = Field(..., min_length=1, max_length=128)


class WorkflowResponse(BaseModel):
    ok: bool
    workflow_key: str
    current_step: str
    total_steps: int
    completed_steps: int
    context: dict[str, Any] | None = None


@router.post("/workflow/{cid}/start", response_model=WorkflowResponse)
def start_workflow(
    cid: int,
    body: WorkflowStartRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """Start a new workflow for a company."""
    require_same_company(cid, current_user)
    try:
        progress = WORKFLOW_SERVICE.start(
            db,
            company_id=cid,
            workflow_key=body.workflow_key,
            total_steps=body.total_steps,
            context=body.context,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    return WorkflowResponse(
        ok=True,
        workflow_key=progress.workflow_key,
        current_step=progress.current_step,
        total_steps=progress.total_steps,
        completed_steps=progress.completed_steps,
        context=json.loads(progress.context) if progress.context else None,
    )


@router.get("/workflow/{cid}")
def get_workflow(
    cid: int,
    workflow_key: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """Get workflow progress for a company."""
    require_same_company(cid, current_user)
    progress = WORKFLOW_SERVICE.get(db, company_id=cid, workflow_key=workflow_key)
    if progress is None:
        raise HTTPException(status_code=404, detail="workflow not found")

    return WorkflowResponse(
        ok=True,
        workflow_key=progress.workflow_key,
        current_step=progress.current_step,
        total_steps=progress.total_steps,
        completed_steps=progress.completed_steps,
        context=json.loads(progress.context) if progress.context else None,
    )


@router.post("/workflow/{cid}/advance", response_model=WorkflowResponse)
def advance_workflow(
    cid: int,
    body: WorkflowAdvanceRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """Advance workflow to the next step."""
    require_same_company(cid, current_user)
    try:
        progress = WORKFLOW_SERVICE.advance(
            db,
            company_id=cid,
            workflow_key=body.workflow_key,
        )
    except ValueError as e:
        if "not found" in str(e):
            raise HTTPException(status_code=404, detail=str(e))
        raise HTTPException(status_code=400, detail=str(e))

    return WorkflowResponse(
        ok=True,
        workflow_key=progress.workflow_key,
        current_step=progress.current_step,
        total_steps=progress.total_steps,
        completed_steps=progress.completed_steps,
        context=json.loads(progress.context) if progress.context else None,
    )
