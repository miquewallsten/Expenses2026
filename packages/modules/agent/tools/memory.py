"""Agent memory tools — remember/recall/list/forget."""

from __future__ import annotations

from typing import Any

import json as _json

from pydantic import BaseModel, ConfigDict, Field, field_validator

from ..core import memory
from ..core.context import AgentContext
from ..core.registry import REGISTRY, ToolResult, ToolSpec


_ALL_PERSONAS = frozenset(("admin", "accounting"))
_ADMIN_ONLY = frozenset(("admin",))
_ADMIN_ACCT = frozenset(("admin", "accounting"))


class RememberInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    key:   str = Field(..., min_length=1, max_length=255)
    value: Any
    kind:  str = Field(default="fact", pattern=r"^(fact|preference|decision)$")
    scope: str = Field(default="company", pattern=r"^(company|user)$")

    @field_validator("value")
    @classmethod
    def _cap_value_size(cls, v: Any) -> Any:
        if len(_json.dumps(v, default=str)) > 2000:
            raise ValueError("memory value must not exceed 2000 characters when serialized")
        return v


def _handle_remember(ctx: AgentContext, args: RememberInput) -> ToolResult:
    user_id = ctx.user_id if args.scope == "user" else None
    row = memory.remember(
        ctx.db,
        company_id=ctx.company_id,
        key=args.key,
        value=args.value,
        kind=args.kind,
        user_id=user_id,
    )
    return ToolResult(
        ok=True,
        summary=f"guardado en memoria: {args.kind}/{args.key}",
        data={"id": row.id, "kind": row.kind, "key": row.key},
    )


REGISTRY.register(ToolSpec(
    name="remember",
    description="Guarda un hecho/preferencia/decisión en la memoria persistente del agente.",
    category="memory",
    input_schema=RememberInput,
    handler=_handle_remember,
    personas=_ADMIN_ACCT,
))


class RecallInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    key:  str = Field(..., min_length=1, max_length=255)
    kind: str | None = Field(default=None, pattern=r"^(fact|preference|decision)$")


def _handle_recall(ctx: AgentContext, args: RecallInput) -> ToolResult:
    val = memory.recall(ctx.db, company_id=ctx.company_id, key=args.key, kind=args.kind)
    if val is None:
        return ToolResult(ok=True, summary=f"sin memoria para {args.key}", data={"value": None})
    return ToolResult(ok=True, summary=f"memoria {args.key}", data={"value": val})


REGISTRY.register(ToolSpec(
    name="recall",
    description="Consulta un valor previamente guardado en memoria.",
    category="memory",
    input_schema=RecallInput,
    handler=_handle_recall,
    personas=_ALL_PERSONAS,
))


class ListMemoriesInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    kind:  str | None = Field(default=None, pattern=r"^(fact|preference|decision)$")
    limit: int = Field(default=20, ge=1, le=100)


def _handle_list_memories(ctx: AgentContext, args: ListMemoriesInput) -> ToolResult:
    rows = memory.list_memories(ctx.db, company_id=ctx.company_id, kind=args.kind, limit=args.limit)
    items = [{"id": r.id, "kind": r.kind, "key": r.key, "created_at": r.created_at} for r in rows]
    return ToolResult(ok=True, summary=f"{len(items)} memorias", data={"items": items})


REGISTRY.register(ToolSpec(
    name="list_memories",
    description="Lista memorias recientes.",
    category="memory",
    input_schema=ListMemoriesInput,
    handler=_handle_list_memories,
    personas=_ADMIN_ACCT,
))


class ForgetInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    key:  str = Field(..., min_length=1, max_length=255)
    kind: str | None = Field(default=None, pattern=r"^(fact|preference|decision)$")


def _handle_forget(ctx: AgentContext, args: ForgetInput) -> ToolResult:
    n = memory.forget(ctx.db, company_id=ctx.company_id, key=args.key, kind=args.kind)
    return ToolResult(ok=True, summary=f"{n} memorias eliminadas", data={"deleted": n})


REGISTRY.register(ToolSpec(
    name="forget",
    description="Elimina memorias por clave (y opcionalmente tipo).",
    category="memory",
    input_schema=ForgetInput,
    handler=_handle_forget,
    personas=_ADMIN_ONLY,
))
