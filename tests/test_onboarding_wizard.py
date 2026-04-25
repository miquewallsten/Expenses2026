"""Phase 4.6 — onboarding wizard backend (step + checklist)."""
from __future__ import annotations

import pytest
from sqlalchemy.orm import Session

from packages.core.platform.models import Company
from packages.core.platform.models_accounting_category import AccountingCategory
from packages.core.platform.models_legal_entity import LegalEntity
from packages.core.platform.models_user import User
from packages.modules.admin.service.onboarding_service import (
    compute_checklist,
    set_onboarding_step,
)
from packages.modules.admin.service.company_setup_service import (
    get_or_create_company_setup,
    upsert_company_setup,
)
from packages.modules.admin.schemas.company_setup import CompanySetupUpdate


@pytest.fixture
def co46(db_session: Session) -> Company:
    co = Company(name="P46", slug="p46")
    db_session.add(co)
    db_session.commit()
    db_session.refresh(co)
    return co


def test_checklist_empty_company_all_fail(db_session: Session, co46: Company) -> None:
    out = compute_checklist(db_session, co46.id)
    assert out["company_id"] == co46.id
    assert out["passed"] == 0
    assert out["total"] == 5
    assert out["go_live_ready"] is False
    assert out["onboarding_step"] == 0
    assert out["onboarding_completed_at"] is None
    assert out["items"]["company"]["ok"] is False
    assert out["items"]["legal_entities"]["ok"] is False
    assert out["items"]["chart_of_accounts"]["ok"] is False
    assert out["items"]["users"]["ok"] is False


def test_checklist_passes_when_all_required_set(
    db_session: Session, co46: Company
) -> None:
    upsert_company_setup(
        db_session,
        co46.id,
        CompanySetupUpdate(
            display_name="ACME",
            country_code="MX",
            base_currency="MXN",
            has_managers=True,
        ),
    )
    db_session.add(LegalEntity(
        company_id=co46.id, entity_name="ACME MX",
    ))
    db_session.add(AccountingCategory(
        company_id=co46.id, code="600-01-001", name="Travel",
    ))
    db_session.add(User(
        company_id=co46.id, email="emp@p46.test", full_name="E", role="employee",
    ))
    db_session.commit()

    out = compute_checklist(db_session, co46.id)
    assert out["passed"] == 5
    assert out["go_live_ready"] is True
    for k, v in out["items"].items():
        assert v["ok"] is True, f"{k} should pass"


def test_set_onboarding_step_persists_and_completes(
    db_session: Session, co46: Company
) -> None:
    s = set_onboarding_step(db_session, co46.id, 3)
    assert s.onboarding_step == 3
    assert s.onboarding_completed_at is None

    s = set_onboarding_step(db_session, co46.id, 6)
    assert s.onboarding_step == 6
    assert s.onboarding_completed_at is not None

    # Bumping again does not reset timestamp
    first_ts = s.onboarding_completed_at
    s = set_onboarding_step(db_session, co46.id, 6)
    assert s.onboarding_completed_at == first_ts


def test_set_onboarding_step_rejects_out_of_range(
    db_session: Session, co46: Company
) -> None:
    with pytest.raises(ValueError):
        set_onboarding_step(db_session, co46.id, -1)
    with pytest.raises(ValueError):
        set_onboarding_step(db_session, co46.id, 7)


def test_checklist_skips_approval_check_when_module_disabled(
    db_session: Session, co46: Company
) -> None:
    upsert_company_setup(
        db_session,
        co46.id,
        CompanySetupUpdate(approvals_module_enabled=False, has_managers=False),
    )
    out = compute_checklist(db_session, co46.id)
    assert out["items"]["approval_policy"]["ok"] is True
