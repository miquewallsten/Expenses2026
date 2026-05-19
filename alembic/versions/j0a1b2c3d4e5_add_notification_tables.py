"""add notification tables

Revision ID: j0a1b2c3d4e5
Revises: i9f0a1b2c3d4
Create Date: 2025-01-15 12:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = "j0a1b2c3d4e5"
down_revision = "i9f0a1b2c3d4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "notifications",
        sa.Column("id", sa.Integer(), autoincrement=True, primary_key=True),
        sa.Column("company_id", sa.Integer(), nullable=False, index=True),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("type", sa.String(32), nullable=False, server_default="info"),
        sa.Column("target_roles", sa.Text(), nullable=True),
        sa.Column("channels", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
    )
    op.create_table(
        "notification_reads",
        sa.Column("id", sa.Integer(), autoincrement=True, primary_key=True),
        sa.Column("notification_id", sa.Integer(), sa.ForeignKey("notifications.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False, index=True),
        sa.Column("read_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("uq_notification_reads_notification_user", "notification_reads", ["notification_id", "user_id"], unique=True)


def downgrade() -> None:
    op.drop_index("uq_notification_reads_notification_user", table_name="notification_reads")
    op.drop_table("notification_reads")
    op.drop_table("notifications")
