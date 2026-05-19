"""enrich_cost_center_project_client

Revision ID: a1b2c3d4e5f6
Revises: z1a2b3c4d5e6
Create Date: 2026-05-17 12:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = "a1b2c3d4e5f6"
down_revision = "z1a2b3c4d5e6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── Cost Centers ────────────────────────────────────────────────────────
    op.add_column("cost_centers", sa.Column("description", sa.Text(), nullable=True))
    op.add_column("cost_centers", sa.Column("budget_amount", sa.Float(), nullable=True))
    op.add_column("cost_centers", sa.Column("budget_currency", sa.String(3), server_default="MXN", nullable=True))
    op.add_column("cost_centers", sa.Column("responsible_user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True))
    op.add_column("cost_centers", sa.Column("parent_id", sa.Integer(), sa.ForeignKey("cost_centers.id"), nullable=True))
    op.add_column("cost_centers", sa.Column("start_date", sa.DateTime(), nullable=True))
    op.add_column("cost_centers", sa.Column("end_date", sa.DateTime(), nullable=True))
    op.add_column("cost_centers", sa.Column("is_billable", sa.Boolean(), server_default="false", nullable=True))
    op.add_column("cost_centers", sa.Column("notes", sa.Text(), nullable=True))
    op.add_column("cost_centers", sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), nullable=True))

    # ── Projects ────────────────────────────────────────────────────────────
    op.add_column("projects", sa.Column("description", sa.Text(), nullable=True))
    op.add_column("projects", sa.Column("budget_amount", sa.Float(), nullable=True))
    op.add_column("projects", sa.Column("budget_currency", sa.String(3), server_default="MXN", nullable=True))
    op.add_column("projects", sa.Column("responsible_user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True))
    op.add_column("projects", sa.Column("parent_id", sa.Integer(), sa.ForeignKey("projects.id"), nullable=True))
    op.add_column("projects", sa.Column("client_id", sa.Integer(), sa.ForeignKey("clients.id"), nullable=True))
    op.add_column("projects", sa.Column("start_date", sa.DateTime(), nullable=True))
    op.add_column("projects", sa.Column("end_date", sa.DateTime(), nullable=True))
    op.add_column("projects", sa.Column("is_billable", sa.Boolean(), server_default="false", nullable=True))
    op.add_column("projects", sa.Column("notes", sa.Text(), nullable=True))
    op.add_column("projects", sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), nullable=True))

    # ── Clients ─────────────────────────────────────────────────────────────
    op.add_column("clients", sa.Column("description", sa.Text(), nullable=True))
    op.add_column("clients", sa.Column("rfc", sa.String(20), nullable=True))
    op.create_index("ix_clients_rfc", "clients", ["rfc"])
    op.add_column("clients", sa.Column("legal_name", sa.String(255), nullable=True))
    op.add_column("clients", sa.Column("contact_email", sa.String(255), nullable=True))
    op.add_column("clients", sa.Column("contact_phone", sa.String(50), nullable=True))
    op.add_column("clients", sa.Column("address", sa.Text(), nullable=True))
    op.add_column("clients", sa.Column("responsible_user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True))
    op.add_column("clients", sa.Column("parent_id", sa.Integer(), sa.ForeignKey("clients.id"), nullable=True))
    op.add_column("clients", sa.Column("is_active", sa.Boolean(), server_default="true", nullable=True))
    op.add_column("clients", sa.Column("notes", sa.Text(), nullable=True))
    op.add_column("clients", sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), nullable=True))


def downgrade() -> None:
    # ── Cost Centers ────────────────────────────────────────────────────────
    op.drop_column("cost_centers", "notes")
    op.drop_column("cost_centers", "is_billable")
    op.drop_column("cost_centers", "end_date")
    op.drop_column("cost_centers", "start_date")
    op.drop_column("cost_centers", "parent_id")
    op.drop_column("cost_centers", "responsible_user_id")
    op.drop_column("cost_centers", "budget_currency")
    op.drop_column("cost_centers", "budget_amount")
    op.drop_column("cost_centers", "description")
    op.drop_column("cost_centers", "updated_at")

    # ── Projects ────────────────────────────────────────────────────────────
    op.drop_column("projects", "notes")
    op.drop_column("projects", "is_billable")
    op.drop_column("projects", "end_date")
    op.drop_column("projects", "start_date")
    op.drop_column("projects", "client_id")
    op.drop_column("projects", "parent_id")
    op.drop_column("projects", "responsible_user_id")
    op.drop_column("projects", "budget_currency")
    op.drop_column("projects", "budget_amount")
    op.drop_column("projects", "description")
    op.drop_column("projects", "updated_at")

    # ── Clients ─────────────────────────────────────────────────────────────
    op.drop_column("clients", "notes")
    op.drop_column("clients", "is_active")
    op.drop_column("clients", "parent_id")
    op.drop_column("clients", "responsible_user_id")
    op.drop_column("clients", "address")
    op.drop_column("clients", "contact_phone")
    op.drop_column("clients", "contact_email")
    op.drop_column("clients", "legal_name")
    op.drop_index("ix_clients_rfc", "clients")
    op.drop_column("clients", "rfc")
    op.drop_column("clients", "description")
    op.drop_column("clients", "updated_at")
