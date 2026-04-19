import json
from typing import Any, Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from apps.api.deps import get_db
from apps.api.ai.ollama_client import chat_with_ollama, resolve_model
from packages.modules.admin.service.company_setup_service import get_or_create_company_setup
from packages.modules.admin.service.accounting_setup_service import get_or_create_accounting_setup
from packages.modules.admin.service.approval_setup_service import get_or_create_approval_setup
from packages.modules.admin.service.workflow_setup_service import get_or_create_workflow_setup
from packages.modules.admin.service.accounting_category_ai_service import generate_accounting_categories
from packages.modules.expenses.service.policy_service import get_or_create_company_expense_policy
from packages.modules.admin.schemas.company_setup import CompanySetupRead
from packages.modules.admin.schemas.accounting_setup import AccountingSetupRead
from packages.modules.admin.schemas.approval_setup import ApprovalSetupRead
from packages.modules.admin.schemas.workflow_setup import WorkflowSetupRead
from packages.modules.expenses.schemas.policy import CompanyExpensePolicyRead

router = APIRouter(prefix="/admin/setup-orchestrator", tags=["admin"])


# ── Request / response models ─────────────────────────────────────────────────


class AnalyzeRequest(BaseModel):
    prompt: str
    current_portal_config: dict[str, Any] = {}


class CompanyProfile(BaseModel):
    company_type: str
    complexity: Literal["simple", "medium", "complex"]
    notes: list[str]


class DetectedConflict(BaseModel):
    code: str
    message: str
    severity: Literal["warning", "critical"]


class MissingDecision(BaseModel):
    key: str
    question: str
    suggested_options: list[str]


class SuggestedPatches(BaseModel):
    company_setup: dict[str, Any] = {}
    expense_policy: dict[str, Any] = {}
    accounting_setup: dict[str, Any] = {}
    approval_setup: dict[str, Any] = {}
    workflow_setup: dict[str, Any] = {}


# ── Allowed patch fields per root ─────────────────────────────────────────────

_ALLOWED_PATCH_FIELDS: dict[str, frozenset[str]] = {
    "company_setup": frozenset({
        "display_name", "country_code", "base_currency", "timezone", "language_code",
        "industry", "employee_count_range", "has_managers", "has_accounting_team",
        "has_subcontractors", "operates_multi_entity", "operates_multi_country",
        "allocation_dimensions", "allow_split_allocations", "expenses_module_enabled",
        "time_allocation_module_enabled", "subcontractor_module_enabled",
        "reimbursements_module_enabled", "approvals_module_enabled",
        "accounting_module_enabled", "archive_module_enabled", "ai_copilot_enabled",
        "ai_setup_completed", "ai_setup_notes", "ai_setup_last_summary",
    }),
    "expense_policy": frozenset({
        "xml_required_mode", "pdf_pair_required_for_cfdi", "international_expenses_allowed",
        "tickets_allowed", "require_justification", "require_proof", "allow_split_allocations",
        "allocation_dimensions", "manager_approval_required", "accounting_review_required",
        "ai_policy_assist_enabled",
    }),
    "accounting_setup": frozenset({
        "accounting_review_mode", "manager_approval_mode", "manager_approval_threshold_amount",
        "reimbursement_entity_required", "poliza_required", "archive_retention_years",
        "account_code_required", "subaccount_required", "auto_account_suggestion_enabled",
        "cost_center_required", "project_required", "client_required",
        "allow_accounting_override", "allow_submit_with_warnings",
        "require_final_accounting_review_before_export", "ai_accounting_assist_enabled",
        "ai_accounting_notes",
    }),
    "approval_setup": frozenset({
        "approval_mode", "manager_threshold_amount", "accounting_threshold_amount",
        "require_manager_for_all_employees", "require_accounting_for_all_expenses",
        "allow_self_submission_without_manager", "allow_resubmission_after_rejection",
        "escalate_policy_failures_to_accounting", "escalate_international_to_accounting",
        "escalate_missing_documents_to_manager", "ai_approval_assist_enabled",
        "ai_approval_notes",
    }),
    "workflow_setup": frozenset({
        "default_expense_workflow_mode", "auto_submit_on_complete_upload",
        "block_submit_on_failed_validation", "allow_submit_with_warnings",
        "auto_assign_review_stage", "route_policy_failures_to", "route_missing_documents_to",
        "route_international_expenses_to", "allow_draft_save", "allow_resubmit_after_return",
        "show_next_action_guidance", "ai_workflow_assist_enabled", "ai_workflow_notes",
    }),
}

_PATCH_ROOTS = ("company_setup", "expense_policy", "accounting_setup", "approval_setup", "workflow_setup")


def _normalize_patches(raw: dict[str, Any]) -> SuggestedPatches:
    """
    Discard any keys the AI invented that don't exist in the real backend schemas.
    Each root is always a dict; unknown keys within each root are silently dropped.
    """
    patches = SuggestedPatches()
    for root in _PATCH_ROOTS:
        allowed = _ALLOWED_PATCH_FIELDS[root]
        raw_root = raw.get(root)
        if not isinstance(raw_root, dict):
            continue
        clean = {k: v for k, v in raw_root.items() if k in allowed}
        if clean:
            getattr(patches, root).update(clean)
    return patches


class AnalyzeResponse(BaseModel):
    summary: str
    company_profile: CompanyProfile
    detected_conflicts: list[DetectedConflict]
    missing_decisions: list[MissingDecision]
    recommended_next_questions: list[str]
    suggested_patches: SuggestedPatches
    generated_categories: list[dict] = []
    accounting_mode: str | None = None
    next_actions: list[str] = []
    ok: bool
    error: str | None = None


# ── AI helpers ────────────────────────────────────────────────────────────────

# fmt: off
SYSTEM_PROMPT = (
    "You are a senior financial operations platform architect. "
    "You receive a description of a company's desired configuration along with its current "
    "portal configuration snapshot, and you produce a structured analysis and recommendations "
    "spanning all five setup domains: company structure, expense policy, accounting controls, "
    "approval logic, and workflow routing. "
    "Consider CFDI/SAT compliance, p\u00f3liza requirements, multi-entity and international operations, "
    "allocation dimensions, and approval escalation paths when assessing the current state. "
    "Respond ONLY with a single valid JSON object \u2014 no markdown fences, no prose outside the JSON. "
    "IMPORTANT: suggested_patches may only contain real field names listed below. "
    "Do NOT invent field names. Omit any patch root that has no changes. "
    "Each patch root must be a JSON object (use {} if empty). "
    "Schema: "
    '{ '
    '"summary": string, '
    '"company_profile": { "company_type": string, "complexity": "simple"|"medium"|"complex", "notes": string[] }, '
    '"detected_conflicts": [{ "code": string, "message": string, "severity": "warning"|"critical" }], '
    '"missing_decisions": [{ "key": string, "question": string, "suggested_options": string[] }], '
    '"recommended_next_questions": string[], '
    '"suggested_patches": { '
    '"company_setup": { '
    '  /* allowed keys only: display_name country_code base_currency timezone language_code '
    '  industry employee_count_range has_managers has_accounting_team has_subcontractors '
    '  operates_multi_entity operates_multi_country allocation_dimensions allow_split_allocations '
    '  expenses_module_enabled time_allocation_module_enabled subcontractor_module_enabled '
    '  reimbursements_module_enabled approvals_module_enabled accounting_module_enabled '
    '  archive_module_enabled ai_copilot_enabled ai_setup_completed ai_setup_notes ai_setup_last_summary */ '
    '}, '
    '"expense_policy": { '
    '  /* allowed keys only: xml_required_mode pdf_pair_required_for_cfdi '
    '  international_expenses_allowed tickets_allowed require_justification require_proof '
    '  allow_split_allocations allocation_dimensions manager_approval_required '
    '  accounting_review_required ai_policy_assist_enabled */ '
    '}, '
    '"accounting_setup": { '
    '  /* allowed keys only: accounting_review_mode manager_approval_mode '
    '  manager_approval_threshold_amount reimbursement_entity_required poliza_required '
    '  archive_retention_years account_code_required subaccount_required '
    '  auto_account_suggestion_enabled cost_center_required project_required client_required '
    '  allow_accounting_override allow_submit_with_warnings '
    '  require_final_accounting_review_before_export ai_accounting_assist_enabled ai_accounting_notes */ '
    '}, '
    '"approval_setup": { '
    '  /* allowed keys only: approval_mode manager_threshold_amount accounting_threshold_amount '
    '  require_manager_for_all_employees require_accounting_for_all_expenses '
    '  allow_self_submission_without_manager allow_resubmission_after_rejection '
    '  escalate_policy_failures_to_accounting escalate_international_to_accounting '
    '  escalate_missing_documents_to_manager ai_approval_assist_enabled ai_approval_notes */ '
    '}, '
    '"workflow_setup": { '
    '  /* allowed keys only: default_expense_workflow_mode auto_submit_on_complete_upload '
    '  block_submit_on_failed_validation allow_submit_with_warnings auto_assign_review_stage '
    '  route_policy_failures_to route_missing_documents_to route_international_expenses_to '
    '  allow_draft_save allow_resubmit_after_return show_next_action_guidance '
    '  ai_workflow_assist_enabled ai_workflow_notes */ '
    '} '
    '} '
    "}"
)
# fmt: on


def _build_user_prompt(company_id: int, prompt: str, config: dict[str, Any]) -> str:
    config_text = json.dumps(config, default=str, indent=2) if config else "{}"
    return (
        f"Company ID: {company_id}.\n\n"
        f"Current portal config:\n{config_text}\n\n"
        f"User instruction: {prompt.strip()}"
    )


def _load_portal_config(db: Session, company_id: int) -> dict[str, Any]:
    """
    Assemble the full portal config for a company using the same logic as
    GET /admin/portal-config/{company_id}, returned as a plain dict so it
    can be used as the AI prompt context.
    """
    cs  = get_or_create_company_setup(db, company_id)
    ep  = get_or_create_company_expense_policy(db, company_id)
    ac  = get_or_create_accounting_setup(db, company_id)
    ap  = get_or_create_approval_setup(db, company_id)
    wf  = get_or_create_workflow_setup(db, company_id)

    manager_flow_enabled = (
        bool(cs.has_managers)
        and ap.approval_mode in ("manager_only", "manager_then_accounting", "threshold_based")
    )
    accounting_flow_enabled = (
        bool(cs.accounting_module_enabled)
        and ac.accounting_review_mode not in ("none", None, "")
    )

    module_map = {
        "expenses": cs.expenses_module_enabled,
        "time_allocation": cs.time_allocation_module_enabled,
        "subcontractor": cs.subcontractor_module_enabled,
        "reimbursements": cs.reimbursements_module_enabled,
        "approvals": cs.approvals_module_enabled,
        "accounting": cs.accounting_module_enabled,
        "archive": cs.archive_module_enabled,
        "ai_copilot": cs.ai_copilot_enabled,
    }
    alloc_dims = [d.strip() for d in (ep.allocation_dimensions or "").split("_") if d.strip()]

    return {
        "company_setup":    CompanySetupRead.model_validate(cs).model_dump(mode="json"),
        "expense_policy":   CompanyExpensePolicyRead.model_validate(ep).model_dump(mode="json"),
        "accounting_setup": AccountingSetupRead.model_validate(ac).model_dump(mode="json"),
        "approval_setup":   ApprovalSetupRead.model_validate(ap).model_dump(mode="json"),
        "workflow_setup":   WorkflowSetupRead.model_validate(wf).model_dump(mode="json"),
        "derived": {
            "enabled_modules":               [k for k, v in module_map.items() if v],
            "allocation_dimensions":          alloc_dims,
            "allow_split_allocations":        ep.allow_split_allocations,
            "tickets_allowed":               ep.tickets_allowed,
            "international_expenses_allowed": ep.international_expenses_allowed,
            "xml_required_mode":             ep.xml_required_mode,
            "pdf_pair_required_for_cfdi":    ep.pdf_pair_required_for_cfdi,
            "manager_flow_enabled":          manager_flow_enabled,
            "accounting_flow_enabled":       accounting_flow_enabled,
            "workflow_mode":                 wf.default_expense_workflow_mode or "standard",
        },
    }


def _parse_str_list(raw: Any, max_items: int = 10) -> list[str]:
    if not isinstance(raw, list):
        return []
    return [str(s).strip() for s in raw if isinstance(s, str) and str(s).strip()][:max_items]


def _parse_dict(raw: Any) -> dict[str, Any]:
    return raw if isinstance(raw, dict) else {}


def _build_category_fields(
    prompt: str, config: dict[str, Any]
) -> tuple[list[dict], str | None, list[str]]:
    """Return (generated_categories, accounting_mode, next_actions) for injection into AnalyzeResponse."""
    cs = _parse_dict(config.get("company_setup"))
    categories = generate_accounting_categories(prompt, cs)
    country = str(cs.get("country_code", "") or "").strip().upper()
    accounting_mode: str | None = "sat_aligned" if country in {"MX", "MEXICO", "MÉXICO"} else None
    next_actions: list[str] = (
        ["Apply generated accounting categories"] if categories else []
    )
    return categories, accounting_mode, next_actions


def _parse_ai_response(parsed: dict[str, Any], prompt: str, config: dict[str, Any]) -> AnalyzeResponse:
    """Convert a validated AI-parsed dict into a full AnalyzeResponse."""
    raw_profile = _parse_dict(parsed.get("company_profile"))
    complexity_raw = str(raw_profile.get("complexity", "simple")).strip().lower()
    complexity: Literal["simple", "medium", "complex"] = (
        complexity_raw if complexity_raw in ("simple", "medium", "complex") else "simple"
    )
    company_profile = CompanyProfile(
        company_type=str(raw_profile.get("company_type", "")).strip()[:200],
        complexity=complexity,
        notes=_parse_str_list(raw_profile.get("notes"), max_items=6),
    )

    detected_conflicts: list[DetectedConflict] = []
    for item in parsed.get("detected_conflicts", []):
        if not isinstance(item, dict):
            continue
        code    = str(item.get("code", "")).strip()
        message = str(item.get("message", "")).strip()
        if not code or not message:
            continue
        severity_raw = str(item.get("severity", "warning")).strip().lower()
        severity: Literal["warning", "critical"] = (
            "critical" if severity_raw == "critical" else "warning"
        )
        detected_conflicts.append(DetectedConflict(code=code, message=message, severity=severity))
    detected_conflicts = detected_conflicts[:10]

    missing_decisions: list[MissingDecision] = []
    for item in parsed.get("missing_decisions", []):
        if not isinstance(item, dict):
            continue
        key      = str(item.get("key", "")).strip()
        question = str(item.get("question", "")).strip()
        if not key or not question:
            continue
        missing_decisions.append(MissingDecision(
            key=key,
            question=question,
            suggested_options=_parse_str_list(item.get("suggested_options"), max_items=6),
        ))
    missing_decisions = missing_decisions[:10]

    raw_patches = _parse_dict(parsed.get("suggested_patches"))
    suggested_patches = _normalize_patches(raw_patches)

    generated_categories, accounting_mode, next_actions = _build_category_fields(prompt, config)

    return AnalyzeResponse(
        summary=str(parsed.get("summary", "")).strip()[:600],
        company_profile=company_profile,
        detected_conflicts=detected_conflicts,
        missing_decisions=missing_decisions,
        recommended_next_questions=_parse_str_list(
            parsed.get("recommended_next_questions"), max_items=8
        ),
        suggested_patches=suggested_patches,
        generated_categories=generated_categories,
        accounting_mode=accounting_mode,
        next_actions=next_actions,
        ok=True,
    )


# ── Deterministic fallback ────────────────────────────────────────────────────

_MANAGER_MODES = {"manager_only", "manager_then_accounting", "threshold_based"}


def _deterministic_analysis(config: dict[str, Any], prompt: str = "") -> AnalyzeResponse:
    """
    Rule-based analysis applied when the AI model is unavailable.
    Detects structural conflicts from the portal config without fabricating data.
    """
    cs  = _parse_dict(config.get("company_setup"))
    ep  = _parse_dict(config.get("expense_policy"))
    ac  = _parse_dict(config.get("accounting_setup"))
    ap  = _parse_dict(config.get("approval_setup"))
    wf  = _parse_dict(config.get("workflow_setup"))
    drv = _parse_dict(config.get("derived"))

    has_managers: bool           = bool(cs.get("has_managers", False))
    approvals_enabled: bool      = bool(cs.get("approvals_module_enabled", True))
    intl_allowed: bool           = bool(ep.get("international_expenses_allowed", False))
    tickets_allowed: bool        = bool(ep.get("tickets_allowed", False))
    approval_mode: str           = str(ap.get("approval_mode", "none"))
    escalate_intl: bool          = bool(ap.get("escalate_international_to_accounting", True))
    account_code_req: bool       = bool(ac.get("account_code_required", False))
    cost_center_req: bool        = bool(ac.get("cost_center_required", False))
    project_req: bool            = bool(ac.get("project_required", False))
    client_req: bool             = bool(ac.get("client_required", False))
    route_intl: str              = str(wf.get("route_international_expenses_to", "accounting"))

    ep_manager_req: bool         = bool(ep.get("manager_approval_required", False))
    ep_accounting_req: bool      = bool(ep.get("accounting_review_required", False))
    ep_allow_split: bool         = bool(ep.get("allow_split_allocations", True))
    cs_allow_split: bool         = bool(cs.get("allow_split_allocations", True))
    drv_allow_split: bool        = bool(drv.get("allow_split_allocations", True))

    wf_mode: str                 = str(wf.get("default_expense_workflow_mode", "standard")).lower()
    wf_block_on_fail: bool       = bool(wf.get("block_submit_on_failed_validation", False))
    wf_allow_warnings: bool      = bool(wf.get("allow_submit_with_warnings", True))
    ac_allow_warnings: bool      = bool(ac.get("allow_submit_with_warnings", True))

    # Allocation dimensions come from derived (list) or expense_policy (raw string)
    alloc_dims: list[str] = list(drv.get("allocation_dimensions") or [])
    if not alloc_dims:
        raw_alloc: str = str(ep.get("allocation_dimensions", ""))
        alloc_dims = [d.strip() for d in raw_alloc.split("_") if d.strip()]

    conflicts: list[DetectedConflict] = []
    missing: list[MissingDecision] = []
    patches = SuggestedPatches()

    # ── 1. Workflow mode includes manager path but company has no managers ───
    wf_manager_modes = {"manager_only", "manager_then_accounting", "threshold_based"}
    if wf_mode in wf_manager_modes and not has_managers:
        conflicts.append(DetectedConflict(
            code="WF_MODE_MANAGER_PATH_NO_MANAGERS",
            message=(
                f"Workflow mode is '{wf_mode}' which requires a manager step, "
                "but has_managers is disabled. Expenses will stall or skip the manager stage."
            ),
            severity="critical",
        ))
        patches.company_setup["has_managers"] = True

    # ── 2. Approval mode requires managers but company has none ─────────────
    if approval_mode in _MANAGER_MODES and not has_managers:
        conflicts.append(DetectedConflict(
            code="MANAGER_FLOW_NO_MANAGERS",
            message=(
                f"Approval mode is '{approval_mode}' but has_managers is disabled. "
                "Manager-based routing will never trigger."
            ),
            severity="critical",
        ))
        patches.approval_setup["approval_mode"] = "accounting_only"
        patches.company_setup["has_managers"] = True

    # ── 3. Expense policy requires manager approval but approval setup disables it ──
    manager_approval_disabled = (
        approval_mode not in _MANAGER_MODES
        or not has_managers
    )
    if ep_manager_req and manager_approval_disabled:
        conflicts.append(DetectedConflict(
            code="POLICY_MANAGER_REQ_BUT_MANAGER_FLOW_OFF",
            message=(
                "Expense policy sets manager_approval_required = true but the approval "
                "setup does not have a manager-based approval mode active "
                f"(approval_mode='{approval_mode}', has_managers={has_managers}). "
                "The policy requirement can never be satisfied."
            ),
            severity="critical",
        ))
        patches.expense_policy["manager_approval_required"] = False

    # ── 4. Expense policy requires accounting review but accounting module disabled ──
    accounting_enabled: bool = bool(cs.get("accounting_module_enabled", True))
    if ep_accounting_req and not accounting_enabled:
        conflicts.append(DetectedConflict(
            code="POLICY_ACCOUNTING_REQ_BUT_MODULE_OFF",
            message=(
                "Expense policy sets accounting_review_required = true but the accounting "
                "module is disabled. Expenses will never reach accounting review."
            ),
            severity="critical",
        ))
        patches.expense_policy["accounting_review_required"] = False

    # ── 5. Tickets disabled but ticket workflow implied ──────────────────────
    ticket_routes = {
        wf.get("route_policy_failures_to"),
        wf.get("route_missing_documents_to"),
        wf.get("route_international_expenses_to"),
    }
    if not tickets_allowed and "ticket" in {str(r).lower() for r in ticket_routes if r}:
        conflicts.append(DetectedConflict(
            code="TICKETS_DISABLED_BUT_ROUTED",
            message=(
                "One or more workflow routes reference a ticket-based path "
                "but tickets_allowed is disabled in the expense policy."
            ),
            severity="warning",
        ))
        patches.expense_policy["tickets_allowed"] = True

    # ── 6. Accounting requires dimension not present in allocation_dimensions ─
    required_dims: list[tuple[str, str]] = [
        ("cost_center", "cost_center_required"),
        ("project",     "project_required"),
        ("client",      "client_required"),
    ]
    missing_dims: list[str] = []
    for dim_key, field_name in required_dims:
        required = bool(ac.get(field_name, False))
        present  = any(dim_key in d.lower() for d in alloc_dims)
        if required and not present:
            missing_dims.append(dim_key)
    if missing_dims:
        dims_str = ", ".join(missing_dims)
        conflicts.append(DetectedConflict(
            code="REQUIRED_DIMENSION_NOT_IN_ALLOCATION",
            message=(
                f"Accounting setup requires [{dims_str}] but "
                f"allocation_dimensions does not include "
                f"{'it' if len(missing_dims) == 1 else 'them'}. "
                "Expenses will fail coding validation."
            ),
            severity="critical",
        ))
        alloc_dims_updated = list(alloc_dims)
        for dim_key, _ in required_dims:
            if dim_key in missing_dims and dim_key not in alloc_dims_updated:
                alloc_dims_updated.append(dim_key)
        patches.expense_policy["allocation_dimensions"] = "_".join(alloc_dims_updated)

    # ── 7. International escalation enabled, international expenses disabled ──
    intl_routing_active = escalate_intl or route_intl not in ("", "none", None)
    if intl_routing_active and not intl_allowed:
        conflicts.append(DetectedConflict(
            code="INTL_ESCALATION_BUT_INTL_DISABLED",
            message=(
                "International expense escalation is configured "
                "(escalate_international_to_accounting or route_international_expenses_to) "
                "but international_expenses_allowed is disabled. "
                "The routing path will never be reached."
            ),
            severity="warning",
        ))
        patches.expense_policy["international_expenses_allowed"] = True

    # ── 8. Approvals enabled, no managers, approval mode none ────────────────
    if approvals_enabled and not has_managers and approval_mode == "none":
        conflicts.append(DetectedConflict(
            code="APPROVALS_ENABLED_NO_PATH",
            message=(
                "Approvals module is enabled but has_managers is False and "
                "approval_mode is 'none'. No approval path is configured; "
                "expenses will bypass review entirely."
            ),
            severity="critical",
        ))
        missing.append(MissingDecision(
            key="approval_path",
            question="How should expenses be approved if there are no managers?",
            suggested_options=[
                "Set approval_mode to 'accounting_only'",
                "Enable has_managers and assign a manager",
                "Disable the approvals module if no review is needed",
            ],
        ))

    # ── 9. block_submit_on_failed_validation conflicts with allow_submit_with_warnings ──
    # If validation is set to block hard but warnings are still allowed, the behaviour
    # is inconsistent: a failed policy check may be classified as a warning and slip through.
    if wf_block_on_fail and wf_allow_warnings:
        conflicts.append(DetectedConflict(
            code="BLOCK_ON_FAIL_BUT_WARNINGS_ALLOWED",
            message=(
                "Workflow sets block_submit_on_failed_validation = true but "
                "allow_submit_with_warnings is also true. Validation failures classified "
                "as warnings can still be submitted, making the block ineffective."
            ),
            severity="warning",
        ))
        patches.workflow_setup["allow_submit_with_warnings"] = False

    # ── 10. Workflow allows warnings but accounting does not ─────────────────
    if wf_allow_warnings and not ac_allow_warnings:
        conflicts.append(DetectedConflict(
            code="WF_ALLOWS_WARNINGS_ACCOUNTING_BLOCKS",
            message=(
                "Workflow allows submission with warnings "
                "(allow_submit_with_warnings = true) but accounting setup does not "
                "(allow_submit_with_warnings = false). Expenses submitted with warnings "
                "will be blocked at the accounting stage, creating a confusing UX."
            ),
            severity="warning",
        ))
        patches.accounting_setup["allow_submit_with_warnings"] = True

    # ── 11. Split allocations disabled in derived but enabled in a child layer ──
    # drv_allow_split is the resolved value; if it is False but any child layer
    # has it enabled there is an inconsistency (child setting overridden or stale).
    split_enabled_in_child = ep_allow_split or cs_allow_split
    if not drv_allow_split and split_enabled_in_child:
        conflicts.append(DetectedConflict(
            code="SPLIT_ALLOC_DERIVED_DISABLED_CHILD_ENABLED",
            message=(
                "Derived config has allow_split_allocations = false but at least one "
                "child layer (company_setup or expense_policy) has it enabled. "
                "Split allocation UI may render but saves will be rejected."
            ),
            severity="warning",
        ))
        patches.expense_policy["allow_split_allocations"] = False
        patches.company_setup["allow_split_allocations"] = False

    # ── Missing decisions: account_code_required with no dimension ───────────
    if account_code_req and "account" not in " ".join(alloc_dims).lower():
        missing.append(MissingDecision(
            key="account_code_dimension",
            question=(
                "Account codes are required by accounting setup. "
                "Should account code be added as an allocation dimension "
                "or managed separately during accounting review?"
            ),
            suggested_options=[
                "Add 'account' to allocation_dimensions",
                "Manage account codes in accounting review only (no allocation entry required)",
            ],
        ))

    # ── Complexity heuristic (deterministic) ─────────────────────────────────
    complexity_score = sum([
        bool(cs.get("operates_multi_entity")),
        bool(cs.get("operates_multi_country")),
        bool(cs.get("has_subcontractors")),
        intl_allowed,
        bool(ac.get("poliza_required")),
        approval_mode in _MANAGER_MODES,
        account_code_req or cost_center_req or project_req or client_req,
    ])
    if complexity_score >= 5:
        complexity: Literal["simple", "medium", "complex"] = "complex"
    elif complexity_score >= 2:
        complexity = "medium"
    else:
        complexity = "simple"

    industry = str(cs.get("industry", "")).strip()
    country  = str(cs.get("country_code", "")).strip().upper()
    company_type_parts = [p for p in [industry, country] if p]
    company_type = ", ".join(company_type_parts) if company_type_parts else "Not specified"

    profile_notes: list[str] = []
    if cs.get("operates_multi_entity"):
        profile_notes.append("Multi-entity structure detected.")
    if cs.get("operates_multi_country"):
        profile_notes.append("Multi-country operations detected.")
    if intl_allowed:
        profile_notes.append("International expenses are permitted.")
    if ac.get("poliza_required"):
        profile_notes.append("Póliza generation is required (SAT compliance path active).")

    next_questions: list[str] = []
    if not cs.get("base_currency"):
        next_questions.append("What is the base currency for expense reimbursement?")
    if not cs.get("industry"):
        next_questions.append("What industry is the company in?")
    if approval_mode == "threshold_based" and not ap.get("manager_threshold_amount"):
        next_questions.append(
            "Approval mode is threshold_based — what is the manager approval threshold amount?"
        )
    if ac.get("poliza_required") and not cs.get("base_currency"):
        next_questions.append(
            "Póliza export requires a base currency — has this been configured?"
        )

    summary_parts = [f"{len(conflicts)} conflict(s) detected."]
    if not conflicts:
        summary_parts = ["No structural conflicts detected."]
    if missing:
        summary_parts.append(f"{len(missing)} decision(s) require clarification.")

    generated_categories, accounting_mode, next_actions = _build_category_fields(prompt, config)

    return AnalyzeResponse(
        summary=" ".join(summary_parts),
        company_profile=CompanyProfile(
            company_type=company_type,
            complexity=complexity,
            notes=profile_notes,
        ),
        detected_conflicts=conflicts,
        missing_decisions=missing,
        recommended_next_questions=next_questions[:8],
        suggested_patches=patches,
        generated_categories=generated_categories,
        accounting_mode=accounting_mode,
        next_actions=next_actions,
        ok=True,
    )


# ── Route ─────────────────────────────────────────────────────────────────────


@router.post("/analyze/{company_id}", response_model=AnalyzeResponse)
def analyze_setup(
    company_id: int,
    body: AnalyzeRequest,
    db: Session = Depends(get_db),
) -> AnalyzeResponse:
    """
    Analyse a natural-language configuration instruction against the current portal
    config. Uses the AI model when available; falls back to deterministic rule-based
    conflict detection otherwise.

    If current_portal_config is absent or empty the endpoint fetches the live
    config from the database automatically.
    """
    portal_config: dict[str, Any] = (
        body.current_portal_config
        if body.current_portal_config
        else _load_portal_config(db, company_id)
    )

    ai_available = resolve_model() is not None

    if not ai_available:
        return _deterministic_analysis(portal_config, body.prompt)

    user_prompt = _build_user_prompt(company_id, body.prompt, portal_config)
    result = chat_with_ollama(SYSTEM_PROMPT, user_prompt)

    if not result.get("ok"):
        # AI call failed at runtime — fall back rather than returning an error
        return _deterministic_analysis(portal_config, body.prompt)

    raw: str = result.get("content", "")
    json_str = raw.replace("```json", "").replace("```", "").strip()

    try:
        parsed = json.loads(json_str)
    except Exception:
        return _deterministic_analysis(portal_config, body.prompt)

    if not isinstance(parsed, dict):
        return _deterministic_analysis(portal_config, body.prompt)

    return _parse_ai_response(parsed, body.prompt, portal_config)

