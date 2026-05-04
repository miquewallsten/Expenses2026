"""add_export_jobs_table

Revision ID: 0e69bec78e33
Revises: 8c3b666b9e6e
Create Date: 2026-05-04 11:04:11.335103

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0e69bec78e33'
down_revision: Union[str, Sequence[str], None] = '8c3b666b9e6e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create export_jobs table for tenant data export tracking."""
    op.create_table(
        "export_jobs",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("company_id", sa.Integer(), nullable=False, index=True),
        # Export configuration
        sa.Column("export_type", sa.String(20), default="full"),
        sa.Column("date_range_start", sa.DateTime(), nullable=True),
        sa.Column("date_range_end", sa.DateTime(), nullable=True),
        sa.Column("include_files", sa.Boolean(), default=True, nullable=False),
        sa.Column("include_audit", sa.Boolean(), default=True, nullable=False),
        # Status
        sa.Column("status", sa.String(20), default="pending"),
        sa.Column(
            "created_at",
            sa.DateTime(),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("completed_at", sa.DateTime(), nullable=True),
        # Download
        sa.Column("download_url", sa.String(1024), nullable=True),
        sa.Column("expires_at", sa.DateTime(), nullable=True),
        sa.Column("file_size_bytes", sa.Integer(), nullable=True),
        # Error handling
        sa.Column("error_message", sa.Text(), nullable=True),
        # Requester
        sa.Column("requested_by", sa.Integer(), nullable=True),
    )
    # Create index for job queue polling
    op.create_index("ix_export_jobs_status", "export_jobs", ["status"])


def downgrade() -> None:
    """Remove export_jobs table."""
    op.drop_index("ix_export_jobs_status", table_name="export_jobs")
    op.drop_table("export_jobs")
