"""user_extended_and_auth_settings

Adds extended profile/capability columns to the users table, creates
user_project_assignments table, and creates company_auth_settings table.

Revision ID: d5e1f8a2b3c4
Revises: 11d026dfb416
Create Date: 2026-04-20 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "d5e1f8a2b3c4"
down_revision: Union[str, Sequence[str], None] = "c4f8b2e91a3d"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()

    # ── Extend users table ──────────────────────────────────────────────────────
    # Inspect existing columns to avoid duplicate-column errors on re-runs.
    inspector = sa.inspect(bind)
    existing_user_cols = {c["name"] for c in inspector.get_columns("users")}

    new_user_cols = [
        ("is_active",                    sa.Boolean(),     {"server_default": "true",  "nullable": False}),
        ("department",                   sa.String(100),   {"nullable": True}),
        ("job_title",                    sa.String(150),   {"nullable": True}),
        ("phone",                        sa.String(50),    {"nullable": True}),
        ("legal_entity_id",              sa.Integer(),     {"nullable": True}),
        ("delegates_for_user_id",        sa.Integer(),     {"nullable": True}),
        ("can_create_expenses",          sa.Boolean(),     {"server_default": "true",  "nullable": False}),
        ("can_create_corporate_expenses",sa.Boolean(),     {"server_default": "false", "nullable": False}),
        ("can_invoice_corporation",      sa.Boolean(),     {"server_default": "false", "nullable": False}),
        ("is_amex_reconciler",           sa.Boolean(),     {"server_default": "false", "nullable": False}),
        ("requires_time_tracking",       sa.Boolean(),     {"server_default": "false", "nullable": False}),
        ("has_executive_reporting",      sa.Boolean(),     {"server_default": "false", "nullable": False}),
        ("invited_at",                   sa.DateTime(),    {"nullable": True}),
        ("last_login_at",                sa.DateTime(),    {"nullable": True}),
    ]

    with op.batch_alter_table("users", schema=None) as batch_op:
        for col_name, col_type, col_kwargs in new_user_cols:
            if col_name not in existing_user_cols:
                batch_op.add_column(sa.Column(col_name, col_type, **col_kwargs))

    # ── user_project_assignments ────────────────────────────────────────────────
    existing_tables = inspector.get_table_names()
    if "user_project_assignments" not in existing_tables:
        op.create_table(
            "user_project_assignments",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
            sa.Column("project_id", sa.Integer(), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
            sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        )
        op.create_index("ix_user_project_assignments_user_id", "user_project_assignments", ["user_id"])
        op.create_index("ix_user_project_assignments_project_id", "user_project_assignments", ["project_id"])

    # ── company_auth_settings ───────────────────────────────────────────────────
    if "company_auth_settings" not in existing_tables:
        op.create_table(
            "company_auth_settings",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("company_id", sa.Integer(), nullable=False, unique=True),
            sa.Column("magic_link_enabled", sa.Boolean(), server_default="true", nullable=False),
            sa.Column("allowed_email_domains", sa.Text(), nullable=True),
            sa.Column("sso_enabled", sa.Boolean(), server_default="false", nullable=False),
            sa.Column("sso_provider", sa.String(50), nullable=True),
            sa.Column("sso_metadata_url", sa.String(500), nullable=True),
            sa.Column("session_timeout_hours", sa.Integer(), server_default="24", nullable=False),
            sa.Column("require_mfa", sa.Boolean(), server_default="false", nullable=False),
            sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        )
        op.create_index("ix_company_auth_settings_company_id", "company_auth_settings", ["company_id"])


def downgrade() -> None:
    op.drop_index("ix_company_auth_settings_company_id", table_name="company_auth_settings")
    op.drop_table("company_auth_settings")
    op.drop_index("ix_user_project_assignments_project_id", table_name="user_project_assignments")
    op.drop_index("ix_user_project_assignments_user_id", table_name="user_project_assignments")
    op.drop_table("user_project_assignments")

    with op.batch_alter_table("users", schema=None) as batch_op:
        batch_op.drop_column("last_login_at")
        batch_op.drop_column("invited_at")
        batch_op.drop_column("has_executive_reporting")
        batch_op.drop_column("requires_time_tracking")
        batch_op.drop_column("is_amex_reconciler")
        batch_op.drop_column("can_invoice_corporation")
        batch_op.drop_column("can_create_corporate_expenses")
        batch_op.drop_column("can_create_expenses")
        batch_op.drop_column("delegates_for_user_id")
        batch_op.drop_column("legal_entity_id")
        batch_op.drop_column("phone")
        batch_op.drop_column("job_title")
        batch_op.drop_column("department")
        batch_op.drop_column("is_active")
