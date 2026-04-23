"""agent engine tables

Revision ID: e7c9a2d4b6f1
Revises: 44ef73e694c5
Create Date: 2026-05-10

Creates four tables for the unified AI Agent:
    agent_sessions        — per-persona conversation history
    agent_tool_calls      — immutable audit log of every tool invocation
    agent_pending_actions — two-phase-commit receipts (30 min TTL)
    agent_uploads         — ingested file metadata + storage pointer
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'e7c9a2d4b6f1'
down_revision: Union[str, Sequence[str], None] = ('44ef73e694c5', 'f1a3c2e8b9d7')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "agent_sessions",
        sa.Column("id",           sa.Integer(),   autoincrement=True, nullable=False),
        sa.Column("company_id",   sa.Integer(),   nullable=False),
        sa.Column("session_id",   sa.String(36),  nullable=False),
        sa.Column("persona",      sa.String(32),  nullable=False),
        sa.Column("user_id",      sa.Integer(),   nullable=True),
        sa.Column("turns",        sa.Text(),      nullable=True),
        sa.Column("context_refs", sa.Text(),      nullable=True),
        sa.Column("created_at",   sa.DateTime(),  server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at",   sa.DateTime(),  server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("session_id", name="uq_agent_sessions_session_id"),
    )
    op.create_index("ix_agent_sessions_company_id", "agent_sessions", ["company_id"])
    op.create_index("ix_agent_sessions_session_id", "agent_sessions", ["session_id"])

    op.create_table(
        "agent_tool_calls",
        sa.Column("id",             sa.Integer(),  autoincrement=True, nullable=False),
        sa.Column("company_id",     sa.Integer(),  nullable=False),
        sa.Column("session_id",     sa.String(36), nullable=True),
        sa.Column("persona",        sa.String(32), nullable=False),
        sa.Column("tool_name",      sa.String(100), nullable=False),
        sa.Column("args_redacted",  sa.Text(),     nullable=True),
        sa.Column("result_summary", sa.Text(),     nullable=True),
        sa.Column("status",         sa.String(32), nullable=False),
        sa.Column("error",          sa.Text(),     nullable=True),
        sa.Column("duration_ms",    sa.Integer(),  nullable=True),
        sa.Column("user_id",        sa.Integer(),  nullable=True),
        sa.Column("created_at",     sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_agent_tool_calls_company_id", "agent_tool_calls", ["company_id"])
    op.create_index("ix_agent_tool_calls_session_id", "agent_tool_calls", ["session_id"])
    op.create_index("ix_agent_tool_calls_tool_name",  "agent_tool_calls", ["tool_name"])
    op.create_index("ix_agent_tool_calls_created_at", "agent_tool_calls", ["created_at"])

    op.create_table(
        "agent_pending_actions",
        sa.Column("id",           sa.Integer(),   autoincrement=True, nullable=False),
        sa.Column("receipt_id",   sa.String(36),  nullable=False),
        sa.Column("company_id",   sa.Integer(),   nullable=False),
        sa.Column("session_id",   sa.String(36),  nullable=True),
        sa.Column("tool_name",    sa.String(100), nullable=False),
        sa.Column("args",         sa.Text(),      nullable=False),
        sa.Column("preview",      sa.Text(),      nullable=False),
        sa.Column("status",       sa.String(32),  nullable=False, server_default="pending"),
        sa.Column("expires_at",   sa.DateTime(),  nullable=False),
        sa.Column("created_at",   sa.DateTime(),  server_default=sa.func.now(), nullable=False),
        sa.Column("confirmed_at", sa.DateTime(),  nullable=True),
        sa.Column("confirmed_by", sa.String(255), nullable=True),
        sa.Column("result",       sa.Text(),      nullable=True),
        sa.Column("error",        sa.Text(),      nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("receipt_id", name="uq_agent_pending_actions_receipt_id"),
    )
    op.create_index("ix_agent_pending_actions_receipt_id", "agent_pending_actions", ["receipt_id"])
    op.create_index("ix_agent_pending_actions_company_id", "agent_pending_actions", ["company_id"])
    op.create_index("ix_agent_pending_actions_session_id", "agent_pending_actions", ["session_id"])

    op.create_table(
        "agent_uploads",
        sa.Column("id",                 sa.Integer(),    autoincrement=True, nullable=False),
        sa.Column("file_id",             sa.String(36),   nullable=False),
        sa.Column("company_id",          sa.Integer(),    nullable=False),
        sa.Column("filename",            sa.String(512),  nullable=False),
        sa.Column("content_type",        sa.String(128),  nullable=False),
        sa.Column("size_bytes",          sa.Integer(),    nullable=False),
        sa.Column("storage_path",        sa.String(1024), nullable=False),
        sa.Column("uploaded_by",         sa.Integer(),    nullable=True),
        sa.Column("used_by_receipt_id",  sa.String(36),   nullable=True),
        sa.Column("created_at",          sa.DateTime(),   server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("file_id", name="uq_agent_uploads_file_id"),
    )
    op.create_index("ix_agent_uploads_file_id",    "agent_uploads", ["file_id"])
    op.create_index("ix_agent_uploads_company_id", "agent_uploads", ["company_id"])


def downgrade() -> None:
    op.drop_index("ix_agent_uploads_company_id", table_name="agent_uploads")
    op.drop_index("ix_agent_uploads_file_id",    table_name="agent_uploads")
    op.drop_table("agent_uploads")

    op.drop_index("ix_agent_pending_actions_session_id", table_name="agent_pending_actions")
    op.drop_index("ix_agent_pending_actions_company_id", table_name="agent_pending_actions")
    op.drop_index("ix_agent_pending_actions_receipt_id", table_name="agent_pending_actions")
    op.drop_table("agent_pending_actions")

    op.drop_index("ix_agent_tool_calls_created_at", table_name="agent_tool_calls")
    op.drop_index("ix_agent_tool_calls_tool_name",  table_name="agent_tool_calls")
    op.drop_index("ix_agent_tool_calls_session_id", table_name="agent_tool_calls")
    op.drop_index("ix_agent_tool_calls_company_id", table_name="agent_tool_calls")
    op.drop_table("agent_tool_calls")

    op.drop_index("ix_agent_sessions_session_id", table_name="agent_sessions")
    op.drop_index("ix_agent_sessions_company_id", table_name="agent_sessions")
    op.drop_table("agent_sessions")
