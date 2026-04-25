"""action links table

Revision ID: c5d8a2f4b6e9
Revises: b7e2f4a1c9d3
Create Date: 2026-01-15
"""

from alembic import op
import sqlalchemy as sa


revision = "c5d8a2f4b6e9"
down_revision = "b7e2f4a1c9d3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "action_links",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("token_jti", sa.String(64), nullable=False),
        sa.Column("company_id", sa.Integer(), nullable=False, index=True),
        sa.Column(
            "user_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("action", sa.String(30), nullable=False),
        sa.Column("resource_type", sa.String(50), nullable=False),
        sa.Column("resource_id", sa.Integer(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_ip", sa.String(64), nullable=True),
        sa.Column("consumed_ip", sa.String(64), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.UniqueConstraint("token_jti", name="uq_action_link_jti"),
    )
    op.create_index("ix_action_links_token_jti", "action_links", ["token_jti"])


def downgrade() -> None:
    op.drop_index("ix_action_links_token_jti", table_name="action_links")
    op.drop_table("action_links")
