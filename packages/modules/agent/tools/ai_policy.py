"""AI-policy agent tools.

Fully-agentic surface over the ai_policies table: the LLM can list existing
policies, propose a new one (receipt → confirmation → persist via the shared
extractor+validator), toggle enable/disable, and delete.

No scripted Q&A format — the chat loop in packages/modules/agent/core/engine.py
already gives the LLM multi-turn reasoning, the ability to call other read
tools (read_expense_policy, list_legal_entities, list_ai_policies, etc.) and
to iterate until it has enough context to act.
"""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from packages.core.platform.models_ai_policy import AIPolicy
from packages.modules.admin.service.ai_policy_extractor_service import (
    PolicyExtractionError,
    extract_policy_from_text,
)
from packages.modules.admin.service.policy_setting_mirror_service import (
    build_settings_snapshot,
    detect_setting_suggestion,
)

from ..core.appliers import register_applier
from ..core.context import AgentContext
from ..core.receipts import create_receipt
from ..core.registry import REGISTRY, ToolResult, ToolSpec


# ── Schemas ─────────────────────────────────────────────────────────────────


class Empty(BaseModel):
    model_config = ConfigDict(extra="forbid")


class CreateAIPolicyArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    source_text: str = Field(
        ...,
        min_length=3,
        max_length=2000,
        description=(
            "Frase final en español (formal, una sola línea) que describe la "
            "política ya desambiguada con el admin. El servicio la valida y la "
            "convierte en rule_json al confirmar. NO envíes instrucciones "
            "ambiguas aquí — primero aclara con el admin en la conversación."
        ),
    )
    enabled: bool = True


class AIPolicyIdArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    policy_id: int


class ToggleAIPolicyArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    policy_id: int
    enabled: bool


class UpdateAIPolicyArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    policy_id: int
    source_text: str = Field(..., min_length=3, max_length=2000)


# ── Read ────────────────────────────────────────────────────────────────────


def _handle_list_ai_policies(ctx: AgentContext, _args: Empty) -> ToolResult:
    rows = (
        ctx.db.query(AIPolicy)
        .filter(AIPolicy.company_id == ctx.company_id)
        .order_by(AIPolicy.created_at.desc())
        .all()
    )
    data = [
        {
            "id":          r.id,
            "summary":     r.summary,
            "source_text": r.source_text,
            "severity":    r.severity,
            "enabled":     bool(r.enabled),
            "rule_json":   r.rule_json or {},
        }
        for r in rows
    ]
    return ToolResult(
        ok=True,
        summary=f"{len(data)} políticas",
        data={"policies": data},
    )


REGISTRY.register(ToolSpec(
    name="list_ai_policies",
    description=(
        "Lista las políticas de IA actuales de la empresa con su summary, "
        "source_text, severity y si están activas. Úsalo antes de proponer "
        "una nueva para evitar duplicados."
    ),
    category="read",
    input_schema=Empty,
    handler=_handle_list_ai_policies,
    personas=frozenset({"admin"}),
))


# ── Create (two-phase) ──────────────────────────────────────────────────────


def _handle_create_ai_policy(ctx: AgentContext, args: CreateAIPolicyArgs) -> ToolResult:
    """Validate + preview a new policy. Writes only after /agent/confirm."""
    settings = build_settings_snapshot(ctx.db, ctx.company_id)
    context = {"current_settings": settings} if settings else None
    try:
        extracted = extract_policy_from_text(args.source_text, company_context=context)
    except PolicyExtractionError as exc:
        return ToolResult(
            ok=False,
            summary=f"no se pudo estructurar la política: {exc}",
            error=str(exc),
        )

    suggestion = detect_setting_suggestion(ctx.db, ctx.company_id, extracted["rule_json"])
    suggestion_dict = suggestion.to_dict() if suggestion else None

    preview = {
        "target":             "ai_policy",
        "source_text":        args.source_text.strip(),
        "rule_json":          extracted["rule_json"],
        "summary":            extracted["summary"],
        "severity":           extracted["severity"],
        "enabled":            bool(args.enabled),
        "setting_suggestion": suggestion_dict,
    }
    receipt = create_receipt(
        db=ctx.db,
        company_id=ctx.company_id,
        session_id=ctx.session_id,
        tool_name="create_ai_policy",
        args={
            "source_text": args.source_text.strip(),
            "enabled":     bool(args.enabled),
            "rule_json":   extracted["rule_json"],
            "summary":     extracted["summary"],
            "severity":    extracted["severity"],
        },
        preview=preview,
    )
    note = ""
    if suggestion_dict and suggestion_dict.get("already_applied"):
        note = " (ya activo como ajuste — considera no crearla)"
    elif suggestion_dict:
        note = f" (equivalente al ajuste {suggestion_dict.get('setting_key')})"
    return ToolResult(
        ok=True,
        summary=f"política lista: {extracted['summary']}{note} — requiere confirmación",
        data={"preview": preview},
        receipt_id=receipt.receipt_id,
    )


def _apply_create_ai_policy(ctx: AgentContext, args: dict[str, Any]) -> dict[str, Any]:
    row = AIPolicy(
        company_id=ctx.company_id,
        source_text=str(args.get("source_text") or "").strip(),
        rule_json=args.get("rule_json") or {},
        summary=str(args.get("summary") or "").strip()[:500],
        scope="expense_validation",
        severity=str(args.get("severity") or "warn"),
        enabled=bool(args.get("enabled", True)),
        created_by_user_id=ctx.user_id,
    )
    ctx.db.add(row)
    ctx.db.commit()
    ctx.db.refresh(row)
    return {"id": row.id, "summary": row.summary, "severity": row.severity}


register_applier("create_ai_policy", _apply_create_ai_policy)


REGISTRY.register(ToolSpec(
    name="create_ai_policy",
    description=(
        "Crea UNA política de IA a partir de una frase FINAL en español. "
        "Usa sólo después de haber aclarado ambigüedades con el admin en la "
        "conversación (bloquear vs advertir, campo exacto, etc.). El servicio "
        "valida que se pueda convertir en una regla determinística; si no, "
        "devuelve el error para que ajustes el texto. Requiere confirmación."
    ),
    category="entity",
    input_schema=CreateAIPolicyArgs,
    handler=_handle_create_ai_policy,
    personas=frozenset({"admin"}),
    destructive=True,
    requires_confirmation=True,
))


# ── Update (re-extract) ─────────────────────────────────────────────────────


def _handle_update_ai_policy(ctx: AgentContext, args: UpdateAIPolicyArgs) -> ToolResult:
    row = (
        ctx.db.query(AIPolicy)
        .filter(AIPolicy.id == args.policy_id, AIPolicy.company_id == ctx.company_id)
        .one_or_none()
    )
    if row is None:
        return ToolResult(ok=False, summary="política no encontrada", error="not_found")

    new_text = args.source_text.strip()
    if new_text == row.source_text:
        return ToolResult(ok=True, summary="sin cambios")

    settings = build_settings_snapshot(ctx.db, ctx.company_id)
    context = {"current_settings": settings} if settings else None
    try:
        extracted = extract_policy_from_text(new_text, company_context=context)
    except PolicyExtractionError as exc:
        return ToolResult(ok=False, summary=str(exc), error=str(exc))

    preview = {
        "target":      "ai_policy",
        "policy_id":   row.id,
        "before": {
            "source_text": row.source_text,
            "summary":     row.summary,
            "severity":    row.severity,
            "rule_json":   row.rule_json or {},
        },
        "after": {
            "source_text": new_text,
            "summary":     extracted["summary"],
            "severity":    extracted["severity"],
            "rule_json":   extracted["rule_json"],
        },
    }
    receipt = create_receipt(
        db=ctx.db,
        company_id=ctx.company_id,
        session_id=ctx.session_id,
        tool_name="update_ai_policy",
        args={
            "policy_id":   row.id,
            "source_text": new_text,
            "summary":     extracted["summary"],
            "severity":    extracted["severity"],
            "rule_json":   extracted["rule_json"],
        },
        preview=preview,
    )
    return ToolResult(
        ok=True,
        summary=f"actualización de política lista: {extracted['summary']} — requiere confirmación",
        data={"preview": preview},
        receipt_id=receipt.receipt_id,
    )


def _apply_update_ai_policy(ctx: AgentContext, args: dict[str, Any]) -> dict[str, Any]:
    row = (
        ctx.db.query(AIPolicy)
        .filter(AIPolicy.id == int(args["policy_id"]), AIPolicy.company_id == ctx.company_id)
        .one_or_none()
    )
    if row is None:
        raise ValueError("policy not found")
    row.source_text = str(args.get("source_text") or "").strip()
    row.summary     = str(args.get("summary") or "").strip()[:500]
    row.severity    = str(args.get("severity") or row.severity)
    row.rule_json   = args.get("rule_json") or row.rule_json
    ctx.db.commit()
    return {"id": row.id, "summary": row.summary}


register_applier("update_ai_policy", _apply_update_ai_policy)


REGISTRY.register(ToolSpec(
    name="update_ai_policy",
    description=(
        "Reemplaza el texto fuente de una política existente (se re-extrae "
        "rule_json/severity). Requiere confirmación."
    ),
    category="entity",
    input_schema=UpdateAIPolicyArgs,
    handler=_handle_update_ai_policy,
    personas=frozenset({"admin"}),
    destructive=True,
    requires_confirmation=True,
))


# ── Toggle enable/disable ───────────────────────────────────────────────────


def _handle_toggle_ai_policy(ctx: AgentContext, args: ToggleAIPolicyArgs) -> ToolResult:
    row = (
        ctx.db.query(AIPolicy)
        .filter(AIPolicy.id == args.policy_id, AIPolicy.company_id == ctx.company_id)
        .one_or_none()
    )
    if row is None:
        return ToolResult(ok=False, summary="política no encontrada", error="not_found")
    if bool(row.enabled) == bool(args.enabled):
        return ToolResult(ok=True, summary="sin cambios")
    preview = {
        "target":    "ai_policy",
        "policy_id": row.id,
        "summary":   row.summary,
        "before":    {"enabled": bool(row.enabled)},
        "after":     {"enabled": bool(args.enabled)},
    }
    receipt = create_receipt(
        db=ctx.db,
        company_id=ctx.company_id,
        session_id=ctx.session_id,
        tool_name="toggle_ai_policy",
        args={"policy_id": row.id, "enabled": bool(args.enabled)},
        preview=preview,
    )
    verb = "activar" if args.enabled else "desactivar"
    return ToolResult(
        ok=True,
        summary=f"{verb} política '{row.summary}' — requiere confirmación",
        data={"preview": preview},
        receipt_id=receipt.receipt_id,
    )


def _apply_toggle_ai_policy(ctx: AgentContext, args: dict[str, Any]) -> dict[str, Any]:
    row = (
        ctx.db.query(AIPolicy)
        .filter(AIPolicy.id == int(args["policy_id"]), AIPolicy.company_id == ctx.company_id)
        .one_or_none()
    )
    if row is None:
        raise ValueError("policy not found")
    row.enabled = bool(args.get("enabled", True))
    ctx.db.commit()
    return {"id": row.id, "enabled": bool(row.enabled)}


register_applier("toggle_ai_policy", _apply_toggle_ai_policy)


REGISTRY.register(ToolSpec(
    name="toggle_ai_policy",
    description="Activa o desactiva una política existente. Requiere confirmación.",
    category="entity",
    input_schema=ToggleAIPolicyArgs,
    handler=_handle_toggle_ai_policy,
    personas=frozenset({"admin"}),
    destructive=True,
    requires_confirmation=True,
))


# ── Delete ──────────────────────────────────────────────────────────────────


def _handle_delete_ai_policy(ctx: AgentContext, args: AIPolicyIdArgs) -> ToolResult:
    row = (
        ctx.db.query(AIPolicy)
        .filter(AIPolicy.id == args.policy_id, AIPolicy.company_id == ctx.company_id)
        .one_or_none()
    )
    if row is None:
        return ToolResult(ok=False, summary="política no encontrada", error="not_found")
    preview = {
        "target":    "ai_policy",
        "policy_id": row.id,
        "summary":   row.summary,
        "source_text": row.source_text,
    }
    receipt = create_receipt(
        db=ctx.db,
        company_id=ctx.company_id,
        session_id=ctx.session_id,
        tool_name="delete_ai_policy",
        args={"policy_id": row.id},
        preview=preview,
    )
    return ToolResult(
        ok=True,
        summary=f"eliminar '{row.summary}' — requiere confirmación",
        data={"preview": preview},
        receipt_id=receipt.receipt_id,
    )


def _apply_delete_ai_policy(ctx: AgentContext, args: dict[str, Any]) -> dict[str, Any]:
    row = (
        ctx.db.query(AIPolicy)
        .filter(AIPolicy.id == int(args["policy_id"]), AIPolicy.company_id == ctx.company_id)
        .one_or_none()
    )
    if row is None:
        return {"deleted": 0}
    ctx.db.delete(row)
    ctx.db.commit()
    return {"deleted": 1, "id": int(args["policy_id"])}


register_applier("delete_ai_policy", _apply_delete_ai_policy)


REGISTRY.register(ToolSpec(
    name="delete_ai_policy",
    description="Elimina una política de IA por id. Requiere confirmación.",
    category="entity",
    input_schema=AIPolicyIdArgs,
    handler=_handle_delete_ai_policy,
    personas=frozenset({"admin"}),
    destructive=True,
    requires_confirmation=True,
))
