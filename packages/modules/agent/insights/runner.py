"""Insight scanner runner — calls each scanner and writes findings to DB."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any, Callable, TypedDict

from sqlalchemy.orm import Session

from ..models import AgentInsight


class InsightCandidate(TypedDict, total=False):
    kind: str
    severity: str  # info | warn | critical
    title: str
    body: str
    data_json: dict[str, Any] | None
    suggested_prompt: str | None


Scanner = Callable[[Session, int], list[InsightCandidate]]


def _scanners() -> list[Scanner]:
    # Imported lazily to avoid import cycles.
    from .scanners import (
        scan_orphan_approvals,
        scan_stale_drafts,
        scan_missing_approvers,
        scan_over_budget_projects,
        scan_duplicate_expenses,
        scan_policy_drift,
        scan_unmatched_amex_aging,
        scan_pending_approval_aging,
        scan_cfdi_cancelled_unhandled,
        scan_routing_sla_overdue,
    )
    return [
        scan_stale_drafts,
        scan_orphan_approvals,
        scan_missing_approvers,
        scan_over_budget_projects,
        scan_duplicate_expenses,
        scan_policy_drift,
        scan_unmatched_amex_aging,
        scan_pending_approval_aging,
        scan_cfdi_cancelled_unhandled,
        scan_routing_sla_overdue,
    ]


def run_scanners(db: Session, company_id: int, *, persist: bool = True) -> list[AgentInsight]:
    """Run every scanner; upsert findings into ``agent_insights`` (open only).

    Returns the full current set of open rows for the company.
    """
    # First clear stale "open" rows for kinds we're about to rescan —
    # scanners are idempotent.
    findings: list[InsightCandidate] = []
    for scanner in _scanners():
        try:
            findings.extend(scanner(db, company_id) or [])
        except Exception as e:  # noqa: BLE001
            # One broken scanner must not block the rest.
            findings.append({
                "kind": "scanner_error",
                "severity": "warn",
                "title": f"Scanner {scanner.__name__} falló",
                "body": str(e)[:500],
                "data_json": None,
                "suggested_prompt": None,
            })
    if not persist:
        # Return ephemeral AgentInsight-shaped rows (not added to session).
        return [_candidate_to_row(company_id, c) for c in findings]
    scanned_kinds = {f["kind"] for f in findings}
    for kind in scanned_kinds:
        db.query(AgentInsight).filter(
            AgentInsight.company_id == company_id,
            AgentInsight.kind == kind,
            AgentInsight.status == "open",
        ).delete(synchronize_session=False)
    for c in findings:
        db.add(_candidate_to_row(company_id, c))
    db.commit()
    return (
        db.query(AgentInsight)
        .filter(AgentInsight.company_id == company_id, AgentInsight.status == "open")
        .order_by(AgentInsight.created_at.desc())
        .all()
    )


def _candidate_to_row(company_id: int, c: InsightCandidate) -> AgentInsight:
    return AgentInsight(
        company_id=company_id,
        kind=c.get("kind", "other"),
        severity=c.get("severity", "info"),
        title=c.get("title", ""),
        body=c.get("body", ""),
        data_json=json.dumps(c.get("data_json"), default=str) if c.get("data_json") else None,
        suggested_prompt=c.get("suggested_prompt"),
        status="open",
    )


def run_for_all_companies(db: Session) -> dict[int, int]:
    """Run every scanner for every company. Returns ``{company_id: open_count}``.

    Failures on one company do not block the rest.
    """
    from packages.core.platform.models import Company

    out: dict[int, int] = {}
    for (cid,) in db.query(Company.id).all():
        try:
            rows = run_scanners(db, cid)
            out[cid] = len(rows)
        except Exception:  # noqa: BLE001
            db.rollback()
            out[cid] = -1
    return out
