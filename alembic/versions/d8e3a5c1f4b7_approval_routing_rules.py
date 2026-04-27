"""approval_routing_rules — Phase 5.5 persistence.

Adds ``approval_routing_rules`` table backing the routing engine in
``packages/modules/expenses/service/approval_routing_service.py``.

Revision ID: d8e3a5c1f4b7
Revises: c8d4f1e9a3b7
Create Date: 2026-04-27
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op


# revision identifiers, used by Alembic.
revision = "d8e3a5c1f4b7"
down_revision = "c8d4f1e9a3b7"
branch_labels = None
depends_on = None


def _is_postgres() -> bool:
    bind = op.get_bind()
    return bind.dialect.name == "postgresql"


def upgrade() -> None:
    json_type = sa.dialects.postgresql.JSONB() if _is_postgres() else sa.JSON()

    op.create_table(
        "approval_routing_rules",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "company_id",
            sa.Integer(),
            sa.ForeignKey("companies.id"),
            nullable=False,
        ),
        sa.Column("rule_key", sa.String(80), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("priority", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("when_json", json_type, nullable=False),
        sa.Column("approvers_json", json_type, nullable=False),
        sa.Column("sla_hours", sa.Integer(), nullable=True),
        sa.Column("escalation_role", sa.String(60), nullable=True),
        sa.Column(
            "is_enabled", sa.Boolean(), nullable=False, server_default=sa.text("true")
        ),
        sa.Column("created_by_user_id", sa.Integer(), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(), server_default=sa.func.now(), nullable=False
        ),
        sa.UniqueConstraint(
            "company_id", "rule_key", name="uq_approval_routing_rules_company_key"
        ),
    )
    op.create_index(
        "ix_approval_routing_rules_company_id",
        "approval_routing_rules",
        ["company_id"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_approval_routing_rules_company_id", table_name="approval_routing_rules"
    )
    op.drop_table("approval_routing_rules")
