import pytest
from packages.core.platform.models_accounting_category import AccountingCategory
from packages.core.platform.models_company_setup import CompanySetup
from packages.core.platform.models_legal_entity import LegalEntity
from packages.core.platform.service.tenant_validator import VALIDATOR, RequirementGap


class TestTenantValidator:
    def test_empty_company_has_blockers(self, db_session):
        from packages.core.platform.models import Company
        company = Company(name="Test", slug="test")
        db_session.add(company)
        db_session.commit()

        report = VALIDATOR.validate_company(db_session, company.id)
        assert report.ok is False
        assert len(report.blockers) > 0
        # No CompanySetup row exists yet → single global blocker
        assert any(g.module == "global" for g in report.blockers)

    def test_company_with_setup_but_missing_display_name(self, db_session):
        from packages.core.platform.models import Company
        from packages.modules.admin.service.company_setup_service import get_or_create_company_setup

        company = Company(name="Test", slug="test-missing-name")
        db_session.add(company)
        db_session.commit()

        setup = get_or_create_company_setup(db_session, company.id)
        setup.display_name = None
        db_session.commit()

        report = VALIDATOR.validate_company(db_session, company.id)
        assert report.ok is False
        assert any("display_name" in g.target for g in report.blockers)

    def test_expenses_module_blocked_without_categories(self, db_session):
        from packages.core.platform.models import Company
        from packages.modules.admin.service.company_setup_service import get_or_create_company_setup

        company = Company(name="Test", slug="test2")
        db_session.add(company)
        db_session.commit()

        setup = get_or_create_company_setup(db_session, company.id)
        setup.display_name = "Test Corp"
        # country_code and base_currency already default to MX / MXN
        setup.expenses_module_enabled = True
        db_session.commit()

        # Add legal entity but no categories
        le = LegalEntity(company_id=company.id, entity_name="Test SA", is_active=True)
        db_session.add(le)
        db_session.commit()

        report = VALIDATOR.validate_company(db_session, company.id)
        assert report.ok is False
        assert any(g.module == "expenses" and "AccountingCategory" in g.target for g in report.blockers)

    def test_fully_ready_company(self, db_session):
        from packages.core.platform.models import Company
        from packages.core.platform.models_expense_policy import CompanyExpensePolicy
        from packages.core.platform.models_approval_setup import ApprovalSetup
        from packages.core.platform.models_accounting_setup import AccountingSetup
        from packages.modules.admin.service.company_setup_service import get_or_create_company_setup

        company = Company(name="Test", slug="test3")
        db_session.add(company)
        db_session.commit()

        setup = get_or_create_company_setup(db_session, company.id)
        setup.display_name = "Test Corp"
        setup.expenses_module_enabled = True
        setup.accounting_module_enabled = True
        setup.approvals_module_enabled = True
        setup.archive_module_enabled = False
        db_session.commit()

        le = LegalEntity(company_id=company.id, entity_name="Test SA", is_active=True)
        db_session.add(le)

        cat = AccountingCategory(company_id=company.id, code="GEN", name="General", is_active=True)
        db_session.add(cat)

        # Required policies
        policy = CompanyExpensePolicy(company_id=company.id)
        db_session.add(policy)
        approval = ApprovalSetup(company_id=company.id)
        db_session.add(approval)
        accounting = AccountingSetup(company_id=company.id)
        db_session.add(accounting)

        db_session.commit()

        report = VALIDATOR.validate_company(db_session, company.id)
        assert report.ok is True
        assert len(report.blockers) == 0

    def test_module_readiness_for_single_module(self, db_session):
        from packages.core.platform.models import Company
        from packages.modules.admin.service.company_setup_service import get_or_create_company_setup

        company = Company(name="Test", slug="test4")
        db_session.add(company)
        db_session.commit()

        setup = get_or_create_company_setup(db_session, company.id)
        setup.display_name = "Test Corp"
        setup.expenses_module_enabled = True
        db_session.commit()

        le = LegalEntity(company_id=company.id, entity_name="Test SA", is_active=True)
        db_session.add(le)
        cat = AccountingCategory(company_id=company.id, code="GEN", name="General", is_active=True)
        db_session.add(cat)
        db_session.commit()

        mod = VALIDATOR.validate_module(db_session, company.id, "expenses")
        assert mod.enabled is True
        # Not fully ready because policies missing, but the module is enabled

    def test_get_blockers_returns_only_blockers(self, db_session):
        from packages.core.platform.models import Company

        company = Company(name="Test", slug="test5")
        db_session.add(company)
        db_session.commit()

        blockers = VALIDATOR.get_blockers(db_session, company.id)
        assert len(blockers) > 0
        assert all(g.severity == "blocker" for g in blockers)
