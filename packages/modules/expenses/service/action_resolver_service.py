"""action_resolver_service.py

Determines which actions are available for a given expense and portal role.

Design principles
-----------------
* Conservative by default: when the current status or config cannot confirm
  that an action is safe, we return False rather than guessing True.
* Status-gated: every action check begins with a known-status guard.  Any
  expense whose status is not in _KNOWN_STATUSES gets all-False responses.
* Config-gated: manager and accounting actions are additionally gated on the
  company's flow-enabled flags so that disabled flows never surface actions.
* No workflow simulation: this service reads persisted state only.  It does
  not simulate what the workflow engine would do next.

Queue/action parity invariant
------------------------------
Manager actions (can_approve/reject/return) must be True only for expenses
that would appear in list_manager_queue.  Accounting actions must be True only
for expenses that would appear in list_accounting_queue — including the
exceptions_only filter.  Both resolve_* functions enforce this by delegating
their eligibility check to is_manager_reviewable / is_accounting_reviewable
(review_queue_service), which are the same helpers used by the queue functions.
Never add a local eligibility override here that bypasses those helpers.

Supported Expense statuses (from packages.modules.expenses.models.expense):
  draft, submitted, manager_approved, approved, rejected

Any status not in this set is treated as unknown and all actions are denied.
"""

from sqlalchemy import select as sa_select
from sqlalchemy.orm import Session

from packages.modules.expenses.models.document import ExpenseDocument
from packages.modules.expenses.models.expense import Expense
from packages.modules.expenses.models.validation_result import ValidationResult
from packages.modules.expenses.service.expense_blocker_service import (
    get_expense_blockers,
)
from packages.modules.expenses.service.review_queue_service import (
    is_accounting_reviewable,
    is_manager_reviewable,
)
from packages.modules.admin.service.approval_setup_service import (
    get_or_create_approval_setup,
)
from packages.modules.admin.service.workflow_setup_service import (
    get_or_create_workflow_setup,
)

# ── Status vocabulary ─────────────────────────────────────────────────────────

# NOTE: _MANAGER_REVIEWABLE_STATUSES, _ACCOUNTING_REVIEWABLE_STATUSES,
# _MANAGER_MODES, _KNOWN_APPROVAL_MODES, _manager_flow_enabled, and
# _accounting_flow_enabled have been consolidated into review_queue_service.py
# as the single source of truth used by both queue inclusion
# (list_manager_queue / list_accounting_queue) and action availability
# (is_manager_reviewable / is_accounting_reviewable → resolve_*_actions).

# All statuses in the current Expense model.  Any expense with a status
# outside this set receives all-False actions to prevent accidental
# permission grants from future migration states.
_KNOWN_STATUSES: frozenset[str] = frozenset(
    {"draft", "submitted", "manager_approved", "approved", "rejected"}
)

# Terminal statuses: no further review transitions expected.
_TERMINAL_STATUSES: frozenset[str] = frozenset({"approved", "rejected"})

# Statuses where an employee may edit the expense in-place.
_EMPLOYEE_EDITABLE_STATUSES: frozenset[str] = frozenset({"draft"})

# Statuses from which an employee may initiate a fresh submission.
_EMPLOYEE_SUBMITTABLE_STATUSES: frozenset[str] = frozenset({"draft"})


# ── Internal helpers ──────────────────────────────────────────────────────────

def _is_known_status(expense: Expense) -> bool:
    """Return True only when the expense status is in _KNOWN_STATUSES."""
    return (expense.status or "") in _KNOWN_STATUSES


# ── Public: validation flag helper ───────────────────────────────────────────

def get_validation_flags(db: Session, expense_id: int) -> dict:
    """
    Return a dict with two boolean flags indicating the worst validation
    state across all documents linked to *expense_id*:

      has_failed  — at least one ValidationResult with status "failed"
      has_warning — at least one ValidationResult with status "warning"
                    (only meaningful when has_failed is False)

    Returns {has_failed: False, has_warning: False} when no documents or
    validation results exist yet.
    """
    doc_ids = (
        db.query(ExpenseDocument.id)
        .filter(
            ExpenseDocument.expense_id == expense_id,
            ExpenseDocument.expense_id.is_not(None),
        )
        .subquery()
    )

    result_statuses: list[str] = [
        row[0]
        for row in (
            db.query(ValidationResult.status)
            .filter(ValidationResult.document_id.in_(sa_select(doc_ids.c.id)))
            .distinct()
            .all()
        )
    ]

    return {
        "has_failed":  "failed"  in result_statuses,
        "has_warning": "warning" in result_statuses,
    }


# ── Public: employee actions ──────────────────────────────────────────────────

def resolve_employee_actions(db: Session, expense: Expense) -> dict:
    """
    Return the set of actions an employee may take on *expense*.

    Shape:
      can_edit          bool
      can_delete        bool
      can_submit        bool
      can_resubmit      bool
      can_add_documents bool
      reasons           list[str]  — human-readable explanations for denials
    """
    reasons: list[str] = []

    # Refuse to resolve anything for an expense with an unknown status to avoid
    # accidental permission grants from future migration states.
    if not _is_known_status(expense):
        reasons.append(f"Unknown expense status '{expense.status}'; no actions available.")
        return {
            "can_edit": False,
            "can_delete": False,
            "can_submit": False,
            "can_resubmit": False,
            "can_add_documents": False,
            "reasons": reasons,
        }

    status = expense.status

    # ── Edit / delete / add documents ─────────────────────────────────────────
    # All three are restricted to draft status.
    # For rejected expenses that allow resubmission, the employee must first
    # transition the expense back to draft via the resubmit action before any
    # document changes are permitted.  The current status vocabulary has no
    # "returned" or "in_correction" state, so we conservatively deny edit
    # access on rejected expenses rather than guessing.
    is_draft   = status == "draft"
    can_edit   = is_draft
    can_delete = is_draft
    can_add_documents = is_draft
    if not is_draft:
        reasons.append("Expense is not in draft; edit, delete, and document upload are disabled.")

    # ── Submit ────────────────────────────────────────────────────────────────
    # Status gate: only a draft may be submitted.
    # Policy/document gate: delegated to expense_blocker_service so that this
    # file does not duplicate validation, document, or policy checks.
    can_submit = is_draft
    if can_submit:
        blockers = get_expense_blockers(db, expense)
        if blockers["submit_blockers"]:
            can_submit = False
            reasons.extend(blockers["submit_blockers"])

    # ── Resubmit after rejection ──────────────────────────────────────────────
    # Resubmission is only available when:
    #   1. The expense is in 'rejected' status.
    #   2. The approval setup explicitly allows it via allow_resubmission_after_rejection.
    # We do not infer permission from any other flag.
    approval = get_or_create_approval_setup(db, expense.company_id)
    can_resubmit = (
        status == "rejected"
        and bool(approval.allow_resubmission_after_rejection)
    )
    if status == "rejected" and not can_resubmit:
        reasons.append("Resubmission after rejection is not allowed by company policy.")

    # allow_draft_save controls whether the UI surfaces a "save" affordance.
    # It does not gate any server-side permission — a draft expense is always
    # persisted on creation regardless of this flag.

    return {
        "can_edit":           can_edit,
        "can_delete":         can_delete,
        "can_submit":         can_submit,
        "can_resubmit":       can_resubmit,
        "can_add_documents":  can_add_documents,
        "reasons":            reasons,
    }


# ── Public: manager actions ───────────────────────────────────────────────────

def resolve_manager_actions(db: Session, expense: Expense) -> dict:
    """
    Return the set of actions a manager may take on *expense*.

    Shape:
      can_approve  bool
      can_reject   bool
      can_return   bool   — return to employee for correction
                           (only when allow_resubmit_after_return is True)
      reasons      list[str]

    Eligibility is delegated to is_manager_reviewable (review_queue_service)
    — the single source of truth shared with list_manager_queue.
    """
    reviewable, reasons = is_manager_reviewable(db, expense)
    if not reviewable:
        return {
            "can_approve": False,
            "can_reject":  False,
            "can_return":  False,
            "reasons":     reasons,
        }

    workflow   = get_or_create_workflow_setup(db, expense.company_id)
    can_return = bool(workflow.allow_resubmit_after_return)
    if not can_return:
        # Return-to-employee creates a correction loop; without the workflow
        # flag the manager must approve or reject outright.
        reasons.append("Return-to-employee is not enabled by workflow policy.")

    return {
        "can_approve": True,
        "can_reject":  True,
        "can_return":  can_return,
        "reasons":     reasons,
    }


# ── Public: accounting actions ────────────────────────────────────────────────

def resolve_accounting_actions(db: Session, expense: Expense) -> dict:
    """
    Return the set of actions an accounting reviewer may take on *expense*.

    Shape:
      can_approve                    bool
      can_reject                     bool
      can_return                     bool
      can_assign_account_code        bool
      can_generate_accounting_event  bool
      reasons                        list[str]

    Eligibility is delegated to is_accounting_reviewable (review_queue_service)
    — the single source of truth shared with list_accounting_queue.
    """
    _base_false = {
        "can_approve":                   False,
        "can_reject":                    False,
        "can_return":                    False,
        "can_assign_account_code":       False,
        "can_generate_accounting_event": False,
    }

    reviewable, reasons = is_accounting_reviewable(db, expense)
    if not reviewable:
        return {**_base_false, "reasons": reasons}

    workflow = get_or_create_workflow_setup(db, expense.company_id)

    # ── Primary accounting actions ────────────────────────────────────────────
    can_return = bool(workflow.allow_resubmit_after_return)
    if not can_return:
        # Return-to-employee requires the workflow flag; without it the
        # accountant must approve or reject outright.
        reasons.append("Return-to-employee is not enabled by workflow policy.")

    # ── Blocker evaluation ────────────────────────────────────────────────────
    # Delegated entirely to expense_blocker_service; no policy or document
    # logic is re-implemented here.
    blockers = get_expense_blockers(db, expense)

    # Accounting blockers are informational for approve/reject/return:
    # those actions are already gated by is_accounting_reviewable above,
    # which is the authoritative eligibility source.  We surface the blocker
    # text in reasons so the UI can explain what outstanding work remains,
    # but we do NOT additionally deny approve/reject/return here.
    if blockers["accounting_blockers"]:
        reasons.extend(blockers["accounting_blockers"])

    # ── Account code assignment ───────────────────────────────────────────────
    # Safe for any expense that cleared the eligibility check; the field is
    # updated in-place and does not change the expense status.

    # ── Accounting event generation ──────────────────────────────────────────
    # True when:
    #   1. expense.status == "submitted"  (generate_accounting_event gate)
    #   2. no accounting_blockers outstanding
    #   3. expense has an account_code OR a category_code is set
    has_account = bool((expense.account_code or "").strip())
    has_category = bool((expense.category_code or "").strip())
    no_blockers = len(blockers["accounting_blockers"]) == 0
    can_generate_accounting_event = (
        expense.status == "submitted"
        and no_blockers
        and (has_account or has_category)
    )
    if not can_generate_accounting_event:
        if expense.status != "submitted":
            reasons.append(
                f"Accounting event requires status 'submitted' (current: '{expense.status}')."
            )
        if not (has_account or has_category):
            reasons.append(
                "Accounting event requires an account code or an active category on the expense."
            )

    return {
        "can_approve":                   True,
        "can_reject":                    True,
        "can_return":                    can_return,
        "can_assign_account_code":       True,
        "can_generate_accounting_event": can_generate_accounting_event,
        "reasons":                       reasons,
    }
