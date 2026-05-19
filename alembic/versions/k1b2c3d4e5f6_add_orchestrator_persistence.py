"""add orchestrator persistence tables

Revision ID: k1b2c3d4e5f6
Revises: j0a1b2c3d4e5
Create Date: 2025-01-15 13:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = "k1b2c3d4e5f6"
down_revision = ("72581e890be5", "j0a1b2c3d4e5")
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "orchestrator_sessions",
        sa.Column("id", sa.Integer(), autoincrement=True, primary_key=True),
        sa.Column("session_id", sa.String(128), nullable=False, unique=True, index=True),
        sa.Column("company_id", sa.Integer(), nullable=False, index=True),
        sa.Column("data", sa.Text(), nullable=False),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
    )
    op.create_table(
        "orchestrator_team_metrics",
        sa.Column("id", sa.Integer(), autoincrement=True, primary_key=True),
        sa.Column("team_name", sa.String(128), nullable=False, unique=True, index=True),
        sa.Column("total_requests", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("successful_requests", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("failed_requests", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("average_response_time", sa.Float(), server_default="0"),
        sa.Column("tool_usage", sa.Text(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), onupdate=sa.func.now(), nullable=False),
    )
    op.create_table(
        "orchestrator_request_log",
        sa.Column("id", sa.Integer(), autoincrement=True, primary_key=True),
        sa.Column("request_id", sa.String(128), nullable=False, unique=True, index=True),
        sa.Column("company_id", sa.Integer(), nullable=True),
        sa.Column("team", sa.String(128), nullable=True),
        sa.Column("status", sa.String(32), nullable=False, server_default="processing"),
        sa.Column("user_message_preview", sa.String(200), nullable=True),
        sa.Column("started_at", sa.Float(), nullable=False),
        sa.Column("finished_at", sa.Float(), nullable=True),
        sa.Column("result_ok", sa.Boolean(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("orchestrator_request_log")
    op.drop_table("orchestrator_team_metrics")
    op.drop_table("orchestrator_sessions")
