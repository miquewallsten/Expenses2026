"""AI Policy model.

Admins write freeform policy statements in natural language; an AI extractor
converts each statement into a deterministic rule_json that is evaluated at
expense submit / accounting review time.

Lifecycle:
  1. Admin posts source_text → router calls ai_policy_extractor_service →
     persists row with rule_json, summary, scope, severity (status='draft').
  2. Admin reviews and confirms → status='active'; the rule starts being
     enforced by ai_policy_evaluator_service.
  3. Admin can disable (enabled=False), edit (re-extract), or delete.

rule_json shape (v1):
  {
    "when": [
      {"field": "amount", "op": ">", "value": 5000},
      {"field": "currency", "op": "=", "value": "USD"}
    ],
    "then": {"action": "block" | "warn" | "require_field",
             "field": "<optional>",
             "message": "<human readable>"}
  }

Supported fields: amount, currency, category, supplier_name, has_xml,
is_international, expense_type, payment_method.
Supported ops: =, !=, >, >=, <, <=, in, not_in, contains.
"""
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, JSON, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

# Use JSONB on PostgreSQL; fall back to plain JSON for SQLite (tests).
_RULE_JSON_TYPE = JSONB().with_variant(JSON(), "sqlite")

from apps.api.db import Base


class AIPolicy(Base):
    __tablename__ = "ai_policies"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    company_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("companies.id"), index=True, nullable=False
    )

    # The admin's original natural-language statement.
    source_text: Mapped[str] = mapped_column(Text, nullable=False)

    # AI-generated structured rule.
    rule_json: Mapped[dict] = mapped_column(_RULE_JSON_TYPE, nullable=False)

    # One-line human summary, suitable for the admin list view.
    summary: Mapped[str] = mapped_column(String(500), nullable=False)

    # Where the rule applies.  v1 only ships 'expense_validation'.
    scope: Mapped[str] = mapped_column(String(40), default="expense_validation", nullable=False)

    # 'block' = hard submit blocker; 'warn' = informational only.
    severity: Mapped[str] = mapped_column(String(10), default="warn", nullable=False)

    enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    created_by_user_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now(), nullable=False
    )
