"""Phase 8.5 — daily insight digest email job.

Iterates every company, runs the agent insight scanners, and emails a
top-N digest of open insights to each finance role recipient (admin,
finance_manager). Channel preference gating uses
``UserNotificationPreference`` with the wildcard fallback.

Idempotent per calendar day via ``event_type`` postfix; safe to re-run.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from apps.api.config import settings
from packages.core.platform.models import Company
from packages.core.platform.models_user import User
from packages.modules.agent.insights import run_for_all_companies
from packages.modules.agent.models import AgentInsight
from packages.modules.channels.render import render_email
from packages.modules.channels.service.notifier import (
    NotifyRequest,
    Recipient,
    send,
)
from packages.modules.channels.service.preferences import is_channel_enabled

log = logging.getLogger(__name__)

DIGEST_EVENT_TYPE = "agent.daily_insight_digest"
_FINANCE_ROLES = ("admin", "finance_manager")
_TOP_N = 10
_SEVERITY_RANK = {"critical": 0, "warn": 1, "info": 2}


def _insights_panel_link() -> str:
    return f"{settings.web_base_url.rstrip('/')}/admin/agent/insights"


def _recipients_for_company(db: Session, company_id: int) -> list[User]:
    return (
        db.query(User)
        .filter(
            User.company_id == company_id,
            User.role.in_(_FINANCE_ROLES),
            User.is_active.is_(True),
            User.email.isnot(None),
        )
        .all()
    )


def _open_insights(db: Session, company_id: int) -> list[AgentInsight]:
    rows = (
        db.query(AgentInsight)
        .filter(
            AgentInsight.company_id == company_id,
            AgentInsight.status == "open",
        )
        .all()
    )
    rows.sort(key=lambda r: (_SEVERITY_RANK.get(r.severity, 9), -(r.id or 0)))
    return rows[:_TOP_N]


def run_daily_insight_digest(
    db: Session,
    *,
    today: datetime | None = None,
    rescan: bool = True,
) -> int:
    """Send the digest. Returns the total dispatch count."""
    today = today or datetime.now(tz=timezone.utc)
    if rescan:
        try:
            run_for_all_companies(db)
        except Exception:
            log.exception("scanner pre-run failed")

    sent = 0
    digest_key = today.strftime("%Y-%m-%d")
    event_type = f"{DIGEST_EVENT_TYPE}.{digest_key}"

    for company in db.query(Company).all():
        try:
            insights = _open_insights(db, company.id)
            if not insights:
                continue
            recipients = _recipients_for_company(db, company.id)
            for user in recipients:
                if not is_channel_enabled(db, user.id, DIGEST_EVENT_TYPE, "email"):
                    continue
                ctx = {
                    "recipient": user,
                    "insights": insights,
                    "link": _insights_panel_link(),
                }
                locale = getattr(user, "preferred_locale", None) or "es"
                msg = render_email("daily_insight_digest_email", locale, ctx)
                rows = send(
                    db,
                    NotifyRequest(
                        company_id=company.id,
                        event_type=event_type,
                        resource_type="agent_insight_digest",
                        resource_id=user.id,
                        recipients=[Recipient(user_id=user.id, email=user.email, whatsapp=None)],
                        message=msg,
                        channels=("email",),
                    ),
                )
                sent += len(rows)
        except Exception:
            log.exception("insight digest failed for company %s", company.id)
    return sent
