from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from apps.api.auth import require_admin
from apps.api.deps import get_db
from packages.core.platform.models_accounting_category import (
    AccountingCategory,
    TAX_BEHAVIOR_VALUES,
)
from packages.modules.admin.schemas.accounting_category import (
    AccountingCategoryBindingPatch,
    AccountingCategoryCreate,
    AccountingCategoryRead,
)

router = APIRouter(prefix="/admin/accounting-categories", tags=["admin"])


@router.post("", response_model=AccountingCategoryRead, status_code=201)
def create_accounting_category(
    body: AccountingCategoryCreate,
    db: Session = Depends(get_db),
):
    if body.tax_behavior not in TAX_BEHAVIOR_VALUES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid tax_behavior '{body.tax_behavior}'. "
                   f"Allowed: {', '.join(TAX_BEHAVIOR_VALUES)}.",
        )

    # Reject duplicate code within the same company.
    existing = (
        db.query(AccountingCategory)
        .filter(
            AccountingCategory.company_id == body.company_id,
            AccountingCategory.code == body.code,
        )
        .first()
    )
    if existing:
        raise HTTPException(
            status_code=409,
            detail=f"An accounting category with code '{body.code}' already exists "
                   f"for company {body.company_id}.",
        )

    category = AccountingCategory(
        company_id=body.company_id,
        code=body.code,
        name=body.name,
        expense_account_code=body.expense_account_code,
        liability_account_code=body.liability_account_code,
        tax_behavior=body.tax_behavior,
        requires_project=body.requires_project,
    )
    db.add(category)
    db.commit()
    db.refresh(category)
    return category


@router.get("/{company_id}", response_model=list[AccountingCategoryRead])
def list_accounting_categories(
    company_id: int,
    db: Session = Depends(get_db),
):
    return (
        db.query(AccountingCategory)
        .filter(
            AccountingCategory.company_id == company_id,
            AccountingCategory.is_active.is_(True),
        )
        .order_by(AccountingCategory.code)
        .all()
    )


@router.patch("/{category_id}/bindings", response_model=AccountingCategoryRead)
def patch_category_bindings(
    category_id: int,
    body: AccountingCategoryBindingPatch,
    db: Session = Depends(get_db),
):
    """Update CoA + tax-rate FK bindings on a category (Motor de Pólizas)."""
    cat = db.query(AccountingCategory).filter(AccountingCategory.id == category_id).first()
    if cat is None:
        raise HTTPException(status_code=404, detail="Category not found")
    cat.expense_account_id      = body.expense_account_id
    cat.tax_rate_id             = body.tax_rate_id
    cat.counterparty_account_id = body.counterparty_account_id
    db.commit()
    db.refresh(cat)
    return cat
