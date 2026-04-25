"""expense_policy_overrides

Stores per-expense admin-policy override justifications so employees can
justify a failing rule (e.g. "La factura no usa UsoCFDI P01") and proceed
to submit.  Each (expense_id, rule_code) pair is unique.

Revision ID: d7a3b5f1e9c8
Revises: c6f9d2a4b8e7
Create Date: 2026-04-24
"""
from alembic import op
import sqlalchemy as sa


revision: str = "d7a3b5f1e9c8"
down_revision: str | None = "c6f9d2a4b8e7"
branch_labels: tuple[str, ...] | None = None
depends_on: tuple[str, ...] | None = None


def upgrade() -> None:
    op.create_table(
        "expense_policy_overrides",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "expense_id",
            sa.Integer(),
            sa.ForeignKey("expenses.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("rule_code", sa.String(length=100), nullable=False),
        sa.Column("justification_note", sa.Text(), nullable=False),
        sa.Column("created_by_user_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("expense_id", "rule_code", name="uq_expense_rule_override"),
    )


def downgrade() -> None:
    op.drop_table("expense_policy_overrides")
