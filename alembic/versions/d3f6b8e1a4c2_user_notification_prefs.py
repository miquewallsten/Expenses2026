"""user notification preferences

Revision ID: d3f6b8e1a4c2
Revises: c5d8a2f4b6e9
Create Date: 2026-01-15
"""

from alembic import op
import sqlalchemy as sa


revision = "d3f6b8e1a4c2"
down_revision = "c5d8a2f4b6e9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "user_notification_preferences",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "user_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("event_type", sa.String(80), nullable=False),
        sa.Column(
            "email_enabled",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
        sa.Column(
            "whatsapp_enabled",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
        sa.Column(
            "digest_only",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.UniqueConstraint("user_id", "event_type", name="uq_user_notif_pref"),
    )


def downgrade() -> None:
    op.drop_table("user_notification_preferences")
