from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from apps.api.auth import get_current_user, require_manager_or_accountant
from apps.api.deps import get_db
from packages.core.platform.models_user import User
from packages.core.platform.service_idempotency import (
    IdempotencyKey,
    idempotency_lookup,
    idempotency_store,
)
from packages.modules.expenses.api._security import get_expense_for_user
from packages.modules.expenses.models.expense import Expense
from packages.modules.expenses.schemas.expense import ExpenseRead
from packages.modules.expenses.service.transition_service import (
    submit_expense,
    manager_approve_expense,
    manager_reject_expense,
    manager_return_expense,
    accounting_approve_expense,
    accounting_reject_expense,
    accounting_return_expense,
)

router = APIRouter(prefix="/expenses/review-actions", tags=["expenses"])


# Phase 4.5: optional body for reject/return endpoints. The 10-char minimum on
# rejection is enforced inside the service layer (see transition_service
# `_validate_rejection_comment`) so it applies to every caller, not just HTTP.
class TransitionCommentBody(BaseModel):
    comment: str | None = Field(default=None, max_length=2000)


def _run(
    fn,
    db: Session,
    expense: Expense,
    *,
    actor_user_id: int | None,
    route: str,
    idempotency_key: str | None,
    comment: str | None = None,
) -> dict:
    """Idempotent transition wrapper. Returns a JSON-ready dict so the cache
    holds exactly what FastAPI sends back."""
    cached = idempotency_lookup(db, actor_user_id or 0, route, idempotency_key)
    if cached is not None:
        return cached
    try:
        if comment is None:
            updated = fn(db, expense, actor_user_id=actor_user_id)
        else:
            updated = fn(db, expense, actor_user_id=actor_user_id, comment=comment)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    payload = ExpenseRead.model_validate(updated).model_dump(mode="json")
    idempotency_store(db, actor_user_id or 0, route, idempotency_key, payload)
    return payload


@router.post("/{expense_id}/submit", response_model=ExpenseRead)
def submit(
    expense_id: int,
    idem: IdempotencyKey = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    expense = get_expense_for_user(expense_id, db, current_user)
    return _run(
        submit_expense,
        db,
        expense,
        actor_user_id=current_user.id,
        route="POST /expenses/review-actions/submit",
        idempotency_key=idem,
    )


@router.post("/{expense_id}/manager-approve", response_model=ExpenseRead)
def manager_approve(
    expense_id: int,
    idem: IdempotencyKey = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_manager_or_accountant),
):
    expense = get_expense_for_user(expense_id, db, current_user)
    return _run(
        manager_approve_expense,
        db,
        expense,
        actor_user_id=current_user.id,
        route="POST /expenses/review-actions/manager-approve",
        idempotency_key=idem,
    )


@router.post("/{expense_id}/manager-reject", response_model=ExpenseRead)
def manager_reject(
    expense_id: int,
    body: TransitionCommentBody | None = None,
    idem: IdempotencyKey = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_manager_or_accountant),
):
    expense = get_expense_for_user(expense_id, db, current_user)
    return _run(
        manager_reject_expense,
        db,
        expense,
        actor_user_id=current_user.id,
        route="POST /expenses/review-actions/manager-reject",
        idempotency_key=idem,
        comment=body.comment if body else None,
    )


@router.post("/{expense_id}/manager-return", response_model=ExpenseRead)
def manager_return(
    expense_id: int,
    body: TransitionCommentBody | None = None,
    idem: IdempotencyKey = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_manager_or_accountant),
):
    expense = get_expense_for_user(expense_id, db, current_user)
    return _run(
        manager_return_expense,
        db,
        expense,
        actor_user_id=current_user.id,
        route="POST /expenses/review-actions/manager-return",
        idempotency_key=idem,
        comment=body.comment if body else None,
    )


@router.post("/{expense_id}/accounting-approve", response_model=ExpenseRead)
def accounting_approve(
    expense_id: int,
    idem: IdempotencyKey = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_manager_or_accountant),
):
    expense = get_expense_for_user(expense_id, db, current_user)
    return _run(
        accounting_approve_expense,
        db,
        expense,
        actor_user_id=current_user.id,
        route="POST /expenses/review-actions/accounting-approve",
        idempotency_key=idem,
    )


@router.post("/{expense_id}/accounting-reject", response_model=ExpenseRead)
def accounting_reject(
    expense_id: int,
    body: TransitionCommentBody | None = None,
    idem: IdempotencyKey = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_manager_or_accountant),
):
    expense = get_expense_for_user(expense_id, db, current_user)
    return _run(
        accounting_reject_expense,
        db,
        expense,
        actor_user_id=current_user.id,
        route="POST /expenses/review-actions/accounting-reject",
        idempotency_key=idem,
        comment=body.comment if body else None,
    )


@router.post("/{expense_id}/accounting-return", response_model=ExpenseRead)
def accounting_return(
    expense_id: int,
    body: TransitionCommentBody | None = None,
    idem: IdempotencyKey = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_manager_or_accountant),
):
    expense = get_expense_for_user(expense_id, db, current_user)
    return _run(
        accounting_return_expense,
        db,
        expense,
        actor_user_id=current_user.id,
        route="POST /expenses/review-actions/accounting-return",
        idempotency_key=idem,
        comment=body.comment if body else None,
    )


# ── Phase 4.4 — Bulk transition ───────────────────────────────────────────────

_BULK_FN_BY_ACTION = {
    "manager_approve": manager_approve_expense,
    "manager_reject": manager_reject_expense,
    "manager_return": manager_return_expense,
    "accounting_approve": accounting_approve_expense,
    "accounting_reject": accounting_reject_expense,
    "accounting_return": accounting_return_expense,
}
_BULK_REQUIRES_COMMENT = {"manager_reject", "accounting_reject"}
_BULK_MAX = 100


class BulkTransitionRequest(BaseModel):
    action: str = Field(..., description="One of _BULK_FN_BY_ACTION keys")
    expense_ids: list[int] = Field(..., min_length=1, max_length=_BULK_MAX)
    comment: str | None = Field(default=None, max_length=2000)


class BulkItemResult(BaseModel):
    expense_id: int
    ok: bool
    status: str | None = None
    error: str | None = None


class BulkTransitionResponse(BaseModel):
    succeeded: int
    failed: int
    results: list[BulkItemResult]


@router.post("/bulk-transition", response_model=BulkTransitionResponse)
def bulk_transition(
    body: BulkTransitionRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_manager_or_accountant),
) -> BulkTransitionResponse:
    fn = _BULK_FN_BY_ACTION.get(body.action)
    if fn is None:
        raise HTTPException(status_code=400, detail=f"Unknown action {body.action!r}")
    accepts_comment = body.action in _BULK_REQUIRES_COMMENT or body.action.endswith(
        "_return"
    )

    seen: set[int] = set()
    results: list[BulkItemResult] = []
    succeeded = 0
    failed = 0

    for raw_id in body.expense_ids:
        if raw_id in seen:
            continue
        seen.add(raw_id)
        try:
            expense = get_expense_for_user(raw_id, db, current_user)
        except HTTPException as exc:
            failed += 1
            results.append(
                BulkItemResult(expense_id=raw_id, ok=False, error=str(exc.detail))
            )
            continue
        try:
            if accepts_comment:
                updated = fn(
                    db, expense, actor_user_id=current_user.id, comment=body.comment
                )
            else:
                updated = fn(db, expense, actor_user_id=current_user.id)
        except ValueError as exc:
            failed += 1
            db.rollback()
            results.append(
                BulkItemResult(expense_id=raw_id, ok=False, error=str(exc))
            )
            continue
        succeeded += 1
        results.append(
            BulkItemResult(expense_id=raw_id, ok=True, status=updated.status)
        )

    return BulkTransitionResponse(
        succeeded=succeeded, failed=failed, results=results
    )
