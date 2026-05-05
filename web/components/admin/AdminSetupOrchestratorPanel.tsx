"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  Bot, Zap, Loader2, CheckCircle2,
  AlertTriangle, AlertCircle, HelpCircle, ChevronDown, ChevronRight, UserPlus,
} from "lucide-react";
import { apiCall, apiPost, HttpError } from "@/lib/api/client";
import {
  getPortalConfigConflicts,
  type PortalConfigConflict,
} from "@/lib/portal-config-conflicts";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Props {
  companyId: number;
  portalConfig: any;
  onApplyPatch?: (patches: SuggestedPatches) => void;
  onAnalysisResult?: (result: AnalyzeResponse) => void;
  onRefreshPortalConfig?: () => void;
  onNavigate?: (section: string) => void;
}

interface CompanyProfile {
  company_type: string;
  complexity: "simple" | "medium" | "complex";
  notes: string[];
}

interface DetectedConflict {
  code: string;
  message: string;
  severity: "warning" | "critical";
}

interface MissingDecision {
  key: string;
  question: string;
  suggested_options: string[];
}

interface SuggestedPatches {
  company_setup: Record<string, any>;
  expense_policy: Record<string, any>;
  accounting_setup: Record<string, any>;
  approval_setup: Record<string, any>;
  workflow_setup: Record<string, any>;
}

interface GeneratedCategory {
  code: string;
  expense_account_code?: string | null;
  requires_project?: boolean;
}

type ExecutableActionType =
  | "create_user"
  | "bulk_invite_users"
  | "create_accounting_category"
  | "bulk_create_accounting_categories"
  | "update_user_role";

interface ExecutableAction {
  action_id: string;
  action_type: ExecutableActionType;
  label: string;
  params: Record<string, any>;
  requires_confirmation?: boolean;
}

const EXEC_ACTION_LABEL: Record<ExecutableActionType, string> = {
  create_user:                       "Create user",
  bulk_invite_users:                 "Bulk invite users",
  create_accounting_category:        "Add category",
  bulk_create_accounting_categories: "Bulk add categories",
  update_user_role:                  "Update role",
};

interface ExecStatus { status: "pending" | "running" | "done" | "error"; result?: any; error?: string; }

interface AnalyzeResponse {
  summary: string;
  company_profile: CompanyProfile;
  detected_conflicts: DetectedConflict[];
  missing_decisions: MissingDecision[];
  recommended_next_questions: string[];
  suggested_patches: SuggestedPatches;
  generated_categories?: GeneratedCategory[];
  next_actions?: string[];
  ok: boolean;
  error?: string | null;
  // Configuration Engine fields
  engine_mode?: "DIAGNOSE" | "CONFIGURE" | "ADAPT";
  understanding?: string;
  current_state_assessment?: string;
  impact?: string[];
  risks_gaps?: string[];
  next_steps?: string[];
  session_id?: string;
  action_state?: "awaiting_approval" | "no_changes";
  executable_actions?: ExecutableAction[];
}

// ── Message (chat thread) ─────────────────────────────────────────────────────

interface Message {
  id: string;
  role: "user" | "assistant";
  text?: string;
  result?: AnalyzeResponse;
  drafts: Record<string, Record<string, any>>;
  executions: Record<string, ExecStatus>;
  approvalState: "pending" | "approved" | "applied";
  appliedSections: Set<keyof SuggestedPatches>;
  categoriesApplying: boolean;
  categoriesApplied: boolean;
  categoriesError: string | null;
  notes: string;
  saving: boolean;
  saved: boolean;
  saveError: string | null;
}

// ── Patch section labels ──────────────────────────────────────────────────────

const PATCH_SECTIONS: { key: keyof SuggestedPatches; i18nKey: string }[] = [
  { key: "company_setup",    i18nKey: "patchCompanySetup" },
  { key: "expense_policy",   i18nKey: "patchExpensePolicy" },
  { key: "accounting_setup", i18nKey: "patchAccountingSetup" },
  { key: "approval_setup",   i18nKey: "patchApprovalSetup" },
  { key: "workflow_setup",   i18nKey: "patchWorkflowSetup" },
];

// Mirror of backend _ALLOWED_PATCH_FIELDS — strips invented keys before rendering.
const ALLOWED_PATCH_KEYS: Record<keyof SuggestedPatches, Set<string>> = {
  company_setup: new Set([
    "display_name", "country_code", "base_currency", "timezone", "language_code",
    "industry", "employee_count_range", "has_managers", "has_accounting_team",
    "has_subcontractors", "operates_multi_entity", "operates_multi_country",
    "allocation_dimensions", "allow_split_allocations", "expenses_module_enabled",
    "time_allocation_module_enabled", "subcontractor_module_enabled",
    "reimbursements_module_enabled", "approvals_module_enabled",
    "accounting_module_enabled", "archive_module_enabled", "ai_copilot_enabled",
    "ai_setup_completed", "ai_setup_notes", "ai_setup_last_summary",
  ]),
  expense_policy: new Set([
    "xml_required_mode", "pdf_pair_required_for_cfdi", "international_expenses_allowed",
    "tickets_allowed", "require_justification", "require_proof", "allow_split_allocations",
    "allocation_dimensions", "manager_approval_required", "accounting_review_required",
    "ai_policy_assist_enabled",
  ]),
  accounting_setup: new Set([
    "accounting_review_mode", "manager_approval_mode", "manager_approval_threshold_amount",
    "reimbursement_entity_required", "poliza_required", "archive_retention_years",
    "account_code_required", "subaccount_required", "auto_account_suggestion_enabled",
    "cost_center_required", "project_required", "client_required",
    "allow_accounting_override", "allow_submit_with_warnings",
    "require_final_accounting_review_before_export", "ai_accounting_assist_enabled",
    "ai_accounting_notes",
  ]),
  approval_setup: new Set([
    "approval_mode", "manager_threshold_amount", "accounting_threshold_amount",
    "require_manager_for_all_employees", "require_accounting_for_all_expenses",
    "allow_self_submission_without_manager", "allow_resubmission_after_rejection",
    "escalate_policy_failures_to_accounting", "escalate_international_to_accounting",
    "escalate_missing_documents_to_manager", "ai_approval_assist_enabled",
    "ai_approval_notes",
  ]),
  workflow_setup: new Set([
    "default_expense_workflow_mode", "auto_submit_on_complete_upload",
    "block_submit_on_failed_validation", "allow_submit_with_warnings",
    "auto_assign_review_stage", "route_policy_failures_to", "route_missing_documents_to",
    "route_international_expenses_to", "allow_draft_save", "allow_resubmit_after_return",
    "show_next_action_guidance", "ai_workflow_assist_enabled", "ai_workflow_notes",
  ]),
};

function patchValueLabel(v: any, tFn: (k: string) => string): string {
  if (typeof v === "boolean") return v ? tFn("valueOn") : tFn("valueOff");
  if (v === null || v === undefined) return "—";
  if (typeof v === "number") return String(v);
  return String(v).replace(/_/g, " ");
}

// ── Conflict fix hints ───────────────────────────────────────────────────────
// Maps each conflict code to the patch fields that would resolve it.
// getFixHint surfaces only values that are actually present in suggested_patches.

const CONFLICT_RELEVANT_FIELDS: Record<string, { section: keyof SuggestedPatches; field: string }[]> = {
  WF_MODE_MANAGER_PATH_NO_MANAGERS: [
    { section: "workflow_setup",  field: "default_expense_workflow_mode" },
    { section: "company_setup",   field: "has_managers" },
  ],
  MANAGER_FLOW_NO_MANAGERS: [
    { section: "company_setup",   field: "has_managers" },
    { section: "approval_setup",  field: "approval_mode" },
  ],
  POLICY_MANAGER_REQ_BUT_MANAGER_FLOW_OFF: [
    { section: "expense_policy",  field: "manager_approval_required" },
    { section: "approval_setup",  field: "approval_mode" },
    { section: "workflow_setup",  field: "default_expense_workflow_mode" },
  ],
  POLICY_ACCOUNTING_REQ_BUT_MODULE_OFF: [
    { section: "expense_policy",  field: "accounting_review_required" },
    { section: "company_setup",   field: "accounting_module_enabled" },
  ],
  TICKETS_DISABLED_BUT_ROUTED: [
    { section: "expense_policy",  field: "tickets_allowed" },
    { section: "workflow_setup",  field: "route_policy_failures_to" },
  ],
  REQUIRED_DIMENSION_NOT_IN_ALLOCATION: [
    { section: "expense_policy",   field: "allocation_dimensions" },
    { section: "accounting_setup", field: "project_required" },
    { section: "accounting_setup", field: "cost_center_required" },
  ],
  INTL_ESCALATION_BUT_INTL_DISABLED: [
    { section: "expense_policy",  field: "international_expenses_allowed" },
    { section: "approval_setup",  field: "escalate_international_to_accounting" },
    { section: "workflow_setup",  field: "route_international_expenses_to" },
  ],
  APPROVALS_ENABLED_NO_PATH: [
    { section: "approval_setup", field: "approval_mode" },
    { section: "company_setup",  field: "approvals_module_enabled" },
  ],
  BLOCK_ON_FAIL_BUT_WARNINGS_ALLOWED: [
    { section: "workflow_setup", field: "block_submit_on_failed_validation" },
    { section: "workflow_setup", field: "allow_submit_with_warnings" },
  ],
  WF_ALLOWS_WARNINGS_ACCOUNTING_BLOCKS: [
    { section: "workflow_setup",   field: "allow_submit_with_warnings" },
    { section: "accounting_setup", field: "allow_submit_with_warnings" },
  ],
  SPLIT_ALLOC_DERIVED_DISABLED_CHILD_ENABLED: [
    { section: "expense_policy", field: "allow_split_allocations" },
    { section: "company_setup",  field: "allow_split_allocations" },
  ],
};

function getFixHint(
  conflict: DetectedConflict,
  patches: SuggestedPatches,
  tFn: (k: string) => string,
): string | null {
  const relevant = CONFLICT_RELEVANT_FIELDS[conflict.code];
  if (!relevant) return null;
  const parts: string[] = [];
  for (const { section, field } of relevant) {
    const val = (patches[section] as Record<string, any>)?.[field];
    if (val !== undefined) {
      parts.push(`${field.replace(/_/g, " ")} → ${patchValueLabel(val, tFn)}`);
    }
  }
  return parts.length > 0 ? parts.join(", ") : null;
}

const COMPLEXITY_COLOR: Record<string, string> = {
  simple:  "text-success/60 border-emerald-500/20 bg-emerald-500/[0.05]",
  medium:  "text-warning/60  border-amber-500/20  bg-amber-500/[0.05]",
  complex: "text-error/60    border-red-500/20    bg-red-500/[0.05]",
};

// ── Operational impact derivation ────────────────────────────────────────────
// Deterministic: derived from persisted portal config + AI-detected conflicts.
// Returns plain-language statements about how the current setup affects
// day-to-day operations.  No inference beyond what is explicitly persisted.

type ImpactItem = { text: string; kind: "ok" | "warn" | "inactive" | "info" };

function deriveOperationalImpact(
  portalConfig: any,
  conflicts: DetectedConflict[],
  tFn: (k: string, vars?: Record<string, any>) => string,
): ImpactItem[] {
  const items: ImpactItem[] = [];
  if (!portalConfig) return items;

  const derived    = portalConfig.derived         ?? {};
  const approval   = portalConfig.approval_setup  ?? {};
  const workflow   = portalConfig.workflow_setup   ?? {};
  const accounting = portalConfig.accounting_setup ?? {};

  const managerEnabled    = derived.manager_flow_enabled    === true;
  const accountingEnabled = derived.accounting_flow_enabled === true;
  const approvalMode      = approval.approval_mode ?? "none";

  // Submission routing — always emit one item so the routing intent is explicit.
  if (approvalMode === "accounting_only") {
    items.push({ text: tFn("impactAccountingOnly"), kind: "info" });
  } else if (approvalMode === "manager_only") {
    items.push({ text: tFn("impactManagerOnly"), kind: "info" });
  } else if (approvalMode === "manager_then_accounting") {
    items.push({ text: tFn("impactManagerThenAccounting"), kind: "info" });
  } else if (approvalMode === "threshold_based") {
    const amt = approval.manager_threshold_amount;
    items.push({
      text: amt
        ? tFn("impactThresholdWithAmount", { amount: amt })
        : tFn("impactThresholdNoAmount"),
      kind: amt ? "info" : "warn",
    });
  } else {
    items.push({ text: tFn("impactNoApproval"), kind: "warn" });
  }

  // Manager queue — only note when inactive (active is implied by routing above).
  if (!managerEnabled) {
    items.push({ text: tFn("impactManagerQueueInactive"), kind: "inactive" });
  }

  // Accounting queue.
  if (!accountingEnabled) {
    items.push({ text: tFn("impactAccountingQueueInactive"), kind: "inactive" });
  } else {
    const acctMode = accounting.accounting_review_mode ?? "";
    if (acctMode === "exception_based") {
      items.push({ text: tFn("impactAccountingExceptionsOnly"), kind: "info" });
    } else if (acctMode === "all_expenses") {
      items.push({ text: tFn("impactAccountingAllExpenses"), kind: "info" });
    }
  }

  // Document validation gate.
  if (workflow.block_submit_on_failed_validation) {
    items.push({ text: tFn("impactValidationBlocked"), kind: "info" });
  }

  // Resubmission after rejection.
  if (approval.allow_resubmission_after_rejection) {
    items.push({ text: tFn("impactResubmissionAllowed"), kind: "ok" });
  } else {
    items.push({ text: tFn("impactNoResubmission"), kind: "inactive" });
  }

  // Escalations — only when explicitly enabled.
  if (approval.escalate_policy_failures_to_accounting) {
    items.push({ text: tFn("impactPolicyEscalated"), kind: "info" });
  }
  if (approval.escalate_international_to_accounting) {
    items.push({ text: tFn("impactIntlEscalated"), kind: "info" });
  }

  // Póliza.
  if (accounting.poliza_required) {
    items.push({ text: tFn("impactPolizaRequired"), kind: "info" });
  }

  // Surface critical conflicts as an operational risk item.
  if (conflicts.some((c) => c.severity === "critical")) {
    items.push({ text: tFn("impactCriticalConflicts"), kind: "warn" });
  }

  return items;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-1.5 text-[9px] font-bold uppercase tracking-widest text-muted">
      {children}
    </p>
  );
}

function CollapsibleSection({
  label,
  count,
  children,
  defaultOpen = false,
}: {
  label: string;
  count: number;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  if (count === 0) return null;
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between py-0.5"
      >
        <SectionLabel>{label}</SectionLabel>
        <span className="flex items-center gap-1">
          <span className="rounded border border-default bg-surface-1 px-1 py-0 text-[9px] text-muted">
            {count}
          </span>
          {open
            ? <ChevronDown className="h-2.5 w-2.5 text-muted" />
            : <ChevronRight className="h-2.5 w-2.5 text-muted" />
          }
        </span>
      </button>
      {open && <div className="space-y-1.5">{children}</div>}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function AdminSetupOrchestratorPanel({
  companyId,
  portalConfig,
  onApplyPatch,
  onAnalysisResult,
  onRefreshPortalConfig,
  onNavigate,
}: Props) {
  const [messages, setMessages]   = useState<Message[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [prompt, setPrompt]       = useState("");
  const [loading, setLoading]     = useState(false);
  const [apiError, setApiError]   = useState<string | null>(null);
  const [managerQueueCount, setManagerQueueCount]       = useState<number | null>(null);
  const [accountingQueueCount, setAccountingQueueCount] = useState<number | null>(null);
  const [legalEntities, setLegalEntities] = useState<{ id: number; entity_name: string; rfc?: string | null }[]>([]);
  const locale       = useLocale();
  const t            = useTranslations("admin.setupOrchestrator");
  const threadEndRef = useRef<HTMLDivElement>(null);

  // Scroll thread to bottom when new messages arrive
  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Fetch legal entities once on mount
  useEffect(() => {
    if (!companyId) return;
    apiCall<{ id: number; entity_name: string; rfc?: string | null }[]>(`/admin/company-setup/${companyId}/legal-entities`)
      .then((data) => { if (Array.isArray(data)) setLegalEntities(data); })
      .catch(() => {});
  }, [companyId]);

  // Fetch queue counts non-blocking whenever portalConfig is available
  useEffect(() => {
    if (!portalConfig || !companyId) return;
    const derived = portalConfig?.derived;
    if (derived?.manager_flow_enabled) {
      apiCall<{ summary?: { total_count?: number } }>(`/manager/queue/${companyId}`)
        .then((d) => { if (d?.summary?.total_count != null) setManagerQueueCount(d.summary.total_count); })
        .catch(() => {});
    }
    if (derived?.accounting_flow_enabled) {
      apiCall<{ summary?: { total_count?: number } }>(`/accounting/queue/${companyId}`)
        .then((d) => { if (d?.summary?.total_count != null) setAccountingQueueCount(d.summary.total_count); })
        .catch(() => {});
    }
  }, [companyId, portalConfig]);

  // ── Per-message state helpers ────────────────────────────────────────────────

  function updateMsg(msgId: string, updater: (m: Message) => Message) {
    setMessages((prev) => prev.map((m) => (m.id === msgId ? updater(m) : m)));
  }

  function setDraftField(msgId: string, actionId: string, field: string, value: any) {
    updateMsg(msgId, (m) => ({
      ...m,
      drafts: { ...m.drafts, [actionId]: { ...(m.drafts[actionId] ?? {}), [field]: value } },
    }));
  }

  async function executeAction(msgId: string, action: ExecutableAction, draft: Record<string, any>) {
    const mergedParams = { ...action.params, ...draft };
    const mergedAction = { ...action, params: mergedParams };
    updateMsg(msgId, (m) => ({ ...m, executions: { ...m.executions, [action.action_id]: { status: "running" } } }));
    try {
      const data = await apiPost<{ ok?: boolean; result?: any; error?: string }>(
        `/admin/setup-orchestrator/execute/${companyId}`,
        { action: mergedAction },
      );
      updateMsg(msgId, (m) => ({
        ...m,
        executions: {
          ...m.executions,
          [action.action_id]: data.ok
            ? { status: "done",  result: data.result }
            : { status: "error", error: data.error ?? "Unknown error" },
        },
      }));
    } catch (err: any) {
      updateMsg(msgId, (m) => ({
        ...m,
        executions: { ...m.executions, [action.action_id]: { status: "error", error: String(err) } },
      }));
    }
  }

  async function handleApplyCategories(msgId: string, cats: GeneratedCategory[]) {
    updateMsg(msgId, (m) => ({ ...m, categoriesApplying: true, categoriesError: null }));
    try {
      await apiPost(`/admin/accounting-categories/apply/${companyId}`, { items: cats });
      updateMsg(msgId, (m) => ({ ...m, categoriesApplying: false, categoriesApplied: true }));
      onRefreshPortalConfig?.();
    } catch (err: any) {
      const msg = err instanceof HttpError ? `Apply failed (${err.status})` : "Could not reach server.";
      updateMsg(msgId, (m) => ({ ...m, categoriesApplying: false, categoriesError: msg }));
    }
  }

  function handleApplySection(msgId: string, key: keyof SuggestedPatches, patches: SuggestedPatches) {
    const patch: SuggestedPatches = {
      company_setup: {}, expense_policy: {}, accounting_setup: {}, approval_setup: {}, workflow_setup: {},
      [key]: patches[key],
    };
    onApplyPatch?.(patch);
    updateMsg(msgId, (m) => ({ ...m, appliedSections: new Set([...m.appliedSections, key]) }));
  }

  function handleApprove(msgId: string) {
    updateMsg(msgId, (m) => ({ ...m, approvalState: "approved" }));
  }

  function handleApply(msgId: string, patches: SuggestedPatches) {
    onApplyPatch?.(patches);
    updateMsg(msgId, (m) => ({
      ...m,
      approvalState:    "applied",
      appliedSections:  new Set(PATCH_SECTIONS.map((s) => s.key)),
    }));
  }

  async function handleSaveSummary(msgId: string, summary: string, notes: string) {
    updateMsg(msgId, (m) => ({ ...m, saving: true, saveError: null, saved: false }));
    try {
      await apiCall(`/admin/company-setup/${companyId}`, {
        method: "PUT",
        json: { ai_setup_last_summary: summary, ai_setup_notes: notes.trim() || null },
      });
      updateMsg(msgId, (m) => ({ ...m, saving: false, saved: true }));
    } catch (err: any) {
      const msg = err instanceof HttpError ? `Save failed (${err.status})` : "Could not reach server.";
      updateMsg(msgId, (m) => ({ ...m, saving: false, saveError: msg }));
    }
  }

  // ── Core send ────────────────────────────────────────────────────────────────

  const blankMsg = (overrides: Partial<Message>): Message => ({
    id: crypto.randomUUID(),
    role: "user",
    text: undefined,
    result: undefined,
    drafts: {}, executions: {},
    approvalState: "pending", appliedSections: new Set(),
    categoriesApplying: false, categoriesApplied: false, categoriesError: null,
    notes: "", saving: false, saved: false, saveError: null,
    ...overrides,
  });

  const runAnalysis = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;

    setMessages((prev) => [...prev, blankMsg({ role: "user", text: trimmed })]);
    setPrompt("");
    setLoading(true);
    setApiError(null);

    try {
      const body: Record<string, unknown> = { prompt: trimmed, locale };
      if (sessionId) body.session_id = sessionId;
      if (portalConfig && Object.keys(portalConfig).length > 0) body.current_portal_config = portalConfig;

      const data: AnalyzeResponse = await apiPost(`/admin/setup-orchestrator/analyze/${companyId}`, body);
      if (data.session_id) setSessionId(data.session_id);

      const drafts: Record<string, Record<string, any>> = {};
      for (const a of data.executable_actions ?? []) drafts[a.action_id] = { ...a.params };

      setMessages((prev) => [...prev, blankMsg({ role: "assistant", result: data, drafts })]);
      onAnalysisResult?.(data);
    } catch (err: any) {
      const msg = err instanceof HttpError ? `Server returned ${err.status}` : "Could not reach the server.";
      setApiError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (overridePrompt?: string) =>
    runAnalysis(typeof overridePrompt === "string" ? overridePrompt : prompt);

  // ── Render one assistant message ─────────────────────────────────────────────

  function renderAssistantMsg(msg: Message) {
    const result = msg.result!;
    const { drafts, executions, approvalState, appliedSections, categoriesApplying, categoriesApplied, categoriesError } = msg;

    const hasActions = (result.executable_actions?.length ?? 0) > 0;
    const totalPatches = PATCH_SECTIONS.reduce(
      (n, s) => n + Object.keys(result.suggested_patches[s.key] ?? {}).filter((k) => ALLOWED_PATCH_KEYS[s.key].has(k)).length,
      0,
    );
    const hasDiscardedKeys = PATCH_SECTIONS.some(({ key }) =>
      Object.keys(result.suggested_patches[key] ?? {}).some((k) => !ALLOWED_PATCH_KEYS[key].has(k)),
    );
    const impactItems = deriveOperationalImpact(portalConfig, result.detected_conflicts ?? [], t);
    // Only show analysis sections when there's something substantive to show
    // Show analysis only when the AI is actually doing something — not for pure Q&A
    const hasAnalysis = result.action_state !== "no_changes" && (
      hasActions || totalPatches > 0 || (result.detected_conflicts?.length ?? 0) > 0
      || (result.missing_decisions?.length ?? 0) > 0 || (result.generated_categories?.length ?? 0) > 0
    );

    return (
      <div className="space-y-3">

        {/* Engine mode tag + understanding */}
        <div className="space-y-1.5">
          {hasAnalysis && (
          <div className="flex items-center gap-2">
            <span className={`rounded border px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-widest ${
              result.engine_mode === "DIAGNOSE" ? "border-blue-500/20 bg-blue-500/[0.06] text-accent/55"
              : result.engine_mode === "ADAPT"  ? "border-emerald-500/20 bg-emerald-500/[0.06] text-emerald-300/55"
              :                                   "border-violet-500/20 bg-violet-500/[0.06] text-violet-300/55"
            }`}>{result.engine_mode ?? "CONFIGURE"}</span>
            {result.company_profile?.company_type && (
              <span className="text-[9px] text-muted">{result.company_profile.company_type}</span>
            )}
            <span className={`ml-auto rounded border px-1.5 py-0.5 text-[8px] font-semibold capitalize ${
              COMPLEXITY_COLOR[result.company_profile?.complexity] ?? COMPLEXITY_COLOR.simple
            }`}>{result.company_profile?.complexity}</span>
          </div>
          )}
          {(result.understanding || result.summary) && (
            <div className="rounded border border-default bg-surface-1 px-3 py-2.5">
              <p className="text-[10px] leading-relaxed text-secondary">{result.understanding ?? result.summary}</p>
            </div>
          )}
          {(result.company_profile?.notes?.length ?? 0) > 0 && hasAnalysis && (
            <ul className="space-y-0.5 px-0.5">
              {result.company_profile.notes.map((n, i) => (
                <li key={i} className="flex items-start gap-1.5 text-[10px] text-muted">
                  <span className="mt-0.5 text-muted">·</span>{n}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Executable actions */}
        {(result.executable_actions?.length ?? 0) > 0 && result.executable_actions!.map((action) => {
          const st    = executions[action.action_id];
          const draft = drafts[action.action_id] ?? {};

          if (st?.status === "done") return (
            <div key={action.action_id} className="flex items-center gap-2 rounded border border-emerald-500/20 bg-emerald-500/[0.04] px-2.5 py-2">
              <CheckCircle2 className="h-3 w-3 shrink-0 text-success/60" />
              <div className="min-w-0">
                <p className="text-[10px] text-emerald-300/70">{action.label}</p>
                {st.result && (
                  <p className="text-[9px] text-emerald-300/40">
                    {Object.entries(st.result).filter(([k]) => !["user_id","category_id"].includes(k)).map(([k,v]) => `${k.replace(/_/g," ")}: ${v}`).join(" · ")}
                  </p>
                )}
              </div>
            </div>
          );

          if (action.action_type === "create_user" || action.action_type === "bulk_invite_users") {
            const isBulk = action.action_type === "bulk_invite_users";
            const userRows: Record<string,any>[] = isBulk
              ? (Array.isArray(draft.users) ? draft.users : [{ full_name: draft.full_name ?? "", email: "", role: draft.role ?? "employee" }])
              : [draft];
            return (
              <div key={action.action_id} className="rounded border border-default bg-surface-1 px-3 py-2.5 space-y-2.5">
                <div className="flex items-center gap-2">
                  <UserPlus className="h-3 w-3 shrink-0 text-muted" />
                  <p className="flex-1 text-[10px] font-medium text-secondary">{action.label}</p>
                  {st?.status === "running" && <Loader2 className="h-3 w-3 shrink-0 animate-spin text-muted" />}
                </div>
                {!isBulk && (
                  <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                    {([
                      { key: "full_name",  label: t("userFormFullName"),  type: "text",  required: true  },
                      { key: "email",      label: t("userFormEmail"),      type: "email", required: true  },
                      { key: "department", label: t("userFormDepartment"), type: "text",  required: false },
                      { key: "job_title",  label: t("userFormJobTitle"),   type: "text",  required: false },
                    ] as { key: string; label: string; type: string; required: boolean }[]).map(({ key, label, type, required }) => (
                      <label key={key} className="flex flex-col gap-0.5">
                        <span className="text-[8.5px] font-semibold uppercase tracking-wider text-muted">{label}{required ? " *" : ""}</span>
                        <input
                          type={type}
                          value={String(draft[key] ?? "")}
                          onChange={(e) => setDraftField(msg.id, action.action_id, key, e.target.value)}
                          className="rounded border border-default bg-surface-2 px-2 py-1 text-[10px] text-secondary outline-none placeholder:text-muted focus:border-strong"
                          placeholder={required ? t("fieldRequired") : t("fieldOptional")}
                        />
                      </label>
                    ))}
                    <label className="flex flex-col gap-0.5">
                      <span className="text-[8.5px] font-semibold uppercase tracking-wider text-muted">{t("userFormRole")} *</span>
                      <select
                        value={String(draft.role ?? "employee")}
                        onChange={(e) => setDraftField(msg.id, action.action_id, "role", e.target.value)}
                        className="rounded border border-default bg-[#1a1a1f] px-2 py-1 text-[10px] text-secondary outline-none focus:border-strong"
                      >
                        {["employee","manager","accounting","admin","executive","secretary"].map((r) => (
                          <option key={r} value={r}>{r}</option>
                        ))}
                      </select>
                    </label>
                    {legalEntities.length > 0 && (
                      <label className="flex flex-col gap-0.5">
                        <span className="text-[8.5px] font-semibold uppercase tracking-wider text-muted">{t("userFormCompany")}</span>
                        <select
                          value={String(draft.legal_entity_id ?? "")}
                          onChange={(e) => setDraftField(msg.id, action.action_id, "legal_entity_id", e.target.value ? Number(e.target.value) : null)}
                          className="rounded border border-default bg-[#1a1a1f] px-2 py-1 text-[10px] text-secondary outline-none focus:border-strong"
                        >
                          <option value="">{t("entityNone")}</option>
                          {legalEntities.map((le) => (
                            <option key={le.id} value={le.id}>{le.entity_name}{le.rfc ? ` (${le.rfc})` : ""}</option>
                          ))}
                        </select>
                      </label>
                    )}
                    <label className="flex items-center gap-2 pt-3">
                      <input
                        type="checkbox"
                        checked={Boolean(draft.send_invite)}
                        onChange={(e) => setDraftField(msg.id, action.action_id, "send_invite", e.target.checked)}
                        className="h-3 w-3 accent-violet-500"
                      />
                      <span className="text-[9px] text-muted">{t("userFormSendInvite")}</span>
                    </label>
                  </div>
                )}
                {st?.status === "error" && <p className="text-[9px] text-error/60">{st.error}</p>}
                <button
                  type="button"
                  disabled={st?.status === "running" || (!isBulk && (!draft.email?.trim() || !draft.full_name?.trim()))}
                  onClick={() => executeAction(msg.id, action, draft)}
                  className="w-full rounded border border-emerald-500/25 bg-emerald-500/[0.07] py-1 text-[9px] font-semibold text-emerald-300/70 transition-colors hover:border-success hover:bg-emerald-500/[0.13] hover:text-emerald-300 disabled:cursor-not-allowed disabled:opacity-30"
                >
                  {st?.status === "running" ? t("creatingBtn") : isBulk ? t("inviteUsersBtn", { count: userRows.length }) : t("createUserBtn")}
                </button>
              </div>
            );
          }

          if (action.action_type === "create_accounting_category" || action.action_type === "bulk_create_accounting_categories") {
            const isBulk = action.action_type === "bulk_create_accounting_categories";
            const cats: Record<string,any>[] = isBulk ? (Array.isArray(draft.categories) ? draft.categories : []) : [draft];
            return (
              <div key={action.action_id} className="rounded border border-default bg-surface-1 px-3 py-2.5 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-widest text-muted">{t("categoryLabel")}</span>
                  <p className="flex-1 text-[10px] text-tertiary">{action.label}</p>
                  {st?.status === "running" && <Loader2 className="h-3 w-3 shrink-0 animate-spin text-muted" />}
                </div>
                {isBulk ? (
                  <p className="text-[9px] text-muted">{t("categoriesReadyCount", { count: cats.length })}</p>
                ) : (
                  <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                    {([{key:"code",label:t("catFormCode"),required:true},{key:"name",label:t("catFormName"),required:true},{key:"expense_account_code",label:t("catFormAccountCode"),required:false}] as {key:string;label:string;required:boolean}[]).map(({key,label,required}) => (
                      <label key={key} className="flex flex-col gap-0.5">
                        <span className="text-[8.5px] font-semibold uppercase tracking-wider text-muted">{label}{required ? " *" : ""}</span>
                        <input
                          type="text" value={String(draft[key] ?? "")}
                          onChange={(e) => setDraftField(msg.id, action.action_id, key, e.target.value)}
                          className="rounded border border-default bg-surface-2 px-2 py-1 text-[10px] text-secondary outline-none placeholder:text-muted focus:border-strong"
                          placeholder={required ? t("fieldRequired") : t("fieldOptional")}
                        />
                      </label>
                    ))}
                    <label className="flex flex-col gap-0.5">
                      <span className="text-[8.5px] font-semibold uppercase tracking-wider text-muted">{t("catFormTaxBehavior")}</span>
                      <select value={String(draft.tax_behavior ?? "none")} onChange={(e) => setDraftField(msg.id, action.action_id, "tax_behavior", e.target.value)}
                        className="rounded border border-default bg-[#1a1a1f] px-2 py-1 text-[10px] text-secondary outline-none focus:border-strong">
                        <option value="none">{t("taxBehaviorNone")}</option>
                        <option value="creditable">{t("taxBehaviorCreditable")}</option>
                        <option value="non_creditable">{t("taxBehaviorNonCreditable")}</option>
                      </select>
                    </label>
                  </div>
                )}
                {st?.status === "error" && <p className="text-[9px] text-error/60">{st.error}</p>}
                <button type="button" disabled={st?.status === "running"} onClick={() => executeAction(msg.id, action, draft)}
                  className="w-full rounded border border-emerald-500/25 bg-emerald-500/[0.07] py-1 text-[9px] font-semibold text-emerald-300/70 transition-colors hover:border-success hover:bg-emerald-500/[0.13] hover:text-emerald-300 disabled:cursor-not-allowed disabled:opacity-30">
                  {st?.status === "running" ? t("creatingBtn") : isBulk ? t("createCategoriesBtn", { count: cats.length }) : t("createCategoryBtn")}
                </button>
              </div>
            );
          }

          // update_user_role and fallback
          return (
            <div key={action.action_id} className="rounded border border-default bg-surface-1 px-3 py-2.5 space-y-2">
              <p className="text-[10px] text-tertiary">{action.label}</p>
              {st?.status === "error" && <p className="text-[9px] text-error/60">{st.error}</p>}
              <button type="button" disabled={st?.status === "running"} onClick={() => executeAction(msg.id, action, draft)}
                className="w-full rounded border border-emerald-500/25 bg-emerald-500/[0.07] py-1 text-[9px] font-semibold text-emerald-300/70 transition-colors hover:border-success hover:bg-emerald-500/[0.13] hover:text-emerald-300 disabled:cursor-not-allowed disabled:opacity-30">
                {st?.status === "running" ? t("runningBtn") : t("executeBtn")}
              </button>
            </div>
          );
        })}

        {!hasActions && hasAnalysis && (<>

        {/* Next steps */}
        {(result.next_steps?.length ?? 0) > 0 && (
          <div className="space-y-1">
            <p className="text-[8.5px] font-bold uppercase tracking-widest text-muted">{t("whatToDoNext")}</p>
            <div className="flex flex-col gap-1">
              {result.next_steps!.map((step, i) => (
                <button key={i} type="button"
                  onClick={() => handleSubmit(step)}
                  className="flex items-center gap-1.5 rounded border border-violet-500/15 bg-violet-500/[0.04] px-2.5 py-1.5 text-left text-[10px] text-violet-300/55 transition-colors hover:border-violet-500/30 hover:bg-violet-500/[0.09] hover:text-violet-300/80"
                >
                  <Zap className="h-2.5 w-2.5 shrink-0 opacity-60" />{step}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Current state assessment */}
        {result.current_state_assessment && (
          <div className="space-y-1">
            <SectionLabel>{t("currentState")}</SectionLabel>
            <p className="px-0.5 text-[10px] leading-relaxed text-muted">{result.current_state_assessment}</p>
          </div>
        )}

        {result.action_state === "no_changes" && totalPatches === 0 && (
          <div className="flex items-center gap-2 px-0.5">
            <CheckCircle2 className="h-3 w-3 text-muted" />
            <span className="text-[10px] text-muted">{t("noChangesNeeded")}</span>
          </div>
        )}

        {result.action_state !== "no_changes" && (<>

          {/* Impact */}
          {(result.impact?.length ?? 0) > 0 ? (
            <div>
              <SectionLabel>{t("impact")}</SectionLabel>
              <div className="rounded border border-default bg-surface-1 px-3 py-2 space-y-1">
                {result.impact!.map((item, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <span className="mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full bg-surface-2" />
                    <p className="text-[10px] leading-snug text-tertiary">{item}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : impactItems.length > 0 && (
            <div>
              <SectionLabel>{t("operationalImpact")}</SectionLabel>
              <div className="rounded border border-default bg-surface-1 px-3 py-2 space-y-1">
                {impactItems.map((item, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <span className={`mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full ${
                      item.kind === "ok"       ? "bg-emerald-400/50" :
                      item.kind === "warn"     ? "bg-amber-400/55"   :
                      item.kind === "inactive" ? "bg-surface-1"       : "bg-surface-2"
                    }`} />
                    <p className={`text-[10px] leading-snug ${
                      item.kind === "ok"       ? "text-emerald-300/60" :
                      item.kind === "warn"     ? "text-warning/55"   :
                      item.kind === "inactive" ? "text-muted"       : "text-tertiary"
                    }`}>{item.text}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Detected conflicts */}
          <CollapsibleSection label={t("detectedConflicts")} count={result.detected_conflicts?.length ?? 0} defaultOpen>
            {(result.detected_conflicts ?? []).map((c, i) => {
              const fixHint = getFixHint(c, result.suggested_patches, t);
              return (
                <div key={i} className={`flex items-start gap-2 rounded border px-3 py-2 ${
                  c.severity === "critical" ? "border-red-500/25 bg-red-500/[0.07]" : "border-amber-500/[0.10] bg-amber-500/[0.025]"
                }`}>
                  {c.severity === "critical"
                    ? <AlertCircle   className="mt-0.5 h-3 w-3 shrink-0 text-error/70" />
                    : <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-warning/40" />
                  }
                  <div className="min-w-0 space-y-0.5">
                    <p className="text-[9px] font-mono text-muted">{c.code}</p>
                    <p className={`text-[10px] leading-snug ${c.severity === "critical" ? "font-medium text-error/75" : "text-warning/50"}`}>{c.message}</p>
                    {fixHint && <p className="text-[9px] italic text-muted">{t("fixDirection", { hint: fixHint })}</p>}
                  </div>
                </div>
              );
            })}
          </CollapsibleSection>

          {/* Missing decisions */}
          <CollapsibleSection label={t("missingDecisions")} count={result.missing_decisions?.length ?? 0} defaultOpen>
            {(result.missing_decisions ?? []).map((d, i) => (
              <div key={i} className="rounded border border-default bg-surface-1 px-3 py-2.5 space-y-1.5">
                <div className="flex items-start gap-2">
                  <HelpCircle className="mt-0.5 h-3 w-3 shrink-0 text-accent/40" />
                  <div className="space-y-1">
                    <p className="text-[9px] font-mono text-muted">{d.key}</p>
                    <p className="text-[10px] leading-snug text-tertiary">{d.question}</p>
                  </div>
                </div>
                {d.suggested_options.length > 0 && (
                  <div className="flex flex-wrap gap-1 pl-5">
                    {d.suggested_options.map((opt, j) => (
                      <button key={j} type="button"
                        onClick={() => handleSubmit(`${d.question} → ${opt}`)}
                        className="rounded border border-blue-500/20 bg-blue-500/[0.06] px-2 py-0.5 text-[9px] text-accent/55 transition-colors hover:bg-accent-muted hover:bg-accent-hover/[0.12] hover:text-accent"
                      >{opt}</button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </CollapsibleSection>

          {/* Risks & gaps */}
          {(result.risks_gaps?.length ?? 0) > 0 && (
            <div>
              <SectionLabel>{t("risksGaps")}</SectionLabel>
              <div className="rounded border border-amber-500/[0.08] bg-amber-500/[0.02] px-3 py-2 space-y-1.5">
                {result.risks_gaps!.map((item, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <AlertTriangle className="mt-0.5 h-2.5 w-2.5 shrink-0 text-warning/35" />
                    <p className="text-[10px] leading-snug text-warning/50">{item}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Generated categories */}
          {(result.generated_categories?.length ?? 0) > 0 && (
            <div className="space-y-1.5">
              <SectionLabel>{t("generatedCategories")}</SectionLabel>
              <div className="overflow-hidden rounded border border-default bg-surface-1">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-subtle">
                      <th className="px-3 py-1.5 text-left text-[9px] font-bold uppercase tracking-widest text-muted">{t("colCode")}</th>
                      <th className="px-3 py-1.5 text-left text-[9px] font-bold uppercase tracking-widest text-muted">{t("colAccount")}</th>
                      <th className="px-3 py-1.5 text-left text-[9px] font-bold uppercase tracking-widest text-muted">{t("colProjReq")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.generated_categories!.map((cat, i) => (
                      <tr key={i} className="border-b border-subtle last:border-0">
                        <td className="px-3 py-1.5 font-mono text-[10px] text-tertiary">{cat.code}</td>
                        <td className="px-3 py-1.5 text-[10px] text-muted">{cat.expense_account_code ?? <span className="text-muted">—</span>}</td>
                        <td className="px-3 py-1.5 text-[10px] text-muted">{cat.requires_project ? t("colYes") : t("colNo")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button type="button" onClick={() => handleApplyCategories(msg.id, result.generated_categories!)}
                disabled={categoriesApplying || categoriesApplied}
                className="inline-flex w-full items-center justify-center gap-1.5 rounded border border-default bg-surface-2 px-3 py-1.5 text-[10px] font-semibold text-tertiary transition-colors hover:bg-surface-3 disabled:cursor-not-allowed disabled:opacity-50">
                {categoriesApplying ? <><Loader2 className="h-3 w-3 animate-spin" /> {t("applying")}</>
                  : categoriesApplied ? <><CheckCircle2 className="h-3 w-3 text-success/60" /> {t("categoriesApplied")}</>
                  : t("applyCategories")}
              </button>
              {categoriesError && <p className="text-[10px] text-error/60">{categoriesError}</p>}
            </div>
          )}

          {/* Suggested patches */}
          {hasDiscardedKeys && (
            <p className="text-[9px] text-muted italic">{t("discardedKeysNote")}</p>
          )}
          {totalPatches > 0 && (
            <div className="space-y-1.5">
              <SectionLabel>{t("proposedConfig")}</SectionLabel>
              {PATCH_SECTIONS.map(({ key, i18nKey }) => {
                const allowed  = ALLOWED_PATCH_KEYS[key];
                const entries  = Object.entries(result.suggested_patches[key] ?? {}).filter(([f]) => allowed.has(f));
                if (entries.length === 0) return null;
                const sectionApplied = appliedSections.has(key);
                return (
                  <div key={key} className="overflow-hidden rounded border border-default bg-surface-1">
                    <div className="flex items-center justify-between border-b border-subtle px-3 py-1.5">
                      <p className="text-[9px] font-bold uppercase tracking-widest text-muted">{t(i18nKey)}</p>
                      <button type="button" onClick={() => handleApplySection(msg.id, key, result.suggested_patches)}
                        disabled={sectionApplied}
                        className="text-[9px] font-medium text-violet-300/55 transition-colors hover:text-violet-300/80 disabled:cursor-not-allowed disabled:opacity-40">
                        {sectionApplied ? t("applied") : t("applyThisPatch")}
                      </button>
                    </div>
                    <table className="w-full">
                      <tbody>
                        {entries.map(([field, value]) => (
                          <tr key={field} className="border-b border-subtle last:border-0">
                            <td className="px-3 py-1.5 text-[10px] text-muted">{field.replace(/_/g, " ")}</td>
                            <td className="px-3 py-1.5 text-right text-[10px] font-medium text-tertiary">{patchValueLabel(value, t)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                );
              })}
            </div>
          )}

          {/* Approval gate */}
          {totalPatches > 0 && (
            <div className="space-y-1.5 border-t border-subtle pt-3">
              <SectionLabel>{t("actionSection")}</SectionLabel>
              {approvalState === "pending" && (
                <div className="flex items-center justify-between rounded border border-amber-500/[0.15] bg-amber-500/[0.04] px-3 py-2">
                  <span className="text-[10px] text-warning/55">{t("awaitingApproval")}</span>
                  <button type="button" onClick={() => handleApprove(msg.id)}
                    className="text-[10px] font-semibold text-violet-300/65 transition-colors hover:text-violet-300/90">{t("approveBtn")}</button>
                </div>
              )}
              {approvalState === "approved" && (
                <button type="button" onClick={() => handleApply(msg.id, result.suggested_patches)}
                  className="inline-flex w-full items-center justify-center gap-1.5 rounded border border-violet-500/25 bg-violet-600/15 px-3 py-1.5 text-[10px] font-semibold text-violet-300/70 transition-colors hover:bg-violet-600/25">
                  <Zap className="h-3 w-3" /> Apply changes
                </button>
              )}
              {approvalState === "applied" && (
                <div className="flex items-center gap-2 px-1 py-1">
                  <CheckCircle2 className="h-3 w-3 text-success/60" />
                  <span className="text-[10px] text-emerald-300/60">{t("changesApplied")}</span>
                </div>
              )}
            </div>
          )}

          {totalPatches === 0 && result.engine_mode === "DIAGNOSE" && (
            <div className="flex items-center gap-2 border-t border-subtle pt-3 px-0.5">
              <CheckCircle2 className="h-3 w-3 text-muted" />
              <span className="text-[10px] text-muted">{t("diagnosisComplete")}</span>
            </div>
          )}

        </>)}

        </>)} {/* end !hasActions */}

        {/* Save summary — only when there's substantive analysis */}
        {hasAnalysis && result.summary && (
          <div className="space-y-1.5 border-t border-subtle pt-3">
            <SectionLabel>{t("saveToCompanySetup")}</SectionLabel>
            <textarea rows={2} value={msg.notes}
              onChange={(e) => updateMsg(msg.id, (m) => ({ ...m, notes: e.target.value, saved: false }))}
              placeholder={t("notesPlaceholder")}
              className="w-full resize-none rounded border border-default bg-surface-1 px-2.5 py-2 text-[10px] text-tertiary placeholder-white/18 outline-none focus:border-violet-500/35"
            />
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => handleSaveSummary(msg.id, result.summary!, msg.notes)}
                disabled={msg.saving || msg.saved}
                className="inline-flex items-center gap-1.5 rounded border border-default bg-surface-2 px-3 py-1.5 text-[10px] font-semibold text-tertiary transition-colors hover:bg-surface-3 disabled:cursor-not-allowed disabled:opacity-50">
                {msg.saving ? <><Loader2 className="h-3 w-3 animate-spin" /> {t("saving")}</>
                  : msg.saved ? <><CheckCircle2 className="h-3 w-3 text-success/60" /> {t("saved")}</>
                  : t("saveSummaryNotes")}
              </button>
              {msg.saveError && <p className="text-[10px] text-error/60">{msg.saveError}</p>}
            </div>
          </div>
        )}

      </div>
    );
  }

  // ── Pre-flight conflicts ──────────────────────────────────────────────────────
  const preflightConflicts: PortalConfigConflict[] = getPortalConfigConflicts(portalConfig);

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-full flex-col overflow-hidden">

      {/* Header */}
      <div className="flex shrink-0 items-center gap-2 px-1 py-2">
        <Bot className="h-4 w-4 shrink-0 text-violet-400/55" />
        <span className="text-[11px] font-semibold text-tertiary">{t("title")}</span>
        {sessionId && (
          <span className="rounded border border-emerald-500/15 bg-emerald-500/[0.04] px-1.5 py-0.5 text-[8px] text-emerald-300/35">{t("sessionActive")}</span>
        )}
        <span className="ml-auto flex items-center gap-1.5">
          {managerQueueCount !== null && (
            <span className="rounded border border-default bg-surface-1 px-1.5 py-0.5 text-[8px] text-muted">{t("mgrQueue", { count: managerQueueCount })}</span>
          )}
          {accountingQueueCount !== null && (
            <span className="rounded border border-default bg-surface-1 px-1.5 py-0.5 text-[8px] text-muted">{t("acctQueue", { count: accountingQueueCount })}</span>
          )}
          <span className="rounded border border-violet-500/15 bg-violet-500/[0.06] px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-widest text-violet-300/40">{t("ai")}</span>
        </span>
      </div>

      {/* Thread */}
      <div className="flex-1 overflow-y-auto px-1 space-y-2 pb-2">

        {/* Pre-flight conflicts — only before first message */}
        {messages.length === 0 && preflightConflicts.length > 0 && (
          <div className="space-y-1">
            <p className="text-[8.5px] font-bold uppercase tracking-[0.12em] text-muted">
              {t("currentConfigIssues")} <span className="text-muted">({preflightConflicts.length})</span>
            </p>
            {preflightConflicts.map((c, i) => (
              <div key={i} className={`group rounded border ${c.severity === "critical" ? "border-red-500/20 bg-red-500/[0.06]" : "border-subtle bg-surface-0"}`}>
                <button type="button" onClick={() => onNavigate?.(c.section)}
                  className="flex w-full items-start gap-2 px-2.5 py-1.5 text-left">
                  {c.severity === "critical"
                    ? <AlertCircle   className="mt-0.5 h-2.5 w-2.5 shrink-0 text-error/65" />
                    : <AlertTriangle className="mt-0.5 h-2.5 w-2.5 shrink-0 text-warning/35" />
                  }
                  <p className={`flex-1 text-[9.5px] leading-snug ${c.severity === "critical" ? "text-error/70" : "text-muted"}`}>{c.message}</p>
                </button>
                <div className="flex items-center justify-between border-t border-subtle px-2.5 py-1">
                  <span className="text-[8px] text-muted">{c.section}</span>
                  <div className="flex gap-1">
                    {onNavigate && (
                      <button type="button" onClick={() => onNavigate(c.section)}
                        className="rounded px-1.5 py-0.5 text-[8px] font-medium text-muted transition-colors hover:bg-surface-2 hover:text-secondary">
                        {t("goToSection")}
                      </button>
                    )}
                    <button type="button"
                      onClick={() => handleSubmit(`Fix this configuration issue: ${c.message}`)}
                      className="flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[8px] font-medium text-violet-300/35 transition-colors hover:bg-violet-500/[0.08] hover:text-violet-300/60">
                      <Zap className="h-2 w-2" /> {t("askAi")}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Message thread */}
        {messages.map((msg) => (
          <div key={msg.id}>
            {msg.role === "user" ? (
              <div className="flex justify-end">
                <div className="max-w-[90%] rounded border border-subtle bg-surface-2 px-3 py-2">
                  <p className="text-[10px] leading-relaxed text-tertiary">{msg.text}</p>
                </div>
              </div>
            ) : (
              <div className="rounded border border-subtle bg-surface-1 px-3 py-2.5">
                {renderAssistantMsg(msg)}
              </div>
            )}
          </div>
        ))}

        {loading && (
          <div className="flex items-center gap-2 px-1 py-2">
            <Loader2 className="h-3 w-3 animate-spin text-violet-400/50" />
            <span className="text-[10px] text-muted">{t("thinking")}</span>
          </div>
        )}

        {apiError && (
          <div className="rounded border border-red-500/15 bg-red-500/[0.04] px-3 py-2">
            <p className="text-[10px] text-error/55">{apiError}</p>
          </div>
        )}

        <div ref={threadEndRef} />
      </div>

      {/* Input — pinned at bottom */}
      <div className="shrink-0 border-t border-subtle px-1 pt-2 pb-1 space-y-1.5">
        <textarea
          rows={2}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSubmit(); } }}
          placeholder={messages.length === 0 ? t("promptPlaceholderNew") : t("promptPlaceholderContinue")}
          className="w-full resize-none rounded border border-default bg-surface-1 px-2.5 py-2 text-[10px] text-tertiary placeholder-white/18 outline-none focus:border-violet-500/35"
        />
        <button type="button" onClick={() => handleSubmit()} disabled={loading || !prompt.trim()}
          className="inline-flex w-full items-center justify-center gap-1.5 rounded border border-violet-500/25 bg-violet-600/15 px-3 py-1.5 text-[10px] font-semibold text-violet-300/70 transition-colors hover:bg-violet-600/25 disabled:cursor-not-allowed disabled:opacity-40">
          {loading ? <><Loader2 className="h-3 w-3 animate-spin" /> {t("thinking")}</> : <><Zap className="h-3 w-3" /> {t("sendBtn")}</>}
        </button>
      </div>

    </div>
  );
}
