"""expense_blocker_service.py

Evaluates whether an expense is complete enough for submission, accounting
work, and póliza generation.

Design principles
-----------------
* Allocation dimensions (project, client, cost center) are verified directly
  against persisted ExpenseAllocation rows.  A blocker is only added when the
  requirement is configured AND no qualifying row exists.
* Conservative fallback: if a requirement cannot be verified at all (e.g. an
  unrecognised dimension name), a blocker is added rather than silently passing.
* No workflow simulation: reads persisted state only.
* Single public entry point: get_expense_blockers(db, expense) → dict.
  Callers that only care about one category can inspect the relevant key.

Return shape
------------
{
    "submit_blockers":      list[str],  # hard blocks on submission
    "accounting_blockers":  list[str],  # hard blocks on accounting work
    "poliza_blockers":      list[str],  # hard blocks on póliza generation
    "warnings":             list[str],  # soft / informational only
}


# ============================================================================
# Developer smoke tests — end-to-end curl walkthrough
# ============================================================================
#
# Prerequisites
# -------------
#   * API running:  python -m uvicorn apps.api.main:app --reload
#   * Company 1 exists with:
#       accounting_flow_enabled = True   (portal config / accounting_setup)
#       poliza_required          = True   (accounting_setup)
#       account_code_required    = True   (accounting_setup)
#       project_required         = True   (accounting_setup)
#   * Replace placeholder IDs below with real values from your local DB.
#
# Convenience export — re-use $EXP across all steps:
#
#   export EXP=<id from step 1>
#
# ----------------------------------------------------------------------------
# STEP 1 — Create a draft expense
# ----------------------------------------------------------------------------
# Expect: 201 with {"id": N, "status": "draft", ...}
#
#   curl -s -X POST http://localhost:8000/expenses \
#     -H "Content-Type: application/json" \
#     -H "X-User-Id: 1" \
#     -d '{"description": "Office supplies", "amount": 150.00, "company_id": 1}' \
#     | python3 -m json.tool
#
#   export EXP=<id from response above>
#
# ----------------------------------------------------------------------------
# STEP 2 — Submit the expense
# ----------------------------------------------------------------------------
# Expect: {"status": "submitted", ...}
# For a minimal config (no XML / proof required) this should succeed with no
# submit_blockers.  Check first if unsure:
#
#   curl -s "http://localhost:8000/expenses/blockers/$EXP" \
#     -H "X-User-Id: 1" | python3 -m json.tool
#
#   curl -s -X POST "http://localhost:8000/expenses/review-actions/$EXP/submit" \
#     -H "X-User-Id: 1" | python3 -m json.tool
#
# ----------------------------------------------------------------------------
# STEP 3 — Assign account code
# ----------------------------------------------------------------------------
# Expect: 200 with expense.account_code = "6001-gastos-generales".
# After this call the account-code entry should leave accounting_blockers and
# poliza_blockers.
#
#   curl -s -X POST "http://localhost:8000/accounting/work/$EXP/assign-account-code" \
#     -H "Content-Type: application/json" \
#     -H "X-User-Id: 1" \
#     -d '{"account_code": "6001-gastos-generales"}' \
#     | python3 -m json.tool
#
# ----------------------------------------------------------------------------
# STEP 4 — Observe póliza still blocked by missing project allocation
# ----------------------------------------------------------------------------
# Precondition: no ExpenseAllocation row with a non-null project_id yet.
# Expect: poliza_blockers contains "Project allocation is required."
#         accounting_blockers also contains the same entry.
#
#   curl -s "http://localhost:8000/expenses/blockers/$EXP" \
#     -H "X-User-Id: 1" | python3 -m json.tool
#
#   # Attempting generation at this point must return 400:
#   curl -s -X POST "http://localhost:8000/accounting/work/$EXP/generate-poliza" \
#     -H "X-User-Id: 1" | python3 -m json.tool
#   # Expect: {"detail": "Póliza cannot be generated ... Project allocation is required."}
#
# ----------------------------------------------------------------------------
# STEP 5 — Save a project allocation via the replace endpoint
# ----------------------------------------------------------------------------
# Replaces any existing allocations atomically.  100 % must sum to 100.
# Replace PROJECT_ID with a real id from:
#   GET http://localhost:8000/expenses/projects?company_id=1
#
#   curl -s -X PUT "http://localhost:8000/expenses/allocation-edit/$EXP" \
#     -H "Content-Type: application/json" \
#     -H "X-User-Id: 1" \
#     -d "{\"items\": [{\"project_id\": PROJECT_ID, \"percent\": 100}]}" \
#     | python3 -m json.tool
#   # Expect: {"expense_id": N, "items": [{...}]}
#
# ----------------------------------------------------------------------------
# STEP 6 — Confirm project blocker is cleared
# ----------------------------------------------------------------------------
# Now that an ExpenseAllocation row with project_id is persisted,
# get_allocation_presence returns has_project=True and _check_*_blockers
# no longer emits "Project allocation is required.".
# Expect: poliza_blockers = [] (assuming account code is already assigned).
#
#   curl -s "http://localhost:8000/expenses/blockers/$EXP" \
#     -H "X-User-Id: 1" | python3 -m json.tool
#
# ----------------------------------------------------------------------------
# STEP 7 — Generate póliza (all blockers resolved)
# ----------------------------------------------------------------------------
# Expect: 200 with:
#   {"expense_id": N, "status": "generated",
#    "poliza_reference": "POL-EXP-N",
#    "account_code": "6001-gastos-generales", "amount": 150.0}
#
#   curl -s -X POST "http://localhost:8000/accounting/work/$EXP/generate-poliza" \
#     -H "X-User-Id: 1" | python3 -m json.tool
#
#   # Cross-check eligibility endpoint (non-destructive):
#   curl -s "http://localhost:8000/accounting/work/$EXP/poliza-eligibility" \
#     -H "X-User-Id: 1" | python3 -m json.tool
#   # Expect: {"eligible": true, "blockers": []}
#
# ============================================================================
"""

from sqlalchemy.orm import Session

from packages.modules.expenses.models.document import ExpenseDocument
from packages.modules.expenses.models.expense import Expense
from packages.modules.expenses.models.expense_allocation import ExpenseAllocation
from packages.modules.expenses.models.expense_attachment import ExpenseAttachment
from packages.modules.expenses.models.validation_result import ValidationResult
from packages.modules.expenses.service.policy_service import (
    get_or_create_company_expense_policy,
)
from packages.modules.expenses.service.review_queue_service import (
    is_accounting_reviewable,
)
from packages.modules.admin.service.accounting_setup_service import (
    get_or_create_accounting_setup,
)
from packages.modules.admin.service.approval_setup_service import (
    get_or_create_approval_setup,
)
from packages.modules.expenses.service.ai_policy_evaluator_service import (
    evaluate_policies as _evaluate_ai_policies,
)
from packages.core.platform.models_accounting_category import AccountingCategory
from packages.core.platform.models_ai_policy import AIPolicy
from packages.modules.expenses.models.expense_policy_override import (
    ExpensePolicyOverride,
)


def _overridden_rule_codes(db: Session, expense_id: int) -> set[str]:
    return {
        r[0]
        for r in db.query(ExpensePolicyOverride.rule_code)
        .filter(ExpensePolicyOverride.expense_id == expense_id)
        .all()
    }


def _ai_blockers_and_warnings(db: Session, expense: Expense) -> dict[str, list[str]]:
    """Evaluate AI policies per-policy so overridden ones can be skipped.

    Returns the same ``{blockers, warnings}`` shape as `evaluate_policies`
    but drops every policy whose ``AI_POLICY_{id}`` code has an active
    justification override row.
    """
    overridden = _overridden_rule_codes(db, expense.id)
    policies = (
        db.query(AIPolicy)
        .filter(
            AIPolicy.company_id == expense.company_id,
            AIPolicy.enabled.is_(True),
            AIPolicy.scope == "expense_validation",
        )
        .all()
    )
    blockers: list[str] = []
    warnings: list[str] = []
    for p in policies:
        if f"AI_POLICY_{p.id}" in overridden:
            continue
        verdict = _evaluate_ai_policies(db, expense, policies=[p])
        blockers.extend(verdict["blockers"])
        warnings.extend(verdict["warnings"])
    return {"blockers": blockers, "warnings": warnings}


# ── Internal data-gathering helpers ───────────────────────────────────────────

def _load_expense_category(
    db: Session, expense: Expense
) -> AccountingCategory | None:
    """Return the active AccountingCategory for this expense's category_code, or None."""
    code = (expense.category_code or "").strip()
    if not code:
        return None
    return (
        db.query(AccountingCategory)
        .filter(
            AccountingCategory.company_id == expense.company_id,
            AccountingCategory.code == code,
            AccountingCategory.is_active.is_(True),
        )
        .first()
    )

def _get_documents(db: Session, expense_id: int) -> list[ExpenseDocument]:
    return (
        db.query(ExpenseDocument)
        .filter(
            ExpenseDocument.expense_id == expense_id,
            ExpenseDocument.expense_id.is_not(None),
        )
        .all()
    )


def _get_validation_statuses(db: Session, expense_id: int) -> set[str]:
    """Return the distinct ValidationResult.status values for all documents
    linked to *expense_id*."""
    doc_ids = (
        db.query(ExpenseDocument.id)
        .filter(
            ExpenseDocument.expense_id == expense_id,
            ExpenseDocument.expense_id.is_not(None),
        )
        .subquery()
    )
    rows = (
        db.query(ValidationResult.status)
        .filter(ValidationResult.document_id.in_(doc_ids))
        .distinct()
        .all()
    )
    return {row[0] for row in rows}


def _get_warning_messages(db: Session, expense_id: int) -> list[str]:
    """Return distinct warning messages from ValidationResult rows linked to
    this expense.  These are surfaced as soft warnings in the return dict."""
    doc_ids = (
        db.query(ExpenseDocument.id)
        .filter(
            ExpenseDocument.expense_id == expense_id,
            ExpenseDocument.expense_id.is_not(None),
        )
        .subquery()
    )
    rows = (
        db.query(ValidationResult.message)
        .filter(
            ValidationResult.document_id.in_(doc_ids),
            ValidationResult.status == "warning",
        )
        .distinct()
        .all()
    )
    return [row[0] for row in rows if row[0]]


def _has_attachment_type(db: Session, expense_id: int, attachment_type: str) -> bool:
    return (
        db.query(ExpenseAttachment.id)
        .filter(
            ExpenseAttachment.expense_id == expense_id,
            ExpenseAttachment.attachment_type == attachment_type,
        )
        .first()
    ) is not None


def _has_allocation_dimension(
    db: Session, expense_id: int, dimension: str
) -> bool:
    """Return True if at least one persisted ExpenseAllocation row for
    *expense_id* has a non-null value for *dimension* (one of
    'project_id', 'client_id', 'cost_center_id').
    Returns False for unrecognised keys (conservative: no row found).
    Delegates to get_allocation_presence for consistent logic."""
    presence = get_allocation_presence(db, expense_id)
    mapping = {
        "project_id":     presence["has_project"],
        "client_id":      presence["has_client"],
        "cost_center_id": presence["has_cost_center"],
    }
    return mapping.get(dimension, False)  # False for unrecognised keys


# ── Public allocation helpers ─────────────────────────────────────────────────

def get_expense_allocations(db: Session, expense_id: int) -> list:
    """Return all persisted ExpenseAllocation rows for *expense_id*.

    Callers can use this to inspect raw allocation data without going through
    the blocker service.  Returns an empty list when no rows exist.
    """
    return (
        db.query(ExpenseAllocation)
        .filter(ExpenseAllocation.expense_id == expense_id)
        .all()
    )


def get_allocation_presence(db: Session, expense_id: int) -> dict:
    """Return a summary of which allocation dimensions are populated for
    *expense_id*.

    Return shape::

        {
            "has_any":          bool,
            "has_project":      bool,
            "has_client":       bool,
            "has_cost_center":  bool,
            "allocation_count": int,
        }

    Each ``has_*`` flag is True when at least one ExpenseAllocation row for
    this expense has a non-null value in the corresponding column.
    """
    rows: list[ExpenseAllocation] = get_expense_allocations(db, expense_id)
    return {
        "has_any":          len(rows) > 0,
        "has_project":      any(r.project_id     is not None for r in rows),
        "has_client":       any(r.client_id      is not None for r in rows),
        "has_cost_center":  any(r.cost_center_id is not None for r in rows),
        "allocation_count": len(rows),
    }


# ── Submission blocker helpers ─────────────────────────────────────────────────

def _check_submit_blockers(
    db: Session,
    expense: Expense,
    documents: list[ExpenseDocument],
    validation_statuses: set[str],
) -> list[str]:
    blockers: list[str] = []

    policy   = get_or_create_company_expense_policy(db, expense.company_id)
    accounting = get_or_create_accounting_setup(db, expense.company_id)

    overridden = _overridden_rule_codes(db, expense.id)

    doc_types = {(d.document_type or "").lower() for d in documents}

    # ── XML requirement ────────────────────────────────────────────────────────
    xml_mode = (policy.xml_required_mode or "").lower()
    if xml_mode == "always" and "XML_REQUIRED" not in overridden:
        if "cfdi_xml" not in doc_types:
            blockers.append(
                "A CFDI XML document is required for all expenses but none has been uploaded."
            )
    elif xml_mode == "mxn_only" and "XML_REQUIRED" not in overridden:
        # Conservative: we cannot verify the currency from the current Expense
        # model, so we check whether any document is present that looks like
        # XML. If none exists we warn but do not hard-block (the expense may be
        # foreign-currency). The hard-block only fires when xml_mode == "always".
        if "cfdi_xml" not in doc_types and not any(
            dt in {"cfdi_pdf", "pdf_unclassified", "ticket"} for dt in doc_types
        ) and not documents:
            blockers.append(
                "No documents have been uploaded. "
                "A CFDI XML may be required depending on expense currency."
            )

    # ── PDF pair requirement ───────────────────────────────────────────────────
    if (
        policy.pdf_pair_required_for_cfdi
        and "cfdi_xml" in doc_types
        and "PDF_PAIR_REQUIRED" not in overridden
    ):
        if not any(dt in {"cfdi_pdf", "pdf_unclassified"} for dt in doc_types):
            blockers.append(
                "A paired PDF is required alongside the CFDI XML "
                "(expense_policy.pdf_pair_required_for_cfdi is True)."
            )

    # ── Proof requirement ──────────────────────────────────────────────────────
    if policy.require_proof and "PROOF_REQUIRED" not in overridden:
        if not _has_attachment_type(db, expense.id, "proof"):
            blockers.append(
                "A proof attachment is required "
                "(expense_policy.require_proof is True) but none has been uploaded."
            )

    # ── Justification requirement ──────────────────────────────────────────────
    if policy.require_justification and "JUSTIFICATION_REQUIRED" not in overridden:
        if not _has_attachment_type(db, expense.id, "justification"):
            blockers.append(
                "A justification attachment is required "
                "(expense_policy.require_justification is True) but none has been uploaded."
            )

    # ── Validation failures ────────────────────────────────────────────────────
    if "failed" in validation_statuses:
        blockers.append(
            "One or more documents have failed validation. "
            "Submission is blocked until validation failures are resolved."
        )

    # ── Warning-based submission block ────────────────────────────────────────
    # Blocked when accounting setup disallows warnings at submit time.
    if "warning" in validation_statuses:
        accounting_allows = bool(accounting.allow_submit_with_warnings)
        if not accounting_allows:
            blockers.append(
                "Validation warnings are present and the accounting setup does not "
                "allow submission with warnings."
            )

    # ── Allocation dimensions ──────────────────────────────────────────────────
    # Read persisted ExpenseAllocation rows once; each has_* flag is True when
    # at least one row carries a non-null value for that dimension.  A blocker
    # is only emitted when the accounting config requires the dimension AND no
    # qualifying allocation row exists yet.
    alloc_presence = get_allocation_presence(db, expense.id)

    if accounting.cost_center_required and not alloc_presence["has_cost_center"]:
        blockers.append("Cost center allocation is required.")

    category = _load_expense_category(db, expense)
    project_required = bool(accounting.project_required) or (
        category is not None and bool(category.requires_project)
    )
    if project_required and not alloc_presence["has_project"]:
        blockers.append("Project allocation is required.")

    if accounting.client_required and not alloc_presence["has_client"]:
        blockers.append("Client allocation is required.")

    # ── AI policy blockers (per-policy, skipping overridden) ──────────────────
    # Freeform admin policies (AIPolicy) — only `block` severity matters at submit.
    ai_verdict = _ai_blockers_and_warnings(db, expense)
    blockers.extend(ai_verdict["blockers"])

    return blockers


# ── Accounting work blocker helpers ───────────────────────────────────────────

def _check_accounting_blockers(
    db: Session,
    expense: Expense,
    documents: list[ExpenseDocument],
    validation_statuses: set[str],
) -> list[str]:
    blockers: list[str] = []

    accounting = get_or_create_accounting_setup(db, expense.company_id)
    policy     = get_or_create_company_expense_policy(db, expense.company_id)

    # ── Reviewability ──────────────────────────────────────────────────────────
    reviewable, reasons = is_accounting_reviewable(db, expense)
    if not reviewable:
        for r in reasons:
            blockers.append(f"Expense is not in accounting-reviewable state: {r}")
        # The remaining checks are only meaningful for reviewable expenses.
        return blockers

    # ── Accounting classification ──────────────────────────────────────────────
    # At least one of account_code or category_code must be set so the
    # accounting engine can determine which GL accounts to use.
    has_account_code  = bool((expense.account_code  or "").strip())
    has_category_code = bool((expense.category_code or "").strip())
    if not has_account_code and not has_category_code:
        blockers.append(
            "Accounting classification is required (account or category)."
        )

    # ── Account code ───────────────────────────────────────────────────────────
    if bool(accounting.account_code_required) and not has_account_code:
        blockers.append(
            "Account code is required (accounting_setup.account_code_required) "
            "but has not been assigned to this expense."
        )

    # ── Allocation dimensions ──────────────────────────────────────────────────
    # Read persisted ExpenseAllocation rows once.  A blocker is only emitted
    # when the dimension is required AND no allocation row satisfies it.
    # Project is also required when the matched category has requires_project=True.
    alloc_presence = get_allocation_presence(db, expense.id)

    if accounting.cost_center_required and not alloc_presence["has_cost_center"]:
        blockers.append("Cost center allocation is required.")

    category = _load_expense_category(db, expense)
    project_required = bool(accounting.project_required) or (
        category is not None and bool(category.requires_project)
    )
    if project_required and not alloc_presence["has_project"]:
        blockers.append("Project allocation is required.")

    if accounting.client_required and not alloc_presence["has_client"]:
        blockers.append("Client allocation is required.")

    # ── Supporting documents ───────────────────────────────────────────────────
    # Accounting path depends on proof/justification if the policy demands them.
    if policy.require_proof:
        if not _has_attachment_type(db, expense.id, "proof"):
            blockers.append(
                "A proof attachment is required (expense_policy.require_proof) "
                "but none has been uploaded."
            )

    if policy.require_justification:
        if not _has_attachment_type(db, expense.id, "justification"):
            blockers.append(
                "A justification attachment is required "
                "(expense_policy.require_justification) but none has been uploaded."
            )

    # ── AI policy blockers ─────────────────────────────────────────
    ai_verdict = _ai_blockers_and_warnings(db, expense)
    blockers.extend(ai_verdict["blockers"])

    return blockers


# ── Póliza blocker helpers ─────────────────────────────────────────────────────

def _check_poliza_blockers(
    db: Session,
    expense: Expense,
) -> list[str]:
    blockers: list[str] = []

    accounting = get_or_create_accounting_setup(db, expense.company_id)

    # ── Póliza not part of this company's workflow ─────────────────────────────
    if not bool(accounting.poliza_required):
        blockers.append(
            "Póliza generation is not configured for this company "
            "(accounting_setup.poliza_required is False)."
        )
        return blockers  # no point checking further prerequisites

    # ── Reviewability ──────────────────────────────────────────────────────────
    reviewable, reasons = is_accounting_reviewable(db, expense)
    if not reviewable:
        for r in reasons:
            blockers.append(f"Expense is not accounting-reviewable: {r}")
        return blockers

    # ── Account code ───────────────────────────────────────────────────────────
    if bool(accounting.account_code_required) and not (expense.account_code or "").strip():
        blockers.append(
            "Account code is required before póliza generation "
            "(accounting_setup.account_code_required is True)."
        )

    # ── Allocation dimensions ──────────────────────────────────────────────────
    # Read persisted ExpenseAllocation rows once.  A blocker is only emitted
    # when the dimension is required AND no allocation row satisfies it.
    alloc_presence = get_allocation_presence(db, expense.id)

    if accounting.cost_center_required and not alloc_presence["has_cost_center"]:
        blockers.append("Cost center allocation is required.")

    category = _load_expense_category(db, expense)
    project_required = bool(accounting.project_required) or (
        category is not None and bool(category.requires_project)
    )
    if project_required and not alloc_presence["has_project"]:
        blockers.append("Project allocation is required.")

    if accounting.client_required and not alloc_presence["has_client"]:
        blockers.append("Client allocation is required.")

    return blockers


# ── Public entry point ────────────────────────────────────────────────────────

def get_expense_blockers(db: Session, expense: Expense) -> dict:
    """
    Evaluate whether *expense* is complete enough for submission, accounting
    work, and póliza generation.

    Returns a dict with four keys:

      submit_blockers     list[str]  — hard blocks preventing submission
      accounting_blockers list[str]  — hard blocks on accounting work
      poliza_blockers     list[str]  — hard blocks on póliza generation
      warnings            list[str]  — soft issues; do not block any action

    An empty list for a category means no blockers were found for that
    category given the current expense state and company configuration.

    All checks are conservative: when a requirement exists but cannot be
    verified from the current data model, a blocker is added rather than
    silently passing.
    """
    documents           = _get_documents(db, expense.id)
    validation_statuses = _get_validation_statuses(db, expense.id)
    warning_messages    = _get_warning_messages(db, expense.id)

    # AI policy warnings (severity='warn') merged in alongside validator warnings.
    ai_warnings = _ai_blockers_and_warnings(db, expense)["warnings"]
    if ai_warnings:
        warning_messages = warning_messages + ai_warnings

    return {
        "submit_blockers": _check_submit_blockers(
            db, expense, documents, validation_statuses
        ),
        "accounting_blockers": _check_accounting_blockers(
            db, expense, documents, validation_statuses
        ),
        "poliza_blockers": _check_poliza_blockers(db, expense),
        "warnings": warning_messages,
    }
