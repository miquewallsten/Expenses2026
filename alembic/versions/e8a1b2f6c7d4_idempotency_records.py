"""Alembic — Phase 2.1 idempotency record table.

Revision ID: e8a1b2f6c7d4
Revises: d3f6b8e1a4c2
"""

from alembic import op
import sqlalchemy as sa


revision = "e8a1b2f6c7d4"
down_revision = "d3f6b8e1a4c2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "idempotency_records",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "user_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("route", sa.String(200), nullable=False),
        sa.Column("idempotency_key", sa.String(120), nullable=False),
        sa.Column(
            "status_code", sa.Integer(), nullable=False, server_default="200"
        ),
        sa.Column("response_json", sa.Text(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.UniqueConstraint(
            "user_id",
            "route",
            "idempotency_key",
            name="uq_idempotency_user_route_key",
        ),
    )


def downgrade() -> None:
    op.drop_table("idempotency_records")
