"""add currency, wallet, soft-delete, budget, delegation dates

Revision ID: l5m6n7o8p9q0
Revises: k1b2c3d4e5f6
Create Date: 2025-05-17 12:00:00.000000
"""
from alembic import op
import sqlalchemy as sa
from decimal import Decimal

revision = "l5m6n7o8p9q0"
down_revision = "k1b2c3d4e5f6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── P0: Multi-currency on Expense ────────────────────────────────────────
    op.add_column("expenses", sa.Column("currency", sa.String(3), server_default="MXN", nullable=False))
    op.add_column("expenses", sa.Column("exchange_rate", sa.Numeric(12, 6), nullable=True))
    op.add_column("expenses", sa.Column("amount_mxn", sa.Numeric(12, 2), nullable=True))

    # ── P1: Soft-delete on Expense ───────────────────────────────────────────
    op.add_column("expenses", sa.Column("is_deleted", sa.Boolean(), server_default="false", nullable=False))
    op.add_column("expenses", sa.Column("deleted_at", sa.DateTime(), nullable=True))

    # ── P0: Pre-paid wallet tables ────────────────────────────────────────────
    op.create_table(
        "employee_wallets",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("company_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("balance", sa.Numeric(12, 2), server_default="0", nullable=False),
        sa.Column("total_deposited", sa.Numeric(12, 2), server_default="0", nullable=False),
        sa.Column("total_spent", sa.Numeric(12, 2), server_default="0", nullable=False),
        sa.Column("wallet_type", sa.String(20), server_default="prepaid", nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("idx_wallet_company_user", "employee_wallets", ["company_id", "user_id"], unique=True)

    op.create_table(
        "wallet_transactions",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("company_id", sa.Integer(), nullable=False),
        sa.Column("wallet_id", sa.Integer(), sa.ForeignKey("employee_wallets.id"), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("transaction_type", sa.String(20), nullable=False),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("balance_after", sa.Numeric(12, 2), nullable=False),
        sa.Column("expense_id", sa.Integer(), nullable=True),
        sa.Column("description", sa.String(500), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("idx_wtx_company_user", "wallet_transactions", ["company_id", "user_id"])
    op.create_index("idx_wtx_wallet", "wallet_transactions", ["wallet_id"])

    # ── P0: Budget enforcement fields on company_expense_policies ─────────────
    op.add_column("company_expense_policies", sa.Column(
        "monthly_budget_per_employee", sa.Numeric(12, 2), nullable=True))
    op.add_column("company_expense_policies", sa.Column(
        "budget_enforcement", sa.String(20), server_default="none", nullable=False))
    op.add_column("company_expense_policies", sa.Column(
        "wallet_enabled", sa.Boolean(), server_default="false", nullable=False))
    op.add_column("company_expense_policies", sa.Column(
        "wallet_auto_deduct", sa.Boolean(), server_default="true", nullable=False))
    op.add_column("company_expense_policies", sa.Column(
        "wallet_currency", sa.String(3), server_default="MXN", nullable=False))

    # ── P2: Delegation date range on users ────────────────────────────────────
    op.add_column("users", sa.Column("delegation_starts_at", sa.DateTime(), nullable=True))
    op.add_column("users", sa.Column("delegation_ends_at", sa.DateTime(), nullable=True))

    # ── Backfill: set currency=MXN and amount_mxn=amount for existing rows ───
    op.execute("UPDATE expenses SET amount_mxn = amount WHERE amount_mxn IS NULL")


def downgrade() -> None:
    op.drop_column("users", "delegation_ends_at")
    op.drop_column("users", "delegation_starts_at")
    op.drop_column("company_expense_policies", "wallet_currency")
    op.drop_column("company_expense_policies", "wallet_auto_deduct")
    op.drop_column("company_expense_policies", "wallet_enabled")
    op.drop_column("company_expense_policies", "budget_enforcement")
    op.drop_column("company_expense_policies", "monthly_budget_per_employee")
    op.drop_index("idx_wtx_wallet", "wallet_transactions")
    op.drop_index("idx_wtx_company_user", "wallet_transactions")
    op.drop_table("wallet_transactions")
    op.drop_index("idx_wallet_company_user", "employee_wallets")
    op.drop_table("employee_wallets")
    op.drop_column("expenses", "deleted_at")
    op.drop_column("expenses", "is_deleted")
    op.drop_column("expenses", "amount_mxn")
    op.drop_column("expenses", "exchange_rate")
    op.drop_column("expenses", "currency")
