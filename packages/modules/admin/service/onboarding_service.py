"""Phase 4.6 — onboarding checklist & step advancement.

Pure read-side computation: returns a dict of {step_key: {ok, label,
detail}} that the wizard's "Go-live checklist" page renders. Each check
is a simple SELECT count — no side effects.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy.orm import Session

from packages.core.platform.models_accounting_category import AccountingCategory
from packages.core.platform.models_company_setup import CompanySetup
from packages.core.platform.models_legal_entity import LegalEntity
from packages.core.platform.models_user import User
from packages.modules.admin.service.company_setup_service import (
    get_or_create_company_setup,
)


_TOTAL_STEPS = 6


def _check_company(setup: CompanySetup) -> dict[str, Any]:
    ok = bool(setup.display_name) and bool(setup.country_code) and bool(setup.base_currency)
    return {
        "ok": ok,
        "label": "Company profile",
        "detail": None if ok else "Missing display name, country, or base currency.",
    }


def _check_legal_entities(db: Session, company_id: int) -> dict[str, Any]:
    count = (
        db.query(LegalEntity)
        .filter(LegalEntity.company_id == company_id)
        .count()
    )
    return {
        "ok": count > 0,
        "label": "Legal entities",
        "detail": None if count else "No legal entities configured.",
        "count": count,
    }


def _check_chart_of_accounts(db: Session, company_id: int) -> dict[str, Any]:
    count = (
        db.query(AccountingCategory)
        .filter(AccountingCategory.company_id == company_id)
        .count()
    )
    return {
        "ok": count > 0,
        "label": "Chart of accounts",
        "detail": None if count else "No accounting categories defined.",
        "count": count,
    }


def _check_approval_policy(setup: CompanySetup) -> dict[str, Any]:
    ok = bool(setup.has_managers) or not setup.approvals_module_enabled
    return {
        "ok": ok,
        "label": "Approval policy",
        "detail": None if ok else "Approvals enabled but no manager hierarchy configured.",
    }


def _check_users(db: Session, company_id: int) -> dict[str, Any]:
    total = db.query(User).filter(User.company_id == company_id).count()
    non_admin = (
        db.query(User)
        .filter(User.company_id == company_id, User.role != "admin")
        .count()
    )
    return {
        "ok": non_admin > 0,
        "label": "Users",
        "detail": None if non_admin else "No employees imported yet.",
        "count": total,
    }


def compute_checklist(db: Session, company_id: int) -> dict[str, Any]:
    setup = get_or_create_company_setup(db, company_id)
    items = {
        "company": _check_company(setup),
        "legal_entities": _check_legal_entities(db, company_id),
        "chart_of_accounts": _check_chart_of_accounts(db, company_id),
        "approval_policy": _check_approval_policy(setup),
        "users": _check_users(db, company_id),
    }
    passed = sum(1 for it in items.values() if it["ok"])
    return {
        "company_id": company_id,
        "items": items,
        "passed": passed,
        "total": len(items),
        "go_live_ready": passed == len(items),
        "onboarding_step": setup.onboarding_step,
        "onboarding_completed_at": (
            setup.onboarding_completed_at.isoformat() + "Z"
            if setup.onboarding_completed_at
            else None
        ),
    }


def set_onboarding_step(
    db: Session, company_id: int, step: int
) -> CompanySetup:
    if step < 0 or step > _TOTAL_STEPS:
        raise ValueError(f"step must be 0..{_TOTAL_STEPS}")
    setup = get_or_create_company_setup(db, company_id)
    setup.onboarding_step = step
    if step >= _TOTAL_STEPS and setup.onboarding_completed_at is None:
        setup.onboarding_completed_at = datetime.utcnow()
    db.add(setup)
    db.commit()
    db.refresh(setup)
    return setup
