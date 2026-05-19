"""WhatsApp/Channel time tracking submission tool.

Lets employees submit time entries via WhatsApp:
  "Horas proyecto Alpha 8h hoy"
  "8 horas Proyecto 5 lunes"
"""

from __future__ import annotations

import logging
import re
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from packages.core.platform.models_time_tracking import TimeProject, TimeEntry
from packages.core.platform.models_user import User

from ...core.context import AgentContext
from ...core.registry import REGISTRY, ToolResult, ToolSpec

_log = logging.getLogger(__name__)


# ── submit_time_entry ────────────────────────────────────────────────────────

class _TimeEntryArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    project_id: int = Field(..., ge=1, description="ID del proyecto")
    hours: float = Field(..., gt=0, le=24, description="Horas trabajadas")
    entry_date: str | None = Field(default=None, description="Fecha YYYY-MM-DD, default hoy")
    description: str | None = Field(default=None, max_length=500)
    activity_id: int | None = Field(default=None, description="ID de la actividad (opcional)")


def _handle_submit_time(ctx: AgentContext, args: _TimeEntryArgs) -> ToolResult:
    if not ctx.can_create_expenses:
        return ToolResult(ok=False, summary="No tienes permiso para registrar horas.", error="permission_denied")

    # Parse date
    if args.entry_date:
        try:
            entry_date = date.fromisoformat(args.entry_date)
        except ValueError:
            return ToolResult(ok=False, summary="Fecha inválida. Usa YYYY-MM-DD.", error="invalid_date")
    else:
        entry_date = date.today()

    # Validate project exists and belongs to company
    project = ctx.db.query(TimeProject).filter(
        TimeProject.id == args.project_id,
        TimeProject.company_id == ctx.company_id,
    ).first()
    if not project:
        return ToolResult(ok=False, summary=f"Proyecto {args.project_id} no encontrado.", error="not_found")

    # Calculate week_start (ISO Monday)
    week_start = entry_date - timedelta(days=entry_date.weekday())

    # Get user name
    user = ctx.db.query(User).filter(User.id == ctx.user_id).first()
    user_name = user.full_name if user and hasattr(user, "full_name") else None

    from packages.modules.time_tracking import service as tt_svc
    from packages.modules.time_tracking.schemas import TimeEntryUpsert

    upsert = TimeEntryUpsert(
        project_id=args.project_id,
        activity_id=args.activity_id,
        entry_date=entry_date,
        hours=Decimal(str(args.hours)),
        description=args.description,
    )

    try:
        entry = tt_svc.upsert_entry(ctx.db, ctx.company_id, ctx.user_id, user_name, upsert)
        return ToolResult(
            ok=True,
            summary=f"Registradas {args.hours}h en «{project.name}» para el {entry_date.isoformat()}. Estado: {entry.status}",
            data={
                "entry_id": entry.id,
                "project": project.name,
                "hours": float(entry.hours),
                "date": entry_date.isoformat(),
                "status": entry.status,
                "week_start": week_start.isoformat(),
            },
        )
    except ValueError as exc:
        return ToolResult(ok=False, summary=str(exc), error="conflict")
    except Exception as exc:
        _log.exception("Time entry submission failed")
        return ToolResult(ok=False, summary=f"Error al registrar horas: {exc}", error=str(exc))


REGISTRY.register(ToolSpec(
    name="submit_time_entry",
    description="Registra horas trabajadas en un proyecto. Requiere project_id y horas. Fecha opcional (default: hoy).",
    category="entity",
    input_schema=_TimeEntryArgs,
    handler=_handle_submit_time,
    personas=frozenset({"admin"}),
    required_module="time_allocation",
))


# ── submit_time_week ──────────────────────────────────────────────────────────

class _SubmitWeekArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    week_start: str = Field(..., description="Lunes de la semana (YYYY-MM-DD)")


def _handle_submit_week(ctx: AgentContext, args: _SubmitWeekArgs) -> ToolResult:
    if not ctx.can_create_expenses:
        return ToolResult(ok=False, summary="No tienes permiso para enviar horas.", error="permission_denied")

    try:
        week_start = date.fromisoformat(args.week_start)
    except ValueError:
        return ToolResult(ok=False, summary="Fecha inválida. Usa YYYY-MM-DD.", error="invalid_date")

    from packages.modules.time_tracking import service as tt_svc
    count = tt_svc.submit_week(ctx.db, ctx.company_id, ctx.user_id, week_start)
    return ToolResult(
        ok=True,
        summary=f"Semana del {args.week_start} enviada para aprobación. {count} entradas.",
        data={"submitted": count, "week_start": args.week_start},
    )


REGISTRY.register(ToolSpec(
    name="submit_time_week",
    description="Envía la semana de horas para aprobación. Requiere fecha del lunes (YYYY-MM-DD).",
    category="entity",
    input_schema=_SubmitWeekArgs,
    handler=_handle_submit_week,
    personas=frozenset({"admin"}),
    required_module="time_allocation",
))


# ── list_my_projects ─────────────────────────────────────────────────────────

class _ListProjectsArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")


def _handle_list_projects(ctx: AgentContext, _args: _ListProjectsArgs) -> ToolResult:
    from packages.modules.time_tracking import service as tt_svc
    projects = tt_svc.list_projects(ctx.db, ctx.company_id)
    out = [
        {
            "id": p.id,
            "name": p.name,
            "code": p.code,
            "status": p.status,
            "budget_hours": float(p.budget_hours) if p.budget_hours else None,
        }
        for p in projects
    ]
    return ToolResult(
        ok=True,
        summary=f"{len(out)} proyectos disponibles",
        data={"projects": out, "count": len(out)},
    )


REGISTRY.register(ToolSpec(
    name="list_time_projects",
    description="Lista los proyectos disponibles para registrar horas.",
    category="read",
    input_schema=_ListProjectsArgs,
    handler=_handle_list_projects,
    personas=frozenset({"accounting", "admin"}),
    required_module="time_allocation",
))


# ── my_week_summary ──────────────────────────────────────────────────────────

class _WeekSummaryArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    week_start: str | None = Field(default=None, description="Lunes de la semana (YYYY-MM-DD). Default: esta semana.")


def _handle_week_summary(ctx: AgentContext, args: _WeekSummaryArgs) -> ToolResult:
    if args.week_start:
        try:
            ws = date.fromisoformat(args.week_start)
        except ValueError:
            return ToolResult(ok=False, summary="Fecha inválida.", error="invalid_date")
    else:
        today = date.today()
        ws = today - timedelta(days=today.weekday())

    from packages.modules.time_tracking import service as tt_svc
    view = tt_svc.get_week_view(ctx.db, ctx.company_id, ctx.user_id, ws)
    return ToolResult(
        ok=True,
        summary=f"Semana del {ws.isoformat()}: {float(view.week_total)}h total, estado {view.week_status}",
        data={
            "week_start": view.week_start.isoformat(),
            "week_end": view.week_end.isoformat(),
            "week_total": float(view.week_total),
            "week_status": view.week_status,
            "rows": [
                {
                    "project": r.project_name,
                    "hours": {k: float(v) for k, v in r.hours.items()},
                    "statuses": r.statuses,
                }
                for r in view.rows
            ],
        },
    )


REGISTRY.register(ToolSpec(
    name="my_week_summary",
    description="Resumen de horas de la semana actual o especificada.",
    category="read",
    input_schema=_WeekSummaryArgs,
    handler=_handle_week_summary,
    personas=frozenset({"admin"}),
    required_module="time_allocation",
))
