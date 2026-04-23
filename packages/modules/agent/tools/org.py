"""Org-entity tools: legal entities, cost centers, clients, projects.

CostCenter/Client/Project share the same shape (name, code, status) so we
use a single schema and three upsert handlers bound to different models.
Legal entities are richer and get their own schema.
"""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from packages.core.platform.models_client import Client
from packages.core.platform.models_cost_center import CostCenter
from packages.core.platform.models_legal_entity import LegalEntity
from packages.core.platform.models_project import Project

from ..core.appliers import register_applier
from ..core.context import AgentContext
from ..core.registry import REGISTRY, ToolResult, ToolSpec
from ._common import apply_diff, diff_row, non_null, propose


class Empty(BaseModel):
    model_config = ConfigDict(extra="forbid")


# ── Reads (generic list helper) ─────────────────────────────────────────────

def _list_simple(ctx: AgentContext, model) -> ToolResult:
    rows = (
        ctx.db.query(model)
        .filter(model.company_id == ctx.company_id)
        .order_by(model.code.asc())
        .all()
    )
    return ToolResult(
        ok=True,
        summary=f"{len(rows)} registros",
        data={"items": [{"id": r.id, "name": r.name, "code": r.code, "status": r.status} for r in rows]},
    )


def _list_cost_centers(ctx: AgentContext, _: Empty) -> ToolResult: return _list_simple(ctx, CostCenter)
def _list_clients(ctx: AgentContext, _: Empty)      -> ToolResult: return _list_simple(ctx, Client)
def _list_projects(ctx: AgentContext, _: Empty)     -> ToolResult: return _list_simple(ctx, Project)


REGISTRY.register(ToolSpec(name="list_cost_centers", description="Lista los centros de costo.", category="read",
                          input_schema=Empty, handler=_list_cost_centers,
                          personas=frozenset({"admin", "employee"})))
REGISTRY.register(ToolSpec(name="list_clients", description="Lista los clientes.", category="read",
                          input_schema=Empty, handler=_list_clients,
                          personas=frozenset({"admin", "employee"})))
REGISTRY.register(ToolSpec(name="list_projects", description="Lista los proyectos.", category="read",
                          input_schema=Empty, handler=_list_projects,
                          personas=frozenset({"admin", "employee"})))


# ── Destructive: upsert simple org entity ───────────────────────────────────

class SimpleEntityArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    code:   str = Field(..., min_length=1, max_length=100)
    name:   str | None = Field(default=None, max_length=255)
    status: str | None = Field(default=None, max_length=50)


def _find_or_new(ctx: AgentContext, model, code: str):
    row = (
        ctx.db.query(model)
        .filter(model.company_id == ctx.company_id, model.code == code)
        .one_or_none()
    )
    if row is None:
        row = model(company_id=ctx.company_id, code=code, name=code, status="active")
        ctx.db.add(row)
        ctx.db.flush()
        return row, True
    return row, False


def _propose_simple(ctx: AgentContext, tool_name: str, model, args: SimpleEntityArgs, label: str) -> ToolResult:
    row, created = _find_or_new(ctx, model, args.code)
    patch = non_null(args)
    patch.pop("code", None)  # identity, never part of diff
    diff = diff_row(row, patch) if not created else {k: {"before": None, "after": v} for k, v in patch.items()}
    # Also record the new name on create so the receipt preview is complete.
    preview = {"action": f"upsert_{label}", "code": args.code, "created": created, "diff": diff}
    if created and "name" not in patch:
        preview["diff"]["name"] = {"before": None, "after": args.code}
    if not created and not diff:
        ctx.db.rollback()
        return ToolResult(ok=True, summary=f"{label} {args.code} sin cambios")
    summary = f"{'crear' if created else 'actualizar'} {label} {args.code}"
    # Roll back the optimistic flush; applier will redo the write after confirm.
    if created:
        ctx.db.rollback()
    return propose(
        ctx,
        tool_name=tool_name,
        args={"code": args.code, **patch},
        preview=preview,
        summary=summary,
    )


def _apply_simple(ctx: AgentContext, model, args: dict[str, Any]) -> dict[str, Any]:
    code = str(args["code"])
    row = ctx.db.query(model).filter(model.company_id == ctx.company_id, model.code == code).one_or_none()
    created = False
    if row is None:
        row = model(company_id=ctx.company_id, code=code, name=args.get("name") or code,
                    status=args.get("status") or "active")
        ctx.db.add(row)
        created = True
    else:
        patch = {k: v for k, v in args.items() if k != "code" and v is not None}
        apply_diff(row, diff_row(row, patch))
    ctx.db.commit()
    return {"created": created, "id": row.id, "code": row.code, "name": row.name, "status": row.status}


# Register upsert_cost_center / upsert_client / upsert_project by table.
for _name, _model in (("cost_center", CostCenter), ("client", Client), ("project", Project)):
    _tn = f"upsert_{_name}"

    def _make_handler(tool_name=_tn, m=_model, label=_name):
        def _h(ctx: AgentContext, args: SimpleEntityArgs) -> ToolResult:
            return _propose_simple(ctx, tool_name, m, args, label)
        return _h

    def _make_applier(m=_model):
        def _a(ctx: AgentContext, args: dict[str, Any]) -> dict[str, Any]:
            return _apply_simple(ctx, m, args)
        return _a

    REGISTRY.register(ToolSpec(
        name=_tn,
        description=f"Crea o actualiza un {_name.replace('_', ' ')} por code.",
        category="config",
        input_schema=SimpleEntityArgs,
        handler=_make_handler(),
        personas=frozenset({"admin"}),
        destructive=True,
        requires_confirmation=True,
    ))
    register_applier(_tn, _make_applier())


# ── Legal entities ──────────────────────────────────────────────────────────

def _list_legal_entities(ctx: AgentContext, _: Empty) -> ToolResult:
    rows = (
        ctx.db.query(LegalEntity)
        .filter(LegalEntity.company_id == ctx.company_id)
        .order_by(LegalEntity.entity_name.asc())
        .all()
    )
    items = [
        {
            "id": r.id, "entity_name": r.entity_name, "entity_code": r.entity_code,
            "country_code": r.country_code, "base_currency": r.base_currency,
            "legal_name": r.legal_name, "rfc": r.rfc, "tax_id": r.tax_id,
            "fiscal_regime": r.fiscal_regime,
            "is_reimbursement_entity": r.is_reimbursement_entity,
            "is_invoice_receiver_entity": r.is_invoice_receiver_entity,
            "is_active": r.is_active,
        }
        for r in rows
    ]
    return ToolResult(ok=True, summary=f"{len(items)} entidades legales", data={"items": items})


REGISTRY.register(ToolSpec(
    name="list_legal_entities",
    description="Lista las entidades legales (empresas emisoras/receptoras) de la compañía.",
    category="read",
    input_schema=Empty,
    handler=_list_legal_entities,
    personas=frozenset({"admin"}),
))


class LegalEntityPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")
    entity_code:                 str          # identity
    entity_name:                 str | None = None
    country_code:                str | None = None
    base_currency:               str | None = None
    legal_name:                  str | None = None
    tax_id:                      str | None = None
    rfc:                         str | None = None
    fiscal_regime:               str | None = None
    fiscal_zip_code:             str | None = None
    fiscal_address:              str | None = None
    is_reimbursement_entity:     bool | None = None
    is_invoice_receiver_entity:  bool | None = None
    is_active:                   bool | None = None


def _handle_upsert_legal_entity(ctx: AgentContext, args: LegalEntityPatch) -> ToolResult:
    code = args.entity_code
    row = (
        ctx.db.query(LegalEntity)
        .filter(LegalEntity.company_id == ctx.company_id, LegalEntity.entity_code == code)
        .one_or_none()
    )
    patch = non_null(args)
    patch.pop("entity_code", None)
    if row is None:
        # Force a name so the NOT NULL entity_name constraint is satisfied.
        patch.setdefault("entity_name", code)
        diff = {k: {"before": None, "after": v} for k, v in patch.items()}
        action = "create"
    else:
        diff = diff_row(row, patch)
        action = "update"
        if not diff:
            return ToolResult(ok=True, summary=f"entidad {code} sin cambios")
    return propose(
        ctx,
        tool_name="upsert_legal_entity",
        args={"entity_code": code, **patch},
        preview={"action": f"{action}_legal_entity", "entity_code": code, "diff": diff},
        summary=f"{'crear' if action == 'create' else 'actualizar'} entidad legal {code}",
    )


def _apply_upsert_legal_entity(ctx: AgentContext, args: dict[str, Any]) -> dict[str, Any]:
    code = str(args["entity_code"])
    row = ctx.db.query(LegalEntity).filter(
        LegalEntity.company_id == ctx.company_id, LegalEntity.entity_code == code,
    ).one_or_none()
    created = False
    patch = {k: v for k, v in args.items() if k != "entity_code" and v is not None}
    if row is None:
        row = LegalEntity(
            company_id=ctx.company_id,
            entity_code=code,
            entity_name=str(patch.pop("entity_name", code)),
        )
        ctx.db.add(row)
        ctx.db.flush()
        created = True
    apply_diff(row, diff_row(row, patch))
    ctx.db.commit()
    return {"created": created, "id": row.id, "entity_code": row.entity_code}


REGISTRY.register(ToolSpec(
    name="upsert_legal_entity",
    description="Crea o actualiza una entidad legal (por entity_code).",
    category="config",
    input_schema=LegalEntityPatch,
    handler=_handle_upsert_legal_entity,
    personas=frozenset({"admin"}),
    destructive=True,
    requires_confirmation=True,
))
register_applier("upsert_legal_entity", _apply_upsert_legal_entity)
