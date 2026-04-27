"""ApprovalRoutingRule — Phase 5.5 persistence.

Stores approval-routing rules per company. The runtime engine in
``approval_routing_service`` operates on plain dicts; this model is
the persistent container.

Each row maps 1:1 to one rule dict::

    {
      "id": <rule_key>,
      "priority": <priority>,
      "when": <when_json>,
      "approvers": <approvers_json>,
      "sla_hours": <sla_hours>,
      "escalation_role": <escalation_role>,
    }

The service helper ``list_rules_for_company`` converts active rows into
that dict shape so the rest of the engine remains untouched.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    JSON,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from apps.api.db import Base


_JSON_TYPE = JSONB().with_variant(JSON(), "sqlite")


class ApprovalRoutingRule(Base):
    __tablename__ = "approval_routing_rules"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    company_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("companies.id"), index=True, nullable=False
    )

    # Stable string identifier used in audit logs and rule references.
    # Unique within (company_id, rule_key).
    rule_key: Mapped[str] = mapped_column(String(80), nullable=False)

    name: Mapped[str] = mapped_column(String(200), nullable=False)

    priority: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # Predicate tree — see approval_routing_service._eval_predicate.
    when_json: Mapped[dict] = mapped_column(_JSON_TYPE, nullable=False)

    # Approver descriptors: list of {"role": "..."} or {"user_id": N}.
    approvers_json: Mapped[list] = mapped_column(_JSON_TYPE, nullable=False)

    sla_hours: Mapped[int | None] = mapped_column(Integer, nullable=True)
    escalation_role: Mapped[str | None] = mapped_column(String(60), nullable=True)

    is_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    created_by_user_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now(), nullable=False
    )

    __table_args__ = (
        UniqueConstraint(
            "company_id", "rule_key", name="uq_approval_routing_rules_company_key"
        ),
    )
