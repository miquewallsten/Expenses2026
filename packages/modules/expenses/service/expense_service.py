from sqlalchemy.orm import Session

from packages.core.platform.models import Company
from packages.core.platform.models_accounting_category import AccountingCategory
from packages.modules.expenses.models.expense import Expense
from packages.modules.expenses.schemas.expense import ExpenseCreate
from packages.modules.expenses.schemas.expense_update import ExpenseUpdate
from packages.modules.expenses.service.config_reader import get_account_mapping_config
from packages.modules.expenses.service.accounting_learning_service import find_learning_match, store_learning
from packages.modules.ai.service import categorization_feedback_service as _cat_feedback
from packages.core.platform.service_audit import log_event


VALID_TRANSITIONS = {
    "draft": ["submitted"],
    "submitted": ["approved", "rejected"],
}


_KEYWORD_CATEGORY_MAP: list[tuple[list[str], str]] = [
    (["uber", "flight", "hotel"],              "TRAVEL"),
    (["meal", "restaurant"],                   "MEALS"),
    (["software", "subscription"],             "SOFTWARE"),
]


def _infer_category_code(description: str | None) -> str:
    """Return the best-guess category code from description keywords, falling back to GENERAL."""
    text = (description or "").lower()
    for keywords, code in _KEYWORD_CATEGORY_MAP:
        if any(kw in text for kw in keywords):
            return code
    return "GENERAL"


def _resolve_category_code(
    db: Session, company_id: int, description: str | None
) -> str | None:
    """
    Infer a candidate code and return it only if a matching active
    AccountingCategory row exists for the company.
    """
    candidate = _infer_category_code(description)
    exists = (
        db.query(AccountingCategory.id)
        .filter(
            AccountingCategory.company_id == company_id,
            AccountingCategory.code == candidate,
            AccountingCategory.is_active.is_(True),
        )
        .first()
    )
    return candidate if exists else None


def _change_expense_status(db: Session, expense_id: int, new_status: str, actor_user_id: int | None = None) -> Expense | None:
    expense = db.query(Expense).filter(Expense.id == expense_id).first()

    if not expense:
        return None

    allowed = VALID_TRANSITIONS.get(expense.status, [])

    if new_status not in allowed:
        raise ValueError("Invalid status transition")

    old_status = expense.status
    expense.status = new_status
    db.commit()
    db.refresh(expense)
    log_event(
        db=db,
        entity_type="expense",
        entity_id=expense.id,
        action="status_change",
        actor_user_id=actor_user_id,
        detail_text=f"{old_status} -> {new_status}",
        company_id=expense.company_id,
    )
    return expense


def _validate_category_code(db: Session, company_id: int, code: str | None) -> None:
    """Phase 2.4 — reject category_code values that don't map to an active
    AccountingCategory for this company. Service layer enforcement; the DB
    has no FK because category_code is also written by the heuristic
    (already filters to active categories) and the learning loop. None is
    permitted (callers may legitimately leave it blank for accounting to
    classify later).
    """
    if code is None:
        return
    exists = (
        db.query(AccountingCategory.id)
        .filter(
            AccountingCategory.company_id == company_id,
            AccountingCategory.code == code,
            AccountingCategory.is_active.is_(True),
        )
        .first()
    )
    if exists is None:
        raise ValueError(
            f"category_code '{code}' is not an active AccountingCategory for company {company_id}"
        )


def create_expense(db: Session, payload: ExpenseCreate) -> Expense:
    company = db.query(Company).filter(Company.id == payload.company_id).first()
    if not company:
        raise ValueError("Company not found")
    # Phase 2.4 — validate caller-supplied category_code BEFORE any
    # classification work runs. The heuristic and learning paths self-validate.
    _validate_category_code(
        db, payload.company_id, getattr(payload, "category_code", None)
    )

    mapping = get_account_mapping_config(db, payload.company_id)

    # ── Classification resolution ─────────────────────────────────────────────
    # 1. Learning table: prior coding for this description overrides everything.
    # 2. Keyword heuristic: validated against active categories.
    # 3. Fallback: caller-supplied category_code (no account_code).
    match = find_learning_match(db, payload.company_id, payload.description)
    if match is not None:
        category_code = match.category_code
        account_code: str | None = match.account_code
    else:
        kw_code = _resolve_category_code(db, payload.company_id, payload.description)
        if kw_code is not None:
            category_code = kw_code
            account_code = None
        else:
            # Phase 8.3 hookup — kNN over CategorizationFeedback as last resort
            # before falling back to caller-supplied category_code.
            knn = None
            try:
                knn = _cat_feedback.suggest_category(
                    db,
                    company_id=payload.company_id,
                    description_text=payload.description or "",
                )
            except Exception:
                knn = None
            if knn and knn.get("category"):
                # Validate suggestion against active categories; fall through if stale.
                try:
                    _validate_category_code(db, payload.company_id, knn["category"])
                    category_code = knn["category"]
                except ValueError:
                    category_code = getattr(payload, "category_code", None)
            else:
                category_code = getattr(payload, "category_code", None)
            account_code = None

    expense = Expense(
        company_id=payload.company_id,
        amount=payload.amount,
        description=payload.description,
        mapping_snapshot=mapping,
        detected_category=None,
        account_code=account_code,
        category_code=category_code,
    )
    db.add(expense)
    db.commit()
    db.refresh(expense)
    return expense


def list_expenses(db: Session, company_id: int | None = None, status: str | None = None) -> list[Expense]:
    query = db.query(Expense)
    if company_id is not None:
        query = query.filter(Expense.company_id == company_id)
    if status is not None:
        query = query.filter(Expense.status == status)
    return query.all()


def list_expenses_paginated(
    db: Session,
    company_id: int | None = None,
    status: str | None = None,
    page: int = 1,
    limit: int = 50,
    order_by: str = "created_at",
    order_dir: str = "desc",
) -> dict:
    """Return paginated expenses with total count.

    Args:
        db: Database session
        company_id: Filter by company (required for tenant isolation)
        status: Filter by status
        page: Page number (1-indexed)
        limit: Items per page (max 100)
        order_by: Sort column (created_at, amount)
        order_dir: Sort direction (asc, desc)

    Returns:
        dict with items, total, page, pages
    """
    limit = min(limit, 100)
    offset = (page - 1) * limit

    query = db.query(Expense)

    if company_id is not None:
        query = query.filter(Expense.company_id == company_id)
    if status is not None:
        query = query.filter(Expense.status == status)

    # Ordering
    order_column = getattr(Expense, order_by, Expense.created_at)
    if order_dir == "desc":
        query = query.order_by(order_column.desc())
    else:
        query = query.order_by(order_column.asc())

    total = query.count()
    items = query.offset(offset).limit(limit).all()

    return {
        "items": items,
        "total": total,
        "page": page,
        "pages": (total + limit - 1) // limit if limit > 0 else 0,
    }


def submit_expense(db: Session, expense_id: int) -> Expense | None:
    return _change_expense_status(db, expense_id, "submitted")


def approve_expense(db: Session, expense_id: int) -> Expense | None:
    return _change_expense_status(db, expense_id, "approved")


def reject_expense(db: Session, expense_id: int) -> Expense | None:
    return _change_expense_status(db, expense_id, "rejected")


def get_expense(db: Session, expense_id: int) -> Expense | None:
    return db.query(Expense).filter(Expense.id == expense_id).first()


def update_expense(db: Session, expense_id: int, payload: ExpenseUpdate) -> Expense | None:
    expense = db.query(Expense).filter(Expense.id == expense_id).first()

    if not expense:
        return None

    # Notes and tags can be updated at any status; amount/description only for drafts.
    draft_only_fields = any([payload.amount, payload.description, payload.expense_date, payload.category_code])
    if draft_only_fields and expense.status != "draft":
        raise ValueError("Only draft expenses can have amount/description updated")

    if payload.amount is not None:
        expense.amount = payload.amount

    if payload.description is not None:
        expense.description = payload.description

    if payload.expense_date is not None:
        expense.expense_date = payload.expense_date

    if payload.notes is not None:
        expense.notes = payload.notes

    if payload.tags is not None:
        expense.tags = payload.tags

    if payload.expense_type is not None:
        expense.expense_type = payload.expense_type

    if payload.status is not None and payload.status in ("draft", "submitted", "manager_approved", "approved", "rejected"):
        expense.status = payload.status

    category_updated = False
    prior_category: str | None = None
    if payload.category_code is not None:
        # Phase 2.4 — same validation as create. Don't accept arbitrary codes.
        _validate_category_code(db, expense.company_id, payload.category_code)
        prior_category = expense.category_code
        if prior_category != payload.category_code:
            expense.category_code = payload.category_code
            category_updated = True
        else:
            expense.category_code = payload.category_code

    db.commit()
    db.refresh(expense)

    if category_updated:
        store_learning(
            db,
            company_id=expense.company_id,
            input_text=expense.description,
            category_code=expense.category_code,
            account_code=expense.account_code,
            expense_status=expense.status,
        )
        # Phase 8.3 hookup — also record the override into CategorizationFeedback
        # so kNN suggestion improves over time. Best-effort; never block update.
        if expense.description:
            try:
                _cat_feedback.record_feedback(
                    db,
                    company_id=expense.company_id,
                    description_text=expense.description,
                    corrected_category=expense.category_code,
                    original_category=prior_category,
                    expense_id=expense.id,
                )
                db.commit()
            except Exception:
                db.rollback()

    return expense


def delete_expense(db: Session, expense_id: int) -> bool:
    expense = db.query(Expense).filter(Expense.id == expense_id).first()

    if not expense:
        return False

    if expense.status != "draft":
        raise ValueError("Only draft expenses can be deleted")

    db.delete(expense)
    db.commit()
    return True


def get_expense_summary(db: Session, company_id: int | None = None) -> dict:
    query = db.query(Expense)

    if company_id is not None:
        query = query.filter(Expense.company_id == company_id)

    expenses = query.all()

    return {
        "total": len(expenses),
        "draft": len([e for e in expenses if e.status == "draft"]),
        "submitted": len([e for e in expenses if e.status == "submitted"]),
        "approved": len([e for e in expenses if e.status == "approved"]),
        "rejected": len([e for e in expenses if e.status == "rejected"]),
        "with_mapping_snapshot": len([e for e in expenses if e.mapping_snapshot is not None]),
        "with_detected_category": len([e for e in expenses if e.detected_category is not None]),
    }
