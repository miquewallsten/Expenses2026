"""Report Builder Agent Tools — allows the copilot to trigger report building,
review reports, resolve flagged issues, and list pending reviews.

The builder is CONSERVATIVE — it builds, compiles, assigns, and flags. It NEVER
approves, exports, or makes accounting decisions on its own. The accountant always
has the final say.
"""
from __future__ import annotations

from datetime import date
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from packages.modules.agent.core.context import AgentContext
from packages.modules.agent.core.registry import REGISTRY, ToolResult, ToolSpec


# ── Input schemas ─────────────────────────────────────────────────────────────

class BuildReportsArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    user_id: int | None = Field(None, description="If set, build for one user only. If null, build for all users with approved expenses.")
    period_start: str | None = Field(None, description="Period start in YYYY-MM-DD format. Defaults to current month start.")
    period_end: str | None = Field(None, description="Period end in YYYY-MM-DD format. Defaults to today.")


class ReviewReportArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    report_id: int = Field(..., description="The report ID to review")


class ResolveIssueArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    report_id: int = Field(..., description="The report ID")
    issue_index: int = Field(..., ge=0, description="Index of the issue in the notes array")
    resolution: str = Field(..., min_length=1, description="Accountant's resolution note")
    action: str = Field(default="acknowledge", description="acknowledge | remap | exclude_expense")
    new_account_code: str | None = Field(None, description="New account code if action=remap")
    exclude_expense_id: int | None = Field(None, description="Expense ID to exclude if action=exclude_expense")


class ListReportsArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    status: str | None = Field(None, description="Filter by status: draft, needs_review, submitted, approved")
    needs_review: bool | None = Field(None, description="Filter reports needing accountant review")
    user_id: int | None = Field(None, description="Filter by user")


class GetPolizaPreviewArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    report_id: int = Field(..., description="The report ID to preview poliza for")


# ── Handlers ──────────────────────────────────────────────────────────────────

def _build_reports(ctx: AgentContext, args: BuildReportsArgs) -> ToolResult:
    """Build expense reports for approved, unbundled expenses."""
    from packages.modules.expenses.service.report_builder_service import build_reports_for_company, build_report_for_user

    period_start = date.fromisoformat(args.period_start) if args.period_start else None
    period_end = date.fromisoformat(args.period_end) if args.period_end else None

    try:
        if args.user_id:
            result = build_report_for_user(
                db=ctx.db,
                company_id=ctx.company_id,
                user_id=args.user_id,
                period_start=period_start,
                period_end=period_end,
                triggered_by="agent",
            )
            results = [result]
        else:
            results = build_reports_for_company(
                db=ctx.db,
                company_id=ctx.company_id,
                period_start=period_start,
                period_end=period_end,
                triggered_by="agent",
            )

        built = [r for r in results if r.report_id is not None]
        errors = [r for r in results if r.report_id is None]
        total_critical = sum(sum(1 for i in r.issues if i.severity == "critical") for r in built)
        total_warnings = sum(sum(1 for i in r.issues if i.severity == "warning") for r in built)

        summary_parts = [f"{len(built)} reporte(s) construido(s)"]
        if total_critical:
            summary_parts.append(f"{total_critical} problema(s) crítico(s)")
        if total_warnings:
            summary_parts.append(f"{total_warnings} advertencia(s)")
        if errors:
            summary_parts.append(f"{len(errors)} error(es)")

        return ToolResult(
            ok=True,
            summary=". ".join(summary_parts) + ".",
            data={
                "reports_built": len(built),
                "errors": len(errors),
                "total_critical_issues": total_critical,
                "total_warning_issues": total_warnings,
                "reports": [
                    {
                        "report_id": r.report_id,
                        "user_id": r.user_id,
                        "status": r.status,
                        "total_mxn": str(r.total_amount_mxn),
                        "expense_count": len(r.expense_mappings),
                        "notes": r.notes,
                    }
                    for r in built
                ],
            },
        )
    except Exception as e:
        return ToolResult(ok=False, summary=f"Error al construir reportes: {str(e)}", error="build_error")


def _review_report(ctx: AgentContext, args: ReviewReportArgs) -> ToolResult:
    """Get detailed report review with mappings, issues, and poliza preview."""
    from packages.modules.expenses.service.report_builder_service import get_report_detail

    detail = get_report_detail(ctx.db, args.report_id)
    if not detail:
        return ToolResult(ok=False, summary=f"Reporte {args.report_id} no encontrado.", error="not_found")

    report = detail["report"]
    issues = detail["issues"]
    mappings = detail["mappings"]

    critical = [i for i in issues if i.get("severity") == "critical" and not i.get("resolved")]
    warnings = [i for i in issues if i.get("severity") == "warning" and not i.get("resolved")]

    summary = f"Reporte {args.report_id}: {report['status']}, {report.get('expense_count', 0)} gastos"
    if critical:
        summary += f", {len(critical)} problema(s) crítico(s)"
    if warnings:
        summary += f", {len(warnings)} advertencia(s)"

    return ToolResult(
        ok=True,
        summary=summary,
        data=detail,
    )


def _resolve_issue(ctx: AgentContext, args: ResolveIssueArgs) -> ToolResult:
    """Resolve a flagged issue on a report. Requires confirmation."""
    from packages.modules.expenses.service.report_builder_service import resolve_report_issue

    try:
        updated = resolve_report_issue(
            db=ctx.db,
            report_id=args.report_id,
            issue_index=args.issue_index,
            resolved_by=ctx.user_id,
            resolution=args.resolution,
            action=args.action,
            new_account_code=args.new_account_code,
            exclude_expense_id=args.exclude_expense_id,
        )
        if not updated:
            return ToolResult(ok=False, summary=f"Reporte {args.report_id} no encontrado.", error="not_found")

        import json
        notes = json.loads(updated.notes or "[]")
        resolved = [n for n in notes if n.get("resolved")]
        unresolved = [n for n in notes if not n.get("resolved")]

        action_labels = {
            "acknowledge": "reconocido",
            "remap": f"remapeado a {args.new_account_code}",
            "exclude_expense": f"excluyendo gasto {args.exclude_expense_id}",
        }

        return ToolResult(
            ok=True,
            summary=f"Problema resuelto ({action_labels.get(args.action, args.action)}). "
                    f"Quedan {len(unresolved)} problema(s) pendiente(s).",
            data={
                "report_id": updated.id,
                "status": updated.status,
                "needs_accountant_review": updated.needs_accountant_review,
                "resolved_count": len(resolved),
                "unresolved_count": len(unresolved),
            },
        )
    except ValueError as e:
        return ToolResult(ok=False, summary=str(e), error="validation_error")
    except Exception as e:
        return ToolResult(ok=False, summary=f"Error al resolver: {str(e)}", error="resolve_error")


def _list_reports(ctx: AgentContext, args: ListReportsArgs) -> ToolResult:
    """List expense reports with optional filters."""
    from packages.modules.expenses.models.report import ExpenseReport

    query = ctx.db.query(ExpenseReport).filter(ExpenseReport.company_id == ctx.company_id)

    if args.status:
        query = query.filter(ExpenseReport.status == args.status)
    if args.needs_review is not None:
        query = query.filter(ExpenseReport.needs_accountant_review == args.needs_review)
    if args.user_id:
        query = query.filter(ExpenseReport.user_id == args.user_id)

    query = query.order_by(ExpenseReport.created_at.desc())
    reports = query.limit(50).all()

    import json

    def _parse_count(notes_str: str | None, severity: str) -> int:
        if not notes_str:
            return 0
        notes = json.loads(notes_str)
        return sum(1 for n in notes if n.get("severity") == severity and not n.get("resolved"))

    return ToolResult(
        ok=True,
        summary=f"{len(reports)} reporte(s) encontrado(s).",
        data={
            "reports": [
                {
                    "id": r.id,
                    "title": r.title,
                    "status": r.status,
                    "user_id": r.user_id,
                    "period_start": r.period_start.isoformat() if r.period_start else None,
                    "period_end": r.period_end.isoformat() if r.period_end else None,
                    "total_amount": str(r.total_amount) if r.total_amount else None,
                    "expense_count": r.expense_count,
                    "currency": r.currency,
                    "settlement_type": r.settlement_type,
                    "needs_accountant_review": r.needs_accountant_review,
                    "critical_issues": _parse_count(r.notes, "critical"),
                    "warning_issues": _parse_count(r.notes, "warning"),
                }
                for r in reports
            ],
        },
    )


def _get_poliza_preview(ctx: AgentContext, args: GetPolizaPreviewArgs) -> ToolResult:
    """Preview the aggregated poliza for all expenses in a report."""
    from packages.modules.expenses.models.report import ExpenseReport
    import json

    report = ctx.db.query(ExpenseReport).filter(
        ExpenseReport.id == args.report_id,
        ExpenseReport.company_id == ctx.company_id,
    ).first()
    if not report:
        return ToolResult(ok=False, summary=f"Reporte {args.report_id} no encontrado.", error="not_found")

    mapping_snapshot = json.loads(report.mapping_snapshot or "[]")

    all_lines = []
    total_debit = 0.0
    total_credit = 0.0
    for mapping in mapping_snapshot:
        lines = mapping.get("poliza_lines", [])
        for line in lines:
            all_lines.append({**line, "expense_id": mapping.get("expense_id")})
            total_debit += float(line.get("debit", 0))
            total_credit += float(line.get("credit", 0))

    balanced = abs(total_debit - total_credit) < 0.01

    return ToolResult(
        ok=True,
        summary=f"Vista previa póliza: {len(all_lines)} líneas, {'balanceado' if balanced else 'DESBALANCEADO'} "
                f"(debe={total_debit:.2f}, haber={total_credit:.2f})",
        data={
            "report_id": args.report_id,
            "lines": all_lines,
            "total_debit": f"{total_debit:.2f}",
            "total_credit": f"{total_credit:.2f}",
            "balanced": balanced,
            "expense_count": report.expense_count,
            "total_amount": str(report.total_amount) if report.total_amount else None,
        },
    )


# ── Registration ──────────────────────────────────────────────────────────────

_ACCT_PERSONAS = frozenset({"accounting", "admin"})

REGISTRY.register(ToolSpec(
    name="build_expense_reports",
    description="Construye reportes de gastos agrupando gastos aprobados por usuario y período. Pre-mapea cuentas contables, calcula IVA, convierte moneda, y genera vista previa de póliza. Marca problemas para revisión del contador. Requiere confirmación.",
    category="entity",
    input_schema=BuildReportsArgs,
    handler=_build_reports,
    personas=_ACCT_PERSONAS,
    destructive=True,
    requires_confirmation=True,
))

REGISTRY.register(ToolSpec(
    name="review_expense_report",
    description="Revisa un reporte de gastos con mapeos contables, problemas marcados, y vista previa de póliza. Muestra todo lo que el contador necesita revisar.",
    category="read",
    input_schema=ReviewReportArgs,
    handler=_review_report,
    personas=_ACCT_PERSONAS,
))

REGISTRY.register(ToolSpec(
    name="resolve_report_issue",
    description="Resuelve un problema marcado en un reporte de gastos. Acciones: acknowledge (reconocer), remap (remapear cuenta), exclude_expense (excluir gasto). Requiere confirmación.",
    category="config",
    input_schema=ResolveIssueArgs,
    handler=_resolve_issue,
    personas=_ACCT_PERSONAS,
    destructive=True,
    requires_confirmation=True,
))

REGISTRY.register(ToolSpec(
    name="list_expense_reports",
    description="Lista reportes de gastos con filtros opcionales. Usa needs_review=true para ver reportes que requieren atención del contador.",
    category="read",
    input_schema=ListReportsArgs,
    handler=_list_reports,
    personas=_ACCT_PERSONAS,
))

REGISTRY.register(ToolSpec(
    name="preview_poliza",
    description="Vista previa de la póliza agregada para un reporte de gastos. Muestra todas las líneas contables con debe/haber y verifica el balance.",
    category="read",
    input_schema=GetPolizaPreviewArgs,
    handler=_get_poliza_preview,
    personas=_ACCT_PERSONAS,
))
