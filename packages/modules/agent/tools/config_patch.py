"""Config-patch tools (destructive, two-phase).

Three tools cover the most-used admin operations:

    update_company_setup     — org profile: currency, timezone, language, etc.
    update_expense_policy    — expense rules: XML required mode, thresholds, allocations.
    update_accounting_setup  — poliza/review settings and required dimensions.

Each tool:
    1. Loads the current row.
    2. Computes a per-field diff (before/after).
    3. Parks the change as an ``AgentPendingAction`` receipt and returns the
       receipt_id. The UI prompts the admin; on confirmation the router calls
       :func:`apply_update_company_setup` / etc. which does the actual write.
"""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from packages.core.platform.models_accounting_setup import AccountingSetup
from packages.core.platform.models_company_setup import CompanySetup
from packages.core.platform.models_expense_policy import CompanyExpensePolicy

from ..core.context import AgentContext
from ..core.receipts import create_receipt
from ..core.registry import REGISTRY, ToolResult, ToolSpec


# ── shared helpers ──────────────────────────────────────────────────────────

def _diff(row: Any, patch: dict[str, Any]) -> dict[str, dict[str, Any]]:
    out: dict[str, dict[str, Any]] = {}
    for key, new_val in patch.items():
        if not hasattr(row, key):
            continue
        current = getattr(row, key)
        if current != new_val:
            out[key] = {"before": current, "after": new_val}
    return out


def _apply_diff(row: Any, diff: dict[str, dict[str, Any]]) -> None:
    for key, pair in diff.items():
        setattr(row, key, pair["after"])


def _get_or_create_company_setup(ctx: AgentContext) -> CompanySetup:
    row = (
        ctx.db.query(CompanySetup)
        .filter(CompanySetup.company_id == ctx.company_id)
        .one_or_none()
    )
    if row is None:
        row = CompanySetup(company_id=ctx.company_id)
        ctx.db.add(row)
        ctx.db.flush()
    return row


def _get_or_create_expense_policy(ctx: AgentContext) -> CompanyExpensePolicy:
    row = (
        ctx.db.query(CompanyExpensePolicy)
        .filter(CompanyExpensePolicy.company_id == ctx.company_id)
        .one_or_none()
    )
    if row is None:
        row = CompanyExpensePolicy(company_id=ctx.company_id)
        ctx.db.add(row)
        ctx.db.flush()
    return row


def _get_or_create_accounting_setup(ctx: AgentContext) -> AccountingSetup:
    row = (
        ctx.db.query(AccountingSetup)
        .filter(AccountingSetup.company_id == ctx.company_id)
        .one_or_none()
    )
    if row is None:
        row = AccountingSetup(company_id=ctx.company_id)
        ctx.db.add(row)
        ctx.db.flush()
    return row


# ── schemas — only the fields we expose to the LLM today ────────────────────
# Keep this list tight; adding fields later is cheap, rolling back is not.

class CompanySetupPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")

    display_name:            str | None = None
    country_code:            str | None = Field(default=None, max_length=10)
    base_currency:           str | None = Field(default=None, max_length=10)
    timezone:                str | None = Field(default=None, max_length=100)
    language_code:           str | None = Field(default=None, max_length=20)
    industry:                str | None = Field(default=None, max_length=100)
    employee_count_range:    str | None = Field(default=None, max_length=50)
    has_managers:            bool | None = None
    has_accounting_team:     bool | None = None
    operates_multi_entity:   bool | None = None
    operates_multi_country:  bool | None = None
    expenses_module_enabled: bool | None = None


class ExpensePolicyPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")

    xml_required_mode:              str | None = Field(default=None, description="one of: always|mxn_only|optional")
    pdf_pair_required_for_cfdi:     bool | None = None
    international_expenses_allowed: bool | None = None
    tickets_allowed:                bool | None = None
    require_justification:          bool | None = None
    require_proof:                  bool | None = None
    allow_split_allocations:        bool | None = None
    manager_approval_required:      bool | None = None
    accounting_review_required:     bool | None = None
    allow_document_free_expenses:   bool | None = None
    ai_policy_assist_enabled:       bool | None = None


class AccountingSetupPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")

    accounting_review_mode:                         str | None = None
    manager_approval_mode:                          str | None = None
    manager_approval_threshold_amount:              float | None = None
    reimbursement_entity_required:                  bool | None = None
    poliza_required:                                bool | None = None
    archive_retention_years:                        int | None = None
    account_code_required:                          bool | None = None
    subaccount_required:                            bool | None = None
    auto_account_suggestion_enabled:                bool | None = None
    cost_center_required:                           bool | None = None
    project_required:                               bool | None = None
    client_required:                                bool | None = None
    allow_accounting_override:                      bool | None = None
    allow_submit_with_warnings:                     bool | None = None
    require_final_accounting_review_before_export: bool | None = None
    ai_accounting_assist_enabled:                   bool | None = None


def _non_null(patch: BaseModel) -> dict[str, Any]:
    return {k: v for k, v in patch.model_dump().items() if v is not None}


# ── tool handlers (phase 1: create receipt) ─────────────────────────────────

def _handle_company(ctx: AgentContext, patch: CompanySetupPatch) -> ToolResult:
    changes = _non_null(patch)
    if not changes:
        return ToolResult(ok=True, summary="no changes requested")
    row = _get_or_create_company_setup(ctx)
    diff = _diff(row, changes)
    if not diff:
        return ToolResult(ok=True, summary="configuration already matches")
    receipt = create_receipt(
        db=ctx.db,
        company_id=ctx.company_id,
        session_id=ctx.session_id,
        tool_name="update_company_setup",
        args=changes,
        preview={"target": "company_setup", "diff": diff},
    )
    return ToolResult(
        ok=True,
        summary=f"preparado cambio a configuración de empresa ({len(diff)} campos) — requiere confirmación",
        data={"diff": diff},
        receipt_id=receipt.receipt_id,
    )


def _handle_expense_policy(ctx: AgentContext, patch: ExpensePolicyPatch) -> ToolResult:
    changes = _non_null(patch)
    if not changes:
        return ToolResult(ok=True, summary="no changes requested")
    row = _get_or_create_expense_policy(ctx)
    diff = _diff(row, changes)
    if not diff:
        return ToolResult(ok=True, summary="configuration already matches")
    receipt = create_receipt(
        db=ctx.db,
        company_id=ctx.company_id,
        session_id=ctx.session_id,
        tool_name="update_expense_policy",
        args=changes,
        preview={"target": "expense_policy", "diff": diff},
    )
    return ToolResult(
        ok=True,
        summary=f"preparado cambio a política de gastos ({len(diff)} campos) — requiere confirmación",
        data={"diff": diff},
        receipt_id=receipt.receipt_id,
    )


def _handle_accounting_setup(ctx: AgentContext, patch: AccountingSetupPatch) -> ToolResult:
    changes = _non_null(patch)
    if not changes:
        return ToolResult(ok=True, summary="no changes requested")
    row = _get_or_create_accounting_setup(ctx)
    diff = _diff(row, changes)
    if not diff:
        return ToolResult(ok=True, summary="configuration already matches")
    receipt = create_receipt(
        db=ctx.db,
        company_id=ctx.company_id,
        session_id=ctx.session_id,
        tool_name="update_accounting_setup",
        args=changes,
        preview={"target": "accounting_setup", "diff": diff},
    )
    return ToolResult(
        ok=True,
        summary=f"preparado cambio de configuración contable ({len(diff)} campos) — requiere confirmación",
        data={"diff": diff},
        receipt_id=receipt.receipt_id,
    )


# ── apply handlers (phase 2: actually write after /agent/confirm) ───────────

def apply_update_company_setup(ctx: AgentContext, args: dict[str, Any]) -> dict[str, Any]:
    row = _get_or_create_company_setup(ctx)
    diff = _diff(row, args)
    _apply_diff(row, diff)
    ctx.db.commit()
    return {"applied": diff, "count": len(diff)}


def apply_update_expense_policy(ctx: AgentContext, args: dict[str, Any]) -> dict[str, Any]:
    row = _get_or_create_expense_policy(ctx)
    diff = _diff(row, args)
    _apply_diff(row, diff)
    ctx.db.commit()
    return {"applied": diff, "count": len(diff)}


def apply_update_accounting_setup(ctx: AgentContext, args: dict[str, Any]) -> dict[str, Any]:
    row = _get_or_create_accounting_setup(ctx)
    diff = _diff(row, args)
    _apply_diff(row, diff)
    ctx.db.commit()
    return {"applied": diff, "count": len(diff)}


# Router-level dispatch table used by /agent/confirm.
APPLIERS = {
    "update_company_setup":    apply_update_company_setup,
    "update_expense_policy":   apply_update_expense_policy,
    "update_accounting_setup": apply_update_accounting_setup,
}


# ── registration ────────────────────────────────────────────────────────────

from ..core.appliers import register_applier

for _name, _fn in APPLIERS.items():
    register_applier(_name, _fn)


REGISTRY.register(ToolSpec(
    name="update_company_setup",
    description="Actualiza el perfil de la empresa (nombre, moneda, zona horaria, idioma, etc.). Cambios se aplican sólo tras confirmación humana.",
    category="config",
    input_schema=CompanySetupPatch,
    handler=_handle_company,
    personas=frozenset({"admin"}),
    destructive=True,
    requires_confirmation=True,
))

REGISTRY.register(ToolSpec(
    name="update_expense_policy",
    description="Actualiza la política de gastos (XML requerido, aprobaciones, divisiones, tickets). Cambios requieren confirmación humana.",
    category="config",
    input_schema=ExpensePolicyPatch,
    handler=_handle_expense_policy,
    personas=frozenset({"admin"}),
    destructive=True,
    requires_confirmation=True,
))

REGISTRY.register(ToolSpec(
    name="update_accounting_setup",
    description="Actualiza la configuración contable (modo de revisión, pólizas, dimensiones requeridas). Cambios requieren confirmación humana.",
    category="config",
    input_schema=AccountingSetupPatch,
    handler=_handle_accounting_setup,
    personas=frozenset({"admin"}),
    destructive=True,
    requires_confirmation=True,
))
