from __future__ import annotations

from typing import Any, Callable

from sqlalchemy.orm import Session

from packages.core.platform.models_user import User
from packages.modules.expenses.schemas.expense import ExpenseCreate
from packages.modules.expenses.service.expense_service import (
    create_expense,
    submit_expense,
    approve_expense,
    reject_expense,
)


ActionHandler = Callable[[dict[str, Any] | None, dict[str, Any] | None, Session, User], dict[str, Any]]


def _handle_expenses_submit(payload: dict[str, Any] | None, context: dict[str, Any] | None, db: Session, user: User) -> dict[str, Any]:
    expense_id = (payload or {}).get("expense_id")
    if not expense_id:
        return {"success": False, "error": {"code": "missing_param", "message": "expense_id is required", "retryable": False}}
    result = submit_expense(db, int(expense_id))
    if result is None:
        return {"success": False, "error": {"code": "not_found", "message": f"Expense {expense_id} not found", "retryable": False}}
    return {"success": True, "data": {"expense_id": result.id, "status": result.status}}


def _handle_expenses_create(payload: dict[str, Any] | None, context: dict[str, Any] | None, db: Session, user: User) -> dict[str, Any]:
    data = payload or {}
    company_id = data.get("company_id", user.company_id)
    expense_create = ExpenseCreate(
        company_id=company_id,
        amount=data.get("amount", 0),
        description=data.get("description", ""),
        category_code=data.get("category_code"),
    )
    expense = create_expense(db, expense_create)
    return {"success": True, "data": {"expense_id": expense.id, "status": expense.status}}


def _handle_approvals_approve(payload: dict[str, Any] | None, context: dict[str, Any] | None, db: Session, user: User) -> dict[str, Any]:
    expense_id = (payload or {}).get("expense_id")
    if not expense_id:
        return {"success": False, "error": {"code": "missing_param", "message": "expense_id is required", "retryable": False}}
    result = approve_expense(db, int(expense_id))
    if result is None:
        return {"success": False, "error": {"code": "not_found", "message": f"Expense {expense_id} not found", "retryable": False}}
    return {"success": True, "data": {"expense_id": result.id, "status": result.status}}


def _handle_approvals_reject(payload: dict[str, Any] | None, context: dict[str, Any] | None, db: Session, user: User) -> dict[str, Any]:
    expense_id = (payload or {}).get("expense_id")
    if not expense_id:
        return {"success": False, "error": {"code": "missing_param", "message": "expense_id is required", "retryable": False}}
    result = reject_expense(db, int(expense_id))
    if result is None:
        return {"success": False, "error": {"code": "not_found", "message": f"Expense {expense_id} not found", "retryable": False}}
    return {"success": True, "data": {"expense_id": result.id, "status": result.status}}


def _handle_users_create(payload: dict[str, Any] | None, context: dict[str, Any] | None, db: Session, user: User) -> dict[str, Any]:
    data = payload or {}
    from packages.core.platform.models_user import User as UserModel
    new_user = UserModel(
        email=data.get("email", ""),
        full_name=data.get("full_name", ""),
        role=data.get("role", "employee"),
        company_id=user.company_id,
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return {"success": True, "data": {"user_id": new_user.id, "email": new_user.email}}


def _handle_users_invite(payload: dict[str, Any] | None, context: dict[str, Any] | None, db: Session, user: User) -> dict[str, Any]:
    data = payload or {}
    return {"success": True, "data": {"invited_email": data.get("email"), "status": "invited"}}


def _handle_policy_update(payload: dict[str, Any] | None, context: dict[str, Any] | None, db: Session, user: User) -> dict[str, Any]:
    data = payload or {}
    return {"success": True, "data": {"policy_updated": True, "fields": list(data.keys())}}


def _handle_announcement_send(payload: dict[str, Any] | None, context: dict[str, Any] | None, db: Session, user: User) -> dict[str, Any]:
    data = payload or {}
    return {"success": True, "data": {"announcement_sent": True, "title": data.get("title")}}


_HANDLERS: dict[str, ActionHandler] = {
    "expenses:submit": _handle_expenses_submit,
    "expenses:create": _handle_expenses_create,
    "approvals:approve": _handle_approvals_approve,
    "approvals:reject": _handle_approvals_reject,
    "users:create": _handle_users_create,
    "users:invite": _handle_users_invite,
    "policy:update": _handle_policy_update,
    "announcement:send": _handle_announcement_send,
}


def route_action(
    action_id: str,
    module: str,
    payload: dict[str, Any] | None,
    context: dict[str, Any] | None,
    db: Session,
    user: User,
) -> dict[str, Any]:
    handler = _HANDLERS.get(action_id)
    if handler is None:
        return {
            "success": False,
            "error": {
                "code": "unknown_action",
                "message": f"Unknown action: {action_id}",
                "retryable": False,
            },
        }
    return handler(payload, context, db, user)
