"""Diagnostic tools — structured health checks callable by the LLM.

These don't write. They collect a compact report the model can use to answer
"what's wrong with X?" questions without hallucinating.
"""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import func

from packages.core.platform.models_accounting_category import AccountingCategory
from packages.core.platform.models_accounting_setup import AccountingSetup
from packages.core.platform.models_company_setup import CompanySetup
from packages.core.platform.models_expense_policy import CompanyExpensePolicy
from packages.core.platform.models_workflow_stage import WorkflowStage
from packages.core.platform.models_workflow_transition import WorkflowTransition
from packages.modules.expenses.models.expense import Expense

from ..core.context import AgentContext
from ..core.registry import REGISTRY, ToolResult, ToolSpec


class Empty(BaseModel):
    model_config = ConfigDict(extra="forbid")


# ── diagnose_config ─────────────────────────────────────────────────────────

def _diagnose_config(ctx: AgentContext, _: Empty) -> ToolResult:
    from packages.core.platform.service.tenant_validator import VALIDATOR
    
    report = VALIDATOR.validate_company(ctx.db, ctx.company_id)
    
    issues: list[dict[str, Any]] = []
    
    # Map validator blockers to diagnostic issues
    for g in report.blockers:
        issues.append({
            "severity": "high" if g.severity == "blocker" else "medium",
            "code": f"validator_{g.kind}_{g.target.replace('.', '_').lower()}",
            "message": g.message,
            "wizard_step": g.wizard_step,
            "module": g.module
        })

    # Also include warnings
    for g in report.warnings:
        issues.append({
            "severity": "low",
            "code": f"validator_{g.kind}_{g.target.replace('.', '_').lower()}",
            "message": g.message,
            "wizard_step": g.wizard_step,
            "module": g.module
        })

    # Legacy manual checks as fallback/supplement
    cs = ctx.db.query(CompanySetup).filter(CompanySetup.company_id == ctx.company_id).one_or_none()
    if cs and not report.blockers:
        if not cs.base_currency:
            issues.append({"severity": "medium", "code": "missing_base_currency",
                           "message": "Falta moneda base."})

    status = "ok" if not report.blockers else "issues_found"
    
    summary = report.ok and "La configuración de la empresa es correcta y completa." or \
              f"Se encontraron {len(report.blockers)} problemas de configuración que bloquean la operación."
              
    return ToolResult(
        ok=True,
        summary=summary,
        data={
            "status": status, 
            "ok": report.ok,
            "issues": issues, 
            "modules_status": [
                {"module": m.module, "enabled": m.enabled, "ok": m.ok} 
                for m in report.modules
            ]
        },
    )


REGISTRY.register(ToolSpec(
    name="diagnose_config",
    description="Revisa la configuración de la empresa y reporta problemas (falta moneda, categorías, etc).",
    category="diagnostic",
    input_schema=Empty,
    handler=_diagnose_config,
    personas=frozenset({"accounting", "admin"}),
))


# ── diagnose_expense ───────────────────────────────────────────────────────

class DiagnoseExpenseArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    expense_id: int = Field(..., ge=1)


def _diagnose_expense(ctx: AgentContext, args: DiagnoseExpenseArgs) -> ToolResult:
    exp = ctx.db.query(Expense).filter(
        Expense.id == args.expense_id,
        Expense.company_id == ctx.company_id,
    ).one_or_none()

    if exp is None:
        return ToolResult(ok=False, summary=f"expense {args.expense_id} no encontrado", error="not_found")

    issues: list[dict[str, Any]] = []
    if not exp.expense_date:
        issues.append({"severity": "medium", "code": "missing_date", "message": "Falta fecha del gasto."})
    if not exp.category_code:
        issues.append({"severity": "medium", "code": "missing_category", "message": "Falta categoría contable."})
    if exp.amount is None or float(exp.amount) <= 0:
        issues.append({"severity": "high", "code": "bad_amount", "message": "Monto inválido o cero."})

    data = {
        "id":            exp.id,
        "status":        exp.status,
        "amount":        float(exp.amount) if exp.amount is not None else None,
        "description":   exp.description,
        "expense_date":  exp.expense_date.isoformat() if exp.expense_date else None,
        "category_code": exp.category_code,
        "account_code":  exp.account_code,
        "report_id":     exp.report_id,
        "issues":        issues,
    }
    return ToolResult(
        ok=True,
        summary=f"expense {exp.id} — {exp.status} — {len(issues)} hallazgos",
        data=data,
    )


REGISTRY.register(ToolSpec(
    name="diagnose_expense",
    description="Analiza un gasto por ID y reporta problemas (fecha, categoría, monto).",
    category="diagnostic",
    input_schema=DiagnoseExpenseArgs,
    handler=_diagnose_expense,
    personas=frozenset({"accounting", "admin"}),
))


# ── trace_workflow ──────────────────────────────────────────────────────────

def _trace_workflow(ctx: AgentContext, _: Empty) -> ToolResult:
    stages = (
        ctx.db.query(WorkflowStage)
        .filter(WorkflowStage.company_id == ctx.company_id)
        .order_by(WorkflowStage.module_key.asc(), WorkflowStage.stage_order.asc())
        .all()
    )
    transitions = (
        ctx.db.query(WorkflowTransition)
        .filter(WorkflowTransition.company_id == ctx.company_id)
        .all()
    )
    if not stages:
        return ToolResult(
            ok=True,
            summary="no hay etapas de flujo configuradas",
            data={"stages": [], "transitions": []},
        )
    return ToolResult(
        ok=True,
        summary=f"{len(stages)} etapas, {len(transitions)} transiciones",
        data={
            "stages": [
                {
                    "id": s.id, "module_key": s.module_key, "stage_key": s.stage_key,
                    "stage_name": s.stage_name, "stage_order": s.stage_order,
                    "is_terminal": s.is_terminal,
                }
                for s in stages
            ],
            "transitions": [
                {
                    "id": t.id, "module_key": t.module_key,
                    "from_stage_key": t.from_stage_key, "to_stage_key": t.to_stage_key,
                    "action_key": t.action_key,
                    "required_permission_key": t.required_permission_key,
                }
                for t in transitions
            ],
        },
    )


REGISTRY.register(ToolSpec(
    name="trace_workflow",
    description="Muestra las etapas y transiciones del flujo de aprobación de gastos.",
    category="diagnostic",
    input_schema=Empty,
    handler=_trace_workflow,
    personas=frozenset({"accounting", "admin"}),
))
