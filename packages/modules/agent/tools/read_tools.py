"""Read-only tools — safe for the LLM to call freely.

No receipts; no confirmation. All queries are tenant-scoped through
``ctx.company_id``.
"""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import func

from packages.core.platform.models_accounting_category import AccountingCategory
from packages.core.platform.models_accounting_setup import AccountingSetup
from packages.core.platform.models_company_setup import CompanySetup
from packages.core.platform.models_expense_policy import CompanyExpensePolicy
from packages.core.platform.models_user import User
from packages.modules.expenses.models.expense import Expense

from ..core.context import AgentContext
from ..core.registry import REGISTRY, ToolResult, ToolSpec


class Empty(BaseModel):
    model_config = ConfigDict(extra="forbid")


def _row_to_dict(row: Any, keys: list[str]) -> dict[str, Any]:
    return {k: getattr(row, k, None) for k in keys}


# ── read: company setup ────────────────────────────────────────────────────

def _read_company_setup(ctx: AgentContext, _: Empty) -> ToolResult:
    row = ctx.db.query(CompanySetup).filter(CompanySetup.company_id == ctx.company_id).one_or_none()
    if row is None:
        return ToolResult(ok=True, summary="no company_setup row found", data={})
    keys = [
        "display_name", "country_code", "base_currency", "timezone", "language_code",
        "industry", "employee_count_range", "has_managers", "has_accounting_team",
        "operates_multi_entity", "operates_multi_country", "expenses_module_enabled",
    ]
    return ToolResult(ok=True, summary="company_setup leído", data=_row_to_dict(row, keys))


REGISTRY.register(ToolSpec(
    name="read_company_setup",
    description="Lee la configuración actual de la empresa (perfil, moneda, zona horaria, idioma).",
    category="read",
    input_schema=Empty,
    handler=_read_company_setup,
    personas=frozenset({"admin"}),
))


# ── read: expense policy ───────────────────────────────────────────────────

def _read_expense_policy(ctx: AgentContext, _: Empty) -> ToolResult:
    row = (
        ctx.db.query(CompanyExpensePolicy)
        .filter(CompanyExpensePolicy.company_id == ctx.company_id)
        .one_or_none()
    )
    if row is None:
        return ToolResult(ok=True, summary="no expense policy row found", data={})
    keys = [
        "xml_required_mode", "pdf_pair_required_for_cfdi", "international_expenses_allowed",
        "tickets_allowed", "require_justification", "require_proof", "allow_split_allocations",
        "manager_approval_required", "accounting_review_required", "allow_document_free_expenses",
        "ai_policy_assist_enabled",
    ]
    return ToolResult(ok=True, summary="expense_policy leída", data=_row_to_dict(row, keys))


REGISTRY.register(ToolSpec(
    name="read_expense_policy",
    description="Lee la política de gastos actual.",
    category="read",
    input_schema=Empty,
    handler=_read_expense_policy,
    personas=frozenset({"admin", "employee"}),
))


# ── read: accounting setup ─────────────────────────────────────────────────

def _read_accounting_setup(ctx: AgentContext, _: Empty) -> ToolResult:
    row = (
        ctx.db.query(AccountingSetup)
        .filter(AccountingSetup.company_id == ctx.company_id)
        .one_or_none()
    )
    if row is None:
        return ToolResult(ok=True, summary="no accounting_setup row found", data={})
    keys = [
        "accounting_review_mode", "manager_approval_mode", "manager_approval_threshold_amount",
        "reimbursement_entity_required", "poliza_required", "archive_retention_years",
        "account_code_required", "subaccount_required", "auto_account_suggestion_enabled",
        "cost_center_required", "project_required", "client_required",
        "allow_accounting_override", "allow_submit_with_warnings",
        "require_final_accounting_review_before_export", "ai_accounting_assist_enabled",
    ]
    return ToolResult(ok=True, summary="accounting_setup leído", data=_row_to_dict(row, keys))


REGISTRY.register(ToolSpec(
    name="read_accounting_setup",
    description="Lee la configuración contable actual.",
    category="read",
    input_schema=Empty,
    handler=_read_accounting_setup,
    personas=frozenset({"admin"}),
))


# ── read: accounting categories ─────────────────────────────────────────────

class ListCategoriesArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    only_active: bool = True
    limit: int = Field(default=200, ge=1, le=500)


def _list_accounting_categories(ctx: AgentContext, args: ListCategoriesArgs) -> ToolResult:
    q = ctx.db.query(AccountingCategory).filter(AccountingCategory.company_id == ctx.company_id)
    if args.only_active:
        q = q.filter(AccountingCategory.is_active.is_(True))
    rows = q.order_by(AccountingCategory.code.asc()).limit(args.limit).all()
    items = [
        {
            "code": r.code,
            "name": r.name,
            "expense_account_code": r.expense_account_code,
            "liability_account_code": r.liability_account_code,
            "tax_behavior": r.tax_behavior,
            "requires_project": r.requires_project,
            "is_active": r.is_active,
        }
        for r in rows
    ]
    return ToolResult(
        ok=True,
        summary=f"{len(items)} categorías contables",
        data={"count": len(items), "items": items},
    )


REGISTRY.register(ToolSpec(
    name="list_accounting_categories",
    description="Lista las categorías contables configuradas para la empresa.",
    category="read",
    input_schema=ListCategoriesArgs,
    handler=_list_accounting_categories,
    personas=frozenset({"admin", "employee"}),
))


# ── read: expense counts by status ──────────────────────────────────────────

def _expense_counts(ctx: AgentContext, _: Empty) -> ToolResult:
    rows = (
        ctx.db.query(Expense.status, func.count(Expense.id))
        .filter(Expense.company_id == ctx.company_id)
        .group_by(Expense.status)
        .all()
    )
    counts = {status: int(n) for status, n in rows}
    return ToolResult(
        ok=True,
        summary=f"totales de gastos por estado ({sum(counts.values())} en total)",
        data={"by_status": counts, "total": sum(counts.values())},
    )


REGISTRY.register(ToolSpec(
    name="expense_counts_by_status",
    description="Totales de gastos agrupados por estado (draft, submitted, approved, etc).",
    category="read",
    input_schema=Empty,
    handler=_expense_counts,
    personas=frozenset({"admin", "employee"}),
))


# Note: list_users moved to admin_tools.py with enhanced filtering and grouping
