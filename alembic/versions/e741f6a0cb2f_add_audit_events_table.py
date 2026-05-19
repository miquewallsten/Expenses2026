"""add_audit_events_table

Revision ID: e741f6a0cb2f
Revises: add_expense_indexes
Create Date: 2026-05-04 09:56:21.151409

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e741f6a0cb2f'
down_revision: Union[str, Sequence[str], None] = 'add_expense_indexes'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create audit_events table for immutable traceability."""
    op.create_table(
        "audit_events",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("company_id", sa.Integer(), nullable=False, index=True),
        # What happened
        sa.Column("event_type", sa.String(50), nullable=False),
        sa.Column("entity_type", sa.String(50), nullable=False),
        sa.Column("entity_id", sa.Integer(), nullable=False),
        # Who did it
        sa.Column("actor_id", sa.Integer(), nullable=True),
        sa.Column(
            "occurred_at",
            sa.DateTime(),
            server_default=sa.func.now(),
            nullable=False,
        ),
        # Where from
        sa.Column("ip_address", sa.String(45), nullable=True),
        sa.Column("user_agent", sa.String(500), nullable=True),
        # What changed
        sa.Column("before", sa.Text(), nullable=True),
        sa.Column("after", sa.Text(), nullable=True),
        # Metadata
        sa.Column("correlation_id", sa.String(36), nullable=True),
    )
    # Create composite indexes for common query patterns
    op.create_index("ix_audit_company_time", "audit_events", ["company_id", "occurred_at"])
    op.create_index("ix_audit_entity", "audit_events", ["entity_type", "entity_id"])
    op.create_index("ix_audit_actor", "audit_events", ["actor_id"])


def downgrade() -> None:
    """Remove audit_events table."""
    op.drop_index("ix_audit_actor", table_name="audit_events")
    op.drop_index("ix_audit_entity", table_name="audit_events")
    op.drop_index("ix_audit_company_time", table_name="audit_events")
    op.drop_table("audit_events")
