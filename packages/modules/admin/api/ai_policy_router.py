"""AI Policy CRUD router.

Endpoints (all require admin):
  GET    /admin/ai-policies/{company_id}                — list
  POST   /admin/ai-policies/{company_id}                — extract + persist
  POST   /admin/ai-policies/{company_id}/preview        — extract only (no save)
  PATCH  /admin/ai-policies/{company_id}/{policy_id}    — toggle enable, edit summary
  POST   /admin/ai-policies/{company_id}/{policy_id}/re-extract — re-run LLM on stored source_text
  DELETE /admin/ai-policies/{company_id}/{policy_id}    — delete
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from apps.api.auth import get_current_user, require_admin, require_same_company
from packages.core.platform.models_user import User
from apps.api.deps import get_db
from packages.core.platform.models_ai_policy import AIPolicy
from packages.modules.admin.service.ai_policy_extractor_service import (
    PolicyExtractionError,
    extract_policy_from_text,
)
from packages.modules.admin.service.policy_setting_mirror_service import (
    apply_setting,
    build_settings_snapshot,
    detect_setting_suggestion,
)


router = APIRouter(
    prefix="/admin/ai-policies",
    tags=["admin"],
    dependencies=[Depends(require_admin)],
)


# ── Schemas ───────────────────────────────────────────────────────────────────


class AIPolicyRead(BaseModel):
    id: int
    company_id: int
    source_text: str
    rule_json: dict[str, Any]
    summary: str
    scope: str
    severity: str
    enabled: bool
    created_at: str
    updated_at: str

    @classmethod
    def from_row(cls, row: AIPolicy) -> "AIPolicyRead":
        return cls(
            id=row.id,
            company_id=row.company_id,
            source_text=row.source_text,
            rule_json=row.rule_json or {},
            summary=row.summary,
            scope=row.scope,
            severity=row.severity,
            enabled=bool(row.enabled),
            created_at=row.created_at.isoformat() if row.created_at else "",
            updated_at=row.updated_at.isoformat() if row.updated_at else "",
        )


class AIPolicyCreate(BaseModel):
    source_text: str = Field(min_length=3, max_length=2000)
    enabled: bool = True


class AIPolicyPreviewResponse(BaseModel):
    rule_json: dict[str, Any]
    summary: str
    severity: str
    setting_suggestion: dict[str, Any] | None = None
    settings_snapshot: dict[str, Any] | None = None
    notice: str | None = None


class ApplySettingRequest(BaseModel):
    setting_key: str
    value: Any


class AIPolicyPatch(BaseModel):
    enabled: bool | None = None
    summary: str | None = Field(default=None, max_length=500)
    severity: str | None = None  # "block" | "warn"
    source_text: str | None = Field(default=None, min_length=3, max_length=2000)


# ── Routes ────────────────────────────────────────────────────────────────────


@router.get("/{company_id}", response_model=list[AIPolicyRead])
def list_policies(company_id: int, db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)) -> list[AIPolicyRead]:
    rows = (
        db.query(AIPolicy)
        .filter(AIPolicy.company_id == company_id)
        .order_by(AIPolicy.created_at.desc())
        .all()
    )
    return [AIPolicyRead.from_row(r) for r in rows]


@router.post("/{company_id}/preview", response_model=AIPolicyPreviewResponse)
def preview_policy(
    company_id: int,
    body: AIPolicyCreate,
    db: Session = Depends(get_db),
) -> AIPolicyPreviewResponse:
    settings = build_settings_snapshot(db, company_id)
    context = {"current_settings": settings} if settings else None
    try:
        extracted = extract_policy_from_text(body.source_text, company_context=context)
    except PolicyExtractionError as exc:
        msg = str(exc)
        # Friendly path: the LLM detected the instruction duplicates an active
        # setting. Return a 200 with a notice + the snapshot so the UI can show
        # the amber "ya está activo" banner instead of a red error.
        if "ya está activo" in msg.lower() or "ya esta activo" in msg.lower():
            return AIPolicyPreviewResponse(
                rule_json={},
                summary="Ajuste ya activo",
                severity="block",
                setting_suggestion=None,
                settings_snapshot=settings,
                notice=msg,
            )
        raise HTTPException(status_code=422, detail=msg) from exc
    suggestion = detect_setting_suggestion(db, company_id, extracted["rule_json"])
    return AIPolicyPreviewResponse(
        **extracted,
        setting_suggestion=suggestion.to_dict() if suggestion else None,
        settings_snapshot=settings,
    )


@router.post("/{company_id}/apply-setting")
def apply_setting_from_policy(
    company_id: int,
    body: ApplySettingRequest,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Apply a setting suggestion (from preview) to CompanyExpensePolicy.

    Used when the admin chooses "apply as setting" instead of "save as policy".
    """
    try:
        policy = apply_setting(db, company_id, body.setting_key, body.value)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return {
        "ok": True,
        "setting_key": body.setting_key,
        "value": getattr(policy, body.setting_key),
    }


@router.post("/{company_id}", response_model=AIPolicyRead)
def create_policy(
    company_id: int,
    body: AIPolicyCreate,
    db: Session = Depends(get_db),
    admin=Depends(require_admin),
) -> AIPolicyRead:
    settings = build_settings_snapshot(db, company_id)
    context = {"current_settings": settings} if settings else None
    try:
        extracted = extract_policy_from_text(body.source_text, company_context=context)
    except PolicyExtractionError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    row = AIPolicy(
        company_id=company_id,
        source_text=body.source_text.strip(),
        rule_json=extracted["rule_json"],
        summary=extracted["summary"],
        scope="expense_validation",
        severity=extracted["severity"],
        enabled=bool(body.enabled),
        created_by_user_id=getattr(admin, "id", None),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return AIPolicyRead.from_row(row)


@router.post("/{company_id}/{policy_id}/re-extract", response_model=AIPolicyRead)
def re_extract_policy(
    company_id: int,
    policy_id: int,
    db: Session = Depends(get_db),
) -> AIPolicyRead:
    row = (
        db.query(AIPolicy)
        .filter(AIPolicy.company_id == company_id, AIPolicy.id == policy_id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Política no encontrada.")
    settings = build_settings_snapshot(db, company_id)
    context = {"current_settings": settings} if settings else None
    try:
        extracted = extract_policy_from_text(row.source_text, company_context=context)
    except PolicyExtractionError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    row.rule_json = extracted["rule_json"]
    row.summary   = extracted["summary"]
    row.severity  = extracted["severity"]
    db.commit()
    db.refresh(row)
    return AIPolicyRead.from_row(row)


@router.patch("/{company_id}/{policy_id}", response_model=AIPolicyRead)
def patch_policy(
    company_id: int,
    policy_id: int,
    body: AIPolicyPatch,
    db: Session = Depends(get_db),
) -> AIPolicyRead:
    row = (
        db.query(AIPolicy)
        .filter(AIPolicy.company_id == company_id, AIPolicy.id == policy_id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Política no encontrada.")
    # If source_text changes, re-extract the rule so rule_json stays in sync.
    if body.source_text is not None:
        new_text = body.source_text.strip()
        if len(new_text) < 3:
            raise HTTPException(status_code=422, detail="source_text muy corto.")
        if new_text != row.source_text:
            settings = build_settings_snapshot(db, company_id)
            context = {"current_settings": settings} if settings else None
            try:
                extracted = extract_policy_from_text(new_text, company_context=context)
            except PolicyExtractionError as exc:
                raise HTTPException(status_code=422, detail=str(exc)) from exc
            row.source_text = new_text
            row.rule_json   = extracted["rule_json"]
            row.summary     = extracted["summary"]
            row.severity    = extracted["severity"]
    if body.enabled is not None:
        row.enabled = bool(body.enabled)
    if body.summary is not None:
        clean = body.summary.strip()
        if clean:
            row.summary = clean[:500]
    if body.severity is not None:
        sev = body.severity.strip().lower()
        if sev not in ("block", "warn"):
            raise HTTPException(status_code=422, detail="severity debe ser 'block' o 'warn'.")
        row.severity = sev
        # Keep rule_json.then.action in sync so the evaluator's verdict matches.
        if isinstance(row.rule_json, dict):
            then = row.rule_json.get("then")
            if isinstance(then, dict):
                then["action"] = sev
    db.commit()
    db.refresh(row)
    return AIPolicyRead.from_row(row)


@router.delete("/{company_id}/{policy_id}")
def delete_policy(
    company_id: int,
    policy_id: int,
    db: Session = Depends(get_db),
) -> dict[str, bool]:
    row = (
        db.query(AIPolicy)
        .filter(AIPolicy.company_id == company_id, AIPolicy.id == policy_id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Política no encontrada.")
    db.delete(row)
    db.commit()
    return {"ok": True}
