"""audit log company_id

Revision ID: a9c1b3e7d5f2
Revises: d7a3b5f1e9c8
Create Date: 2025-01-01 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "a9c1b3e7d5f2"
down_revision = "d7a3b5f1e9c8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "audit_logs",
        sa.Column("company_id", sa.Integer(), nullable=True),
    )
    op.create_foreign_key(
        "fk_audit_logs_company_id",
        "audit_logs",
        "companies",
        ["company_id"],
        ["id"],
    )
    op.create_index("ix_audit_logs_company_id", "audit_logs", ["company_id"])
    op.create_index(
        "ix_audit_logs_company_entity",
        "audit_logs",
        ["company_id", "entity_type", "entity_id"],
    )

    # Backfill from expenses for existing expense entries.
    op.execute(
        """
        UPDATE audit_logs
        SET company_id = e.company_id
        FROM expenses e
        WHERE audit_logs.entity_type = 'expense'
          AND audit_logs.entity_id = e.id
          AND audit_logs.company_id IS NULL
        """
    )


def downgrade() -> None:
    op.drop_index("ix_audit_logs_company_entity", table_name="audit_logs")
    op.drop_index("ix_audit_logs_company_id", table_name="audit_logs")
    op.drop_constraint("fk_audit_logs_company_id", "audit_logs", type_="foreignkey")
    op.drop_column("audit_logs", "company_id")
