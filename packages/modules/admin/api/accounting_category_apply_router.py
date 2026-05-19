from typing import Any

from fastapi import APIRouter, Depends
from packages.core.platform.module_gate import require_module
from pydantic import BaseModel
from sqlalchemy.orm import Session

from apps.api.auth import get_current_user, require_permission, require_same_company
from packages.core.platform.models_user import User
from apps.api.deps import get_db
from packages.modules.admin.service.accounting_category_seed_service import (
    seed_accounting_categories,
)

router = APIRouter(
    prefix="//admin/accounting-categories",
    tags=["admin"],
    dependencies=[Depends(require_permission("accounting:configure")), Depends(require_module("accounting"))],
)


class ApplyRequest(BaseModel):
    items: list[dict[str, Any]]


class ApplyResponse(BaseModel):
    applied: bool
    count: int


@router.post("/apply/{company_id}", response_model=ApplyResponse)
def apply_accounting_categories(
    company_id: int,
    body: ApplyRequest,
    db: Session = Depends(get_db),
) -> ApplyResponse:
    """
    Persist a list of accounting category dicts for the given company.
    Upsert semantics: existing rows are updated; new rows are inserted.
    """
    rows = seed_accounting_categories(db, company_id, body.items)
    return ApplyResponse(applied=True, count=len(rows))
