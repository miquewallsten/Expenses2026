"""Workflow edit tools — upsert/delete stages and transitions.

Reads are covered by trace_workflow in diagnostic.py; here we add writes.
All destructive operations create receipts.
"""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from packages.core.platform.models_workflow_stage import WorkflowStage
from packages.core.platform.models_workflow_transition import WorkflowTransition

from ..core.appliers import register_applier
from ..core.context import AgentContext
from ..core.registry import REGISTRY, ToolResult, ToolSpec
from ._common import apply_diff, diff_row, non_null, propose


class StagePatch(BaseModel):
    model_config = ConfigDict(extra="forbid")
    module_key:  str = Field(..., min_length=1, max_length=100)
    stage_key:   str = Field(..., min_length=1, max_length=100)  # identity
    stage_name:  str | None = Field(default=None, max_length=255)
    stage_order: int | None = Field(default=None, ge=0, le=9999)
    is_terminal: bool | None = None


def _find_stage(ctx: AgentContext, module_key: str, stage_key: str) -> WorkflowStage | None:
    return (
        ctx.db.query(WorkflowStage)
        .filter(WorkflowStage.company_id == ctx.company_id,
                WorkflowStage.module_key == module_key,
                WorkflowStage.stage_key == stage_key)
        .one_or_none()
    )


def _handle_upsert_workflow_stage(ctx: AgentContext, args: StagePatch) -> ToolResult:
    row = _find_stage(ctx, args.module_key, args.stage_key)
    patch = non_null(args)
    module_key = patch.pop("module_key")
    stage_key = patch.pop("stage_key")
    if row is None:
        patch.setdefault("stage_name", stage_key)
        patch.setdefault("stage_order", 0)
        patch.setdefault("is_terminal", False)
        diff = {k: {"before": None, "after": v} for k, v in patch.items()}
        action = "create"
    else:
        diff = diff_row(row, patch)
        action = "update"
        if not diff:
            return ToolResult(ok=True, summary=f"stage {stage_key} sin cambios")
    return propose(
        ctx,
        tool_name="upsert_workflow_stage",
        args={"module_key": module_key, "stage_key": stage_key, **patch},
        preview={"action": f"{action}_workflow_stage",
                 "module_key": module_key, "stage_key": stage_key, "diff": diff},
        summary=f"{'crear' if action == 'create' else 'actualizar'} etapa {module_key}/{stage_key}",
    )


def _apply_upsert_workflow_stage(ctx: AgentContext, args: dict[str, Any]) -> dict[str, Any]:
    module_key = str(args["module_key"])
    stage_key = str(args["stage_key"])
    row = _find_stage(ctx, module_key, stage_key)
    created = False
    patch = {k: v for k, v in args.items() if k not in ("module_key", "stage_key") and v is not None}
    if row is None:
        row = WorkflowStage(
            company_id=ctx.company_id,
            module_key=module_key,
            stage_key=stage_key,
            stage_name=str(patch.pop("stage_name", stage_key)),
            stage_order=int(patch.pop("stage_order", 0)),
            is_terminal=bool(patch.pop("is_terminal", False)),
        )
        ctx.db.add(row)
        ctx.db.flush()
        created = True
    apply_diff(row, diff_row(row, patch))
    ctx.db.commit()
    return {"created": created, "id": row.id, "module_key": module_key, "stage_key": stage_key}


REGISTRY.register(ToolSpec(
    name="upsert_workflow_stage",
    description="Crea o actualiza una etapa del flujo (module_key + stage_key = identidad).",
    category="config", input_schema=StagePatch, handler=_handle_upsert_workflow_stage,
    personas=frozenset({"admin"}), destructive=True, requires_confirmation=True,
))
register_applier("upsert_workflow_stage", _apply_upsert_workflow_stage)


# ── Transitions ────────────────────────────────────────────────────────────

class TransitionPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")
    module_key:              str = Field(..., min_length=1, max_length=100)
    from_stage_key:          str = Field(..., min_length=1, max_length=100)
    to_stage_key:            str = Field(..., min_length=1, max_length=100)
    action_key:              str = Field(..., min_length=1, max_length=100)
    required_permission_key: str | None = Field(default=None, max_length=100)


def _find_transition(ctx: AgentContext, args: TransitionPatch | dict[str, Any]) -> WorkflowTransition | None:
    get = (lambda k: getattr(args, k)) if not isinstance(args, dict) else args.__getitem__
    return (
        ctx.db.query(WorkflowTransition)
        .filter(WorkflowTransition.company_id == ctx.company_id,
                WorkflowTransition.module_key == get("module_key"),
                WorkflowTransition.from_stage_key == get("from_stage_key"),
                WorkflowTransition.to_stage_key == get("to_stage_key"),
                WorkflowTransition.action_key == get("action_key"))
        .one_or_none()
    )


def _handle_upsert_workflow_transition(ctx: AgentContext, args: TransitionPatch) -> ToolResult:
    row = _find_transition(ctx, args)
    patch = non_null(args)
    if row is None:
        patch.setdefault("required_permission_key", "")
        diff = {k: {"before": None, "after": v} for k, v in patch.items()}
        action = "create"
    else:
        diff = diff_row(row, {"required_permission_key": patch.get("required_permission_key", row.required_permission_key)})
        action = "update"
        if not diff:
            return ToolResult(ok=True, summary="transición sin cambios")
    return propose(
        ctx,
        tool_name="upsert_workflow_transition",
        args=patch,
        preview={"action": f"{action}_workflow_transition", "diff": diff,
                 "route": f"{patch['module_key']}: {patch['from_stage_key']} --{patch['action_key']}--> {patch['to_stage_key']}"},
        summary=f"{'crear' if action == 'create' else 'actualizar'} transición {patch['module_key']}/{patch['action_key']}",
    )


def _apply_upsert_workflow_transition(ctx: AgentContext, args: dict[str, Any]) -> dict[str, Any]:
    row = _find_transition(ctx, args)
    created = False
    if row is None:
        row = WorkflowTransition(
            company_id=ctx.company_id,
            module_key=str(args["module_key"]),
            from_stage_key=str(args["from_stage_key"]),
            to_stage_key=str(args["to_stage_key"]),
            action_key=str(args["action_key"]),
            required_permission_key=str(args.get("required_permission_key") or ""),
        )
        ctx.db.add(row)
        created = True
    else:
        if args.get("required_permission_key") is not None:
            row.required_permission_key = str(args["required_permission_key"])
    ctx.db.commit()
    return {"created": created, "id": row.id}


REGISTRY.register(ToolSpec(
    name="upsert_workflow_transition",
    description="Crea o actualiza una transición del flujo.",
    category="config", input_schema=TransitionPatch, handler=_handle_upsert_workflow_transition,
    personas=frozenset({"admin"}), destructive=True, requires_confirmation=True,
))
register_applier("upsert_workflow_transition", _apply_upsert_workflow_transition)


class TransitionIdentity(BaseModel):
    model_config = ConfigDict(extra="forbid")
    module_key:     str = Field(..., min_length=1, max_length=100)
    from_stage_key: str = Field(..., min_length=1, max_length=100)
    to_stage_key:   str = Field(..., min_length=1, max_length=100)
    action_key:     str = Field(..., min_length=1, max_length=100)


def _handle_delete_workflow_transition(ctx: AgentContext, args: TransitionIdentity) -> ToolResult:
    row = _find_transition(ctx, args)
    if row is None:
        return ToolResult(ok=False, summary="transición no encontrada", error="not_found")
    return propose(
        ctx,
        tool_name="delete_workflow_transition",
        args=non_null(args),
        preview={"action": "delete_workflow_transition",
                 "route": f"{args.module_key}: {args.from_stage_key} --{args.action_key}--> {args.to_stage_key}",
                 "id": row.id},
        summary=f"eliminar transición {args.module_key}/{args.action_key}",
    )


def _apply_delete_workflow_transition(ctx: AgentContext, args: dict[str, Any]) -> dict[str, Any]:
    row = _find_transition(ctx, args)
    if row is None:
        return {"deleted": False, "reason": "not_found"}
    ctx.db.delete(row)
    ctx.db.commit()
    return {"deleted": True}


REGISTRY.register(ToolSpec(
    name="delete_workflow_transition",
    description="Elimina una transición del flujo.",
    category="config", input_schema=TransitionIdentity, handler=_handle_delete_workflow_transition,
    personas=frozenset({"admin"}), destructive=True, requires_confirmation=True,
))
register_applier("delete_workflow_transition", _apply_delete_workflow_transition)
