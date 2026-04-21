from typing import Any

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from apps.api.auth import require_admin
from apps.api.deps import get_db
from packages.modules.admin.service.company_setup_service import get_or_create_company_setup
from packages.modules.admin.service.accounting_setup_service import get_or_create_accounting_setup
from packages.modules.admin.service.approval_setup_service import get_or_create_approval_setup
from packages.modules.admin.service.workflow_setup_service import get_or_create_workflow_setup
from packages.modules.expenses.service.policy_service import get_or_create_company_expense_policy
from packages.core.platform.models_accounting_category import AccountingCategory
from packages.core.platform.models_export_bundle_config import ExportBundleConfig
from packages.core.platform.models_archive_config import ArchiveConfig

from packages.modules.admin.schemas.company_setup import CompanySetupRead
from packages.modules.admin.schemas.accounting_setup import AccountingSetupRead
from packages.modules.admin.schemas.approval_setup import ApprovalSetupRead
from packages.modules.admin.schemas.workflow_setup import WorkflowSetupRead
from packages.modules.expenses.schemas.policy import CompanyExpensePolicyRead

router = APIRouter(prefix="/admin/portal-config", tags=["admin"], dependencies=[Depends(require_admin)])


class DerivedConfig(BaseModel):
    enabled_modules: list[str]
    allocation_dimensions: list[str]
    allow_split_allocations: bool
    tickets_allowed: bool
    international_expenses_allowed: bool
    xml_required_mode: str
    pdf_pair_required_for_cfdi: bool
    allow_document_free_expenses: bool
    manager_flow_enabled: bool
    accounting_flow_enabled: bool
    workflow_mode: str
    # Derived routing outcome — the actual path expenses will travel given the
    # *combination* of company setup, approval setup, and accounting setup.
    # Possible values:
    #   direct_processing      — no manager or accounting review step is active
    #   manager_only           — expenses go to manager; accounting is not involved
    #   accounting_only        — expenses go directly to accounting; no manager step
    #   manager_then_accounting — expenses pass manager first, then accounting
    #   disabled_or_conflicted — config implies a flow that cannot actually operate
    #                            (e.g. manager_then_accounting but managers disabled)
    effective_review_route: str


class AccountingCategoryBrief(BaseModel):
    code: str
    expense_account_code: str | None
    requires_project: bool


class ExportBundleConfigBrief(BaseModel):
    bundle_name_pattern: str
    export_format: str


class ArchiveConfigBrief(BaseModel):
    file_pattern: str
    folder_pattern: str


class PortalConfigRead(BaseModel):
    company_setup: CompanySetupRead
    expense_policy: CompanyExpensePolicyRead
    accounting_setup: AccountingSetupRead
    approval_setup: ApprovalSetupRead
    workflow_setup: WorkflowSetupRead
    derived: DerivedConfig
    accounting_categories: list[AccountingCategoryBrief] = []
    export_config: ExportBundleConfigBrief
    archive_config: ArchiveConfigBrief


def _compute_enabled_modules(cs: Any) -> list[str]:
    mapping = {
        "expenses": cs.expenses_module_enabled,
        "time_allocation": cs.time_allocation_module_enabled,
        "subcontractor": cs.subcontractor_module_enabled,
        "reimbursements": cs.reimbursements_module_enabled,
        "approvals": cs.approvals_module_enabled,
        "accounting": cs.accounting_module_enabled,
        "archive": cs.archive_module_enabled,
        "ai_copilot": cs.ai_copilot_enabled,
        "purchase_requests": cs.purchase_requests_module_enabled,
    }
    return [name for name, enabled in mapping.items() if enabled]


def _parse_allocation_dimensions(raw: str | None) -> list[str]:
    if not raw:
        return []
    return [dim.strip() for dim in raw.split("_") if dim.strip()]


def _compute_effective_review_route(
    approval_mode: str,
    manager_flow_enabled: bool,
    accounting_flow_enabled: bool,
) -> str:
    """
    Derive the actual routing path that expenses will travel, given the
    *resolved* flow flags rather than the raw config fields in isolation.

    Rules (evaluated in order):
    - If approval_mode is unrecognised → disabled_or_conflicted
    - none: accounting_only if accounting active, else direct_processing
    - accounting_only: accounting_only if accounting active, else disabled_or_conflicted
    - manager_only / threshold_based:
        * managers active → manager_only
        * managers disabled but accounting active → accounting_only
          (the manager step was the only step; accounting can still run directly)
        * otherwise → disabled_or_conflicted
    - manager_then_accounting:
        * both active → manager_then_accounting
        * either missing → disabled_or_conflicted
          (we cannot silently skip the manager prerequisite)
    """
    _KNOWN = {
        "none", "accounting_only", "manager_only",
        "threshold_based", "manager_then_accounting",
    }
    mode = approval_mode or "none"
    if mode not in _KNOWN:
        return "disabled_or_conflicted"

    if mode == "none":
        return "accounting_only" if accounting_flow_enabled else "direct_processing"

    if mode == "accounting_only":
        return "accounting_only" if accounting_flow_enabled else "disabled_or_conflicted"

    if mode in ("manager_only", "threshold_based"):
        if manager_flow_enabled:
            return "manager_only"
        # Manager path configured but managers are disabled.
        # Accounting can still operate directly if it is active and the
        # workflow does not require a manager prerequisite.
        if accounting_flow_enabled:
            return "accounting_only"
        return "disabled_or_conflicted"

    if mode == "manager_then_accounting":
        if manager_flow_enabled and accounting_flow_enabled:
            return "manager_then_accounting"
        # Sequential flow is broken if either step is missing.
        # Do not silently reroute — the config is conflicted.
        return "disabled_or_conflicted"

    return "disabled_or_conflicted"  # unreachable after _KNOWN guard


@router.get("/{company_id}", response_model=PortalConfigRead)
def get_portal_config(company_id: int, db: Session = Depends(get_db)):
    company_setup = get_or_create_company_setup(db, company_id)
    expense_policy = get_or_create_company_expense_policy(db, company_id)
    accounting_setup = get_or_create_accounting_setup(db, company_id)
    approval_setup = get_or_create_approval_setup(db, company_id)
    workflow_setup = get_or_create_workflow_setup(db, company_id)

    manager_flow_enabled = (
        bool(company_setup.has_managers)
        and approval_setup.approval_mode in ("manager_only", "manager_then_accounting", "threshold_based")
    )

    accounting_flow_enabled = (
        bool(company_setup.accounting_module_enabled)
        and accounting_setup.accounting_review_mode not in ("none", None, "")
    )

    derived = DerivedConfig(
        enabled_modules=_compute_enabled_modules(company_setup),
        allocation_dimensions=_parse_allocation_dimensions(expense_policy.allocation_dimensions),
        allow_split_allocations=expense_policy.allow_split_allocations,
        tickets_allowed=expense_policy.tickets_allowed,
        international_expenses_allowed=expense_policy.international_expenses_allowed,
        xml_required_mode=expense_policy.xml_required_mode,
        pdf_pair_required_for_cfdi=expense_policy.pdf_pair_required_for_cfdi,
        allow_document_free_expenses=expense_policy.allow_document_free_expenses,
        manager_flow_enabled=manager_flow_enabled,
        accounting_flow_enabled=accounting_flow_enabled,
        workflow_mode=workflow_setup.default_expense_workflow_mode or "standard",
        effective_review_route=_compute_effective_review_route(
            approval_mode=approval_setup.approval_mode or "none",
            manager_flow_enabled=manager_flow_enabled,
            accounting_flow_enabled=accounting_flow_enabled,
        ),
    )

    categories = (
        db.query(AccountingCategory)
        .filter(
            AccountingCategory.company_id == company_id,
            AccountingCategory.is_active.is_(True),
        )
        .order_by(AccountingCategory.code)
        .all()
    )

    bundle_cfg = (
        db.query(ExportBundleConfig)
        .filter(ExportBundleConfig.company_id == company_id)
        .first()
    )

    export_config_brief = ExportBundleConfigBrief(
        bundle_name_pattern=bundle_cfg.bundle_name_pattern if bundle_cfg else "company{company_id}_{date}_export_bundle",
        export_format=bundle_cfg.export_format             if bundle_cfg else "json",
    )

    archive_cfg = (
        db.query(ArchiveConfig)
        .filter(ArchiveConfig.company_id == company_id)
        .first()
    )
    archive_config_brief = ArchiveConfigBrief(
        file_pattern=archive_cfg.file_pattern   if archive_cfg else "expense_{expense_id}_{date}",
        folder_pattern=archive_cfg.folder_pattern if archive_cfg else "{year}/{month}/expenses",
    )

    return PortalConfigRead(
        company_setup=CompanySetupRead.model_validate(company_setup),
        expense_policy=CompanyExpensePolicyRead.model_validate(expense_policy),
        accounting_setup=AccountingSetupRead.model_validate(accounting_setup),
        approval_setup=ApprovalSetupRead.model_validate(approval_setup),
        workflow_setup=WorkflowSetupRead.model_validate(workflow_setup),
        derived=derived,
        accounting_categories=[
            AccountingCategoryBrief(
                code=c.code,
                expense_account_code=c.expense_account_code,
                requires_project=bool(c.requires_project),
            )
            for c in categories
        ],
        export_config=export_config_brief,
        archive_config=archive_config_brief,
    )
