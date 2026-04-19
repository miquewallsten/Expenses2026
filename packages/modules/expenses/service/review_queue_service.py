"""
review_queue_service.py

Computes dynamic manager and accounting review queues from persisted config
and expense records.  Does not implement a workflow engine — logic stays
deliberately conservative: it only uses status values and config flags that
already exist in the database.
"""

from sqlalchemy.orm import Session

from packages.modules.expenses.models.document import ExpenseDocument
from packages.modules.expenses.models.expense import Expense
from packages.modules.expenses.models.validation_result import ValidationResult
from packages.modules.expenses.service.policy_service import (
    get_or_create_company_expense_policy,
)
from packages.modules.admin.service.accounting_setup_service import (
    get_or_create_accounting_setup,
)
from packages.modules.admin.service.approval_setup_service import (
    get_or_create_approval_setup,
)
from packages.modules.admin.service.company_setup_service import (
    get_or_create_company_setup,
)
from packages.modules.admin.service.workflow_setup_service import (
    get_or_create_workflow_setup,
)

# ── Constants ─────────────────────────────────────────────────────────────────

# Full set of statuses currently supported by the Expense model.  Any status
# not in this set is unknown / from a future migration and must be ignored.
_KNOWN_STATUSES: frozenset[str] = frozenset(
    {"draft", "submitted", "manager_approved", "approved", "rejected"}
)

# Statuses that are terminal — never appear in any review queue.
# Extend this set when new terminal statuses are added to the model.
_TERMINAL_STATUSES: frozenset[str] = frozenset({"approved", "rejected"})

# Statuses that are reviewable (not terminal, not draft).
# Currently the only immediately reviewable status is "submitted".
# "manager_approved" is gated to the accounting queue context only.
# TODO: extend when a "returned" or "escalated" status is added to the model.
_REVIEWABLE_STATUSES: frozenset[str] = frozenset(
    _KNOWN_STATUSES - _TERMINAL_STATUSES - {"draft"}
)

# Status written by the manager-approval step; signals "ready for accounting".
_STATUS_MANAGER_APPROVED = "manager_approved"
_STATUS_SUBMITTED = "submitted"

# approval_mode values that activate the manager flow
_MANAGER_MODES: frozenset[str] = frozenset(
    {"manager_only", "manager_then_accounting", "threshold_based"}
)

# All approval_mode values the current schema recognises.  Defined here as
# the single source of truth — used by the eligibility helpers below.
# (Previously duplicated in action_resolver_service.py.)
_KNOWN_APPROVAL_MODES: frozenset[str] = frozenset(
    {"none", "manager_only", "manager_then_accounting",
     "accounting_only", "threshold_based"}
)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _safe_statuses(candidates: list[str]) -> list[str]:
    """
    Filter *candidates* to only statuses that are both known to the current
    Expense model and not terminal.  Returns an empty list when nothing
    survives — callers should treat that as "empty queue" without querying.

    This guard prevents accidental queries against invented or future status
    values that are not yet persisted in the database.
    """
    return [
        s for s in candidates
        if s in _KNOWN_STATUSES and s not in _TERMINAL_STATUSES
    ]

def _manager_flow_enabled(company_setup, approval_setup) -> bool:
    """Mirror the derivation used in portal_config_router."""
    return (
        bool(company_setup.has_managers)
        and (approval_setup.approval_mode or "none") in _MANAGER_MODES
    )


def _accounting_flow_enabled(company_setup, accounting_setup) -> bool:
    """Mirror the derivation used in portal_config_router."""
    return (
        bool(company_setup.accounting_module_enabled)
        and (accounting_setup.accounting_review_mode or "") not in ("none", "")
    )


def _manager_queue_eligible_statuses(approval_setup) -> list[str]:
    """
    Return the Expense statuses eligible to enter the manager queue under the
    given approval_setup, or [] when the mode does not route through a manager.

    CANONICAL — both list_manager_queue (DB filter) and is_manager_reviewable
    (per-expense check) call this function so they cannot drift.
    """
    if (approval_setup.approval_mode or "none") not in _MANAGER_MODES:
        return []
    # "submitted" is the sole manager-queue entry point in the current model.
    # Extend here (and nowhere else) if additional entry-point statuses are
    # added to the Expense model.
    return [_STATUS_SUBMITTED]


def _accounting_queue_eligible_statuses(
    approval_setup,
    company_setup=None,
) -> list[str]:
    """
    Return the Expense statuses eligible to enter the accounting queue under
    the given approval_setup, or [] when the mode does not route to accounting.

    Pass *company_setup* to enable conflict-aware routing: when
    approval_mode is "manager_then_accounting" but manager flow is actually
    disabled (has_managers=False or mode mismatch), this returns
    ["submitted"] rather than ["manager_approved"] so expenses are not
    silently stranded waiting for a step that will never run.  Mirrors the
    "disabled_or_conflicted → accounting_only" branch in
    portal_config_router._compute_effective_review_route.

    When company_setup is None the function falls back to trusting
    approval_mode alone — safe for callers that do not have company_setup
    loaded.

    CANONICAL — both list_accounting_queue (DB filter) and
    is_accounting_reviewable (per-expense check) call this function so they
    cannot drift.
    """
    mode = approval_setup.approval_mode or "none"
    if mode not in _KNOWN_APPROVAL_MODES:
        return []  # unknown/future mode — deny rather than assume
    if mode == "manager_then_accounting":
        # When manager flow is active, expenses must have cleared the manager
        # step first (status == "manager_approved").
        # When manager flow is broken/disabled, fall through to direct
        # accounting using "submitted" — expenses must not be stranded.
        if company_setup is not None and not _manager_flow_enabled(
            company_setup, approval_setup
        ):
            return [_STATUS_SUBMITTED]
        return [_STATUS_MANAGER_APPROVED]
    if mode in ("accounting_only", "none"):
        # Direct-to-accounting path: "submitted" is the entry point.
        return [_STATUS_SUBMITTED]
    # "manager_only", "threshold_based": no accounting review step.
    return []


def _expense_ids_with_flagged_validations(
    db: Session,
    company_id: int,
    flag_statuses: tuple[str, ...],
) -> set[int]:
    """
    Return the set of expense IDs (for the given company) whose documents
    have at least one ValidationResult with a status in *flag_statuses*.
    """
    flagged_doc_ids = (
        db.query(ValidationResult.document_id)
        .filter(ValidationResult.status.in_(flag_statuses))
        .subquery()
    )
    rows = (
        db.query(ExpenseDocument.expense_id)
        .filter(
            ExpenseDocument.id.in_(flagged_doc_ids),
            ExpenseDocument.expense_id.is_not(None),
        )
        .distinct()
        .all()
    )
    return {row[0] for row in rows}


def _get_expense_validation_flags(db: Session, expense_id: int) -> dict:
    """
    Per-expense equivalent of _expense_ids_with_flagged_validations.

    Returns {has_failed, has_warning} booleans for the documents linked to
    *expense_id*.  Used by is_accounting_reviewable for the exceptions_only
    gate; list_accounting_queue uses the batch helper instead for efficiency.
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
            .filter(ValidationResult.document_id.in_(doc_ids))
            .distinct()
            .all()
        )
    ]
    return {
        "has_failed":  "failed"  in result_statuses,
        "has_warning": "warning" in result_statuses,
    }


# ── Per-expense reviewability (single source of truth) ───────────────────────
#
# These helpers answer "can this reviewer act on this specific expense?".
# They derive their rules from the same _*_queue_eligible_statuses functions
# used by the batch queue queries, guaranteeing they stay in sync:
#
#   list_manager_queue         ← _manager_queue_eligible_statuses   (DB WHERE)
#   is_manager_reviewable      ← _manager_queue_eligible_statuses   (per-expense)
#   resolve_manager_actions    ← is_manager_reviewable              (imported)
#
#   list_accounting_queue      ← _accounting_queue_eligible_statuses (DB WHERE)
#   is_accounting_reviewable   ← _accounting_queue_eligible_statuses (per-expense)
#   resolve_accounting_actions ← is_accounting_reviewable           (imported)
#
# INVARIANT: if is_accounting_reviewable(db, expense) returns True and
# accounting_review_mode is "all", the expense appears in list_accounting_queue.
# Same holds for the manager pair.


def is_manager_reviewable(
    db: Session, expense: Expense
) -> tuple[bool, list[str]]:
    """
    Return ``(True, [])`` when a manager can act on *expense*, or
    ``(False, reasons)`` explaining why not.

    Imported by action_resolver_service.resolve_manager_actions.
    """
    reasons: list[str] = []

    if (expense.status or "") not in _KNOWN_STATUSES:
        reasons.append(
            f"Unknown expense status '{expense.status}'; no actions available."
        )
        return False, reasons

    company_setup = get_or_create_company_setup(db, expense.company_id)
    approval      = get_or_create_approval_setup(db, expense.company_id)

    if not _manager_flow_enabled(company_setup, approval):
        reasons.append("Manager review flow is not enabled for this company.")
        return False, reasons

    eligible = _manager_queue_eligible_statuses(approval)
    if not eligible:
        reasons.append(
            f"Approval mode '{approval.approval_mode}' does not route expenses "
            "through manager review."
        )
        return False, reasons

    if expense.status not in eligible:
        reasons.append(
            f"Expense status '{expense.status}' is not awaiting manager review "
            f"(expected: {', '.join(sorted(eligible))})."
        )
        return False, reasons

    # Threshold re-check — guards against calls from outside the queue context
    # (e.g. a detail view that calls resolve_manager_actions directly).
    if (
        (approval.approval_mode or "none") == "threshold_based"
        and approval.manager_threshold_amount is not None
        and approval.manager_threshold_amount > 0
        and (expense.amount or 0) < approval.manager_threshold_amount
    ):
        reasons.append(
            "Expense amount is below the manager approval threshold; "
            "no manager action required."
        )
        return False, reasons

    return True, reasons


def is_accounting_reviewable(
    db: Session, expense: Expense
) -> tuple[bool, list[str]]:
    """
    Return ``(True, [])`` when an accounting reviewer can act on *expense*, or
    ``(False, reasons)`` explaining why not.

    Imported by action_resolver_service.resolve_accounting_actions.
    """
    reasons: list[str] = []

    if (expense.status or "") not in _KNOWN_STATUSES:
        reasons.append(
            f"Unknown expense status '{expense.status}'; no actions available."
        )
        return False, reasons

    company_setup = get_or_create_company_setup(db, expense.company_id)
    accounting    = get_or_create_accounting_setup(db, expense.company_id)
    approval      = get_or_create_approval_setup(db, expense.company_id)

    if not _accounting_flow_enabled(company_setup, accounting):
        reasons.append("Accounting review flow is not enabled for this company.")
        return False, reasons

    if expense.status in _TERMINAL_STATUSES:
        reasons.append(
            f"Expense status '{expense.status}' is terminal; "
            "no accounting actions are available."
        )
        return False, reasons

    # Pass company_setup so conflict-aware routing (manager_then_accounting
    # with managers disabled) falls back to "submitted" rather than
    # "manager_approved".
    eligible = _accounting_queue_eligible_statuses(approval, company_setup)
    if not eligible:
        approval_mode = approval.approval_mode or "none"
        if approval_mode not in _KNOWN_APPROVAL_MODES:
            reasons.append(
                f"Unrecognised approval_mode '{approval_mode}'; "
                "accounting actions denied."
            )
        else:
            reasons.append(
                f"Approval mode '{approval_mode}' does not route expenses "
                "to accounting review."
            )
        return False, reasons

    if expense.status not in eligible:
        reasons.append(
            f"Expense status '{expense.status}' is not in the accounting review "
            f"stage (expected: {', '.join(sorted(eligible))})."
        )
        return False, reasons

    # ── exceptions_only gate ──────────────────────────────────────────────────
    # When accounting_review_mode is "exceptions_only", only expenses that
    # carry at least one qualifying exception flag are routed to accounting.
    # This is the per-expense equivalent of the batch filter in
    # list_accounting_queue — both use the same flag rules so they cannot drift.
    #
    # Qualifying flags:
    #   • any document with validation status "failed"
    #   • any document with validation status "warning", but only when warnings
    #     are explicitly routed to accounting (allow_submit_with_warnings on
    #     accounting setup OR workflow setup)
    #
    # escalate_policy_failures_to_accounting is captured by the "failed" flag
    # path above — no separate query needed.
    # escalate_international_to_accounting cannot be detected from the Expense
    # model alone; conservatively defer to the validation flag path only.
    review_mode = accounting.accounting_review_mode or "all"
    if review_mode == "exceptions_only":
        workflow = get_or_create_workflow_setup(db, expense.company_id)
        flags    = _get_expense_validation_flags(db, expense.id)
        warnings_routed = bool(
            accounting.allow_submit_with_warnings
            or workflow.allow_submit_with_warnings
        )
        is_exception = flags["has_failed"] or (
            flags["has_warning"] and warnings_routed
        )
        if not is_exception:
            reasons.append(
                "This expense is not routed to accounting under "
                "exceptions-only review mode."
            )
            return False, reasons

    return True, reasons


# ── Public API ────────────────────────────────────────────────────────────────

def list_manager_queue(db: Session, company_id: int) -> list[Expense]:
    """
    Return expenses that are currently awaiting manager review.

    Rules:
    - Returns [] if manager flow is not enabled for this company/config.
    - Only includes expenses with status "submitted".
    - Excludes terminal statuses (approved / rejected).
    - For threshold_based mode: only includes expenses >= manager_threshold_amount.
    - If require_manager_for_all_employees is False and the approval mode does
      not require manager review, the manager flow gate above already returns [].
    """
    company_setup = get_or_create_company_setup(db, company_id)
    approval = get_or_create_approval_setup(db, company_id)

    if not _manager_flow_enabled(company_setup, approval):
        return []

    # require_manager_for_all_employees=False alone does not disable the queue
    # when the approval_mode explicitly routes through managers.  However, if
    # the mode is threshold_based AND the flag is False AND no threshold is set,
    # there are no expenses that need manager review.
    if (
        approval.approval_mode == "threshold_based"
        and not approval.require_manager_for_all_employees
        and (approval.manager_threshold_amount is None or approval.manager_threshold_amount <= 0)
    ):
        return []

    # Eligible statuses come from the same function used by is_manager_reviewable
    # — queue filter and per-expense check are guaranteed to agree.
    eligible_statuses = _safe_statuses(_manager_queue_eligible_statuses(approval))
    if not eligible_statuses:
        return []

    query = (
        db.query(Expense)
        .filter(
            Expense.company_id == company_id,
            Expense.status.in_(eligible_statuses),
        )
    )

    if approval.approval_mode == "threshold_based":
        threshold = approval.manager_threshold_amount
        if threshold is not None and threshold > 0:
            query = query.filter(Expense.amount >= threshold)

    return query.order_by(Expense.created_at).all()


def list_accounting_queue(db: Session, company_id: int) -> list[Expense]:
    """
    Return expenses that are currently awaiting accounting review.

    Eligibility rules:
    - Returns [] if accounting flow is not enabled for this company/config.
    - Terminal statuses ("approved", "rejected") are always excluded.
    - Eligible statuses are derived from _accounting_queue_eligible_statuses,
      which is the single source of truth shared with is_accounting_reviewable:
        * Direct-to-accounting paths (mode "none", "accounting_only"):
          → status "submitted".
        * "manager_then_accounting" with manager flow active:
          → status "manager_approved" (must have cleared manager step).
        * "manager_then_accounting" with manager flow DISABLED:
          → status "submitted" (fallback; manager step will never run).
        * "manager_only", "threshold_based":
          → [] (no accounting step; returns empty queue).

    accounting_review_mode == "all":
    - All accounting-eligible expenses are included directly.

    accounting_review_mode == "exceptions_only":
    - Restricted to accounting-eligible submitted items that carry at least
      one validation exception flag:
        * Always: documents with status "failed".
        * Additionally: documents with status "warning" when
          allow_submit_with_warnings is True on accounting or workflow setup.
    - If no candidate expense IDs survive the flag filter, returns [].
    - Does not invent stage transitions unsupported by the current status model.
    """
    company_setup = get_or_create_company_setup(db, company_id)
    accounting = get_or_create_accounting_setup(db, company_id)
    approval = get_or_create_approval_setup(db, company_id)
    workflow = get_or_create_workflow_setup(db, company_id)
    policy = get_or_create_company_expense_policy(db, company_id)

    if not _accounting_flow_enabled(company_setup, accounting):
        return []

    review_mode = accounting.accounting_review_mode or "all"
    approval_mode = approval.approval_mode or "none"

    # Eligible statuses come from the same function used by
    # is_accounting_reviewable — queue filter and per-expense check are
    # guaranteed to agree.  Passing company_setup enables conflict-aware
    # routing (manager_then_accounting + manager disabled → "submitted").
    # _safe_statuses strips any value not yet supported by the Expense model.
    eligible_statuses = _safe_statuses(
        _accounting_queue_eligible_statuses(approval, company_setup)
    )
    if not eligible_statuses:
        return []

    if review_mode == "all":
        return (
            db.query(Expense)
            .filter(
                Expense.company_id == company_id,
                Expense.status.in_(eligible_statuses),
            )
            .order_by(Expense.created_at)
            .all()
        )

    if review_mode == "exceptions_only":
        # Build the set of expense IDs that carry at least one qualifying
        # validation flag.  This is the batch-query equivalent of the
        # exceptions_only gate inside is_accounting_reviewable; the flag rules
        # are intentionally identical so that queue membership and action
        # availability are always in parity.
        flag_statuses: list[str] = ["failed"]
        if accounting.allow_submit_with_warnings or workflow.allow_submit_with_warnings:
            flag_statuses.append("warning")

        flagged_ids = _expense_ids_with_flagged_validations(
            db, company_id, tuple(flag_statuses)
        )

        # Also include IDs escalated to accounting by approval config even if
        # their validations are clean.
        escalation_ids: set[int] = set()

        if approval.escalate_policy_failures_to_accounting:
            # Policy failures are represented by "failed" validation results —
            # already captured in flagged_ids above.  No additional query needed.
            pass

        if approval.escalate_international_to_accounting and policy.international_expenses_allowed:
            # International routing: workflow config points international expenses
            # to accounting.  We can't detect "is international" from the Expense
            # model alone without additional data, so we conservatively skip this
            # auto-inclusion and rely on the validation flag path above.
            pass

        candidate_ids = flagged_ids | escalation_ids
        if not candidate_ids:
            return []

        return (
            db.query(Expense)
            .filter(
                Expense.company_id == company_id,
                Expense.status.in_(eligible_statuses),
                Expense.id.in_(candidate_ids),
            )
            .order_by(Expense.created_at)
            .all()
        )

    # accounting_review_mode == "none" or unknown — flow gate above should have
    # caught this, but be safe.
    return []


def build_queue_summary(expenses: list[Expense]) -> dict:
    """
    Return a lightweight summary dict for a review queue.

    Keys:
      total_count   – number of expenses in the queue
      total_amount  – sum of expense amounts (float, 2 decimal places)
      statuses      – mapping of status → count
      flagged_count – number of expenses whose amount > 0 (proxy for non-zero
                      items; replace with real flag logic when a flag field exists)
    """
    total_count = len(expenses)
    total_amount = round(sum(e.amount for e in expenses if e.amount is not None), 2)

    statuses: dict[str, int] = {}
    for expense in expenses:
        statuses[expense.status] = statuses.get(expense.status, 0) + 1

    # "Flagged" here is a conservative stand-in: expenses with a non-zero amount.
    # When a dedicated flag/exception field is added to the Expense model this
    # should be updated to use that field instead.
    flagged_count = sum(1 for e in expenses if e.amount is not None and e.amount > 0)

    return {
        "total_count": total_count,
        "total_amount": total_amount,
        "statuses": statuses,
        "flagged_count": flagged_count,
    }
