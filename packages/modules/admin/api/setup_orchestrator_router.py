import json
from datetime import datetime, timezone
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import desc
from sqlalchemy.orm import Session

from apps.api.auth import require_admin
from apps.api.deps import get_db
from apps.api.ai.ollama_client import chat_with_ollama, resolve_model
from packages.core.platform.models_orchestrator_session import OrchestratorSession
from packages.core.platform.models_orchestrator_audit import OrchestratorAuditLog
from packages.core.platform.models_accounting_category import AccountingCategory, TAX_BEHAVIOR_VALUES
from packages.core.platform.models_user import User
from packages.core.platform.schemas_user import UserCreate, USER_ROLES
from packages.core.platform.service_user import create_user
from packages.modules.admin.service.company_setup_service import get_or_create_company_setup
from packages.modules.admin.service.accounting_setup_service import get_or_create_accounting_setup
from packages.modules.admin.service.approval_setup_service import get_or_create_approval_setup
from packages.modules.admin.service.workflow_setup_service import get_or_create_workflow_setup
from packages.modules.admin.service.accounting_category_ai_service import generate_accounting_categories
from packages.modules.admin.service.accounting_category_seed_service import seed_accounting_categories
from packages.modules.expenses.service.policy_service import get_or_create_company_expense_policy
from packages.modules.admin.schemas.company_setup import CompanySetupRead
from packages.modules.admin.schemas.accounting_setup import AccountingSetupRead
from packages.modules.admin.schemas.approval_setup import ApprovalSetupRead
from packages.modules.admin.schemas.workflow_setup import WorkflowSetupRead
from packages.modules.expenses.schemas.policy import CompanyExpensePolicyRead

router = APIRouter(prefix="/admin/setup-orchestrator", tags=["admin"], dependencies=[Depends(require_admin)])

_MAX_SESSION_TURNS = 20
_SESSION_CONTEXT_TURNS = 10


# ── Request / response models ─────────────────────────────────────────────────


class AnalyzeRequest(BaseModel):
    prompt: str
    current_portal_config: dict[str, Any] = {}
    session_id: str | None = None  # if set, loads prior turns as context and stores result
    locale: str | None = None


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


_VALID_EXECUTABLE_TYPES = {
    "create_user",
    "bulk_invite_users",
    "create_accounting_category",
    "bulk_create_accounting_categories",
    "update_user_role",
}


class ExecutableAction(BaseModel):
    action_id: str
    action_type: Literal[
        "create_user",
        "bulk_invite_users",
        "create_accounting_category",
        "bulk_create_accounting_categories",
        "update_user_role",
    ]
    label: str
    params: dict[str, Any] = {}
    requires_confirmation: bool = True


class ExecuteActionRequest(BaseModel):
    action: ExecutableAction


class ExecuteActionResponse(BaseModel):
    ok: bool
    action_id: str
    result: dict[str, Any] = {}
    error: str | None = None


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
    next_steps: list[str] = []   # clickable follow-up prompts for the user
    executable_actions: list[ExecutableAction] = []  # actions the AI proposes to execute directly
    ok: bool
    error: str | None = None
    engine_mode: Literal["DIAGNOSE", "CONFIGURE", "ADAPT"] = "CONFIGURE"
    understanding: str = ""
    current_state_assessment: str = ""
    impact: list[str] = []
    risks_gaps: list[str] = []
    action_state: Literal["awaiting_approval", "no_changes"] = "awaiting_approval"
    session_id: str | None = None   # echoed back so the frontend can continue the same session
    audit_id: int | None = None


# ── Apply models ──────────────────────────────────────────────────────────────


class ApplyRequest(BaseModel):
    patches: SuggestedPatches
    generated_categories: list[dict[str, Any]] = []
    session_id: str | None = None
    approved_by: str | None = None


class DomainApplied(BaseModel):
    domain: str
    fields: list[str]


class ApplyResponse(BaseModel):
    ok: bool
    applied_domains: list[DomainApplied]
    categories_applied: int
    audit_id: int
    error: str | None = None


# ── Session / audit read models ───────────────────────────────────────────────


class SessionSummary(BaseModel):
    session_id: str
    turn_count: int
    created_at: str
    updated_at: str


class SessionDetail(BaseModel):
    session_id: str
    turns: list[dict[str, Any]]
    created_at: str
    updated_at: str


class AuditEntry(BaseModel):
    id: int
    session_id: str | None
    action: str
    engine_mode: str | None
    categories_proposed: int
    categories_applied: int
    applied_by: str | None
    created_at: str


# ── Allowed patch fields per domain ──────────────────────────────────────────

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
    """Discard any keys the AI invented that don't exist in the real backend schemas."""
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


# ── AI system prompt ──────────────────────────────────────────────────────────

# fmt: off
SYSTEM_PROMPT = (
    "You are the AI Setup Guide for an enterprise financial operations platform. "
    "You are a knowledgeable, proactive consultant — not a passive analyzer. "
    "Your role is to understand what the admin wants to achieve, solve their problems, "
    "guide them through setup step by step, fix conflicts, explain tradeoffs, and "
    "drive the configuration to a working state. You span all five setup domains: "
    "company structure, expense policy, accounting controls, approval logic, and workflow routing. "
    "Consider CFDI/SAT compliance, p\u00f3liza requirements, multi-entity and international "
    "operations, allocation dimensions, and approval escalation paths.\n\n"

    "YOUR JOB:\n"
    "  \u2022 Understand intent from ANY input \u2014 even vague, short, or ambiguous requests.\n"
    "  \u2022 Diagnose issues proactively and explain them in plain language.\n"
    "  \u2022 Guide the admin one step at a time when setup is incomplete.\n"
    "  \u2022 Propose concrete configuration patches when you have enough information.\n"
    "  \u2022 Always suggest what to do next so the admin is never left wondering.\n"
    "  \u2022 Be honest about risks and tradeoffs, but stay solution-oriented.\n\n"

    "OPERATING MODES \u2014 detect automatically:\n"
    "  DIAGNOSE: Admin asks what\u2019s wrong, describes unexpected behavior, or wants a health "
    "check. Surface conflicts and gaps clearly. Explain the root cause. Suggest fixes in "
    "next_steps. Leave suggested_patches empty. Set action_state to 'no_changes'.\n"
    "  CONFIGURE: Admin provides requirements, company description, or policy intent. "
    "Map intent to schema. Populate suggested_patches. Set action_state to 'awaiting_approval'.\n"
    "  ADAPT: Admin wants to tune or adjust an existing setting. Compute the minimal safe "
    "change. Explain what changes and why. Set action_state to 'awaiting_approval'.\n\n"

    "GUIDED FLOW (critical rule):\n"
    "  If a request needs configuration but one key decision is still ambiguous, ask ONLY "
    "that single most important question via missing_decisions (one item max). "
    "Leave suggested_patches empty until answered. Once answered (via prior turns or the "
    "current message), propose the full concrete patches immediately.\n\n"

    "NEXT STEPS (always required):\n"
    "  Always populate next_steps[] with 2\u20134 short, actionable follow-up prompts the admin "
    "can click to continue. These should be the most logical things to do or ask next given "
    "the current state. Examples: 'Set a manager approval threshold', "
    "'Enable accounting review for all expenses', 'Fix the international escalation conflict', "
    "'Walk me through expense policy setup', 'What else needs to be configured?'.\n\n"

    "OUT-OF-SCOPE REQUESTS:\n"
    "  If the request cannot be handled by configuration patches OR executable actions "
    "(e.g. UI navigation questions, billing, integrations not in the schema), set "
    "engine_mode to 'DIAGNOSE', action_state to 'no_changes', leave suggested_patches and "
    "executable_actions empty, and use 'understanding' to briefly explain what area handles it. "
    "Still populate next_steps with useful related actions.\n\n"

    "EXECUTABLE ACTIONS (you are an executive assistant, not just a configurator):\n"
    "  You can execute real operations — not just propose config patches. When the admin "
    "asks to add a user, invite people, add accounting categories, update a role — do it "
    "by populating executable_actions[]. NEVER say 'go to Administration → Users' for "
    "things you can execute here.\n"
    "  Supported action types:\n"
    "  - create_user: { email, full_name, role (employee|manager|accounting|admin|executive|secretary), department?, job_title?, send_invite? }\n"
    "  - bulk_invite_users: { users: [{ email, full_name, role, department? }] }\n"
    "  - create_accounting_category: { code, name, expense_account_code?, tax_behavior? (none|creditable|non_creditable) }\n"
    "  - bulk_create_accounting_categories: { categories: [{ code, name, expense_account_code?, tax_behavior? }] }\n"
    "  - update_user_role: { email, role }\n"
    "  If information is incomplete (e.g. no email provided for a user), ask for it via "
    "missing_decisions (one question). Once answered, populate executable_actions immediately.\n"
    "  Set action_state to 'awaiting_approval' whenever executable_actions has items — "
    "the admin reviews and confirms before anything executes.\n\n"

    "HARD RULES:\n"
    "  1. Never invent field names. Only use keys listed in the schema below.\n"
    "  2. Never apply config silently. action_state must always be set correctly.\n"
    "  3. In DIAGNOSE mode, suggested_patches must be empty.\n"
    "  4. Every patch change must appear in impact[]. Every risk in risks_gaps[].\n"
    "  5. Respond ONLY with a single valid JSON object. No markdown fences, no prose outside JSON.\n"
    "  6. Never hallucinate values. Never assume missing financial rules.\n"
    "  7. Never create conflicting rules across domains.\n"
    "  8. next_steps[] must always contain 2\u20134 items. Never leave it empty.\n\n"

    "Schema:\n"
    '{ '
    '"engine_mode": "DIAGNOSE"|"CONFIGURE"|"ADAPT", '
    '"understanding": string, '
    '"summary": string, '
    '"company_profile": { "company_type": string, "complexity": "simple"|"medium"|"complex", "notes": string[] }, '
    '"current_state_assessment": string, '
    '"detected_conflicts": [{ "code": string, "message": string, "severity": "warning"|"critical" }], '
    '"missing_decisions": [{ "key": string, "question": string, "suggested_options": string[] }], '
    '"impact": string[], '
    '"risks_gaps": string[], '
    '"next_steps": string[], '
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
    '}, '
    '"action_state": "awaiting_approval"|"no_changes", '
    '"executable_actions": [{ "action_id": string, "action_type": "create_user"|"bulk_invite_users"|"create_accounting_category"|"bulk_create_accounting_categories"|"update_user_role", "label": string, "params": object }] '
    "}"
)
# fmt: on


# ── Session helpers ───────────────────────────────────────────────────────────


def _load_session_turns(db: Session, company_id: int, session_id: str) -> list[dict]:
    row = (
        db.query(OrchestratorSession)
        .filter(
            OrchestratorSession.company_id == company_id,
            OrchestratorSession.session_id == session_id,
        )
        .first()
    )
    if not row or not row.turns:
        return []
    try:
        turns = json.loads(row.turns)
        return turns[-_SESSION_CONTEXT_TURNS:] if len(turns) > _SESSION_CONTEXT_TURNS else turns
    except Exception:
        return []


def _save_session_turn(
    db: Session,
    company_id: int,
    session_id: str,
    user_content: str,
    assistant_summary: str,
) -> None:
    now = datetime.now(timezone.utc).isoformat()
    new_turns = [
        {"role": "user", "content": user_content[:1000], "timestamp": now},
        {"role": "assistant", "content": assistant_summary[:1000], "timestamp": now},
    ]
    row = (
        db.query(OrchestratorSession)
        .filter(
            OrchestratorSession.company_id == company_id,
            OrchestratorSession.session_id == session_id,
        )
        .first()
    )
    if row:
        try:
            existing = json.loads(row.turns or "[]")
        except Exception:
            existing = []
        merged = existing + new_turns
        row.turns = json.dumps(merged[-_MAX_SESSION_TURNS:])
    else:
        row = OrchestratorSession(
            company_id=company_id,
            session_id=session_id,
            turns=json.dumps(new_turns),
        )
        db.add(row)
    try:
        db.commit()
    except Exception:
        db.rollback()


def _write_audit(
    db: Session,
    company_id: int,
    action: str,
    *,
    session_id: str | None = None,
    engine_mode: str | None = None,
    patches_proposed: dict | None = None,
    patches_applied: dict | None = None,
    categories_proposed: int = 0,
    categories_applied: int = 0,
    applied_by: str | None = None,
) -> int:
    """Write an audit log entry. Returns the new row id, or -1 on failure."""
    entry = OrchestratorAuditLog(
        company_id=company_id,
        session_id=session_id,
        action=action,
        engine_mode=engine_mode,
        patches_proposed=json.dumps(patches_proposed) if patches_proposed is not None else None,
        patches_applied=json.dumps(patches_applied) if patches_applied is not None else None,
        categories_proposed=categories_proposed,
        categories_applied=categories_applied,
        applied_by=applied_by,
    )
    db.add(entry)
    try:
        db.commit()
        db.refresh(entry)
        return entry.id
    except Exception:
        db.rollback()
        return -1


# ── Prompt builders ───────────────────────────────────────────────────────────


def _build_user_prompt(
    company_id: int,
    prompt: str,
    config: dict[str, Any],
    prior_turns: list[dict] | None = None,
) -> str:
    config_text = json.dumps(config, default=str, indent=2) if config else "{}"
    prior_context = ""
    if prior_turns:
        lines = []
        for t in prior_turns:
            role = str(t.get("role", "user")).upper()
            content = str(t.get("content", ""))
            lines.append(f"[{role}]: {content}")
        prior_context = (
            "Prior conversation context (maintain continuity — do not re-ask questions already answered):\n"
            + "\n".join(lines)
            + "\n\n"
        )
    return (
        f"Company ID: {company_id}.\n\n"
        f"Current portal config:\n{config_text}\n\n"
        f"{prior_context}"
        f"User instruction: {prompt.strip()}"
    )


def _load_portal_config(db: Session, company_id: int) -> dict[str, Any]:
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


# ── Response parsers ──────────────────────────────────────────────────────────


def _parse_str_list(raw: Any, max_items: int = 10) -> list[str]:
    if not isinstance(raw, list):
        return []
    return [str(s).strip() for s in raw if isinstance(s, str) and str(s).strip()][:max_items]


def _parse_dict(raw: Any) -> dict[str, Any]:
    return raw if isinstance(raw, dict) else {}


def _build_category_fields(
    prompt: str, config: dict[str, Any]
) -> tuple[list[dict], str | None, list[str]]:
    cs = _parse_dict(config.get("company_setup"))
    categories = generate_accounting_categories(prompt, cs)
    country = str(cs.get("country_code", "") or "").strip().upper()
    accounting_mode: str | None = "sat_aligned" if country in {"MX", "MEXICO", "MÉXICO"} else None
    next_actions: list[str] = (
        ["Apply generated accounting categories"] if categories else []
    )
    return categories, accounting_mode, next_actions


def _parse_ai_response(parsed: dict[str, Any], prompt: str, config: dict[str, Any]) -> AnalyzeResponse:
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

    engine_mode_raw = str(parsed.get("engine_mode", "CONFIGURE")).strip().upper()
    engine_mode: Literal["DIAGNOSE", "CONFIGURE", "ADAPT"] = (
        engine_mode_raw if engine_mode_raw in ("DIAGNOSE", "CONFIGURE", "ADAPT") else "CONFIGURE"
    )
    understanding = str(parsed.get("understanding", "")).strip()[:500]
    current_state_assessment = str(parsed.get("current_state_assessment", "")).strip()[:800]
    impact = _parse_str_list(parsed.get("impact"), max_items=10)
    risks_gaps = _parse_str_list(parsed.get("risks_gaps"), max_items=10)
    next_steps = _parse_str_list(parsed.get("next_steps"), max_items=6)
    action_state_raw = str(parsed.get("action_state", "awaiting_approval")).strip().lower()
    action_state: Literal["awaiting_approval", "no_changes"] = (
        "no_changes" if action_state_raw == "no_changes" else "awaiting_approval"
    )

    # Parse executable actions
    executable_actions: list[ExecutableAction] = []
    for item in (parsed.get("executable_actions") or []):
        if not isinstance(item, dict):
            continue
        action_type = str(item.get("action_type", "")).strip()
        if action_type not in _VALID_EXECUTABLE_TYPES:
            continue
        action_id = str(item.get("action_id", f"action_{len(executable_actions) + 1}")).strip()[:64]
        label = str(item.get("label", "")).strip()[:300]
        params = item.get("params", {}) if isinstance(item.get("params"), dict) else {}
        executable_actions.append(ExecutableAction(
            action_id=action_id,
            action_type=action_type,  # type: ignore[arg-type]
            label=label,
            params=params,
        ))
    executable_actions = executable_actions[:20]

    # If there are executable actions, escalate action_state so the frontend shows the confirm panel
    if executable_actions and action_state == "no_changes":
        action_state = "awaiting_approval"

    generated_categories, accounting_mode, next_actions = (
        _build_category_fields(prompt, config)
        if action_state != "no_changes"
        else ([], None, [])
    )

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
        next_steps=next_steps,
        executable_actions=executable_actions,
        ok=True,
        engine_mode=engine_mode,
        understanding=understanding,
        current_state_assessment=current_state_assessment,
        impact=impact,
        risks_gaps=risks_gaps,
        action_state=action_state,
    )


# ── Deterministic fallback ────────────────────────────────────────────────────

_MANAGER_MODES = {"manager_only", "manager_then_accounting", "threshold_based"}


def _deterministic_analysis(config: dict[str, Any], prompt: str = "") -> AnalyzeResponse:
    """Rule-based analysis when the AI model is unavailable."""
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

    alloc_dims: list[str] = list(drv.get("allocation_dimensions") or [])
    if not alloc_dims:
        raw_alloc: str = str(ep.get("allocation_dimensions", ""))
        alloc_dims = [d.strip() for d in raw_alloc.split("_") if d.strip()]

    conflicts: list[DetectedConflict] = []
    missing: list[MissingDecision] = []
    patches = SuggestedPatches()

    # 1. Workflow mode includes manager path but company has no managers
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

    # 2. Approval mode requires managers but company has none
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

    # 3. Expense policy requires manager approval but approval setup disables it
    manager_approval_disabled = approval_mode not in _MANAGER_MODES or not has_managers
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

    # 4. Expense policy requires accounting review but accounting module disabled
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

    # 5. Tickets disabled but ticket workflow implied
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

    # 6. Accounting requires dimension not present in allocation_dimensions
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

    # 7. International escalation enabled, international expenses disabled
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

    # 8. Approvals enabled, no managers, approval mode none
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

    # 9. block_submit_on_failed_validation conflicts with allow_submit_with_warnings
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

    # 10. Workflow allows warnings but accounting does not
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

    # 11. Split allocations disabled in derived but enabled in a child layer
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

    # Missing: account_code_required with no dimension
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

    # Complexity heuristic
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

    patch_count = sum(len(getattr(patches, root)) for root in _PATCH_ROOTS)
    det_action_state: Literal["awaiting_approval", "no_changes"] = (
        "awaiting_approval" if patch_count > 0 else "no_changes"
    )

    generated_categories, accounting_mode, next_actions = (
        _build_category_fields(prompt, config)
        if det_action_state != "no_changes"
        else ([], None, [])
    )

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
        engine_mode="DIAGNOSE",
        understanding=(
            "Deterministic conflict analysis (AI model unavailable). "
            f"Checked {len(conflicts) + len(missing)} rule(s) against current configuration."
        ),
        current_state_assessment=" ".join(summary_parts) if summary_parts else "No issues detected.",
        impact=[],
        risks_gaps=[c.message for c in conflicts if c.severity == "critical"],
        action_state=det_action_state,
    )


# ── Routes ────────────────────────────────────────────────────────────────────


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

    Pass session_id to maintain a multi-turn conversation. The engine will load prior
    turns as context and append the new turn to the session after analysis.
    """
    portal_config: dict[str, Any] = (
        body.current_portal_config
        if body.current_portal_config
        else _load_portal_config(db, company_id)
    )

    # Load prior session turns for multi-turn context
    prior_turns: list[dict] = []
    if body.session_id:
        prior_turns = _load_session_turns(db, company_id, body.session_id)

    ai_available = resolve_model() is not None
    response: AnalyzeResponse

    if not ai_available:
        response = _deterministic_analysis(portal_config, body.prompt)
    else:
        user_prompt = _build_user_prompt(company_id, body.prompt, portal_config, prior_turns)
        lang = "Respond exclusively in Spanish. Use formal business language (usted form)." if (body.locale or "").startswith("es") else "Respond in English."
        system_prompt = SYSTEM_PROMPT + f"\n\n{lang}"
        result = chat_with_ollama(system_prompt, user_prompt)

        if not result.get("ok"):
            response = _deterministic_analysis(portal_config, body.prompt)
        else:
            raw: str = result.get("content", "")
            json_str = raw.replace("```json", "").replace("```", "").strip()
            try:
                parsed = json.loads(json_str)
            except Exception:
                parsed = None

            if not isinstance(parsed, dict):
                response = _deterministic_analysis(portal_config, body.prompt)
            else:
                response = _parse_ai_response(parsed, body.prompt, portal_config)

    # Persist session turn (non-blocking — failure does not break the response)
    if body.session_id:
        _save_session_turn(
            db,
            company_id,
            body.session_id,
            user_content=body.prompt,
            assistant_summary=response.understanding or response.summary,
        )

    # Write audit log (non-blocking)
    audit_id = _write_audit(
        db,
        company_id,
        action="analyze",
        session_id=body.session_id,
        engine_mode=response.engine_mode,
        patches_proposed=response.suggested_patches.model_dump(),
        categories_proposed=len(response.generated_categories),
    )

    response.session_id = body.session_id
    response.audit_id = audit_id
    return response


@router.post("/apply/{company_id}", response_model=ApplyResponse)
def apply_setup(
    company_id: int,
    body: ApplyRequest,
    db: Session = Depends(get_db),
) -> ApplyResponse:
    """
    Apply a set of suggested patches to the live configuration.

    Only call this after the user has reviewed and approved the patches returned
    by /analyze. Changes are applied atomically across all config domains.
    Categories (if provided) are upserted in a separate step.

    This is the ONLY way changes reach the database — /analyze never writes config.
    """
    applied_domains: list[DomainApplied] = []

    try:
        # Load all ORM records first (creates defaults if not yet configured)
        cs = get_or_create_company_setup(db, company_id)
        ep = get_or_create_company_expense_policy(db, company_id)
        ac = get_or_create_accounting_setup(db, company_id)
        ap = get_or_create_approval_setup(db, company_id)
        wf = get_or_create_workflow_setup(db, company_id)

        # Apply each non-empty patch domain directly to the ORM objects
        if body.patches.company_setup:
            for field, value in body.patches.company_setup.items():
                setattr(cs, field, value)
            applied_domains.append(DomainApplied(
                domain="company_setup",
                fields=list(body.patches.company_setup),
            ))

        if body.patches.expense_policy:
            for field, value in body.patches.expense_policy.items():
                setattr(ep, field, value)
            applied_domains.append(DomainApplied(
                domain="expense_policy",
                fields=list(body.patches.expense_policy),
            ))

        if body.patches.accounting_setup:
            for field, value in body.patches.accounting_setup.items():
                setattr(ac, field, value)
            applied_domains.append(DomainApplied(
                domain="accounting_setup",
                fields=list(body.patches.accounting_setup),
            ))

        if body.patches.approval_setup:
            for field, value in body.patches.approval_setup.items():
                setattr(ap, field, value)
            applied_domains.append(DomainApplied(
                domain="approval_setup",
                fields=list(body.patches.approval_setup),
            ))

        if body.patches.workflow_setup:
            for field, value in body.patches.workflow_setup.items():
                setattr(wf, field, value)
            applied_domains.append(DomainApplied(
                domain="workflow_setup",
                fields=list(body.patches.workflow_setup),
            ))

        # Single commit for all config changes — atomic across all domains
        db.commit()

    except Exception as exc:
        db.rollback()
        return ApplyResponse(
            ok=False,
            applied_domains=[],
            categories_applied=0,
            audit_id=-1,
            error=str(exc),
        )

    # Categories upserted separately (seed service has its own commit)
    cats_applied = 0
    if body.generated_categories:
        try:
            rows = seed_accounting_categories(db, company_id, body.generated_categories)
            cats_applied = len(rows)
        except Exception as exc:
            # Categories failed but config changes are already committed — report partial success
            audit_id = _write_audit(
                db,
                company_id,
                action="apply",
                session_id=body.session_id,
                patches_applied=body.patches.model_dump(),
                categories_applied=0,
                applied_by=body.approved_by,
            )
            return ApplyResponse(
                ok=False,
                applied_domains=applied_domains,
                categories_applied=0,
                audit_id=audit_id,
                error=f"Config applied but categories failed: {exc}",
            )

    audit_id = _write_audit(
        db,
        company_id,
        action="apply",
        session_id=body.session_id,
        patches_applied=body.patches.model_dump(),
        categories_proposed=len(body.generated_categories),
        categories_applied=cats_applied,
        applied_by=body.approved_by,
    )

    return ApplyResponse(
        ok=True,
        applied_domains=applied_domains,
        categories_applied=cats_applied,
        audit_id=audit_id,
    )


@router.post("/execute/{company_id}", response_model=ExecuteActionResponse)
def execute_action(
    company_id: int,
    body: ExecuteActionRequest,
    db: Session = Depends(get_db),
) -> ExecuteActionResponse:
    """
    Execute a single action proposed by the AI (create user, add category, etc.).
    Only call this after the admin has confirmed the action in the UI.
    """
    action = body.action
    try:
        if action.action_type == "create_user":
            p = action.params
            role = str(p.get("role", "employee")).strip().lower()
            if role not in USER_ROLES:
                role = "employee"
            payload = UserCreate(
                company_id=company_id,
                email=str(p.get("email", "")).strip(),
                full_name=str(p.get("full_name", "")).strip(),
                role=role,
                department=p.get("department") or None,
                job_title=p.get("job_title") or None,
                phone=p.get("phone") or None,
                send_invite=bool(p.get("send_invite", False)),
            )
            if not payload.email or not payload.full_name:
                return ExecuteActionResponse(
                    ok=False, action_id=action.action_id,
                    error="email and full_name are required",
                )
            user = create_user(db, payload)
            return ExecuteActionResponse(
                ok=True, action_id=action.action_id,
                result={"user_id": user.id, "email": user.email, "full_name": user.full_name, "role": user.role},
            )

        elif action.action_type == "bulk_invite_users":
            users_data = action.params.get("users", [])
            if not isinstance(users_data, list):
                return ExecuteActionResponse(ok=False, action_id=action.action_id, error="params.users must be a list")
            created, errors = [], []
            for u in users_data[:50]:
                try:
                    role = str(u.get("role", "employee")).strip().lower()
                    if role not in USER_ROLES:
                        role = "employee"
                    payload = UserCreate(
                        company_id=company_id,
                        email=str(u.get("email", "")).strip(),
                        full_name=str(u.get("full_name", "")).strip(),
                        role=role,
                        department=u.get("department") or None,
                        send_invite=bool(u.get("send_invite", False)),
                    )
                    if not payload.email or not payload.full_name:
                        errors.append(f"Missing email or full_name: {u}")
                        continue
                    user = create_user(db, payload)
                    created.append({"user_id": user.id, "email": user.email, "role": user.role})
                except Exception as ex:
                    errors.append(str(ex))
            return ExecuteActionResponse(
                ok=True, action_id=action.action_id,
                result={"created_count": len(created), "created": created, "errors": errors},
            )

        elif action.action_type == "create_accounting_category":
            p = action.params
            code = str(p.get("code", "")).strip()
            name = str(p.get("name", "")).strip()
            if not code or not name:
                return ExecuteActionResponse(ok=False, action_id=action.action_id, error="code and name are required")
            existing = (
                db.query(AccountingCategory)
                .filter(AccountingCategory.company_id == company_id, AccountingCategory.code == code)
                .first()
            )
            if existing:
                return ExecuteActionResponse(ok=False, action_id=action.action_id, error=f"Category '{code}' already exists")
            tax_behavior = str(p.get("tax_behavior", "none"))
            if tax_behavior not in TAX_BEHAVIOR_VALUES:
                tax_behavior = "none"
            category = AccountingCategory(
                company_id=company_id, code=code, name=name,
                expense_account_code=p.get("expense_account_code") or None,
                liability_account_code=p.get("liability_account_code") or None,
                tax_behavior=tax_behavior,
                requires_project=bool(p.get("requires_project", False)),
            )
            db.add(category)
            db.commit()
            db.refresh(category)
            return ExecuteActionResponse(
                ok=True, action_id=action.action_id,
                result={"category_id": category.id, "code": category.code, "name": category.name},
            )

        elif action.action_type == "bulk_create_accounting_categories":
            categories_data = action.params.get("categories", [])
            if not isinstance(categories_data, list):
                return ExecuteActionResponse(ok=False, action_id=action.action_id, error="params.categories must be a list")
            created, errors = [], []
            for cat in categories_data[:100]:
                code = str(cat.get("code", "")).strip()
                name = str(cat.get("name", "")).strip()
                if not code or not name:
                    errors.append(f"Missing code/name: {cat}")
                    continue
                existing = (
                    db.query(AccountingCategory)
                    .filter(AccountingCategory.company_id == company_id, AccountingCategory.code == code)
                    .first()
                )
                if existing:
                    errors.append(f"Code '{code}' already exists — skipped")
                    continue
                tax_behavior = str(cat.get("tax_behavior", "none"))
                if tax_behavior not in TAX_BEHAVIOR_VALUES:
                    tax_behavior = "none"
                db.add(AccountingCategory(
                    company_id=company_id, code=code, name=name,
                    expense_account_code=cat.get("expense_account_code") or None,
                    liability_account_code=cat.get("liability_account_code") or None,
                    tax_behavior=tax_behavior,
                    requires_project=bool(cat.get("requires_project", False)),
                ))
                created.append(code)
            try:
                db.commit()
            except Exception as ex:
                db.rollback()
                return ExecuteActionResponse(ok=False, action_id=action.action_id, error=str(ex))
            return ExecuteActionResponse(
                ok=True, action_id=action.action_id,
                result={"created_count": len(created), "created_codes": created, "errors": errors},
            )

        elif action.action_type == "update_user_role":
            p = action.params
            email = str(p.get("email", "")).strip().lower()
            new_role = str(p.get("role", "")).strip().lower()
            if not email or not new_role:
                return ExecuteActionResponse(ok=False, action_id=action.action_id, error="email and role are required")
            if new_role not in USER_ROLES:
                return ExecuteActionResponse(
                    ok=False, action_id=action.action_id,
                    error=f"Invalid role '{new_role}'. Allowed: {', '.join(USER_ROLES)}",
                )
            user = db.query(User).filter(User.email == email, User.company_id == company_id).first()
            if not user:
                return ExecuteActionResponse(ok=False, action_id=action.action_id, error=f"User '{email}' not found")
            user.role = new_role
            db.commit()
            return ExecuteActionResponse(
                ok=True, action_id=action.action_id,
                result={"user_id": user.id, "email": user.email, "new_role": new_role},
            )

        else:
            return ExecuteActionResponse(ok=False, action_id=action.action_id, error=f"Unknown action_type: {action.action_type}")

    except Exception as exc:
        db.rollback()
        return ExecuteActionResponse(ok=False, action_id=action.action_id, error=str(exc))


@router.get("/sessions/{company_id}", response_model=list[SessionSummary])
def list_sessions(
    company_id: int,
    db: Session = Depends(get_db),
) -> list[SessionSummary]:
    """List all orchestrator sessions for a company, most recent first."""
    rows = (
        db.query(OrchestratorSession)
        .filter(OrchestratorSession.company_id == company_id)
        .order_by(desc(OrchestratorSession.updated_at))
        .limit(50)
        .all()
    )
    result = []
    for row in rows:
        try:
            turns = json.loads(row.turns or "[]")
            turn_count = len(turns)
        except Exception:
            turn_count = 0
        result.append(SessionSummary(
            session_id=row.session_id,
            turn_count=turn_count,
            created_at=row.created_at.isoformat(),
            updated_at=row.updated_at.isoformat(),
        ))
    return result


@router.get("/sessions/{company_id}/{session_id}", response_model=SessionDetail)
def get_session(
    company_id: int,
    session_id: str,
    db: Session = Depends(get_db),
) -> SessionDetail:
    """Return all turns in a specific session."""
    row = (
        db.query(OrchestratorSession)
        .filter(
            OrchestratorSession.company_id == company_id,
            OrchestratorSession.session_id == session_id,
        )
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Session not found")
    try:
        turns = json.loads(row.turns or "[]")
    except Exception:
        turns = []
    return SessionDetail(
        session_id=row.session_id,
        turns=turns,
        created_at=row.created_at.isoformat(),
        updated_at=row.updated_at.isoformat(),
    )


@router.get("/audit/{company_id}", response_model=list[AuditEntry])
def list_audit_log(
    company_id: int,
    limit: int = 50,
    db: Session = Depends(get_db),
) -> list[AuditEntry]:
    """Return the most recent orchestrator audit log entries for a company."""
    rows = (
        db.query(OrchestratorAuditLog)
        .filter(OrchestratorAuditLog.company_id == company_id)
        .order_by(desc(OrchestratorAuditLog.created_at))
        .limit(min(limit, 200))
        .all()
    )
    return [
        AuditEntry(
            id=row.id,
            session_id=row.session_id,
            action=row.action,
            engine_mode=row.engine_mode,
            categories_proposed=row.categories_proposed,
            categories_applied=row.categories_applied,
            applied_by=row.applied_by,
            created_at=row.created_at.isoformat(),
        )
        for row in rows
    ]
