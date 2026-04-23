"""merge heads and add agent memory + insights + usage tables

Revision ID: a8c2d1e5b7f3
Revises: f2b4c9a1d3e5, f1a3c2e8b9d7
Create Date: 2026-04-22

Phase 8 — adds ``agent_memory``, ``agent_insights``, ``agent_usage`` tables and
collapses the two open heads (agent_v2 flag branch and the reimbursements-drop
branch) into one.
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "a8c2d1e5b7f3"
down_revision: Union[str, Sequence[str], None] = ("f2b4c9a1d3e5", "f1a3c2e8b9d7")
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "agent_memory",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("company_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=True),
        sa.Column("kind", sa.String(length=32), nullable=False, server_default="fact"),
        sa.Column("key", sa.String(length=255), nullable=False),
        sa.Column("value_json", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("expires_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_agent_memory_company_id", "agent_memory", ["company_id"])
    op.create_index("ix_agent_memory_user_id", "agent_memory", ["user_id"])

    op.create_table(
        "agent_insights",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("company_id", sa.Integer(), nullable=False),
        sa.Column("kind", sa.String(length=64), nullable=False),
        sa.Column("severity", sa.String(length=16), nullable=False, server_default="info"),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("data_json", sa.Text(), nullable=True),
        sa.Column("status", sa.String(length=16), nullable=False, server_default="open"),
        sa.Column("suggested_prompt", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("resolved_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_agent_insights_company_id", "agent_insights", ["company_id"])
    op.create_index("ix_agent_insights_kind", "agent_insights", ["kind"])
    op.create_index("ix_agent_insights_status", "agent_insights", ["status"])

    op.create_table(
        "agent_usage",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("company_id", sa.Integer(), nullable=False),
        sa.Column("session_id", sa.String(length=36), nullable=True),
        sa.Column("user_id", sa.Integer(), nullable=True),
        sa.Column("persona", sa.String(length=32), nullable=False),
        sa.Column("model", sa.String(length=128), nullable=False),
        sa.Column("provider", sa.String(length=64), nullable=False, server_default="ollama"),
        sa.Column("tool_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("iterations", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("duration_ms", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("ok", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_agent_usage_company_id", "agent_usage", ["company_id"])
    op.create_index("ix_agent_usage_session_id", "agent_usage", ["session_id"])
    op.create_index("ix_agent_usage_created_at", "agent_usage", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_agent_usage_created_at", table_name="agent_usage")
    op.drop_index("ix_agent_usage_session_id", table_name="agent_usage")
    op.drop_index("ix_agent_usage_company_id", table_name="agent_usage")
    op.drop_table("agent_usage")

    op.drop_index("ix_agent_insights_status", table_name="agent_insights")
    op.drop_index("ix_agent_insights_kind", table_name="agent_insights")
    op.drop_index("ix_agent_insights_company_id", table_name="agent_insights")
    op.drop_table("agent_insights")

    op.drop_index("ix_agent_memory_user_id", table_name="agent_memory")
    op.drop_index("ix_agent_memory_company_id", table_name="agent_memory")
    op.drop_table("agent_memory")
