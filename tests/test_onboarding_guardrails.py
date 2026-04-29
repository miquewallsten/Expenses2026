import pytest
from packages.core.platform.models import Company
from packages.core.platform.models_accounting_category import AccountingCategory
from packages.core.platform.models_expense_policy import CompanyExpensePolicy
from packages.core.platform.models_approval_setup import ApprovalSetup
from packages.core.platform.models_accounting_setup import AccountingSetup
from packages.core.platform.models_legal_entity import LegalEntity
from packages.modules.admin.service.company_setup_service import get_or_create_company_setup
from packages.modules.admin.service.onboarding_service import compute_checklist, set_onboarding_step


class TestOnboardingGuardrails:
    def test_compute_checklist_includes_blockers(self, db_session):
        company = Company(name="Test", slug="test-guard")
        db_session.add(company)
        db_session.commit()

        setup = get_or_create_company_setup(db_session, company.id)
        setup.display_name = "Test Corp"
        db_session.commit()

        checklist = compute_checklist(db_session, company.id)
        assert "blockers" in checklist
        assert len(checklist["blockers"]) > 0
        assert checklist["go_live_ready"] is False

    def test_set_onboarding_step_blocks_completion_when_not_ready(self, db_session):
        company = Company(name="Test", slug="test-guard2")
        db_session.add(company)
        db_session.commit()

        setup = get_or_create_company_setup(db_session, company.id)
        setup.display_name = "Test Corp"
        db_session.commit()

        with pytest.raises(ValueError) as exc_info:
            set_onboarding_step(db_session, company.id, 6)
        assert "Cannot complete onboarding" in str(exc_info.value)

    def test_set_onboarding_step_allows_completion_when_ready(self, db_session):
        company = Company(name="Test", slug="test-guard3")
        db_session.add(company)
        db_session.commit()

        setup = get_or_create_company_setup(db_session, company.id)
        setup.display_name = "Test Corp"
        setup.expenses_module_enabled = True
        setup.approvals_module_enabled = True
        setup.archive_module_enabled = False
        db_session.commit()

        le = LegalEntity(company_id=company.id, entity_name="Test SA", is_active=True)
        db_session.add(le)

        cat = AccountingCategory(company_id=company.id, code="GEN", name="General", is_active=True)
        db_session.add(cat)

        policy = CompanyExpensePolicy(company_id=company.id)
        db_session.add(policy)
        approval = ApprovalSetup(company_id=company.id)
        db_session.add(approval)
        accounting = AccountingSetup(company_id=company.id)
        db_session.add(accounting)

        db_session.commit()

        # Should succeed
        result = set_onboarding_step(db_session, company.id, 6)
        assert result.onboarding_step == 6
        assert result.onboarding_completed_at is not None

    def test_early_steps_not_blocked(self, db_session):
        company = Company(name="Test", slug="test-guard4")
        db_session.add(company)
        db_session.commit()

        setup = get_or_create_company_setup(db_session, company.id)
        db_session.commit()

        # Step 3 should be fine even with blockers
        result = set_onboarding_step(db_session, company.id, 3)
        assert result.onboarding_step == 3
