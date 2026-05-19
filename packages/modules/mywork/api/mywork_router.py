from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from apps.api.auth import get_current_user, require_same_company
from apps.api.deps import get_db
from packages.core.platform.models_user import User
from packages.modules.mywork.core.manifest_service import ManifestService
from packages.modules.mywork.core.action_router import route_action
from packages.modules.mywork.schemas.action import (
    ActionRequest,
    ActionResponse,
    ActionError,
    ContextUpdateRequest,
    ContextUpdateResponse,
)

router = APIRouter(prefix="/mywork", tags=["mywork"])


@router.get("/manifest")
def get_manifest(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict[str, Any]:
    require_same_company(current_user.company_id, current_user)
    svc = ManifestService(db)
    return svc.build_manifest(current_user.id)


@router.post("/context", response_model=ContextUpdateResponse)
def update_context(
    body: ContextUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ContextUpdateResponse:
    require_same_company(current_user.company_id, current_user)
    suggestions: list[dict[str, Any]] = []
    if body.module == "expenses":
        suggestions = [
            {"type": "action", "label": "Create expense", "actionId": "expenses:create"},
            {"type": "tip", "label": "Upload CFDI XML for auto-categorization"},
        ]
    elif body.module == "approvals":
        suggestions = [
            {"type": "action", "label": "Review pending approvals", "actionId": "approvals:approve"},
        ]
    elif body.module == "admin":
        suggestions = [
            {"type": "action", "label": "Invite user", "actionId": "users:invite"},
            {"type": "action", "label": "Update policy", "actionId": "policy:update"},
        ]
    return ContextUpdateResponse(module=body.module, copilot_suggestions=suggestions)


@router.post("/actions", response_model=ActionResponse)
def post_action(
    body: ActionRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ActionResponse:
    require_same_company(current_user.company_id, current_user)
    result = route_action(
        action_id=body.action_id,
        module=body.module,
        payload=body.payload,
        context=body.context,
        db=db,
        user=current_user,
    )
    if not result.get("success", False):
        error_data = result.get("error", {})
        return ActionResponse(
            success=False,
            error=ActionError(
                code=error_data.get("code", "action_failed"),
                message=error_data.get("message", "Action failed"),
                retryable=error_data.get("retryable", False),
            ),
        )
    return ActionResponse(success=True, data=result.get("data"))
