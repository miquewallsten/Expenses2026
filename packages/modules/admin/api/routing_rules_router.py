"""routing_rules_router.py — admin CRUD for ApprovalRoutingRule.

Wraps the persistence model behind the dict-DSL routing engine
(``approval_routing_service``). Admins can list, create, update, and
delete rules per company. Rule shape mirrors the engine contract:

    rule_key  → ``id`` field in match_rule output
    priority  → integer, higher wins
    when_json → predicate tree {"all": [...]} / {"any": [...]} / leaf
    approvers_json → list of {"role": str} | {"user_id": int}
    sla_hours / escalation_role → optional SLA hookup
"""

from __future__ import annotations

from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from apps.api.auth import get_current_user, require_admin, require_same_company
from apps.api.deps import get_db
from packages.core.platform.models_user import User
from packages.modules.expenses.models_routing import ApprovalRoutingRule
from packages.modules.expenses.service.approval_routing_service import (
    list_rules_for_company,
    resolve_approvers,
)


router = APIRouter(
    prefix="/admin/routing-rules",
    tags=["admin", "routing-rules"],
    dependencies=[Depends(require_admin)],
)


class RoutingRuleRow(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    company_id: int
    rule_key: str
    name: str
    priority: int
    when_json: dict[str, Any]
    approvers_json: list[dict[str, Any]]
    sla_hours: Optional[int] = None
    escalation_role: Optional[str] = None
    is_enabled: bool


class RoutingRuleCreate(BaseModel):
    rule_key: str = Field(..., min_length=1, max_length=80)
    name: str = Field(..., min_length=1, max_length=200)
    priority: int = Field(default=0)
    when_json: dict[str, Any]
    approvers_json: list[dict[str, Any]] = Field(default_factory=list)
    sla_hours: Optional[int] = Field(default=None, ge=1, le=24 * 30)
    escalation_role: Optional[str] = Field(default=None, max_length=60)
    is_enabled: bool = True


class RoutingRuleUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=200)
    priority: Optional[int] = None
    when_json: Optional[dict[str, Any]] = None
    approvers_json: Optional[list[dict[str, Any]]] = None
    sla_hours: Optional[int] = Field(default=None, ge=1, le=24 * 30)
    escalation_role: Optional[str] = Field(default=None, max_length=60)
    is_enabled: Optional[bool] = None


def _validate_when(when: dict[str, Any]) -> None:
    """Lightweight shape check — guards against obviously malformed predicate
    trees. The runtime evaluator is permissive (unknown ops return False),
    but rejecting garbage at the API boundary surfaces author errors early."""
    if not isinstance(when, dict) or not when:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="when_json must be a non-empty object",
        )
    if "all" in when or "any" in when:
        key = "all" if "all" in when else "any"
        children = when[key]
        if not isinstance(children, list) or not children:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"when_json.{key} must be a non-empty list",
            )
        for child in children:
            _validate_when(child)
        return
    if "field" not in when or "value" not in when:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="leaf predicate requires 'field' and 'value'",
        )
    op = when.get("op", "eq")
    if op not in {"eq", "ne", "gt", "gte", "lt", "lte", "in", "not_in"}:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"unsupported op '{op}'",
        )


def _validate_approvers(approvers: list[dict[str, Any]]) -> None:
    for a in approvers:
        if not isinstance(a, dict) or ("role" not in a and "user_id" not in a):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="each approver must specify 'role' or 'user_id'",
            )


@router.get("/{company_id}", response_model=list[RoutingRuleRow])
def list_rules(
    company_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[ApprovalRoutingRule]:
    require_same_company(company_id, current_user)
    rows = list(
        db.execute(
            select(ApprovalRoutingRule)
            .where(ApprovalRoutingRule.company_id == company_id)
            .order_by(
                ApprovalRoutingRule.priority.desc(),
                ApprovalRoutingRule.rule_key.asc(),
            )
        ).scalars()
    )
    return rows


@router.post(
    "/{company_id}", response_model=RoutingRuleRow, status_code=status.HTTP_201_CREATED
)
def create_rule(
    company_id: int,
    payload: RoutingRuleCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ApprovalRoutingRule:
    require_same_company(company_id, current_user)
    _validate_when(payload.when_json)
    _validate_approvers(payload.approvers_json)

    existing = db.execute(
        select(ApprovalRoutingRule).where(
            ApprovalRoutingRule.company_id == company_id,
            ApprovalRoutingRule.rule_key == payload.rule_key,
        )
    ).scalar_one_or_none()
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"rule_key '{payload.rule_key}' already exists",
        )

    row = ApprovalRoutingRule(
        company_id=company_id,
        rule_key=payload.rule_key,
        name=payload.name,
        priority=payload.priority,
        when_json=payload.when_json,
        approvers_json=payload.approvers_json,
        sla_hours=payload.sla_hours,
        escalation_role=payload.escalation_role,
        is_enabled=payload.is_enabled,
        created_by_user_id=current_user.id,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def _get_or_404(
    db: Session, *, company_id: int, rule_id: int
) -> ApprovalRoutingRule:
    row = db.execute(
        select(ApprovalRoutingRule).where(
            ApprovalRoutingRule.id == rule_id,
            ApprovalRoutingRule.company_id == company_id,
        )
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="routing rule not found"
        )
    return row


@router.patch("/{company_id}/{rule_id}", response_model=RoutingRuleRow)
def update_rule(
    company_id: int,
    rule_id: int,
    payload: RoutingRuleUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ApprovalRoutingRule:
    require_same_company(company_id, current_user)
    row = _get_or_404(db, company_id=company_id, rule_id=rule_id)

    if payload.when_json is not None:
        _validate_when(payload.when_json)
        row.when_json = payload.when_json
    if payload.approvers_json is not None:
        _validate_approvers(payload.approvers_json)
        row.approvers_json = payload.approvers_json
    if payload.name is not None:
        row.name = payload.name
    if payload.priority is not None:
        row.priority = payload.priority
    if payload.sla_hours is not None:
        row.sla_hours = payload.sla_hours
    if payload.escalation_role is not None:
        row.escalation_role = payload.escalation_role
    if payload.is_enabled is not None:
        row.is_enabled = payload.is_enabled

    db.commit()
    db.refresh(row)
    return row


@router.delete(
    "/{company_id}/{rule_id}", status_code=status.HTTP_204_NO_CONTENT
)
def delete_rule(
    company_id: int,
    rule_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    require_same_company(company_id, current_user)
    row = _get_or_404(db, company_id=company_id, rule_id=rule_id)
    db.delete(row)
    db.commit()


# ── Preview / probe ──────────────────────────────────────────────────────


class RoutingPreviewRequest(BaseModel):
    """Arbitrary expense-like context dict; engine matches by field name."""

    context: dict[str, Any] = Field(default_factory=dict)


class RoutingPreviewResponse(BaseModel):
    matched_rule_id: Optional[str] = None
    approver_user_ids: list[int] = Field(default_factory=list)
    approver_roles: list[str] = Field(default_factory=list)
    sla_hours: Optional[int] = None
    escalation_role: Optional[str] = None
    rules_evaluated: int


@router.post("/{company_id}/preview", response_model=RoutingPreviewResponse)
def preview_match(
    company_id: int,
    payload: RoutingPreviewRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> RoutingPreviewResponse:
    """Run the rule engine against a context dict and return the match.

    Read-only — never mutates expenses or fires notifications. Admins use
    this from the UI to confirm which rule will fire for a hypothetical
    expense before enabling it in production.
    """
    require_same_company(company_id, current_user)
    rules = list_rules_for_company(db, company_id=company_id)
    resolved = resolve_approvers(db, context=payload.context, rules=rules)
    return RoutingPreviewResponse(
        matched_rule_id=resolved.rule_id,
        approver_user_ids=resolved.approver_user_ids,
        approver_roles=resolved.approver_roles,
        sla_hours=resolved.sla_hours,
        escalation_role=resolved.escalation_role,
        rules_evaluated=len(rules),
    )
