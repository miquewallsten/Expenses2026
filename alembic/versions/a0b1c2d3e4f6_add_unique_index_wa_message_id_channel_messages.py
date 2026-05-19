"""add unique index wa_message_id on channel_messages

Revision ID: a0b1c2d3e4f6
Revises: a0b1c2d3e4f5
Create Date: 2026-05-19 12:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = "a0b1c2d3e4f6"
down_revision = "z1a2b3c4d5e6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_index(
        "uq_channel_messages_wa_message_id",
        "channel_messages",
        ["wa_message_id"],
        unique=True,
        postgresql_where=sa.text("wa_message_id IS NOT NULL"),
        sqlite_where=sa.text("wa_message_id IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_index("uq_channel_messages_wa_message_id", table_name="channel_messages")
