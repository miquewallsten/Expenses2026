from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from apps.api.db import Base


class ExpensePolicyOverride(Base):
    """Employee justification that overrides a failing/warning policy check.

    Identified by `rule_code` which matches the codes returned by
    compute_policy_checks (e.g. "AI_POLICY_4", "PROOF_REQUIRED", …).

    Presence of a non-empty justification_note downgrades the corresponding
    policy check row to `passed` and lifts the submission blocker for that
    rule.  Removed via DELETE when the user wants to revert.
    """

    __tablename__ = "expense_policy_overrides"
    __table_args__ = (
        UniqueConstraint("expense_id", "rule_code", name="uq_expense_rule_override"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    expense_id: Mapped[int] = mapped_column(
        ForeignKey("expenses.id", ondelete="CASCADE"), nullable=False, index=True
    )
    rule_code: Mapped[str] = mapped_column(String(100), nullable=False)
    justification_note: Mapped[str] = mapped_column(Text, nullable=False)
    created_by_user_id: Mapped[int | None] = mapped_column(nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False
    )
