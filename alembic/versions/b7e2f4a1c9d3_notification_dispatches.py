"""notification dispatches table

Revision ID: b7e2f4a1c9d3
Revises: a9c1b3e7d5f2
Create Date: 2026-04-24 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


revision = "b7e2f4a1c9d3"
down_revision = "a9c1b3e7d5f2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "notification_dispatches",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("company_id", sa.Integer(), nullable=False, index=True),
        sa.Column("event_type", sa.String(length=80), nullable=False, index=True),
        sa.Column("resource_type", sa.String(length=50), nullable=False),
        sa.Column("resource_id", sa.Integer(), nullable=False),
        sa.Column(
            "recipient_user_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("recipient_address", sa.String(length=255), nullable=True),
        sa.Column("channel", sa.String(length=30), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="pending"),
        sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("last_error", sa.Text(), nullable=True),
        sa.Column("payload_json", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.UniqueConstraint(
            "event_type",
            "resource_type",
            "resource_id",
            "recipient_user_id",
            "channel",
            name="uq_notification_dispatch_idem",
        ),
    )
    op.create_index(
        "ix_notification_dispatches_resource",
        "notification_dispatches",
        ["resource_type", "resource_id"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_notification_dispatches_resource", table_name="notification_dispatches"
    )
    op.drop_table("notification_dispatches")
