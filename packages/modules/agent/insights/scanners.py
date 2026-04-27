"""Individual scanners. Cheap heuristic SQL — no ML."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import func
from sqlalchemy.orm import Session

from packages.core.platform.models_workflow_stage import WorkflowStage
from packages.core.platform.models_workflow_transition import WorkflowTransition
from packages.core.platform.models_user import User
from packages.modules.expenses.models.expense import Expense

from .runner import InsightCandidate


# ── 1. Stale drafts (>30 days in draft) ─────────────────────────────────────

def scan_stale_drafts(db: Session, company_id: int) -> list[InsightCandidate]:
    cutoff = datetime.now(timezone.utc) - timedelta(days=30)
    rows = (
        db.query(Expense)
        .filter(
            Expense.company_id == company_id,
            Expense.status == "draft",
            Expense.created_at < cutoff,
        )
        .limit(200)
        .all()
    )
    if not rows:
        return []
    ids = [r.id for r in rows]
    return [{
        "kind": "stale_drafts",
        "severity": "warn",
        "title": f"{len(ids)} gastos en borrador > 30 días",
        "body": "Hay gastos abandonados en estado 'draft' por más de 30 días. "
                "Considera revisarlos o descartarlos.",
        "data_json": {"expense_ids": ids[:50], "total": len(ids)},
        "suggested_prompt": "Muéstrame los gastos en borrador con más de 30 días y "
                            "ayúdame a cerrarlos.",
    }]


# ── 2. Orphan approvals (submitted but no manager action >7d) ──────────────

def scan_orphan_approvals(db: Session, company_id: int) -> list[InsightCandidate]:
    cutoff = datetime.now(timezone.utc) - timedelta(days=7)
    rows = (
        db.query(Expense)
        .filter(
            Expense.company_id == company_id,
            Expense.status == "submitted",
            Expense.created_at < cutoff,
        )
        .limit(200)
        .all()
    )
    if not rows:
        return []
    return [{
        "kind": "orphan_approvals",
        "severity": "warn",
        "title": f"{len(rows)} gastos esperando aprobación > 7 días",
        "body": "Gastos enviados que siguen sin aprobación del manager.",
        "data_json": {"expense_ids": [r.id for r in rows][:50], "total": len(rows)},
        "suggested_prompt": "Lista los gastos atascados en revisión del manager.",
    }]


# ── 3. Missing approvers (modules without any approver role) ───────────────

def scan_missing_approvers(db: Session, company_id: int) -> list[InsightCandidate]:
    # A module with stages but no transitions at all == broken flow.
    modules_with_stages = {
        m for (m,) in db.query(WorkflowStage.module_key)
        .filter(WorkflowStage.company_id == company_id)
        .distinct()
        .all()
    }
    modules_with_transitions = {
        m for (m,) in db.query(WorkflowTransition.module_key)
        .filter(WorkflowTransition.company_id == company_id)
        .distinct()
        .all()
    }
    missing = sorted(modules_with_stages - modules_with_transitions)
    if not missing:
        return []
    return [{
        "kind": "missing_approvers",
        "severity": "critical",
        "title": f"{len(missing)} módulos sin transiciones de aprobación",
        "body": f"Los módulos {', '.join(missing)} tienen etapas pero ninguna transición definida. "
                f"Los gastos se quedan atascados.",
        "data_json": {"modules": missing},
        "suggested_prompt": f"Crea un flujo de aprobación básico para el módulo {missing[0]}.",
    }]


# ── 4. Over-budget projects (if Project model + budget exists) ─────────────

def scan_over_budget_projects(db: Session, company_id: int) -> list[InsightCandidate]:
    try:
        from packages.core.platform.models_project import Project
    except Exception:
        return []
    # Sum expenses per project where expense has project_id.
    project_id_col = getattr(Expense, "project_id", None)
    budget_col = getattr(Project, "budget", None)
    if project_id_col is None or budget_col is None:
        return []
    spent = (
        db.query(project_id_col, func.coalesce(func.sum(Expense.amount), 0))
        .filter(Expense.company_id == company_id,
                Expense.status.in_(("approved", "manager_approved")))
        .group_by(project_id_col)
        .all()
    )
    project_ids = [pid for pid, _ in spent if pid is not None]
    projects_by_id = {
        p.id: p
        for p in db.query(Project).filter(Project.id.in_(project_ids)).all()
    }
    over: list[dict[str, Any]] = []
    for pid, total in spent:
        if pid is None:
            continue
        proj = projects_by_id.get(pid)
        if proj is None or not proj.budget:
            continue
        if float(total) > float(proj.budget):
            over.append({
                "project_id": pid,
                "name": getattr(proj, "name", None),
                "budget": float(proj.budget),
                "spent": float(total),
            })
    if not over:
        return []
    return [{
        "kind": "over_budget_projects",
        "severity": "critical",
        "title": f"{len(over)} proyectos sobre presupuesto",
        "body": "Uno o más proyectos han superado su presupuesto aprobado.",
        "data_json": {"projects": over[:20]},
        "suggested_prompt": f"Muéstrame el desglose del proyecto {over[0]['name']}.",
    }]


# ── 5. Duplicate expenses (same amount + date + employee within 24h) ───────

def scan_duplicate_expenses(db: Session, company_id: int) -> list[InsightCandidate]:
    employee_id_col = getattr(Expense, "employee_id", None) or getattr(Expense, "user_id", None)
    if employee_id_col is None:
        return []
    dup_groups = (
        db.query(
            employee_id_col,
            Expense.amount,
            Expense.expense_date,
            func.count(Expense.id).label("n"),
        )
        .filter(Expense.company_id == company_id)
        .group_by(employee_id_col, Expense.amount, Expense.expense_date)
        .having(func.count(Expense.id) > 1)
        .limit(50)
        .all()
    )
    if not dup_groups:
        return []
    return [{
        "kind": "duplicate_expenses",
        "severity": "warn",
        "title": f"{len(dup_groups)} posibles duplicados",
        "body": "Grupos de gastos con mismo empleado, monto y fecha — posibles duplicados.",
        "data_json": {"groups": [
            {"employee_id": g[0], "amount": float(g[1] or 0), "date": str(g[2]), "count": g[3]}
            for g in dup_groups
        ]},
        "suggested_prompt": "Revisa los gastos potencialmente duplicados y sugiere una acción.",
    }]


# ── 6. Policy drift (no expense_policy row or missing CFDI setting) ────────

def scan_policy_drift(db: Session, company_id: int) -> list[InsightCandidate]:
    from packages.core.platform.models_expense_policy import CompanyExpensePolicy
    row = (
        db.query(CompanyExpensePolicy)
        .filter(CompanyExpensePolicy.company_id == company_id)
        .one_or_none()
    )
    out: list[InsightCandidate] = []
    if row is None:
        out.append({
            "kind": "policy_drift",
            "severity": "warn",
            "title": "Política de gastos sin configurar",
            "body": "Esta empresa no tiene una fila de ExpensePolicy. Los defaults se aplican.",
            "data_json": None,
            "suggested_prompt": "Configura una política de gastos básica para esta empresa.",
        })
    return out


# ── 7. Unmatched Amex line aging (>14d unmatched) ──────────────────────────

def scan_unmatched_amex_aging(db: Session, company_id: int) -> list[InsightCandidate]:
    try:
        from packages.modules.amex.models import AmexStatementLine
    except Exception:
        return []
    cutoff = datetime.now(timezone.utc) - timedelta(days=14)
    rows = (
        db.query(AmexStatementLine)
        .filter(
            AmexStatementLine.company_id == company_id,
            AmexStatementLine.status == "unmatched",
            AmexStatementLine.created_at < cutoff,
        )
        .limit(200)
        .all()
    )
    if not rows:
        return []
    return [{
        "kind": "unmatched_amex_aging",
        "severity": "warn",
        "title": f"{len(rows)} líneas Amex sin emparejar > 14 días",
        "body": "Cargos de Amex que llevan más de dos semanas sin CFDI emparejado.",
        "data_json": {
            "line_ids": [r.id for r in rows][:50],
            "total": len(rows),
        },
        "suggested_prompt": "Lista las líneas Amex sin emparejar más antiguas y propón próximos pasos.",
    }]


# ── 8. Pending approval aging (>10d in submitted/manager_approved) ─────────

def scan_pending_approval_aging(db: Session, company_id: int) -> list[InsightCandidate]:
    cutoff = datetime.now(timezone.utc) - timedelta(days=10)
    rows = (
        db.query(Expense)
        .filter(
            Expense.company_id == company_id,
            Expense.status.in_(("submitted", "manager_approved")),
            Expense.created_at < cutoff,
        )
        .limit(200)
        .all()
    )
    if not rows:
        return []
    return [{
        "kind": "pending_approval_aging",
        "severity": "critical",
        "title": f"{len(rows)} gastos atascados en aprobación > 10 días",
        "body": "Gastos detenidos en alguna etapa de aprobación; revisa SLA por aprobador.",
        "data_json": {"expense_ids": [r.id for r in rows][:50], "total": len(rows)},
        "suggested_prompt": "Resume el SLA de aprobación por aprobador en los últimos 30 días.",
    }]


# ── 9. CFDIs cancelled but expense still active ────────────────────────────

def scan_cfdi_cancelled_unhandled(db: Session, company_id: int) -> list[InsightCandidate]:
    cfdi_status_col = getattr(Expense, "cfdi_status", None)
    if cfdi_status_col is None:
        return []
    rows = (
        db.query(Expense)
        .filter(
            Expense.company_id == company_id,
            cfdi_status_col == "Cancelado",
            Expense.status.in_(("submitted", "manager_approved", "approved")),
        )
        .limit(200)
        .all()
    )
    if not rows:
        return []
    return [{
        "kind": "cfdi_cancelled_unhandled",
        "severity": "critical",
        "title": f"{len(rows)} gastos con CFDI cancelado sin reemplazar",
        "body": "El SAT marcó estos CFDIs como Cancelado pero los gastos siguen vivos.",
        "data_json": {"expense_ids": [r.id for r in rows][:50], "total": len(rows)},
        "suggested_prompt": "Lista los gastos con CFDI cancelado y sugiere reposición.",
    }]


# ── 10. Routing SLA breach (Phase 5.5 escalation) ──────────────────────────

def scan_routing_sla_overdue(db: Session, company_id: int) -> list[InsightCandidate]:
    """Surfaces submitted/manager_approved expenses past their routing rule's
    ``sla_hours`` window. Reuses approval_routing_service.find_overdue.
    Best-effort — empty list on any error so the scanner never blocks the
    insight runner."""
    try:
        from packages.modules.expenses.service.approval_routing_service import (
            build_context_for_expense,
            find_overdue,
            list_rules_for_company,
        )
    except Exception:  # pragma: no cover — defensive
        return []
    rules = list_rules_for_company(db, company_id=company_id, enabled_only=True)
    if not rules:
        return []
    rows = (
        db.query(Expense)
        .filter(
            Expense.company_id == company_id,
            Expense.status.in_(("submitted", "manager_approved")),
        )
        .limit(500)
        .all()
    )
    if not rows:
        return []
    triples = [
        (r.id, r.status, r.created_at, build_context_for_expense(r))
        for r in rows
        if r.created_at is not None
    ]
    overdue = find_overdue(db, expenses_with_ctx=triples, rules=rules)
    if not overdue:
        return []
    return [{
        "kind": "routing_sla_overdue",
        "severity": "critical",
        "title": f"{len(overdue)} gastos rebasaron SLA de aprobación",
        "body": "Reglas de routing marcaron estos gastos como atrasados; revisa escalación.",
        "data_json": {
            "items": [
                {
                    "expense_id": o.expense_id,
                    "rule_id": o.rule_id,
                    "age_hours": o.age_hours,
                    "sla_hours": o.sla_hours,
                    "escalation_role": o.escalation_role,
                }
                for o in overdue[:50]
            ],
            "total": len(overdue),
        },
        "suggested_prompt": "Lista los gastos vencidos por SLA y sugiere a quién escalar.",
    }]
