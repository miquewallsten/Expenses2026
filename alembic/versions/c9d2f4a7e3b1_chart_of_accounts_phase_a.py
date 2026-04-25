"""chart_of_accounts_phase_a

Revision ID: c9d2f4a7e3b1
Revises: a8c2d1e5b7f3
Create Date: 2026-04-23 12:00:00.000000

Phase A of the Chart-of-Accounts rebuild:
  * accounting_accounts — per-company CoA with SAT Código Agrupador
  * tax_rates           — named VAT rates with GL account + behavior
  * accounting_categories: adds FK columns to both tables (legacy string
    columns kept for backward compat; dropped in Phase E)
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c9d2f4a7e3b1"
down_revision: Union[str, Sequence[str], None] = "a8c2d1e5b7f3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on:    Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── accounting_accounts ──────────────────────────────────────────────────
    op.create_table(
        "accounting_accounts",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("company_id", sa.Integer, sa.ForeignKey("companies.id"), nullable=False, index=True),
        sa.Column("code", sa.String(50), nullable=False, index=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("parent_id", sa.Integer, sa.ForeignKey("accounting_accounts.id", ondelete="CASCADE"), nullable=True, index=True),
        sa.Column("sat_group_code", sa.String(20), nullable=True, index=True),
        sa.Column("account_class", sa.String(20), nullable=False, server_default="expense"),
        sa.Column("is_postable", sa.Boolean, nullable=False, server_default=sa.text("true")),
        sa.Column("split_by", sa.String(20), nullable=False, server_default="none"),
        sa.Column("sort_order", sa.Integer, nullable=False, server_default="0"),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime, server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("company_id", "code", name="uq_accounting_accounts_company_code"),
    )

    # ── tax_rates ────────────────────────────────────────────────────────────
    op.create_table(
        "tax_rates",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("company_id", sa.Integer, sa.ForeignKey("companies.id"), nullable=False, index=True),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("rate", sa.Numeric(6, 4), nullable=False),
        sa.Column("behavior", sa.String(20), nullable=False),
        sa.Column("gl_account_id", sa.Integer, sa.ForeignKey("accounting_accounts.id", ondelete="SET NULL"), nullable=True),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime, server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("company_id", "name", name="uq_tax_rates_company_name"),
    )

    # ── accounting_categories: new FK columns ────────────────────────────────
    op.add_column(
        "accounting_categories",
        sa.Column(
            "expense_account_id", sa.Integer,
            sa.ForeignKey("accounting_accounts.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.add_column(
        "accounting_categories",
        sa.Column(
            "tax_rate_id", sa.Integer,
            sa.ForeignKey("tax_rates.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.add_column(
        "accounting_categories",
        sa.Column(
            "counterparty_account_id", sa.Integer,
            sa.ForeignKey("accounting_accounts.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.create_index(
        "ix_accounting_categories_expense_account_id",
        "accounting_categories", ["expense_account_id"],
    )
    op.create_index(
        "ix_accounting_categories_tax_rate_id",
        "accounting_categories", ["tax_rate_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_accounting_categories_tax_rate_id", table_name="accounting_categories")
    op.drop_index("ix_accounting_categories_expense_account_id", table_name="accounting_categories")
    op.drop_column("accounting_categories", "counterparty_account_id")
    op.drop_column("accounting_categories", "tax_rate_id")
    op.drop_column("accounting_categories", "expense_account_id")
    op.drop_table("tax_rates")
    op.drop_table("accounting_accounts")
