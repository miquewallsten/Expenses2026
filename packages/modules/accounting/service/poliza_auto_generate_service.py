"""poliza_auto_generate_service.py — auto-generate póliza when expense is approved.

Called as a post-approval hook. Checks if:
  - poliza_required is True in AccountingSetup
  - expense has a valid category mapping
  - expense has not already been exported

If all conditions pass, generates the accounting event and marks the expense
for póliza inclusion by setting expense.poliza_generated = True.
"""
from __future__ import annotations

import logging
from typing import Any

from sqlalchemy.orm import Session

from packages.core.platform.models_accounting_category import AccountingCategory
from packages.modules.admin.service.accounting_setup_service import get_accounting_setup
from packages.modules.accounting.service.accounting_event_service import generate_accounting_event
from packages.modules.expenses.models.expense import Expense

_log = logging.getLogger(__name__)


def on_expense_approved(db: Session, expense_id: int) -> dict[str, Any]:
    """Post-approval hook: auto-generate accounting event if configured.

    Returns:
        {"expense_id": int, "event_generated": bool, "event": dict|None, "reason": str}
    """
    expense = db.query(Expense).filter(Expense.id == expense_id).first()
    if not expense:
        return {"expense_id": expense_id, "event_generated": False, "event": None, "reason": "Expense not found"}

    if expense.status != "approved":
        return {"expense_id": expense_id, "event_generated": False, "event": None, "reason": f"Expense status is '{expense.status}', not 'approved'"}

    # Check if already processed
    if getattr(expense, "poliza_generated", False):
        return {"expense_id": expense_id, "event_generated": False, "event": None, "reason": "Póliza already generated"}

    # Check company setup
    setup = get_accounting_setup(db, expense.company_id)
    if not setup or not setup.poliza_required:
        return {"expense_id": expense_id, "event_generated": False, "event": None, "reason": "Póliza generation not required"}

    # Check category mapping exists
    has_account = bool((expense.account_code or "").strip())
    if not has_account:
        cat_code = expense.category_code
        if cat_code:
            cat = db.query(AccountingCategory).filter(
                AccountingCategory.company_id == expense.company_id,
                AccountingCategory.code == cat_code,
            ).first()
            if cat:
                has_account = bool(cat.expense_account_code or cat.expense_account_id)

    if not has_account:
        return {"expense_id": expense_id, "event_generated": False, "event": None, "reason": "No accounting mapping — needs accountant review first"}

    # Generate event
    try:
        event = generate_accounting_event(db, expense_id)
        # Mark expense as processed
        if hasattr(expense, "poliza_generated"):
            expense.poliza_generated = True
            db.commit()
        _log.info("Auto-generated accounting event for expense %s", expense_id)
        return {"expense_id": expense_id, "event_generated": True, "event": event, "reason": "OK"}
    except Exception as exc:
        _log.warning("Failed to auto-generate event for expense %s: %s", expense_id, exc)
        return {"expense_id": expense_id, "event_generated": False, "event": None, "reason": str(exc)}
