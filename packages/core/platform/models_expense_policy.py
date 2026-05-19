from datetime import datetime

from sqlalchemy import Boolean, DateTime, Integer, Numeric, String, func
from decimal import Decimal
from sqlalchemy.orm import Mapped, mapped_column

from apps.api.db import Base


class CompanyExpensePolicy(Base):
    """Per-company expense policy configuration.

    xml_required_mode allowed values:
        "never"     — XML not required for any expense
        "always"    — XML required for every expense
        "mxn_only"  — XML required only for MXN-denominated expenses

    allocation_dimensions allowed values:
        "project"
        "client"
        "cost_center"
        "project_client"
        "project_cost_center"
        "client_cost_center"
        "project_client_cost_center"
    """

    __tablename__ = "company_expense_policies"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)

    # One policy row per company
    company_id: Mapped[int] = mapped_column(Integer, unique=True, index=True, nullable=False)

    # XML requirements
    xml_required_mode: Mapped[str] = mapped_column(String(20), default="mxn_only", nullable=False)

    # Document pairing
    pdf_pair_required_for_cfdi: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # Expense types
    international_expenses_allowed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    tickets_allowed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    # Supporting documents
    require_justification: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    require_proof: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    # Allocation
    allow_split_allocations: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    allocation_dimensions: Mapped[str] = mapped_column(
        String(50), default="project_client_cost_center", nullable=False
    )

    # Document-free expenses
    # When True, employees may submit an expense with no uploaded documents at all.
    # The admin enables this for petty-cash, per-diem, or any scenario where
    # receipts are not expected.  The xml_required_mode and pdf_pair settings are
    # still honoured — so enabling this while xml_required_mode="always" would
    # still block on missing XML.  Intended use: set xml_required_mode="never",
    # require_proof=False, require_justification=False.
    allow_document_free_expenses: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    # Budget enforcement
    monthly_budget_per_employee: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    budget_enforcement: Mapped[str] = mapped_column(
        String(20), default="none", server_default="none", nullable=False,
        # "none" — no budget enforcement
        # "warn" — warn when over budget but allow submission
        # "block" — block expenses that exceed budget
    )

    # Pre-paid wallet settings
    wallet_enabled: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false", nullable=False)
    wallet_auto_deduct: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true", nullable=False)
    wallet_currency: Mapped[str] = mapped_column(String(3), default="MXN", server_default="MXN", nullable=False)

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now(), nullable=False
    )
