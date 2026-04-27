"""Per-tenant AI governance service (Phase 8.10).

Single entry-point for the engine and admin endpoints to read/write the
``CompanyAiGovernancePolicy`` row. All mutations write an AuditLog entry.
"""

from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

from packages.core.platform.models_ai_governance import (
    PII_LEVELS, CompanyAiGovernancePolicy,
)
from packages.core.platform.models_audit import AuditLog


_VALID_FIELDS = {
    "ai_enabled", "allowed_models", "pii_redaction_level",
    "max_tokens_per_call", "monthly_token_budget", "notes",
}


def get_or_create(db: Session, company_id: int) -> CompanyAiGovernancePolicy:
    row = (
        db.query(CompanyAiGovernancePolicy)
        .filter(CompanyAiGovernancePolicy.company_id == company_id)
        .one_or_none()
    )
    if row is not None:
        return row
    row = CompanyAiGovernancePolicy(company_id=company_id)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def to_dict(row: CompanyAiGovernancePolicy) -> dict[str, Any]:
    return {
        "company_id":           row.company_id,
        "ai_enabled":           row.ai_enabled,
        "allowed_models":       row.allowed_models,
        "pii_redaction_level":  row.pii_redaction_level,
        "max_tokens_per_call":  row.max_tokens_per_call,
        "monthly_token_budget": row.monthly_token_budget,
        "notes":                row.notes,
    }


def update(
    db: Session,
    *,
    company_id: int,
    actor_user_id: int | None,
    patch: dict[str, Any],
) -> CompanyAiGovernancePolicy:
    """Apply a validated patch and audit the change."""
    row = get_or_create(db, company_id)
    before = to_dict(row)
    changed: dict[str, Any] = {}

    for k, v in patch.items():
        if k not in _VALID_FIELDS or v is None:
            continue
        if k == "pii_redaction_level" and v not in PII_LEVELS:
            raise ValueError(f"invalid pii_redaction_level: {v!r}")
        if k in ("max_tokens_per_call", "monthly_token_budget"):
            try:
                v = int(v)
            except (TypeError, ValueError):
                raise ValueError(f"{k} must be int")
            if v < 0:
                raise ValueError(f"{k} must be ≥ 0")
        if k == "ai_enabled":
            v = bool(v)
        if getattr(row, k) != v:
            setattr(row, k, v)
            changed[k] = {"before": before[k], "after": v}

    if changed:
        import json as _json
        db.add(AuditLog(
            company_id=company_id,
            actor_user_id=actor_user_id,
            action="ai_policy.update",
            entity_type="company_ai_governance_policy",
            entity_id=row.id,
            detail_text=_json.dumps({"changes": changed}, default=str)[:5000],
        ))
        db.commit()
        db.refresh(row)
    return row


# ── Engine-side enforcement helpers ────────────────────────────────────────


def is_model_allowed(row: CompanyAiGovernancePolicy, model: str) -> bool:
    spec = (row.allowed_models or "*").strip()
    if spec == "*" or not spec:
        return True
    allowed = {m.strip() for m in spec.split(",") if m.strip()}
    return model in allowed


def cap_max_tokens(row: CompanyAiGovernancePolicy, requested: int | None) -> int | None:
    """Return the lower of requested and the policy cap, or None when both are unset."""
    cap = row.max_tokens_per_call or 0
    if cap <= 0:
        return requested
    if requested is None or requested <= 0:
        return cap
    return min(requested, cap)
