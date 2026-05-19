"""Knowledge tools — how_to lookup + free-text search across the app ontology.

These are read-only and safe for every persona.
"""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field

from ..core.context import AgentContext
from ..core.knowledge import get_chunk, hybrid_search_knowledge
from ..core.registry import REGISTRY, ToolResult, ToolSpec


_ALL_PERSONAS = frozenset(("admin", "accounting"))


# ── how_to ──────────────────────────────────────────────────────────────────

_SECTION_LINKS: dict[str, str] = {
    "archive_module_enabled":     "/admin?section=Archive+Config",
    "channel_settings":           "/admin?section=Channels",
    "auth_settings":              "/admin?section=Authentication",
    "report_cycle":               "/admin?section=Report+Cycle",
    "expense_policy":             "/admin?section=Expense+Policy",
    "accounting_setup":           "/admin?section=Accounting+Setup",
    "approval_setup":             "/admin?section=Approval+Setup",
    "workflow_setup":             "/admin?section=Workflow+Setup",
    "company_setup":              "/admin?section=Company+Setup",
}


def _deep_link_for(chunk: dict) -> str | None:
    key = (chunk.get("key") or "").split(".")[0]
    return _SECTION_LINKS.get(key) or _SECTION_LINKS.get(chunk.get("key", ""))


class HowToInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    question: str = Field(..., min_length=2, max_length=500)


def _handle_how_to(ctx: AgentContext, args: HowToInput) -> ToolResult:
    chunks = hybrid_search_knowledge(ctx.db, ctx.company_id, args.question, k=3)
    if not chunks:
        return ToolResult(
            ok=True,
            summary="sin resultado de conocimiento",
            data={"answer": None, "links": []},
        )
    top = chunks[0]
    link = _deep_link_for(top)
    return ToolResult(
        ok=True,
        summary=top["title"],
        data={
            "answer": top["body"],
            "title":  top["title"],
            "source": top["source"],
            "link":   link,
            "related": [{"title": c["title"], "key": c["key"]} for c in chunks[1:]],
        },
    )


REGISTRY.register(ToolSpec(
    name="how_to",
    description="Explica cómo funciona una parte del producto o dónde configurarla. Devuelve un resumen corto y un deep-link al admin.",
    category="read",
    input_schema=HowToInput,
    handler=_handle_how_to,
    personas=_ALL_PERSONAS,
))


# ── search_knowledge ────────────────────────────────────────────────────────

class SearchKnowledgeInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    query: str = Field(..., min_length=2, max_length=500)
    k:     int = Field(default=5, ge=1, le=10)


def _handle_search_knowledge(ctx: AgentContext, args: SearchKnowledgeInput) -> ToolResult:
    chunks = hybrid_search_knowledge(ctx.db, ctx.company_id, args.query, k=args.k)
    return ToolResult(
        ok=True,
        summary=f"{len(chunks)} chunks",
        data={"results": [
            {"title": c["title"], "body": c["body"], "key": c["key"], "source": c["source"]}
            for c in chunks
        ]},
    )


REGISTRY.register(ToolSpec(
    name="search_knowledge",
    description="Busca en la base de conocimiento del producto (entidades, módulos, ajustes, flujos).",
    category="read",
    input_schema=SearchKnowledgeInput,
    handler=_handle_search_knowledge,
    personas=_ALL_PERSONAS,
))


# ── get_knowledge ───────────────────────────────────────────────────────────

class GetKnowledgeInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    key: str = Field(..., min_length=1, max_length=255)


def _handle_get_knowledge(ctx: AgentContext, args: GetKnowledgeInput) -> ToolResult:
    chunk = get_chunk(args.key)
    if chunk is None:
        return ToolResult(ok=False, summary=f"sin conocimiento para {args.key}", error="not_found")
    return ToolResult(ok=True, summary=chunk["title"], data=chunk)


REGISTRY.register(ToolSpec(
    name="get_knowledge",
    description="Obtiene una entrada específica del catálogo de conocimiento por clave.",
    category="read",
    input_schema=GetKnowledgeInput,
    handler=_handle_get_knowledge,
    personas=_ALL_PERSONAS,
))
