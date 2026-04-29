from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from sqlalchemy.orm import Session


@dataclass
class RequirementGap:
    module: str
    kind: str  # entity | policy | prerequisite
    target: str
    message: str
    severity: str = "blocker"  # blocker | warning
    wizard_step: str | None = None


@dataclass
class ModuleReadiness:
    module: str
    enabled: bool
    ok: bool
    gaps: list[RequirementGap] = field(default_factory=list)


@dataclass
class ReadinessReport:
    company_id: int
    ok: bool
    modules: list[ModuleReadiness] = field(default_factory=list)
    blockers: list[RequirementGap] = field(default_factory=list)
    warnings: list[RequirementGap] = field(default_factory=list)


# ── Module requirements ─────────────────────────────────────────────────────

_MODULE_REQUIREMENTS: dict[str, dict[str, list[tuple[str, str, str]]]] = {
    "expenses": {
        "required_entities": [
            ("CompanySetup", "display_name", "Company name is required"),
            ("CompanySetup", "country_code", "Country is required for tax rules"),
            ("CompanySetup", "base_currency", "Base currency is required"),
            ("LegalEntity", "count>0", "At least one legal entity is required"),
            ("AccountingCategory", "count>0", "At least one accounting category is required"),
        ],
        "required_policies": [
            ("CompanyExpensePolicy", "exists", "Expense policy must be configured"),
            ("ApprovalSetup", "exists", "Approval workflow must be configured"),
        ],
    },
    "accounting": {
        "required_entities": [
            ("AccountingCategory", "count>0", "Chart of accounts cannot be empty"),
        ],
        "required_policies": [
            ("AccountingSetup", "exists", "Accounting setup must be configured"),
        ],
    },
    "approvals": {
        "required_policies": [
            ("ApprovalSetup", "exists", "Approval workflow must be configured"),
        ],
    },
    "purchase_requests": {
        "required_policies": [
            ("ApprovalSetup", "exists", "Approval workflow is required for purchase requests"),
        ],
    },
    "time_tracking": {
        "required_entities": [
            ("CompanySetup", "display_name", "Company name is required"),
        ],
    },
    "amex_reconciliation": {
        "prerequisites": [
            ("expenses", "The expenses module must be enabled for AMEX reconciliation"),
        ],
    },
    "archive": {
        "required_policies": [
            ("ArchiveConfig", "exists", "Archive configuration should be set up"),
        ],
    },
}

_WIZARD_STEP_MAP: dict[str, str] = {
    "CompanySetup": "company",
    "LegalEntity": "legal_entities",
    "AccountingCategory": "chart_of_accounts",
    "CompanyExpensePolicy": "approval_policy",
    "ApprovalSetup": "approval_policy",
    "AccountingSetup": "chart_of_accounts",
    "ArchiveConfig": "company",
}


class TenantReadinessValidator:
    """Checks whether a tenant has all required settings for enabled modules."""

    def validate_company(self, db: Session, company_id: int) -> ReadinessReport:
        from packages.core.platform.models_company_setup import CompanySetup

        setup = db.query(CompanySetup).filter_by(company_id=company_id).first()
        if setup is None:
            return ReadinessReport(
                company_id=company_id,
                ok=False,
                modules=[],
                blockers=[
                    RequirementGap(
                        module="global",
                        kind="entity",
                        target="CompanySetup",
                        message="Company setup has not been created.",
                        severity="blocker",
                        wizard_step="company",
                    )
                ],
            )

        module_flags = {
            "expenses": setup.expenses_module_enabled,
            "accounting": setup.accounting_module_enabled,
            "approvals": setup.approvals_module_enabled,
            "purchase_requests": setup.purchase_requests_module_enabled,
            "time_tracking": setup.time_allocation_module_enabled,
            "amex_reconciliation": setup.amex_reconciliation_module_enabled,
            "archive": setup.archive_module_enabled,
            "subcontractor": setup.subcontractor_module_enabled,
        }

        modules: list[ModuleReadiness] = []
        blockers: list[RequirementGap] = []
        warnings: list[RequirementGap] = []

        for module_key, enabled in module_flags.items():
            if not enabled:
                continue
            reqs = _MODULE_REQUIREMENTS.get(module_key)
            if not reqs:
                continue

            mod_gaps: list[RequirementGap] = []

            # prerequisites
            for prereq_mod, msg in reqs.get("prerequisites", []):
                if not module_flags.get(prereq_mod, False):
                    gap = RequirementGap(
                        module=module_key,
                        kind="prerequisite",
                        target=prereq_mod,
                        message=msg,
                        severity="blocker",
                        wizard_step=_WIZARD_STEP_MAP.get(prereq_mod),
                    )
                    mod_gaps.append(gap)
                    blockers.append(gap)

            # required entities
            for entity_name, check, msg in reqs.get("required_entities", []):
                ok = self._check_entity(db, company_id, entity_name, check, setup)
                if not ok:
                    gap = RequirementGap(
                        module=module_key,
                        kind="entity",
                        target=f"{entity_name}.{check}",
                        message=msg,
                        severity="blocker",
                        wizard_step=_WIZARD_STEP_MAP.get(entity_name),
                    )
                    mod_gaps.append(gap)
                    blockers.append(gap)

            # required policies
            for policy_name, check, msg in reqs.get("required_policies", []):
                ok = self._check_policy(db, company_id, policy_name)
                if not ok:
                    gap = RequirementGap(
                        module=module_key,
                        kind="policy",
                        target=f"{policy_name}.{check}",
                        message=msg,
                        severity="blocker",
                        wizard_step=_WIZARD_STEP_MAP.get(policy_name),
                    )
                    mod_gaps.append(gap)
                    blockers.append(gap)

            modules.append(
                ModuleReadiness(
                    module=module_key,
                    enabled=True,
                    ok=len(mod_gaps) == 0,
                    gaps=mod_gaps,
                )
            )

        return ReadinessReport(
            company_id=company_id,
            ok=len(blockers) == 0,
            modules=modules,
            blockers=blockers,
            warnings=warnings,
        )

    def validate_module(self, db: Session, company_id: int, module_key: str) -> ModuleReadiness:
        report = self.validate_company(db, company_id)
        for mod in report.modules:
            if mod.module == module_key:
                return mod
        return ModuleReadiness(module=module_key, enabled=False, ok=True)

    def get_blockers(self, db: Session, company_id: int) -> list[RequirementGap]:
        return self.validate_company(db, company_id).blockers

    # ── Private checks ─────────────────────────────────────────────────────────

    def _check_entity(
        self,
        db: Session,
        company_id: int,
        entity_name: str,
        check: str,
        setup: Any | None,
    ) -> bool:
        if entity_name == "CompanySetup":
            if setup is None:
                return False
            val = getattr(setup, check, None)
            return val is not None and str(val).strip() != ""

        if entity_name == "LegalEntity":
            from packages.core.platform.models_legal_entity import LegalEntity
            return db.query(LegalEntity).filter_by(company_id=company_id, is_active=True).count() > 0

        if entity_name == "AccountingCategory":
            from packages.core.platform.models_accounting_category import AccountingCategory
            return db.query(AccountingCategory).filter_by(company_id=company_id, is_active=True).count() > 0

        return True

    def _check_policy(self, db: Session, company_id: int, policy_name: str) -> bool:
        if policy_name == "CompanyExpensePolicy":
            from packages.core.platform.models_expense_policy import CompanyExpensePolicy
            return db.query(CompanyExpensePolicy).filter_by(company_id=company_id).first() is not None

        if policy_name == "ApprovalSetup":
            from packages.core.platform.models_approval_setup import ApprovalSetup
            return db.query(ApprovalSetup).filter_by(company_id=company_id).first() is not None

        if policy_name == "AccountingSetup":
            from packages.core.platform.models_accounting_setup import AccountingSetup
            return db.query(AccountingSetup).filter_by(company_id=company_id).first() is not None

        if policy_name == "ArchiveConfig":
            from packages.core.platform.models_archive_config import ArchiveConfig
            return db.query(ArchiveConfig).filter_by(company_id=company_id).first() is not None

        return True


VALIDATOR = TenantReadinessValidator()
