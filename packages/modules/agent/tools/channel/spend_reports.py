"""WhatsApp/Channel spend report tools.

Lets managers and directors ask questions like:
  "¿Cuánto gastamos en el Proyecto Alpha el mes pasado?"
  "Total de gastos aprobados esta semana"
  "Gastos pendientes de aprobar"
"""

from __future__ import annotations

import logging
from datetime import date, timedelta
from decimal import Decimal
from typing import Any

from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import func, extract

from packages.modules.expenses.models.expense import Expense

from ...core.context import AgentContext
from ...core.registry import REGISTRY, ToolResult, ToolSpec

_log = logging.getLogger(__name__)


# ── spend_summary ────────────────────────────────────────────────────────────

class _SpendSummaryArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    period: str = Field(default="month", description="Período: 'today', 'week', 'month', 'quarter', 'year'")
    status: str = Field(default="approved", description="Estado de gastos: approved, submitted, all")


def _date_range(period: str) -> tuple[date, date]:
    today = date.today()
    if period == "today":
        return today, today
    elif period == "week":
        start = today - timedelta(days=today.weekday())
        return start, today
    elif period == "month":
        return today.replace(day=1), today
    elif period == "quarter":
        q = (today.month - 1) // 3
        return date(today.year, q * 3 + 1, 1), today
    elif period == "year":
        return date(today.year, 1, 1), today
    else:
        return today.replace(day=1), today


def _handle_spend_summary(ctx: AgentContext, args: _SpendSummaryArgs) -> ToolResult:
    start, end = _date_range(args.period)
    q = ctx.db.query(Expense).filter(
        Expense.company_id == ctx.company_id,
        Expense.expense_date >= start,
        Expense.expense_date <= end,
    )
    if args.status != "all":
        q = q.filter(Expense.status == args.status)

    rows = q.all()
    total = sum(float(e.amount_mxn or e.amount) for e in rows) if rows else 0.0
    count = len(rows)

    # Breakdown by category
    by_category: dict[str, dict] = {}
    for e in rows:
        cat = e.category_code or "sin_categoría"
        if cat not in by_category:
            by_category[cat] = {"total": 0.0, "count": 0}
        by_category[cat]["total"] += float(e.amount_mxn or e.amount)
        by_category[cat]["count"] += 1

    period_labels = {
        "today": "hoy",
        "week": "esta semana",
        "month": "este mes",
        "quarter": "este trimestre",
        "year": "este año",
    }
    label = period_labels.get(args.period, args.period)

    return ToolResult(
        ok=True,
        summary=f"Gastos {args.status} {label}: ${total:,.2f} MXN en {count} gastos",
        data={
            "period": args.period,
            "date_from": start.isoformat(),
            "date_to": end.isoformat(),
            "status_filter": args.status,
            "total": total,
            "count": count,
            "by_category": by_category,
        },
    )


REGISTRY.register(ToolSpec(
    name="spend_summary",
    description="Resumen de gastos por período (today/week/month/quarter/year) y estado.",
    category="read",
    input_schema=_SpendSummaryArgs,
    handler=_handle_spend_summary,
    personas=frozenset({"accounting", "admin"}),
))


# ── spend_by_project ─────────────────────────────────────────────────────────

class _SpendByProjectArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    project_id: int | None = Field(default=None, description="ID del proyecto (opcional, sin esto muestra todos)")
    period: str = Field(default="month", description="Período: today/week/month/quarter/year")


def _handle_spend_by_project(ctx: AgentContext, args: _SpendByProjectArgs) -> ToolResult:
    start, end = _date_range(args.period)
    q = ctx.db.query(Expense).filter(
        Expense.company_id == ctx.company_id,
        Expense.expense_date >= start,
        Expense.expense_date <= end,
        Expense.status == "approved",
    )
    if args.project_id:
        q = q.filter(Expense.project_id == args.project_id)

    rows = q.all()

    # Group by project
    by_project: dict[int | str, dict] = {}
    for e in rows:
        pid = e.project_id or "sin_proyecto"
        if pid not in by_project:
            by_project[pid] = {"total": 0.0, "count": 0, "description": f"Project {pid}"}
        by_project[pid]["total"] += float(e.amount_mxn or e.amount)
        by_project[pid]["count"] += 1

    # Try to get project names
    if by_project:
        from packages.core.platform.models_project import Project
        pids = [k for k in by_project.keys() if isinstance(k, int)]
        if pids:
            projects = ctx.db.query(Project).filter(Project.id.in_(pids)).all()
            for p in projects:
                if p.id in by_project:
                    by_project[p.id]["description"] = p.name

    period_labels = {
        "today": "hoy", "week": "esta semana", "month": "este mes",
        "quarter": "este trimestre", "year": "este año",
    }
    label = period_labels.get(args.period, args.period)

    total = sum(v["total"] for v in by_project.values())

    project_name = None
    if args.project_id and args.project_id in by_project:
        project_name = by_project[args.project_id]["description"]

    summary = f"Gastos aprobados {label}"
    if project_name:
        summary += f" en «{project_name}»"
    summary += f": ${total:,.2f} MXN"

    return ToolResult(
        ok=True,
        summary=summary,
        data={
            "period": args.period,
            "date_from": start.isoformat(),
            "date_to": end.isoformat(),
            "total": total,
            "projects": by_project,
        },
    )


REGISTRY.register(ToolSpec(
    name="spend_by_project",
    description="Gastos aprobados por proyecto y período. Sin project_id muestra todos.",
    category="read",
    input_schema=_SpendByProjectArgs,
    handler=_handle_spend_by_project,
    personas=frozenset({"accounting", "admin"}),
))


# ── time_report_summary ───────────────────────────────────────────────────────

class _TimeReportArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    project_id: int = Field(..., description="ID del proyecto")
    period: str = Field(default="month", description="Período: week/month/quarter")


def _handle_time_report(ctx: AgentContext, args: _TimeReportArgs) -> ToolResult:
    from packages.modules.time_tracking import service as tt_svc
    from packages.modules.time_tracking.schemas import ProjectReport

    start, end = _date_range(args.period)
    report = tt_svc.project_report(ctx.db, ctx.company_id, args.project_id, start, end)

    if report is None:
        return ToolResult(ok=False, summary=f"Proyecto {args.project_id} no encontrado.", error="not_found")

    summary = (
        f"Proyecto «{report.project_name}»: "
        f"{float(report.logged_hours)}h registradas, "
        f"{float(report.approved_hours)}h aprobadas"
    )
    if report.budget_hours:
        summary += f" de {float(report.budget_hours)}h presupuestadas ({report.utilization_pct:.0f}% utilización)"

    return ToolResult(
        ok=True,
        summary=summary,
        data=report.model_dump(),
    )


REGISTRY.register(ToolSpec(
    name="time_report_summary",
    description="Reporte de horas por proyecto (registradas, aprobadas, presupuesto).",
    category="read",
    input_schema=_TimeReportArgs,
    handler=_handle_time_report,
    personas=frozenset({"accounting", "admin"}),
))
