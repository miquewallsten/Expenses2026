"""Repair: re-add user_notification_preferences (drift from d3f6b8e1a4c2)

Revision ID: c8d4f1e9a3b7
Revises: f3a8c5e2b1d6
Create Date: 2026-04-27

Idempotent guard: skip if the table already exists in the target DB.
"""

from alembic import op
import sqlalchemy as sa


revision = "c8d4f1e9a3b7"
down_revision = "f3a8c5e2b1d6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    if "user_notification_preferences" in insp.get_table_names():
        return
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
