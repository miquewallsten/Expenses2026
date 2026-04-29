import pytest
from packages.modules.agent.core.context import AgentContext
from packages.modules.agent.tools.readiness_tools import (
    _check_tenant_readiness,
    _explain_module_requirements,
    _suggest_next_configuration_step,
)


class TestAgentReadinessTools:
    def test_check_tenant_readiness_returns_blockers(self, db_session):
        from packages.core.platform.models import Company
        from packages.modules.admin.service.company_setup_service import get_or_create_company_setup

        company = Company(name="Test", slug="test-agent")
        db_session.add(company)
        db_session.commit()

        setup = get_or_create_company_setup(db_session, company.id)
        setup.display_name = "Test Corp"
        db_session.commit()

        ctx = AgentContext(
            db=db_session,
            company_id=company.id,
            user_id=1,
            user_email="test@example.com",
            user_role="admin",
            persona="admin",
            locale="es",
            session_id="sess_1",
        )

        result = _check_tenant_readiness(ctx, None)
        assert result.ok is True
        assert result.data["ok"] is False
        assert len(result.data["blockers"]) > 0

    def test_check_tenant_readiness_ready_company(self, db_session):
        from packages.core.platform.models import Company
        from packages.core.platform.models_accounting_category import AccountingCategory
        from packages.core.platform.models_expense_policy import CompanyExpensePolicy
        from packages.core.platform.models_approval_setup import ApprovalSetup
        from packages.core.platform.models_accounting_setup import AccountingSetup
        from packages.core.platform.models_legal_entity import LegalEntity
        from packages.modules.admin.service.company_setup_service import get_or_create_company_setup

        company = Company(name="Test", slug="test-agent2")
        db_session.add(company)
        db_session.commit()

        setup = get_or_create_company_setup(db_session, company.id)
        setup.display_name = "Test Corp"
        setup.expenses_module_enabled = True
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

        ctx = AgentContext(
            db=db_session,
            company_id=company.id,
            user_id=1,
            user_email="test@example.com",
            user_role="admin",
            persona="admin",
            locale="es",
            session_id="sess_2",
        )

        result = _check_tenant_readiness(ctx, None)
        assert result.ok is True
        assert result.data["ok"] is True

    def test_explain_module_requirements(self, db_session):
        from packages.core.platform.models import Company
        from packages.modules.admin.service.company_setup_service import get_or_create_company_setup

        company = Company(name="Test", slug="test-agent3")
        db_session.add(company)
        db_session.commit()

        get_or_create_company_setup(db_session, company.id)
        db_session.commit()

        ctx = AgentContext(
            db=db_session,
            company_id=company.id,
            user_id=1,
            user_email="test@example.com",
            user_role="admin",
            persona="admin",
            locale="es",
            session_id="sess_3",
        )

        from pydantic import BaseModel
        class Args(BaseModel):
            module_key: str = "expenses"

        result = _explain_module_requirements(ctx, Args())
        assert result.ok is True
        assert result.data["enabled"] is True
        # Module is enabled by default but not fully configured

    def test_suggest_next_step(self, db_session):
        from packages.core.platform.models import Company
        from packages.modules.admin.service.company_setup_service import get_or_create_company_setup

        company = Company(name="Test", slug="test-agent4")
        db_session.add(company)
        db_session.commit()

        setup = get_or_create_company_setup(db_session, company.id)
        setup.display_name = "Test Corp"
        setup.expenses_module_enabled = True
        db_session.commit()

        ctx = AgentContext(
            db=db_session,
            company_id=company.id,
            user_id=1,
            user_email="test@example.com",
            user_role="admin",
            persona="admin",
            locale="es",
            session_id="sess_4",
        )

        result = _suggest_next_configuration_step(ctx, None)
        assert result.ok is True
        assert result.data["ok"] is False
        assert result.data["suggestion"] is not None
        assert "wizard_step" in result.data["suggestion"]
