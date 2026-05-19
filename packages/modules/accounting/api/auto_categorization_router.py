"""auto_categorization_router.py — endpoints for AI-driven expense categorization.

Routes:
  GET  /accounting/auto-categorize/{company_id}/pending  — list uncategorized expenses
  POST /accounting/auto-categorize/{company_id}/suggest   — suggest for a batch
  POST /accounting/auto-categorize/{company_id}/accept    — accept a single suggestion
  POST /accounting/auto-categorize/{company_id}/accept-bulk — accept multiple at once
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from apps.api.auth import get_current_user, require_permission
from packages.core.platform.models_user import User
from apps.api.deps import get_db
from packages.modules.accounting.service.auto_categorization_service import (
    get_uncategorized_expenses,
    suggest_category,
    bulk_suggest,
    accept_suggestion,
)

router = APIRouter(
    prefix="/accounting/auto-categorize",
    tags=["accounting"],
    dependencies=[Depends(require_permission("accounting:configure"))],
)


class AcceptBody(BaseModel):
    expense_id: int
    category_code: str
    account_code: str | None = None


class AcceptBulkBody(BaseModel):
    items: list[AcceptBody]


class SuggestBody(BaseModel):
    limit: int = 50


# ── Pending ────────────────────────────────────────────────────────────────

@router.get("/{company_id}/pending")
def list_pending(company_id: int, limit: int = 50, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    expenses = get_uncategorized_expenses(db, company_id, limit)
    return [
        {
            "id": e.id,
            "description": e.description,
            "amount": float(e.amount or 0),
            "expense_date": e.expense_date.isoformat() if e.expense_date else None,
            "vendor_name": getattr(e, "vendor_name", None),
            "status": e.status,
        }
        for e in expenses
    ]


# ── Suggest ────────────────────────────────────────────────────────────────

@router.post("/{company_id}/suggest")
def suggest(company_id: int, body: SuggestBody | None = None, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    limit = body.limit if body else 50
    return bulk_suggest(db, company_id, limit)


# ── Single suggest ─────────────────────────────────────────────────────────

@router.post("/{company_id}/suggest/{expense_id}")
def suggest_single(company_id: int, expense_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return suggest_category(db, company_id, expense_id)


# ── Accept single ─────────────────────────────────────────────────────────

@router.post("/{company_id}/accept")
def accept(company_id: int, body: AcceptBody, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    try:
        expense = accept_suggestion(db, body.expense_id, body.category_code, body.account_code)
        return {"ok": True, "expense_id": expense.id, "category_code": expense.category_code}
    except ValueError as e:
        raise HTTPException(404, str(e))


# ── Accept bulk ───────────────────────────────────────────────────────────

@router.post("/{company_id}/accept-bulk")
def accept_bulk(company_id: int, body: AcceptBulkBody, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    results = []
    for item in body.items:
        try:
            expense = accept_suggestion(db, item.expense_id, item.category_code, item.account_code)
            results.append({"expense_id": expense.id, "ok": True})
        except Exception as e:
            results.append({"expense_id": item.expense_id, "ok": False, "error": str(e)})
    return {"results": results}
