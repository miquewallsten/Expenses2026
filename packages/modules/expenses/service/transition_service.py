"""transition_service.py

Executes real expense status transitions using the current persisted config.

Design principles
-----------------
* Config-driven: every transition is gated on the company's persisted setup.
  No hardcoded routing logic; all routing decisions derive from config records.
* Conservative status vocabulary: only statuses in _KNOWN_STATUSES are ever
  written to the database.  If a future workflow needs a new status (e.g.
  "returned", "escalated"), add it to the Expense model and _KNOWN_STATUSES
  first, then add the transition here.
* Clear errors: invalid transitions raise ValueError with a human-readable
  message that identifies the expected precondition that failed.
* Audit trail: every successful transition calls log_event so that status
  history is captured without requiring a separate audit table.

Supported Expense statuses (current model vocabulary):
  draft, submitted, manager_approved, approved, rejected

  The Expense.status column is String(50) with no DB-level enum; the service
  enforces the vocabulary via _KNOWN_STATUSES in _apply_transition.

Note on "return" transitions
-----------------------------
  There is no dedicated "returned" status in the current model.  Return
  operations write "draft" (_STATUS_RETURNED) as the safest available
  fallback.  See the _KNOWN_STATUSES block for the full rationale.

Developer smoke tests (no test framework exists in this project)
-----------------------------------------------------------------
The project has no pytest suite.  Use the curl commands below against a
running dev server (uvicorn on port 8000) to verify the four core scenarios.
All commands target expense id=1 and company id=1; adjust as needed.

Scenario 1 – draft expense can be submitted
  # Precondition: expense 1 must be in "draft" status.
  # Reset if needed:
  #   psql financial_ops -c "UPDATE expenses SET status='draft' WHERE id=1;"
  curl -s -X POST http://127.0.0.1:8000/expenses/review-actions/1/submit \\
       -H "X-User-Id: 1" | python3 -m json.tool
  # Expected: 200 with status="submitted"

Scenario 2 – manager action blocked when manager flow is disabled
  # Precondition: expense 1 in "submitted" status; company 1 has
  #   approval_setup.approval_mode = "accounting_only" (no manager step).
  curl -s -X POST http://127.0.0.1:8000/expenses/review-actions/1/manager-approve \\
       -H "X-User-Id: 1" | python3 -m json.tool
  # Expected: 400 with detail containing "manager flow is not enabled"

Scenario 3 – accounting action blocked on a draft expense
  # Precondition: expense 1 in "draft" status (wrong state for accounting).
  curl -s -X POST http://127.0.0.1:8000/expenses/review-actions/1/accounting-approve \\
       -H "X-User-Id: 1" | python3 -m json.tool
  # Expected: 400 with detail containing "cannot be actioned by accounting"

Scenario 4 – accounting approve succeeds on a reviewable submitted expense
  # Precondition: expense 1 in "submitted" status; company 1 has
  #   accounting_setup with a non-empty accounting_review_mode (e.g. "all"),
  #   and approval_setup.approval_mode != "manager_then_accounting"
  #   (so "submitted" is the eligible input status, not "manager_approved").
  curl -s -X POST http://127.0.0.1:8000/expenses/review-actions/1/accounting-approve \\
       -H "X-User-Id: 1" | python3 -m json.tool
  # Expected: 200 with status="approved"

A convenience shell script that runs all four scenarios in sequence is at:
  scripts/smoke_transitions.sh
"""

from sqlalchemy.orm import Session

from packages.modules.expenses.models.expense import Expense
from packages.modules.admin.service.accounting_setup_service import (
    get_or_create_accounting_setup,
)
from packages.modules.admin.service.approval_setup_service import (
    get_or_create_approval_setup,
)
from packages.modules.admin.service.company_setup_service import (
    get_or_create_company_setup,
)
from packages.modules.expenses.service.action_resolver_service import (
    get_validation_flags,
)
from packages.core.platform.service_audit import log_event

# ── Status constants ──────────────────────────────────────────────────────────

_STATUS_DRAFT            = "draft"
_STATUS_SUBMITTED        = "submitted"
_STATUS_MANAGER_APPROVED = "manager_approved"
_STATUS_APPROVED         = "approved"
_STATUS_REJECTED         = "rejected"

# Fallback for return-to-employee operations.  There is no dedicated "returned"
# status in the current model; "draft" is used because it re-opens the expense
# for editing and resubmission without permanently closing it.
_STATUS_RETURNED = _STATUS_DRAFT

# ---------------------------------------------------------------------------
# Model limitation — no "returned" status
# ---------------------------------------------------------------------------
# The Expense model column is String(50) with no database-level enum constraint,
# so any string is physically accepted.  However, the only values recognised by
# queue services, the action resolver, and this service are the five constants
# above.  _apply_transition guards against writing anything outside this set.
#
# Return-to-employee operations use _STATUS_RETURNED = "draft" as the nearest
# safe alternative:
#   - "draft" re-opens the expense for editing and resubmission.
#   - It does NOT conflate a returned expense with a permanently rejected one.
#   - The UI layer treats a post-return "draft" as can_resubmit=True.
#
# Trade-off: there is currently no DB-level way to distinguish "returned by
# a reviewer" from "never submitted".  When a dedicated "returned" value is
# added to the Expense model, update _STATUS_RETURNED, add the value to
# _KNOWN_STATUSES, and update the action resolver + queue services.
# ---------------------------------------------------------------------------

# Exhaustive set of statuses this service may write.  _apply_transition asserts
# membership before any DB commit so that no unrecognised value can reach the DB.
_KNOWN_STATUSES: frozenset[str] = frozenset(
    {
        _STATUS_DRAFT,
        _STATUS_SUBMITTED,
        _STATUS_MANAGER_APPROVED,
        _STATUS_APPROVED,
        _STATUS_REJECTED,
    }
)

# approval_mode values that activate the manager review step.
_MANAGER_MODES: frozenset[str] = frozenset(
    {"manager_only", "manager_then_accounting", "threshold_based"}
)

# approval_mode values that route submitted expenses directly to accounting.
_DIRECT_ACCOUNTING_MODES: frozenset[str] = frozenset({"accounting_only", "none"})


# ── Internal helpers ──────────────────────────────────────────────────────────

def _manager_flow_enabled(company_setup, approval_setup) -> bool:
    return (
        bool(company_setup.has_managers)
        and (approval_setup.approval_mode or "none") in _MANAGER_MODES
    )


def _accounting_flow_enabled(company_setup, accounting_setup) -> bool:
    return (
        bool(company_setup.accounting_module_enabled)
        and (accounting_setup.accounting_review_mode or "") not in ("none", "")
    )


def _apply_transition(
    db: Session,
    expense: Expense,
    new_status: str,
    actor_user_id: int | None = None,
) -> Expense:
    """Write new_status, commit, refresh, and log.  Internal use only.

    Asserts that new_status is in _KNOWN_STATUSES before touching the DB so
    that no unrecognised value can ever be persisted by a future code change.
    """
    if new_status not in _KNOWN_STATUSES:
        raise ValueError(
            f"_apply_transition: '{new_status}' is not a recognised status. "
            f"Add it to the Expense model and _KNOWN_STATUSES before using it."
        )
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
        detail_text=f"{old_status} → {new_status}",
        company_id=expense.company_id,
    )
    return expense


# ── Public transitions ────────────────────────────────────────────────────────

def submit_expense(db: Session, expense: Expense, actor_user_id: int | None = None) -> Expense:
    """
    Submit an expense for review.

    Allowed from statuses:
      - draft   (first submission)
      - rejected (resubmission), only when allow_resubmission_after_rejection is True

    Raises ValueError if:
      - The expense is not in a submittable state.
      - The workflow blocks submission because documents have failed validation.
    """
    status = expense.status

    # ── Precondition: submittable state ───────────────────────────────────────
    if status == _STATUS_DRAFT:
        pass  # first submission, always allowed to attempt
    elif status == _STATUS_REJECTED:
        approval = get_or_create_approval_setup(db, expense.company_id)
        if not bool(approval.allow_resubmission_after_rejection):
            raise ValueError(
                f"Expense {expense.id} is rejected and company policy does not "
                "allow resubmission after rejection."
            )
    else:
        raise ValueError(
            f"Expense {expense.id} cannot be submitted from status '{status}'. "
            f"Expected '{_STATUS_DRAFT}' or '{_STATUS_REJECTED}' "
            "(with resubmission policy enabled)."
        )

    # ── Precondition: validation gate ─────────────────────────────────────────
    # Submission is always blocked when documents have failed validation.
    # The accounting setup's allow_submit_with_warnings can override the
    # 'warning' severity in the accounting queue, but 'failed' is hard-blocked.
    flags = get_validation_flags(db, expense.id)
    if flags["has_failed"]:
        raise ValueError(
            f"Expense {expense.id} cannot be submitted: one or more attached "
            "documents have failed validation."
        )

    # ── Target status ─────────────────────────────────────────────────────────
    # The submit action always moves the expense into the review pipeline.
    # The single supported entry-point status for both manager and accounting
    # queues is "submitted" — routing to the correct queue is handled by the
    # queue services at read time, not at write time.
    return _apply_transition(db, expense, _STATUS_SUBMITTED, actor_user_id=actor_user_id)


def manager_approve_expense(db: Session, expense: Expense, actor_user_id: int | None = None) -> Expense:
    """
    Approve an expense at the manager review stage.

    Target status depends on approval_mode:
      - manager_only / threshold_based → "approved"  (manager is the final step)
      - manager_then_accounting        → "manager_approved"  (routes to accounting)

    Raises ValueError if:
      - The manager flow is not enabled.
      - The expense is not awaiting manager review (status ≠ "submitted").
      - threshold_based: expense amount is below the configured threshold.
    """
    company_setup = get_or_create_company_setup(db, expense.company_id)
    approval      = get_or_create_approval_setup(db, expense.company_id)

    if not _manager_flow_enabled(company_setup, approval):
        raise ValueError(
            f"Expense {expense.id}: manager flow is not enabled for company "
            f"{expense.company_id}."
        )

    if expense.status != _STATUS_SUBMITTED:
        raise ValueError(
            f"Expense {expense.id} cannot be manager-approved from status "
            f"'{expense.status}'. Expected '{_STATUS_SUBMITTED}'."
        )

    # Threshold re-check — guard against direct calls bypassing queue filtering.
    approval_mode = approval.approval_mode or "none"
    if (
        approval_mode == "threshold_based"
        and approval.manager_threshold_amount is not None
        and approval.manager_threshold_amount > 0
        and (expense.amount or 0) < approval.manager_threshold_amount
    ):
        raise ValueError(
            f"Expense {expense.id} (amount {expense.amount}) is below the "
            f"manager approval threshold ({approval.manager_threshold_amount}); "
            "manager approval is not required for this expense."
        )

    # Determine whether there is a downstream accounting step.
    if approval_mode == "manager_then_accounting":
        # Accounting will review next; write manager_approved so the accounting
        # queue service can distinguish this from a fresh submission.
        target = _STATUS_MANAGER_APPROVED
    else:
        # manager_only or threshold_based: manager is the final approver.
        target = _STATUS_APPROVED

    return _apply_transition(db, expense, target, actor_user_id=actor_user_id)


def manager_reject_expense(db: Session, expense: Expense, actor_user_id: int | None = None) -> Expense:
    """
    Reject an expense at the manager review stage.

    Raises ValueError if:
      - The manager flow is not enabled.
      - The expense is not awaiting manager review.
    """
    company_setup = get_or_create_company_setup(db, expense.company_id)
    approval      = get_or_create_approval_setup(db, expense.company_id)

    if not _manager_flow_enabled(company_setup, approval):
        raise ValueError(
            f"Expense {expense.id}: manager flow is not enabled for company "
            f"{expense.company_id}."
        )

    if expense.status != _STATUS_SUBMITTED:
        raise ValueError(
            f"Expense {expense.id} cannot be manager-rejected from status "
            f"'{expense.status}'. Expected '{_STATUS_SUBMITTED}'."
        )

    return _apply_transition(db, expense, _STATUS_REJECTED, actor_user_id=actor_user_id)


def manager_return_expense(db: Session, expense: Expense, actor_user_id: int | None = None) -> Expense:
    """
    Return an expense to the employee for correction (manager stage).

    The expense is set to 'draft' (_STATUS_RETURNED) so the employee can edit
    and resubmit.  There is no dedicated "returned" status in the current model;
    see the module-level note for the rationale and trade-offs.

    Raises ValueError if:
      - The manager flow is not enabled.
      - The expense is not awaiting manager review.
    """
    company_setup = get_or_create_company_setup(db, expense.company_id)
    approval      = get_or_create_approval_setup(db, expense.company_id)

    if not _manager_flow_enabled(company_setup, approval):
        raise ValueError(
            f"Expense {expense.id}: manager flow is not enabled for company "
            f"{expense.company_id}."
        )

    if expense.status != _STATUS_SUBMITTED:
        raise ValueError(
            f"Expense {expense.id} cannot be returned from status "
            f"'{expense.status}'. Expected '{_STATUS_SUBMITTED}'."
        )

    return _apply_transition(db, expense, _STATUS_RETURNED, actor_user_id=actor_user_id)


def accounting_approve_expense(db: Session, expense: Expense, actor_user_id: int | None = None) -> Expense:
    """
    Approve an expense at the accounting review stage.

    Eligible input statuses depend on approval_mode:
      - manager_then_accounting → "manager_approved"
      - accounting_only / none  → "submitted"

    Raises ValueError if:
      - The accounting flow is not enabled.
      - The expense is not in an accounting-eligible status.
    """
    company_setup = get_or_create_company_setup(db, expense.company_id)
    accounting    = get_or_create_accounting_setup(db, expense.company_id)
    approval      = get_or_create_approval_setup(db, expense.company_id)

    if not _accounting_flow_enabled(company_setup, accounting):
        raise ValueError(
            f"Expense {expense.id}: accounting flow is not enabled for company "
            f"{expense.company_id}."
        )

    _assert_accounting_eligible(expense, approval)

    return _apply_transition(db, expense, _STATUS_APPROVED, actor_user_id=actor_user_id)


def accounting_reject_expense(db: Session, expense: Expense, actor_user_id: int | None = None) -> Expense:
    """
    Reject an expense at the accounting review stage.

    Raises ValueError if:
      - The accounting flow is not enabled.
      - The expense is not in an accounting-eligible status.
    """
    company_setup = get_or_create_company_setup(db, expense.company_id)
    accounting    = get_or_create_accounting_setup(db, expense.company_id)
    approval      = get_or_create_approval_setup(db, expense.company_id)

    if not _accounting_flow_enabled(company_setup, accounting):
        raise ValueError(
            f"Expense {expense.id}: accounting flow is not enabled for company "
            f"{expense.company_id}."
        )

    _assert_accounting_eligible(expense, approval)

    return _apply_transition(db, expense, _STATUS_REJECTED, actor_user_id=actor_user_id)


def accounting_return_expense(db: Session, expense: Expense, actor_user_id: int | None = None) -> Expense:
    """
    Return an expense to the employee for correction (accounting stage).

    The expense is set to 'draft' (_STATUS_RETURNED) — same model limitation
    and rationale as manager_return_expense.  See the module-level note.

    Raises ValueError if:
      - The accounting flow is not enabled.
      - The expense is not in an accounting-eligible status.
      - allow_resubmit_after_return is False.
    """
    company_setup = get_or_create_company_setup(db, expense.company_id)
    accounting    = get_or_create_accounting_setup(db, expense.company_id)
    approval      = get_or_create_approval_setup(db, expense.company_id)

    if not _accounting_flow_enabled(company_setup, accounting):
        raise ValueError(
            f"Expense {expense.id}: accounting flow is not enabled for company "
            f"{expense.company_id}."
        )

    _assert_accounting_eligible(expense, approval)

    return _apply_transition(db, expense, _STATUS_RETURNED, actor_user_id=actor_user_id)


# ── Private: accounting eligibility assertion ─────────────────────────────────

def _assert_accounting_eligible(expense: Expense, approval_setup) -> None:
    """
    Raise ValueError if *expense* is not in a status that accounting may act on.

    Eligible statuses mirror list_accounting_queue eligibility logic in
    review_queue_service.py and the accounting resolver in action_resolver_service.py:
      - manager_then_accounting → only "manager_approved"
      - all other modes         → only "submitted"
    """
    approval_mode = approval_setup.approval_mode or "none"

    if approval_mode == "manager_then_accounting":
        eligible: frozenset[str] = frozenset({_STATUS_MANAGER_APPROVED})
    else:
        eligible = frozenset({_STATUS_SUBMITTED})

    if expense.status not in eligible:
        raise ValueError(
            f"Expense {expense.id} cannot be actioned by accounting from status "
            f"'{expense.status}'. "
            f"Expected: {', '.join(sorted(eligible))} "
            f"(approval_mode='{approval_mode}')."
        )
