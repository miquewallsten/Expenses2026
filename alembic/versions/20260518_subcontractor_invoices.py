"""subcontractor invoice reports and invoices tables

Revision ID: sub_inv_001
Revises: 
Create Date: 2026-05-18
"""
from alembic import op
import sqlalchemy as sa

revision = "sub_inv_001"
down_revision = None  # adjust to last migration
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "subcontractor_invoice_reports",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("company_id", sa.Integer(), nullable=False),
        sa.Column("subcontractor_id", sa.Integer(), sa.ForeignKey("clients.id"), nullable=True),
        sa.Column("responsible_user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("status", sa.String(50), server_default="draft"),
        sa.Column("period_start", sa.Date(), nullable=True),
        sa.Column("period_end", sa.Date(), nullable=True),
        sa.Column("total_amount", sa.Numeric(14, 2), server_default="0"),
        sa.Column("total_isr_retention", sa.Numeric(14, 2), server_default="0"),
        sa.Column("total_iva_retention", sa.Numeric(14, 2), server_default="0"),
        sa.Column("total_net", sa.Numeric(14, 2), server_default="0"),
        sa.Column("project_id", sa.Integer(), nullable=True),
        sa.Column("client_id", sa.Integer(), nullable=True),
        sa.Column("cost_center_id", sa.Integer(), nullable=True),
        sa.Column("validation_status", sa.String(20), nullable=True),
        sa.Column("validation_notes", sa.Text(), nullable=True),
        sa.Column("approved_by", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("approved_at", sa.DateTime(), nullable=True),
        sa.Column("paid_at", sa.DateTime(), nullable=True),
        sa.Column("payment_reference", sa.String(255), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now()),
        sa.CheckConstraint("status IN ('draft','submitted','validated','manager_approved','accounting_approved','paid','rejected')", name="ck_sub_report_status_valid"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("idx_sub_report_company_status", "subcontractor_invoice_reports", ["company_id", "status"])
    op.create_index("idx_sub_report_subcontractor", "subcontractor_invoice_reports", ["company_id", "subcontractor_id"])

    op.create_table(
        "subcontractor_invoices",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("company_id", sa.Integer(), nullable=False),
        sa.Column("report_id", sa.Integer(), sa.ForeignKey("subcontractor_invoice_reports.id", ondelete="CASCADE"), nullable=False),
        sa.Column("uuid", sa.String(36), nullable=True),
        sa.Column("series", sa.String(25), nullable=True),
        sa.Column("folio", sa.String(40), nullable=True),
        sa.Column("amount", sa.Numeric(14, 2), nullable=False),
        sa.Column("isr_retention", sa.Numeric(14, 2), server_default="0"),
        sa.Column("iva_retention", sa.Numeric(14, 2), server_default="0"),
        sa.Column("subtotal", sa.Numeric(14, 2), server_default="0"),
        sa.Column("iva_amount", sa.Numeric(14, 2), server_default="0"),
        sa.Column("description", sa.String(500), nullable=True),
        sa.Column("invoice_date", sa.Date(), nullable=True),
        sa.Column("due_date", sa.Date(), nullable=True),
        sa.Column("sat_status", sa.String(20), nullable=True),
        sa.Column("sat_validated_at", sa.DateTime(), nullable=True),
        sa.Column("cfdi_version", sa.String(10), nullable=True),
        sa.Column("payment_method", sa.String(30), nullable=True),
        sa.Column("payment_form", sa.String(30), nullable=True),
        sa.Column("account_code", sa.String(50), nullable=True),
        sa.Column("category_code", sa.String(50), nullable=True),
        sa.Column("status", sa.String(50), server_default="draft"),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now()),
        sa.CheckConstraint("status IN ('draft','submitted','validated','approved','paid','rejected')", name="ck_sub_invoice_status_valid"),
        sa.CheckConstraint("amount >= 0", name="ck_sub_invoice_amount_non_negative"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("idx_sub_invoice_report", "subcontractor_invoices", ["report_id"])
    op.create_index("idx_sub_invoice_company", "subcontractor_invoices", ["company_id"])
    op.create_index("idx_sub_invoice_uuid", "subcontractor_invoices", ["uuid"])


def downgrade() -> None:
    op.drop_table("subcontractor_invoices")
    op.drop_table("subcontractor_invoice_reports")
