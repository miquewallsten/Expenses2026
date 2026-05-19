"""Creative tools — high-level composite builders.

These tools compose multiple low-level writes into one receipt. The admin
confirms once and the applier creates everything atomically.
"""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict, Field, model_validator

from packages.core.platform.models_cost_center import CostCenter
from packages.core.platform.models_role import Role
from packages.core.platform.models_workflow_stage import WorkflowStage
from packages.core.platform.models_workflow_transition import WorkflowTransition

from ..core.appliers import register_applier
from ..core.context import AgentContext
from ..core.registry import REGISTRY, ToolResult, ToolSpec
from ._common import propose


_ADMIN_ONLY = frozenset(("admin",))


# ╔═══════════════════════════════════════════════════════════════════════════
# ║ 1. create_approval_chain
# ╚═══════════════════════════════════════════════════════════════════════════

class ChainStageSpec(BaseModel):
    model_config = ConfigDict(extra="forbid")
    stage_key:   str = Field(..., min_length=1, max_length=100)
    stage_name:  str = Field(..., min_length=1, max_length=255)
    is_terminal: bool = False


class ChainTransitionSpec(BaseModel):
    model_config = ConfigDict(extra="forbid")
    from_stage_key:          str
    to_stage_key:            str
    action_key:              str = Field(..., min_length=1, max_length=100)
    required_permission_key: str | None = None


class CreateApprovalChainInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    module_key:  str = Field(..., min_length=1, max_length=100)
    stages:      list[ChainStageSpec] = Field(..., min_length=2, max_length=20)
    transitions: list[ChainTransitionSpec] = Field(default_factory=list, max_length=40)

    @model_validator(mode="after")
    def _ensure_transitions(self):
        if not self.transitions:
            # Auto-link stages sequentially.
            self.transitions = [
                ChainTransitionSpec(
                    from_stage_key=self.stages[i].stage_key,
                    to_stage_key=self.stages[i + 1].stage_key,
                    action_key=f"advance_{i+1}",
                )
                for i in range(len(self.stages) - 1)
            ]
        return self


def _handle_create_approval_chain(ctx: AgentContext, a: CreateApprovalChainInput) -> ToolResult:
    preview = {
        "action": "create_approval_chain",
        "module_key": a.module_key,
        "stages": [s.model_dump() for s in a.stages],
        "transitions": [t.model_dump() for t in a.transitions],
    }
    return propose(
        ctx,
        tool_name="create_approval_chain",
        args=a.model_dump(),
        preview=preview,
        summary=f"cadena de aprobación {a.module_key} con {len(a.stages)} etapas",
    )


def _apply_create_approval_chain(ctx: AgentContext, args: dict[str, Any]) -> dict[str, Any]:
    module_key = str(args["module_key"])
    created_stages = 0
    created_transitions = 0
    for i, s in enumerate(args["stages"]):
        existing = (
            ctx.db.query(WorkflowStage)
            .filter(WorkflowStage.company_id == ctx.company_id,
                    WorkflowStage.module_key == module_key,
                    WorkflowStage.stage_key == s["stage_key"])
            .one_or_none()
        )
        if existing is None:
            ctx.db.add(WorkflowStage(
                company_id=ctx.company_id,
                module_key=module_key,
                stage_key=s["stage_key"],
                stage_name=s["stage_name"],
                stage_order=i,
                is_terminal=bool(s.get("is_terminal", False)),
            ))
            created_stages += 1
    ctx.db.flush()
    for t in args.get("transitions", []):
        existing = (
            ctx.db.query(WorkflowTransition)
            .filter(WorkflowTransition.company_id == ctx.company_id,
                    WorkflowTransition.module_key == module_key,
                    WorkflowTransition.from_stage_key == t["from_stage_key"],
                    WorkflowTransition.to_stage_key == t["to_stage_key"],
                    WorkflowTransition.action_key == t["action_key"])
            .one_or_none()
        )
        if existing is None:
            ctx.db.add(WorkflowTransition(
                company_id=ctx.company_id,
                module_key=module_key,
                from_stage_key=t["from_stage_key"],
                to_stage_key=t["to_stage_key"],
                action_key=t["action_key"],
                required_permission_key=t.get("required_permission_key") or "",
            ))
            created_transitions += 1
    ctx.db.commit()
    return {"stages_created": created_stages, "transitions_created": created_transitions}


REGISTRY.register(ToolSpec(
    name="create_approval_chain",
    description="Crea una cadena de aprobación completa: etapas y transiciones para un módulo.",
    category="config",
    input_schema=CreateApprovalChainInput,
    handler=_handle_create_approval_chain,
    personas=_ADMIN_ONLY,
    destructive=True,
    requires_confirmation=True,
))
register_applier("create_approval_chain", _apply_create_approval_chain)


# ╔═══════════════════════════════════════════════════════════════════════════
# ║ 2. create_cost_center_hierarchy
# ╚═══════════════════════════════════════════════════════════════════════════

class CostCenterNode(BaseModel):
    model_config = ConfigDict(extra="forbid")
    code: str = Field(..., min_length=1, max_length=100)
    name: str = Field(..., min_length=1, max_length=255)


class CreateCostCentersInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    nodes: list[CostCenterNode] = Field(..., min_length=1, max_length=50)


def _handle_create_cost_centers(ctx: AgentContext, a: CreateCostCentersInput) -> ToolResult:
    return propose(
        ctx,
        tool_name="create_cost_center_hierarchy",
        args=a.model_dump(),
        preview={
            "action": "create_cost_center_hierarchy",
            "nodes": [n.model_dump() for n in a.nodes],
        },
        summary=f"crear {len(a.nodes)} centros de costo",
    )


def _apply_create_cost_centers(ctx: AgentContext, args: dict[str, Any]) -> dict[str, Any]:
    created = 0
    for n in args["nodes"]:
        existing = (
            ctx.db.query(CostCenter)
            .filter(CostCenter.company_id == ctx.company_id,
                    CostCenter.code == n["code"])
            .one_or_none()
        )
        if existing is None:
            ctx.db.add(CostCenter(
                company_id=ctx.company_id,
                code=n["code"],
                name=n["name"],
                status="active",
            ))
            created += 1
    ctx.db.commit()
    return {"created": created}


REGISTRY.register(ToolSpec(
    name="create_cost_center_hierarchy",
    description="Crea varios centros de costo de una sola vez.",
    category="entity",
    input_schema=CreateCostCentersInput,
    handler=_handle_create_cost_centers,
    personas=_ADMIN_ONLY,
    destructive=True,
    requires_confirmation=True,
))
register_applier("create_cost_center_hierarchy", _apply_create_cost_centers)


# ╔═══════════════════════════════════════════════════════════════════════════
# ║ 3. create_role_from_template
# ╚═══════════════════════════════════════════════════════════════════════════

_ROLE_TEMPLATES: dict[str, dict[str, Any]] = {
    "approver":  {"description": "Aprueba gastos asignados a su equipo."},
    "accounting": {"description": "Revisa contabilidad, exporta pólizas, mapea categorías."},
    "viewer":    {"description": "Acceso de solo lectura a reportes."},
}


class CreateRoleFromTemplateInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    template: str = Field(..., pattern=r"^(approver|accounting|viewer)$")
    name:     str = Field(..., min_length=1, max_length=255)
    key:      str | None = Field(default=None, max_length=100)


def _handle_create_role_from_template(ctx: AgentContext, a: CreateRoleFromTemplateInput) -> ToolResult:
    key = a.key or a.template
    tpl = _ROLE_TEMPLATES[a.template]
    return propose(
        ctx,
        tool_name="create_role_from_template",
        args={"template": a.template, "name": a.name, "key": key},
        preview={
            "action": "create_role",
            "template": a.template,
            "key": key,
            "name": a.name,
            "description": tpl["description"],
        },
        summary=f"crear rol «{a.name}» (plantilla {a.template})",
    )


def _apply_create_role_from_template(ctx: AgentContext, args: dict[str, Any]) -> dict[str, Any]:
    key = args["key"]
    tpl = _ROLE_TEMPLATES[args["template"]]
    existing = (
        ctx.db.query(Role)
        .filter(Role.company_id == ctx.company_id, Role.key == key)
        .one_or_none()
    )
    if existing is not None:
        return {"created": False, "id": existing.id}
    row = Role(
        company_id=ctx.company_id,
        key=key,
        name=args["name"],
        description=tpl["description"],
    )
    ctx.db.add(row)
    ctx.db.commit()
    ctx.db.refresh(row)
    return {"created": True, "id": row.id}


REGISTRY.register(ToolSpec(
    name="create_role_from_template",
    description="Crea un rol a partir de una plantilla (approver | accountant | viewer).",
    category="rbac",
    input_schema=CreateRoleFromTemplateInput,
    handler=_handle_create_role_from_template,
    personas=_ADMIN_ONLY,
    destructive=True,
    requires_confirmation=True,
))
register_applier("create_role_from_template", _apply_create_role_from_template)


# ╔═══════════════════════════════════════════════════════════════════════════
# ║ 4. clone_workflow
# ╚═══════════════════════════════════════════════════════════════════════════

class CloneWorkflowInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    source_module: str = Field(..., min_length=1, max_length=100)
    target_module: str = Field(..., min_length=1, max_length=100)


def _handle_clone_workflow(ctx: AgentContext, a: CloneWorkflowInput) -> ToolResult:
    stages = (
        ctx.db.query(WorkflowStage)
        .filter(WorkflowStage.company_id == ctx.company_id,
                WorkflowStage.module_key == a.source_module)
        .order_by(WorkflowStage.stage_order.asc())
        .all()
    )
    if not stages:
        return ToolResult(ok=False, summary=f"módulo {a.source_module} no tiene etapas", error="not_found")
    transitions = (
        ctx.db.query(WorkflowTransition)
        .filter(WorkflowTransition.company_id == ctx.company_id,
                WorkflowTransition.module_key == a.source_module)
        .all()
    )
    return propose(
        ctx,
        tool_name="clone_workflow",
        args=a.model_dump(),
        preview={
            "action": "clone_workflow",
            "source_module": a.source_module,
            "target_module": a.target_module,
            "stage_count": len(stages),
            "transition_count": len(transitions),
        },
        summary=f"clonar {a.source_module} → {a.target_module}",
    )


def _apply_clone_workflow(ctx: AgentContext, args: dict[str, Any]) -> dict[str, Any]:
    src = str(args["source_module"])
    dst = str(args["target_module"])
    stages = (
        ctx.db.query(WorkflowStage)
        .filter(WorkflowStage.company_id == ctx.company_id,
                WorkflowStage.module_key == src)
        .order_by(WorkflowStage.stage_order.asc())
        .all()
    )
    for s in stages:
        if ctx.db.query(WorkflowStage).filter(
            WorkflowStage.company_id == ctx.company_id,
            WorkflowStage.module_key == dst,
            WorkflowStage.stage_key == s.stage_key,
        ).one_or_none() is None:
            ctx.db.add(WorkflowStage(
                company_id=ctx.company_id,
                module_key=dst,
                stage_key=s.stage_key,
                stage_name=s.stage_name,
                stage_order=s.stage_order,
                is_terminal=s.is_terminal,
            ))
    ctx.db.flush()
    transitions = (
        ctx.db.query(WorkflowTransition)
        .filter(WorkflowTransition.company_id == ctx.company_id,
                WorkflowTransition.module_key == src)
        .all()
    )
    for t in transitions:
        if ctx.db.query(WorkflowTransition).filter(
            WorkflowTransition.company_id == ctx.company_id,
            WorkflowTransition.module_key == dst,
            WorkflowTransition.from_stage_key == t.from_stage_key,
            WorkflowTransition.to_stage_key == t.to_stage_key,
            WorkflowTransition.action_key == t.action_key,
        ).one_or_none() is None:
            ctx.db.add(WorkflowTransition(
                company_id=ctx.company_id,
                module_key=dst,
                from_stage_key=t.from_stage_key,
                to_stage_key=t.to_stage_key,
                action_key=t.action_key,
                required_permission_key=t.required_permission_key,
            ))
    ctx.db.commit()
    return {"stages": len(stages), "transitions": len(transitions)}


REGISTRY.register(ToolSpec(
    name="clone_workflow",
    description="Clona todas las etapas y transiciones de un módulo a otro.",
    category="config",
    input_schema=CloneWorkflowInput,
    handler=_handle_clone_workflow,
    personas=_ADMIN_ONLY,
    destructive=True,
    requires_confirmation=True,
))
register_applier("clone_workflow", _apply_clone_workflow)
