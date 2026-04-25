"""Accounting-category write tools (two-phase, destructive).

Lets the admin create accounting categories directly from chat, without
needing a CSV upload. The ingest_accounting_catalog tool remains the right
choice for bulk files; these tools are for inline creation:

    create_accounting_category         — one category at a time
    bulk_create_accounting_categories  — list inline in the chat

Both create an AgentPendingAction receipt and wait for /agent/confirm.
"""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from packages.core.platform.models_accounting_category import (
    AccountingCategory,
    TAX_BEHAVIOR_VALUES,
)

from ..core.appliers import register_applier
from ..core.context import AgentContext
from ..core.receipts import create_receipt
from ..core.registry import REGISTRY, ToolResult, ToolSpec


# ── Schemas ─────────────────────────────────────────────────────────────────


class CategoryRow(BaseModel):
    model_config = ConfigDict(extra="forbid")
    code: str = Field(..., min_length=1, max_length=50)
    name: str = Field(..., min_length=1, max_length=255)
    expense_account_code:   str | None = Field(default=None, max_length=50)
    liability_account_code: str | None = Field(default=None, max_length=50)
    tax_behavior:           str = Field(default="none")
    requires_project:       bool = False


class CreateCategoryArgs(CategoryRow):
    model_config = ConfigDict(extra="forbid")


class BulkCreateCategoriesArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    rows: list[CategoryRow] = Field(..., min_length=1, max_length=200)


# ── Helpers ─────────────────────────────────────────────────────────────────


def _existing_codes(ctx: AgentContext) -> set[str]:
    return {
        c.code for c in
        ctx.db.query(AccountingCategory.code)
        .filter(AccountingCategory.company_id == ctx.company_id).all()
    }


def _normalize_row(row: dict[str, Any]) -> dict[str, Any]:
    tb = str(row.get("tax_behavior") or "none")
    if tb not in TAX_BEHAVIOR_VALUES:
        tb = "none"
    return {
        "code":                   str(row["code"]).strip()[:50],
        "name":                   str(row["name"]).strip()[:255],
        "expense_account_code":   (row.get("expense_account_code") or None),
        "liability_account_code": (row.get("liability_account_code") or None),
        "tax_behavior":           tb,
        "requires_project":       bool(row.get("requires_project") or False),
    }


# ── Handlers (phase 1: create receipt) ──────────────────────────────────────


def _handle_create_category(ctx: AgentContext, args: CreateCategoryArgs) -> ToolResult:
    row = _normalize_row(args.model_dump())
    if not row["code"] or not row["name"]:
        return ToolResult(ok=False, summary="code y name son obligatorios",
                          error="missing_fields")
    if row["code"] in _existing_codes(ctx):
        return ToolResult(
            ok=False,
            summary=f"ya existe una categoría con código '{row['code']}'",
            error="duplicate_code",
        )
    preview = {"target": "accounting_category", "rows": [row], "counts": {"new": 1}}
    receipt = create_receipt(
        db=ctx.db,
        company_id=ctx.company_id,
        session_id=ctx.session_id,
        tool_name="create_accounting_category",
        args={"rows": [row]},
        preview=preview,
    )
    return ToolResult(
        ok=True,
        summary=f"lista para crear: {row['code']} — {row['name']} (requiere confirmación)",
        data={"preview": preview},
        receipt_id=receipt.receipt_id,
    )


def _handle_bulk_create_categories(
    ctx: AgentContext, args: BulkCreateCategoriesArgs
) -> ToolResult:
    existing = _existing_codes(ctx)
    proposed: list[dict[str, Any]] = []
    skipped:  list[dict[str, Any]] = []
    seen:     set[str] = set()
    for raw in args.rows:
        r = _normalize_row(raw.model_dump())
        if not r["code"] or not r["name"]:
            skipped.append({"code": r["code"], "reason": "missing_fields"})
            continue
        if r["code"] in existing or r["code"] in seen:
            skipped.append({"code": r["code"], "reason": "already_exists"})
            continue
        seen.add(r["code"])
        proposed.append(r)

    if not proposed:
        return ToolResult(
            ok=True,
            summary="no hay categorías nuevas para crear",
            data={"skipped": skipped},
        )

    preview = {
        "target":  "accounting_category",
        "counts":  {"new": len(proposed), "skipped": len(skipped)},
        "rows":    proposed[:50],
        "skipped": skipped[:50],
    }
    receipt = create_receipt(
        db=ctx.db,
        company_id=ctx.company_id,
        session_id=ctx.session_id,
        tool_name="bulk_create_accounting_categories",
        args={"rows": proposed},
        preview=preview,
    )
    return ToolResult(
        ok=True,
        summary=(
            f"{len(proposed)} categorías listas para crear"
            + (f", {len(skipped)} omitidas" if skipped else "")
            + " — requiere confirmación"
        ),
        data={"preview": preview},
        receipt_id=receipt.receipt_id,
    )


# ── Appliers (phase 2: write after /agent/confirm) ──────────────────────────


def _apply_create_categories(ctx: AgentContext, args: dict[str, Any]) -> dict[str, Any]:
    rows = args.get("rows") or []
    existing = _existing_codes(ctx)
    created = 0
    for r in rows:
        code = str(r.get("code") or "").strip()
        if not code or code in existing:
            continue
        ctx.db.add(AccountingCategory(
            company_id=ctx.company_id,
            code=code,
            name=str(r.get("name") or code),
            expense_account_code=r.get("expense_account_code"),
            liability_account_code=r.get("liability_account_code"),
            tax_behavior=str(r.get("tax_behavior") or "none"),
            requires_project=bool(r.get("requires_project") or False),
        ))
        existing.add(code)
        created += 1
    ctx.db.commit()
    return {"created": created, "total_proposed": len(rows)}


register_applier("create_accounting_category",        _apply_create_categories)
register_applier("bulk_create_accounting_categories", _apply_create_categories)


# ── Registration ────────────────────────────────────────────────────────────


REGISTRY.register(ToolSpec(
    name="create_accounting_category",
    description=(
        "Crea UNA categoría contable directamente desde la conversación, sin "
        "archivo. Ideal cuando el admin menciona explícitamente códigos "
        "(ej.: 'crea la categoría VIÁTICOS (604-001)'). Requiere confirmación."
    ),
    category="entity",
    input_schema=CreateCategoryArgs,
    handler=_handle_create_category,
    personas=frozenset({"admin"}),
    destructive=True,
    requires_confirmation=True,
))


REGISTRY.register(ToolSpec(
    name="bulk_create_accounting_categories",
    description=(
        "Crea varias categorías contables de una lista proporcionada en la "
        "conversación (sin CSV). Úsalo cuando el admin escriba o pegue una "
        "lista de códigos/nombres. Para archivos, usa ingest_accounting_catalog. "
        "Requiere confirmación."
    ),
    category="entity",
    input_schema=BulkCreateCategoriesArgs,
    handler=_handle_bulk_create_categories,
    personas=frozenset({"admin"}),
    destructive=True,
    requires_confirmation=True,
))
