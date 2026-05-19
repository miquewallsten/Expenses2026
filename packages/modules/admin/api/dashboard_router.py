"""Admin Config Overview dashboard — live system health, insights, and activity."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import func as sa_func
from sqlalchemy.orm import Session

from apps.api.auth import get_current_user, require_admin, require_same_company
from apps.api.deps import get_db
from packages.core.platform.models_user import User
from packages.core.platform.service.tenant_validator import VALIDATOR
from packages.modules.agent.models import AgentInsight, AgentUsage

router = APIRouter(
    prefix="/admin/dashboard",
    tags=["admin-dashboard"],
    dependencies=[Depends(require_admin)],
)


@router.get("/{company_id}/health")
def dashboard_health(company_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    require_same_company(company_id, current_user)
    
    # ── Readiness ───────────────────────────────────────────────────────────
    report = VALIDATOR.validate_company(db, company_id)
    blockers = [
        {"module": g.module, "message": g.message, "severity": g.severity, "wizard_step": g.wizard_step}
        for g in report.blockers[:10]
    ]
    warnings = [
        {"module": g.module, "message": g.message, "severity": g.severity, "wizard_step": g.wizard_step}
        for g in report.warnings[:10]
    ]

    # ── Open agent insights ─────────────────────────────────────────────────
    open_insights = (
        db.query(AgentInsight)
        .filter(
            AgentInsight.company_id == company_id,
            AgentInsight.status == "open",
        )
        .order_by(AgentInsight.severity.desc(), AgentInsight.created_at.desc())
        .limit(20)
        .all()
    )
    insights_data = [
        {
            "id": i.id,
            "kind": i.kind,
            "severity": i.severity,
            "title": i.title,
            "body": i.body[:200] if i.body else "",
            "suggested_prompt": i.suggested_prompt,
            "created_at": i.created_at.isoformat() if i.created_at else None,
        }
        for i in open_insights
    ]

    # ── Agent activity (last 24h) ──────────────────────────────────────────
    yesterday = datetime.now(tz=timezone.utc) - timedelta(days=1)
    agent_turns_24h = (
        db.query(sa_func.count(AgentUsage.id))
        .filter(AgentUsage.company_id == company_id, AgentUsage.created_at >= yesterday)
        .scalar()
    ) or 0

    agent_errors_24h = (
        db.query(sa_func.count(AgentUsage.id))
        .filter(
            AgentUsage.company_id == company_id,
            AgentUsage.created_at >= yesterday,
            AgentUsage.ok == 0,  # integer column, not boolean
        )
        .scalar()
    ) or 0

    # ── Active users (logged in within 7 days) ──────────────────────────────
    week_ago = datetime.now(tz=timezone.utc) - timedelta(days=7)
    active_users = (
        db.query(sa_func.count(User.id.distinct()))
        .filter(User.company_id == company_id, User.last_login_at >= week_ago)
        .scalar()
    ) or 0

    total_users = (
        db.query(sa_func.count(User.id))
        .filter(User.company_id == company_id, User.is_active == True)  # noqa: E712
        .scalar()
    ) or 0

    return {
        "readiness": {
            "ok": report.ok,
            "blockers": blockers,
            "warnings": warnings,
        },
        "insights": insights_data,
        "insights_open_count": len(open_insights),
        "activity": {
            "agent_turns_24h": agent_turns_24h,
            "agent_errors_24h": agent_errors_24h,
            "active_users": active_users,
            "total_users": total_users,
        },
    }
