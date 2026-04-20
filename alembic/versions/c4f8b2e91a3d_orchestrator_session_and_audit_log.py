"""orchestrator_session_and_audit_log

Revision ID: c4f8b2e91a3d
Revises: 11d026dfb416
Create Date: 2026-04-19

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'c4f8b2e91a3d'
down_revision: Union[str, Sequence[str], None] = '11d026dfb416'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "orchestrator_sessions",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("company_id", sa.Integer(), nullable=False),
        sa.Column("session_id", sa.String(36), nullable=False),
        sa.Column("turns", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_orchestrator_sessions_company_id", "orchestrator_sessions", ["company_id"])
    op.create_index("ix_orchestrator_sessions_session_id", "orchestrator_sessions", ["session_id"])

    op.create_table(
        "orchestrator_audit_log",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("company_id", sa.Integer(), nullable=False),
        sa.Column("session_id", sa.String(36), nullable=True),
        sa.Column("action", sa.String(20), nullable=False),
        sa.Column("engine_mode", sa.String(20), nullable=True),
        sa.Column("patches_proposed", sa.Text(), nullable=True),
        sa.Column("patches_applied", sa.Text(), nullable=True),
        sa.Column("categories_proposed", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("categories_applied", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("applied_by", sa.String(255), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_orchestrator_audit_log_company_id", "orchestrator_audit_log", ["company_id"])
    op.create_index("ix_orchestrator_audit_log_session_id", "orchestrator_audit_log", ["session_id"])


def downgrade() -> None:
    op.drop_index("ix_orchestrator_audit_log_session_id", table_name="orchestrator_audit_log")
    op.drop_index("ix_orchestrator_audit_log_company_id", table_name="orchestrator_audit_log")
    op.drop_table("orchestrator_audit_log")
    op.drop_index("ix_orchestrator_sessions_session_id", table_name="orchestrator_sessions")
    op.drop_index("ix_orchestrator_sessions_company_id", table_name="orchestrator_sessions")
    op.drop_table("orchestrator_sessions")
