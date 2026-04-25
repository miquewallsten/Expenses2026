"""amex reconciliation tables

Revision ID: c6f9d2a4b8e7
Revises: b5e8f1c3d7a2
Create Date: 2025-01-15 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "c6f9d2a4b8e7"
down_revision: Union[str, None] = "b5e8f1c3d7a2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "amex_statements",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("company_id", sa.Integer(), nullable=False, index=True),
        sa.Column("reconciler_id", sa.Integer(), nullable=True, index=True),
        sa.Column("filename", sa.String(length=255), nullable=False),
        sa.Column("period_start", sa.Date(), nullable=True),
        sa.Column("period_end", sa.Date(), nullable=True),
        sa.Column("card_last4", sa.String(length=8), nullable=True),
        sa.Column("currency", sa.String(length=10), nullable=False, server_default="MXN"),
        sa.Column("total_amount", sa.Numeric(14, 2), nullable=False, server_default="0"),
        sa.Column("line_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("status", sa.String(length=30), nullable=False, server_default="draft"),
        sa.Column("submitted_at", sa.DateTime(), nullable=True),
        sa.Column("expense_id", sa.Integer(), nullable=True, index=True),
        sa.Column("report_id", sa.Integer(), nullable=True, index=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint(
            "status IN ('draft','submitted','manager_approved','approved','rejected')",
            name="ck_amex_statement_status_valid",
        ),
    )

    op.create_table(
        "amex_cfdi_documents",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "statement_id",
            sa.Integer(),
            sa.ForeignKey("amex_statements.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("company_id", sa.Integer(), nullable=False, index=True),
        sa.Column("xml_filename", sa.String(length=255), nullable=True),
        sa.Column("xml_storage_key", sa.String(length=512), nullable=True),
        sa.Column("xml_content", sa.Text(), nullable=True),
        sa.Column("pdf_filename", sa.String(length=255), nullable=True),
        sa.Column("pdf_storage_key", sa.String(length=512), nullable=True),
        sa.Column("uuid", sa.String(length=64), nullable=True),
        sa.Column("emisor_rfc", sa.String(length=20), nullable=True),
        sa.Column("emisor_name", sa.String(length=255), nullable=True),
        sa.Column("receptor_rfc", sa.String(length=20), nullable=True),
        sa.Column("total", sa.Numeric(14, 2), nullable=True),
        sa.Column("subtotal", sa.Numeric(14, 2), nullable=True),
        sa.Column("invoice_date", sa.Date(), nullable=True),
        sa.Column("sat_status", sa.String(length=30), nullable=True),
        sa.Column("validation_status", sa.String(length=20), nullable=False, server_default="pending"),
        sa.Column("validation_error", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_amex_doc_statement", "amex_cfdi_documents", ["statement_id"])
    op.create_index("ix_amex_doc_uuid", "amex_cfdi_documents", ["uuid"])

    op.create_table(
        "amex_statement_lines",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "statement_id",
            sa.Integer(),
            sa.ForeignKey("amex_statements.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("company_id", sa.Integer(), nullable=False, index=True),
        sa.Column("line_no", sa.Integer(), nullable=False),
        sa.Column("posted_date", sa.Date(), nullable=True),
        sa.Column("description", sa.String(length=500), nullable=False),
        sa.Column("merchant", sa.String(length=255), nullable=True),
        sa.Column("amount", sa.Numeric(14, 2), nullable=False),
        sa.Column("currency", sa.String(length=10), nullable=False, server_default="MXN"),
        sa.Column("reference", sa.String(length=100), nullable=True),
        sa.Column("project_id", sa.Integer(), nullable=True),
        sa.Column("cost_center_id", sa.Integer(), nullable=True),
        sa.Column("category_code", sa.String(length=50), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column(
            "matched_document_id",
            sa.Integer(),
            sa.ForeignKey("amex_cfdi_documents.id", ondelete="SET NULL"),
            nullable=True,
            index=True,
        ),
        sa.Column("match_confidence", sa.String(length=20), nullable=False, server_default="none"),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="unmatched"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint(
            "status IN ('unmatched','matched','no_invoice','missing')",
            name="ck_amex_line_status_valid",
        ),
    )
    op.create_index("ix_amex_line_statement", "amex_statement_lines", ["statement_id"])


def downgrade() -> None:
    op.drop_index("ix_amex_line_statement", table_name="amex_statement_lines")
    op.drop_table("amex_statement_lines")
    op.drop_index("ix_amex_doc_uuid", table_name="amex_cfdi_documents")
    op.drop_index("ix_amex_doc_statement", table_name="amex_cfdi_documents")
    op.drop_table("amex_cfdi_documents")
    op.drop_table("amex_statements")
