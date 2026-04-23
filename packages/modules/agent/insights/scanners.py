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
    over: list[dict[str, Any]] = []
    for pid, total in spent:
        if pid is None:
            continue
        proj = db.query(Project).filter(Project.id == pid).one_or_none()
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
