"""Push notification HTTP surface for the unified Agent.

Mounted under ``/agent/push``.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

from apps.api.auth import get_current_user, require_same_company
from packages.core.platform.models_user import User as UserModel
from apps.api.deps import get_db
from packages.core.platform.models_user import User

from ..core.agent_push_service import AgentNotification, PUSH_SERVICE
from ..core.notification_service_db import DB_NOTIFICATION_SERVICE

router = APIRouter(prefix="/push", tags=["agent-push"])


# ── Schemas ────────────────────────────────────────────────────────────────────

class NotifyRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    user_id: int = Field(..., gt=0)
    type: str = Field(..., pattern=r"^(suggestion|alert|announcement)$")
    title: str = Field(..., min_length=1, max_length=255)
    message: str = Field(..., min_length=1, max_length=1000)
    action: dict[str, Any] | None = None


class CheckTriggersRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    context: dict[str, Any] = Field(default_factory=dict)


class DismissRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    notification_id: str = Field(..., min_length=1)


class SendAnnouncementRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    company_id: int = Field(..., gt=0)
    title: str = Field(..., min_length=1, max_length=255)
    message: str = Field(..., min_length=1, max_length=2000)
    target_roles: list[str] | None = None
    channels: list[str] | None = None


# ── Endpoints ────────────────────────────────────────────────────────────────

@router.post("/notify")
def notify_user(
    body: NotifyRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict[str, Any]:
    """Send a notification to a user."""
    # Verify the target user belongs to the same company
    target_user = db.query(UserModel).filter(UserModel.id == body.user_id).first()
    if not target_user or target_user.company_id != current_user.company_id:
        raise HTTPException(status_code=404, detail="User not found")
    require_same_company(target_user.company_id, current_user)
    notif = AgentNotification(
        id="",
        type=body.type,  # type: ignore[arg-type]
        title=body.title,
        message=body.message,
        action=body.action,
    )
    pushed = PUSH_SERVICE.send_notification(body.user_id, notif)
    # Push via WebSocket if the user is connected
    try:
        from ..api.agent_ws import manager as ws_manager
        import asyncio
        loop = asyncio.get_event_loop()
        if loop.is_running():
            loop.create_task(ws_manager.send_to_user(body.user_id, {
                "type": "notification",
                "data": {"id": pushed.id, "type": pushed.type, "title": pushed.title, "message": pushed.message},
            }))
    except Exception:
        pass
    return {"ok": True, "notification_id": pushed.id}


@router.post("/check")
def check_triggers(
    body: CheckTriggersRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict[str, Any]:
    """Evaluate triggers for the current user and return proactive notifications."""
    require_same_company(current_user.company_id, current_user)
    results = PUSH_SERVICE.check_triggers(current_user.id, body.context)
    return {
        "ok": True,
        "notifications": [
            {
                "id": n.id,
                "type": n.type,
                "title": n.title,
                "message": n.message,
                "action": n.action,
            }
            for n in results
        ],
    }


@router.get("/notifications")
def get_notifications(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict[str, Any]:
    """Get all active notifications for the current user (push + announcements)."""
    require_same_company(current_user.company_id, current_user)
    push_notes = PUSH_SERVICE.get_user_notifications(current_user.id)
    announcements = DB_NOTIFICATION_SERVICE.get_user_notifications(
        db,
        user_id=current_user.id,
        user_role=current_user.role,
        company_id=current_user.company_id,
    )
    return {
        "ok": True,
        "notifications": [
            {
                "id": n.id,
                "type": n.type,
                "title": n.title,
                "message": n.message,
                "action": n.action,
            }
            for n in push_notes
        ]
        + announcements,
    }


@router.post("/dismiss")
def dismiss_notification(
    body: DismissRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict[str, Any]:
    """Dismiss a notification for the current user."""
    require_same_company(current_user.company_id, current_user)
    push_ok = PUSH_SERVICE.dismiss_notification(current_user.id, body.notification_id)
    ann_ok = DB_NOTIFICATION_SERVICE.dismiss_notification(db, current_user.id, body.notification_id)
    return {"ok": push_ok or ann_ok}


@router.post("/announcement")
def send_announcement(
    body: SendAnnouncementRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict[str, Any]:
    """Broadcast an announcement to targeted users."""
    require_same_company(body.company_id, current_user)
    ann = DB_NOTIFICATION_SERVICE.send_announcement(
        db,
        company_id=body.company_id,
        title=body.title,
        message=body.message,
        target_roles=body.target_roles,
        channels=body.channels,
    )
    return {"ok": True, "announcement_id": ann.id}

