"""Phase 5.5 — approval routing rule engine + SLA escalation.

Pure-Python rule evaluator over a context dict. Rules look like::

    {
      "id": "high-value-travel",
      "priority": 10,
      "when": {
        "all": [
          {"field": "amount", "op": "gte", "value": 5000},
          {"field": "category_code", "op": "eq", "value": "travel"}
        ]
      },
      "approvers": [{"role": "cfo"}, {"user_id": 42}],
      "sla_hours": 48,
      "escalation_role": "cfo"
    }

Supported operators: eq, ne, gt, gte, lt, lte, in, not_in.

A rule matches when its ``when`` block matches the context. The first matching
rule (by ``priority`` desc, then list order) wins.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from packages.core.platform.models_audit import AuditLog
from packages.core.platform.models_user import User


_OPS = {
    "eq": lambda a, b: a == b,
    "ne": lambda a, b: a != b,
    "gt": lambda a, b: a is not None and a > b,
    "gte": lambda a, b: a is not None and a >= b,
    "lt": lambda a, b: a is not None and a < b,
    "lte": lambda a, b: a is not None and a <= b,
    "in": lambda a, b: a in b,
    "not_in": lambda a, b: a not in b,
}


def _eval_predicate(pred: dict[str, Any], ctx: dict[str, Any]) -> bool:
    if "all" in pred:
        return all(_eval_predicate(p, ctx) for p in pred["all"])
    if "any" in pred:
        return any(_eval_predicate(p, ctx) for p in pred["any"])
    op = pred.get("op", "eq")
    fn = _OPS.get(op)
    if fn is None:
        return False
    return bool(fn(ctx.get(pred["field"]), pred["value"]))


def evaluate_when(when: dict[str, Any] | None, ctx: dict[str, Any]) -> bool:
    if not when:
        return True
    return _eval_predicate(when, ctx)


def match_rule(
    rules: list[dict[str, Any]], ctx: dict[str, Any]
) -> dict[str, Any] | None:
    sorted_rules = sorted(
        enumerate(rules), key=lambda kv: (-int(kv[1].get("priority", 0)), kv[0])
    )
    for _, rule in sorted_rules:
        if evaluate_when(rule.get("when"), ctx):
            return rule
    return None


def apply_delegation(db: Session, user_id: int, *, max_depth: int = 5) -> int:
    """Walk ``User.delegates_for_user_id`` until None or max_depth, with cycle
    protection. Returns the final approver user_id."""
    seen: set[int] = set()
    current = user_id
    for _ in range(max_depth):
        if current in seen:
            return current
        seen.add(current)
        u = db.query(User).filter(User.id == current).first()
        if u is None or not u.delegates_for_user_id:
            return current
        current = u.delegates_for_user_id
    return current


@dataclass
class ResolvedApprovers:
    rule_id: str | None
    approver_user_ids: list[int] = field(default_factory=list)
    approver_roles: list[str] = field(default_factory=list)
    sla_hours: int | None = None
    escalation_role: str | None = None


def resolve_approvers(
    db: Session, *, context: dict[str, Any], rules: list[dict[str, Any]]
) -> ResolvedApprovers:
    rule = match_rule(rules, context)
    if rule is None:
        return ResolvedApprovers(rule_id=None)
    user_ids: list[int] = []
    roles: list[str] = []
    for spec in rule.get("approvers", []) or []:
        if uid := spec.get("user_id"):
            user_ids.append(apply_delegation(db, int(uid)))
        if role := spec.get("role"):
            roles.append(str(role))
    # de-dup preserving order
    seen: set[int] = set()
    deduped_ids = [u for u in user_ids if not (u in seen or seen.add(u))]
    return ResolvedApprovers(
        rule_id=rule.get("id"),
        approver_user_ids=deduped_ids,
        approver_roles=roles,
        sla_hours=rule.get("sla_hours"),
        escalation_role=rule.get("escalation_role"),
    )


# ── SLA escalation ──────────────────────────────────────────────────────────

_PENDING_STATUSES = ("submitted", "manager_approved")


@dataclass
class OverdueExpense:
    expense_id: int
    status: str
    stage_entered_at: datetime
    age_hours: float
    sla_hours: int
    escalation_role: str | None
    rule_id: str | None


def _last_status_change_at(
    db: Session, *, expense_id: int, target_status: str
) -> datetime | None:
    row = db.execute(
        select(AuditLog.created_at)
        .where(
            AuditLog.entity_type == "expense",
            AuditLog.entity_id == expense_id,
            AuditLog.action == "status_change",
            AuditLog.detail_text.like(f"%→ {target_status}%"),
        )
        .order_by(AuditLog.id.desc())
        .limit(1)
    ).first()
    return row[0] if row else None


def find_overdue(
    db: Session,
    *,
    expenses_with_ctx: list[tuple[int, str, datetime, dict[str, Any]]],
    rules: list[dict[str, Any]],
    now: datetime | None = None,
) -> list[OverdueExpense]:
    """Given (expense_id, status, stage_entered_at, context) tuples, return
    overdue ones based on each rule's ``sla_hours``.

    Caller is responsible for passing the candidate set (e.g., all submitted
    or manager_approved expenses for a company). Stage entry timestamps may
    come from audit log via ``_last_status_change_at`` or from a tracked
    column on the expense.
    """
    now = now or datetime.utcnow()
    out: list[OverdueExpense] = []
    for exp_id, status, entered_at, ctx in expenses_with_ctx:
        if status not in _PENDING_STATUSES:
            continue
        rule = match_rule(rules, ctx)
        if rule is None:
            continue
        sla_hours = rule.get("sla_hours")
        if not sla_hours:
            continue
        age = now - entered_at
        if age >= timedelta(hours=int(sla_hours)):
            out.append(OverdueExpense(
                expense_id=exp_id,
                status=status,
                stage_entered_at=entered_at,
                age_hours=round(age.total_seconds() / 3600, 2),
                sla_hours=int(sla_hours),
                escalation_role=rule.get("escalation_role"),
                rule_id=rule.get("id"),
            ))
    return out


# ── Persistence helpers (Phase 5.5 follow-up) ─────────────────────────────


def list_rules_for_company(
    db: Session, *, company_id: int, enabled_only: bool = True
) -> list[dict[str, Any]]:
    """Load ``ApprovalRoutingRule`` rows for a company and return rule dicts
    in the shape ``match_rule`` expects. Rows are deterministically ordered
    by priority desc then rule_key asc."""
    from packages.modules.expenses.models_routing import ApprovalRoutingRule

    stmt = select(ApprovalRoutingRule).where(
        ApprovalRoutingRule.company_id == company_id
    )
    if enabled_only:
        stmt = stmt.where(ApprovalRoutingRule.is_enabled.is_(True))
    stmt = stmt.order_by(
        ApprovalRoutingRule.priority.desc(), ApprovalRoutingRule.rule_key.asc()
    )
    rows = list(db.execute(stmt).scalars())
    return [
        {
            "id": r.rule_key,
            "priority": int(r.priority or 0),
            "when": r.when_json or {},
            "approvers": r.approvers_json or [],
            "sla_hours": r.sla_hours,
            "escalation_role": r.escalation_role,
        }
        for r in rows
    ]
