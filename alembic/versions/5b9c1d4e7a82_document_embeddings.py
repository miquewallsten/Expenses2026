"""document_embeddings (Phase 8.1)

Revision ID: 5b9c1d4e7a82
Revises: 4e9a7c2b8d31
Create Date: 2026-04-25
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

# revision identifiers
revision = "5b9c1d4e7a82"
down_revision = "4e9a7c2b8d31"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    is_postgres = bind.dialect.name == "postgresql"

    # Best-effort: create pgvector extension if available (no-op in CI / SQLite).
    if is_postgres:
        try:
            op.execute("CREATE EXTENSION IF NOT EXISTS vector")
        except Exception:  # pragma: no cover
            pass

    # Embedding column type — pgvector(1536) on PG, TEXT fallback elsewhere.
    if is_postgres:
        try:
            from pgvector.sqlalchemy import Vector
            embedding_type: sa.types.TypeEngine = Vector(1536)
        except ImportError:  # pragma: no cover
            embedding_type = sa.Text()
    else:
        embedding_type = sa.Text()

    op.create_table(
        "document_embeddings",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column(
            "document_id",
            sa.Integer,
            sa.ForeignKey("expense_documents.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "expense_id",
            sa.Integer,
            sa.ForeignKey("expenses.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("company_id", sa.Integer, nullable=True),
        sa.Column("chunk_index", sa.Integer, nullable=False, server_default="0"),
        sa.Column("chunk_text", sa.Text, nullable=False),
        sa.Column("embedding", embedding_type, nullable=True),
        sa.Column("meta", sa.JSON, nullable=True),
        sa.Column(
            "model_name", sa.String(80), nullable=False,
            server_default="text-embedding-3-small",
        ),
        sa.Column(
            "created_at", sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False,
        ),
    )
    op.create_index(
        "ix_document_embeddings_document_id",
        "document_embeddings", ["document_id"],
    )
    op.create_index(
        "ix_document_embeddings_expense_id",
        "document_embeddings", ["expense_id"],
    )
    op.create_index(
        "ix_document_embeddings_company_id",
        "document_embeddings", ["company_id"],
    )
    op.create_index(
        "ix_document_embeddings_company_doc",
        "document_embeddings", ["company_id", "document_id"],
    )

    # IVFFlat ANN index — Postgres + pgvector only.
    if is_postgres:
        try:
            op.execute(
                "CREATE INDEX IF NOT EXISTS ix_document_embeddings_vector "
                "ON document_embeddings USING ivfflat "
                "(embedding vector_cosine_ops) WITH (lists = 100)"
            )
        except Exception:  # pragma: no cover
            pass


def downgrade() -> None:
    op.drop_index("ix_document_embeddings_company_doc", table_name="document_embeddings")
    op.drop_index("ix_document_embeddings_company_id", table_name="document_embeddings")
    op.drop_index("ix_document_embeddings_expense_id", table_name="document_embeddings")
    op.drop_index("ix_document_embeddings_document_id", table_name="document_embeddings")
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        try:
            op.execute("DROP INDEX IF EXISTS ix_document_embeddings_vector")
        except Exception:  # pragma: no cover
            pass
    op.drop_table("document_embeddings")
