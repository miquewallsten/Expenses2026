"""Per-tenant AI governance policy (Phase 8.10).

Distinct from ``models_ai_policy.AIPolicy`` (which captures expense-validation
rules authored by admins). This model controls *how the AI itself behaves*
for a tenant: enable/disable, model allowlist, PII redaction strictness,
token caps, and monthly budgets. Enforced inside the agent engine.

One row per company; created lazily by the service (``get_or_create``).
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from apps.api.db import Base


PII_LEVELS = ("strict", "standard", "off")
DEFAULT_ALLOWED_MODELS = "*"  # "*" or comma-separated identifiers.


class CompanyAiGovernancePolicy(Base):
    __tablename__ = "company_ai_governance_policies"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    company_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("companies.id"), unique=True, index=True, nullable=False,
    )

    ai_enabled: Mapped[bool] = mapped_column(
        Boolean, default=True, server_default="true", nullable=False,
    )
    allowed_models: Mapped[str] = mapped_column(
        String(512), default=DEFAULT_ALLOWED_MODELS,
        server_default=DEFAULT_ALLOWED_MODELS, nullable=False,
    )
    pii_redaction_level: Mapped[str] = mapped_column(
        String(20), default="standard", server_default="standard", nullable=False,
    )
    max_tokens_per_call: Mapped[int] = mapped_column(
        Integer, default=4096, server_default="4096", nullable=False,
    )
    monthly_token_budget: Mapped[int] = mapped_column(
        Integer, default=0, server_default="0", nullable=False,
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now(), nullable=False,
    )
