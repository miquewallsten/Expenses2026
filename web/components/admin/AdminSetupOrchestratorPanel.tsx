"use client";

import { useEffect, useState } from "react";
import {
  Bot, Zap, Loader2, CheckCircle2,
  AlertTriangle, AlertCircle, HelpCircle, ChevronDown, ChevronRight,
} from "lucide-react";
import {
  getPortalConfigConflicts,
  type PortalConfigConflict,
} from "@/lib/portal-config-conflicts";

const API = process.env.NEXT_PUBLIC_API_BASE_URL;

// ── Types ─────────────────────────────────────────────────────────────────────

interface Props {
  companyId: number;
  portalConfig: any;
  onApplyPatch?: (patches: SuggestedPatches) => void;
  onAnalysisResult?: (result: AnalyzeResponse) => void;
  onRefreshPortalConfig?: () => void;
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
}

// ── Patch section labels ──────────────────────────────────────────────────────

const PATCH_SECTIONS: { key: keyof SuggestedPatches; label: string }[] = [
  { key: "company_setup",    label: "Company setup" },
  { key: "expense_policy",   label: "Expense policy" },
  { key: "accounting_setup", label: "Accounting setup" },
  { key: "approval_setup",   label: "Approval setup" },
  { key: "workflow_setup",   label: "Workflow setup" },
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

function patchValueLabel(v: any): string {
  if (typeof v === "boolean") return v ? "On" : "Off";
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
): string | null {
  const relevant = CONFLICT_RELEVANT_FIELDS[conflict.code];
  if (!relevant) return null;
  const parts: string[] = [];
  for (const { section, field } of relevant) {
    const val = (patches[section] as Record<string, any>)?.[field];
    if (val !== undefined) {
      parts.push(`${field.replace(/_/g, " ")} → ${patchValueLabel(val)}`);
    }
  }
  return parts.length > 0 ? parts.join(", ") : null;
}

const COMPLEXITY_COLOR: Record<string, string> = {
  simple:  "text-emerald-400/60 border-emerald-500/20 bg-emerald-500/[0.05]",
  medium:  "text-amber-400/60  border-amber-500/20  bg-amber-500/[0.05]",
  complex: "text-red-400/60    border-red-500/20    bg-red-500/[0.05]",
};

// ── Operational impact derivation ────────────────────────────────────────────
// Deterministic: derived from persisted portal config + AI-detected conflicts.
// Returns plain-language statements about how the current setup affects
// day-to-day operations.  No inference beyond what is explicitly persisted.

type ImpactItem = { text: string; kind: "ok" | "warn" | "inactive" | "info" };

function deriveOperationalImpact(
  portalConfig: any,
  conflicts: DetectedConflict[],
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
    items.push({ text: "Employees submit directly to accounting", kind: "info" });
  } else if (approvalMode === "manager_only") {
    items.push({ text: "All expenses require manager approval", kind: "info" });
  } else if (approvalMode === "manager_then_accounting") {
    items.push({ text: "Expenses route through manager approval then accounting", kind: "info" });
  } else if (approvalMode === "threshold_based") {
    const t = approval.manager_threshold_amount;
    items.push({
      text: t
        ? `Expenses above ${t} route to managers; others proceed directly`
        : "Threshold-based routing is configured but no threshold amount is set",
      kind: t ? "info" : "warn",
    });
  } else {
    items.push({ text: "No approval routing is configured", kind: "warn" });
  }

  // Manager queue — only note when inactive (active is implied by routing above).
  if (!managerEnabled) {
    items.push({ text: "Manager queue will remain inactive", kind: "inactive" });
  }

  // Accounting queue.
  if (!accountingEnabled) {
    items.push({ text: "Accounting queue will remain inactive", kind: "inactive" });
  } else {
    const acctMode = accounting.accounting_review_mode ?? "";
    if (acctMode === "exception_based") {
      items.push({ text: "Accounting queue will receive exception items only", kind: "info" });
    } else if (acctMode === "all_expenses") {
      items.push({ text: "All approved expenses enter the accounting queue", kind: "info" });
    }
  }

  // Document validation gate.
  if (workflow.block_submit_on_failed_validation) {
    items.push({ text: "Submission blocked when documents fail validation", kind: "info" });
  }

  // Resubmission after rejection.
  if (approval.allow_resubmission_after_rejection) {
    items.push({ text: "Employees can resubmit after rejection", kind: "ok" });
  } else {
    items.push({ text: "Rejected expenses cannot be resubmitted", kind: "inactive" });
  }

  // Escalations — only when explicitly enabled.
  if (approval.escalate_policy_failures_to_accounting) {
    items.push({ text: "Policy violations escalate to accounting", kind: "info" });
  }
  if (approval.escalate_international_to_accounting) {
    items.push({ text: "International expenses escalate to accounting", kind: "info" });
  }

  // Póliza.
  if (accounting.poliza_required) {
    items.push({ text: "Póliza generation required for approved expenses", kind: "info" });
  }

  // Surface critical conflicts as an operational risk item.
  if (conflicts.some((c) => c.severity === "critical")) {
    items.push({ text: "Critical conflicts detected — routing may not behave as expected", kind: "warn" });
  }

  return items;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-1.5 text-[9px] font-bold uppercase tracking-widest text-white/20">
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
          <span className="rounded border border-white/[0.07] bg-white/[0.03] px-1 py-0 text-[9px] text-white/30">
            {count}
          </span>
          {open
            ? <ChevronDown className="h-2.5 w-2.5 text-white/20" />
            : <ChevronRight className="h-2.5 w-2.5 text-white/20" />
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
}: Props) {
  const [prompt, setPrompt]         = useState("");
  const [loading, setLoading]       = useState(false);
  const [result, setResult]         = useState<AnalyzeResponse | null>(null);
  const [apiError, setApiError]     = useState<string | null>(null);
  const [managerQueueCount, setManagerQueueCount]       = useState<number | null>(null);
  const [accountingQueueCount, setAccountingQueueCount] = useState<number | null>(null);
  const [applied, setApplied]       = useState(false);
  const [appliedSections, setAppliedSections] = useState<Set<keyof SuggestedPatches>>(new Set());
  const [categoriesApplying, setCategoriesApplying] = useState(false);
  const [categoriesApplied, setCategoriesApplied]   = useState(false);
  const [categoriesError, setCategoriesError]       = useState<string | null>(null);
  const [notes, setNotes]           = useState("");
  const [saving, setSaving]         = useState(false);
  const [saved, setSaved]           = useState(false);
  const [saveError, setSaveError]   = useState<string | null>(null);

  // Fetch queue counts non-blocking whenever portalConfig is available
  useEffect(() => {
    if (!portalConfig || !companyId) return;
    const derived = portalConfig?.derived;
    if (derived?.manager_flow_enabled) {
      fetch(`${API}/manager/queue/${companyId}`, { headers: { "X-User-Id": "1" } })
        .then((r) => r.ok ? r.json() : null)
        .then((d) => { if (d?.summary?.total_count != null) setManagerQueueCount(d.summary.total_count); })
        .catch(() => {});
    }
    if (derived?.accounting_flow_enabled) {
      fetch(`${API}/accounting/queue/${companyId}`, { headers: { "X-User-Id": "1" } })
        .then((r) => r.ok ? r.json() : null)
        .then((d) => { if (d?.summary?.total_count != null) setAccountingQueueCount(d.summary.total_count); })
        .catch(() => {});
    }
  }, [companyId, portalConfig]);

  const runAnalysis = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setLoading(true);
    setApiError(null);
    setResult(null);
    setApplied(false);
    setAppliedSections(new Set());
    setCategoriesApplied(false);
    setCategoriesError(null);
    setSaved(false);
    setSaveError(null);

    try {
      const body: Record<string, unknown> = { prompt: trimmed };
      if (portalConfig && Object.keys(portalConfig).length > 0) {
        body.current_portal_config = portalConfig;
      }
      const res = await fetch(
        `${API}/admin/setup-orchestrator/analyze/${companyId}`,
        {
          method:  "POST",
          headers: { "Content-Type": "application/json", "X-User-Id": "1" },
          body:    JSON.stringify(body),
        },
      );

      if (!res.ok) {
        setApiError(`Server returned ${res.status}`);
        return;
      }

      const data: AnalyzeResponse = await res.json();
      setResult(data);
      onAnalysisResult?.(data);
    } catch (err) {
      setApiError("Could not reach the server.");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = () => runAnalysis(prompt);

  const handleApply = () => {
    if (!result?.suggested_patches) return;
    onApplyPatch?.(result.suggested_patches);
    setApplied(true);
    setAppliedSections(new Set(PATCH_SECTIONS.map((s) => s.key)));
  };

  const handleApplyCategories = async () => {
    const cats = result?.generated_categories;
    if (!cats?.length) return;
    setCategoriesApplying(true);
    setCategoriesError(null);
    try {
      const res = await fetch(
        `${API}/admin/accounting-categories/apply/${companyId}`,
        {
          method:  "POST",
          headers: { "Content-Type": "application/json", "X-User-Id": "1" },
          body:    JSON.stringify({ items: cats }),
        },
      );
      if (!res.ok) {
        setCategoriesError(`Apply failed (${res.status})`);
      } else {
        setCategoriesApplied(true);
        onRefreshPortalConfig?.();
      }
    } catch {
      setCategoriesError("Could not reach server.");
    } finally {
      setCategoriesApplying(false);
    }
  };

  const handleApplySection = (key: keyof SuggestedPatches) => {
    if (!result?.suggested_patches) return;
    const patch: SuggestedPatches = {
      company_setup:    {},
      expense_policy:   {},
      accounting_setup: {},
      approval_setup:   {},
      workflow_setup:   {},
      [key]: result.suggested_patches[key],
    };
    onApplyPatch?.(patch);
    setAppliedSections((prev) => new Set([...prev, key]));
  };

  const handleSaveSummary = async () => {
    if (!result?.summary) return;
    setSaving(true);
    setSaveError(null);
    setSaved(false);
    try {
      const res = await fetch(`${API}/admin/company-setup/${companyId}`, {
        method:  "PUT",
        headers: { "Content-Type": "application/json", "X-User-Id": "1" },
        body:    JSON.stringify({
          ai_setup_last_summary: result.summary,
          ai_setup_notes:        notes.trim() || null,
        }),
      });
      if (!res.ok) {
        setSaveError(`Save failed (${res.status})`);
      } else {
        setSaved(true);
      }
    } catch {
      setSaveError("Could not reach server.");
    } finally {
      setSaving(false);
    }
  };

  const totalPatches = result
    ? PATCH_SECTIONS.reduce(
        (n, s) => n + Object.keys(result.suggested_patches[s.key] ?? {})
          .filter((k) => ALLOWED_PATCH_KEYS[s.key].has(k)).length,
        0,
      )
    : 0;

  const hasDiscardedKeys = result
    ? PATCH_SECTIONS.some(({ key }) =>
        Object.keys(result.suggested_patches[key] ?? {}).some(
          (k) => !ALLOWED_PATCH_KEYS[key].has(k),
        )
      )
    : false;

  const preflightConflicts: PortalConfigConflict[] = getPortalConfigConflicts(portalConfig);
  const impactItems = deriveOperationalImpact(portalConfig, result?.detected_conflicts ?? []);

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto px-1 py-1">

      {/* Header */}
      <div className="flex items-center gap-2">
        <Bot className="h-4 w-4 shrink-0 text-violet-400/55" />
        <span className="text-[11px] font-semibold text-white/45">Setup Orchestrator</span>
        <span className="ml-auto flex items-center gap-1.5">
          {managerQueueCount !== null && (
            <span className="rounded border border-white/[0.07] bg-white/[0.02] px-1.5 py-0.5 text-[8px] text-white/28">
              Mgr queue: {managerQueueCount}
            </span>
          )}
          {accountingQueueCount !== null && (
            <span className="rounded border border-white/[0.07] bg-white/[0.02] px-1.5 py-0.5 text-[8px] text-white/28">
              Acct queue: {accountingQueueCount}
            </span>
          )}
          <span className="rounded border border-violet-500/15 bg-violet-500/[0.06] px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-widest text-violet-300/40">
            AI
          </span>
        </span>
      </div>

      {/* Pre-flight: current config conflicts — shown until an AI result is loaded */}
      {!result && preflightConflicts.length > 0 && (
        <CollapsibleSection
          label="Current config issues"
          count={preflightConflicts.length}
          defaultOpen={preflightConflicts.some((c) => c.severity === "critical")}
        >
          {preflightConflicts.map((c, i) => (
            <div
              key={i}
              className={`flex items-start gap-2 rounded border px-3 py-2 ${
                c.severity === "critical"
                  ? "border-red-500/25 bg-red-500/[0.07]"
                  : "border-amber-500/[0.10] bg-amber-500/[0.025]"
              }`}
            >
              {c.severity === "critical"
                ? <AlertCircle   className="mt-0.5 h-3 w-3 shrink-0 text-red-400/70" />
                : <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-amber-400/40" />
              }
              <p className={`text-[10px] leading-snug ${
                c.severity === "critical"
                  ? "font-medium text-red-300/75"
                  : "text-amber-300/50"
              }`}>
                {c.message}
              </p>
            </div>
          ))}
        </CollapsibleSection>
      )}

      {/* A — Company understanding prompt */}
      <div className="space-y-1.5">
        <textarea
          rows={4}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSubmit(); }
          }}
          placeholder="Describe your company, expense process, accounting controls, legal entities, and approval structure…"
          className="w-full resize-none rounded border border-white/[0.08] bg-white/[0.03] px-2.5 py-2 text-[10px] text-white/55 placeholder-white/18 outline-none focus:border-violet-500/35"
        />

        {/* B — Analyze button */}
        <button
          type="button"
          onClick={handleSubmit}
          disabled={loading || !prompt.trim()}
          className="inline-flex w-full items-center justify-center gap-1.5 rounded border border-violet-500/25 bg-violet-600/15 px-3 py-1.5 text-[10px] font-semibold text-violet-300/70 transition-colors hover:bg-violet-600/25 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {loading
            ? <><Loader2 className="h-3 w-3 animate-spin" /> Analysing…</>
            : <><Zap className="h-3 w-3" /> Analyse setup</>
          }
        </button>
      </div>

      {/* API error */}
      {apiError && !loading && (
        <div className="rounded border border-red-500/15 bg-red-500/[0.04] px-3 py-2">
          <p className="text-[10px] text-red-300/55">{apiError}</p>
        </div>
      )}

      {result && (
        <div className="space-y-4">

          {/* C — Analysis summary */}
          <div className="space-y-1.5">
            <SectionLabel>Analysis summary</SectionLabel>
            <div className="rounded border border-white/[0.07] bg-white/[0.02] px-3 py-2.5 space-y-2">
              <p className="text-[10px] leading-relaxed text-white/45">{result.summary}</p>

              <div className="flex flex-wrap items-center gap-2 pt-0.5">
                {/* Company type */}
                {result.company_profile.company_type && (
                  <span className="rounded border border-white/[0.08] bg-white/[0.02] px-2 py-0.5 text-[9px] text-white/35">
                    {result.company_profile.company_type}
                  </span>
                )}
                {/* Complexity badge */}
                <span
                  className={`rounded border px-2 py-0.5 text-[9px] font-semibold capitalize ${
                    COMPLEXITY_COLOR[result.company_profile.complexity] ?? COMPLEXITY_COLOR.simple
                  }`}
                >
                  {result.company_profile.complexity}
                </span>
              </div>

              {result.company_profile.notes.length > 0 && (
                <ul className="space-y-0.5 pt-0.5">
                  {result.company_profile.notes.map((n, i) => (
                    <li key={i} className="flex items-start gap-1.5 text-[10px] text-white/35">
                      <span className="mt-0.5 text-white/18">·</span>
                      {n}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* C2 — Operational impact */}
          {impactItems.length > 0 && (
            <div>
              <SectionLabel>Operational impact</SectionLabel>
              <div className="rounded border border-white/[0.07] bg-white/[0.02] px-3 py-2 space-y-1">
                {impactItems.map((item, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <span
                      className={`mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full ${
                        item.kind === "ok"       ? "bg-emerald-400/50" :
                        item.kind === "warn"     ? "bg-amber-400/55"   :
                        item.kind === "inactive" ? "bg-white/14"       :
                                                   "bg-white/22"
                      }`}
                    />
                    <p
                      className={`text-[10px] leading-snug ${
                        item.kind === "ok"       ? "text-emerald-300/60" :
                        item.kind === "warn"     ? "text-amber-300/55"   :
                        item.kind === "inactive" ? "text-white/28"       :
                                                   "text-white/42"
                      }`}
                    >
                      {item.text}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* D — Detected conflicts */}
          <CollapsibleSection
            label="Detected conflicts"
            count={result.detected_conflicts.length}
            defaultOpen
          >
            {result.detected_conflicts.map((c, i) => {
              const fixHint = getFixHint(c, result.suggested_patches);
              return (
                <div
                  key={i}
                  className={`flex items-start gap-2 rounded border px-3 py-2 ${
                    c.severity === "critical"
                      ? "border-red-500/25 bg-red-500/[0.07]"
                      : "border-amber-500/[0.10] bg-amber-500/[0.025]"
                  }`}
                >
                  {c.severity === "critical"
                    ? <AlertCircle   className="mt-0.5 h-3 w-3 shrink-0 text-red-400/70" />
                    : <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-amber-400/40" />
                  }
                  <div className="min-w-0 space-y-0.5">
                    <p className="text-[9px] font-mono text-white/22">{c.code}</p>
                    <p className={`text-[10px] leading-snug ${
                      c.severity === "critical"
                        ? "font-medium text-red-300/75"
                        : "text-amber-300/50"
                    }`}>
                      {c.message}
                    </p>
                    {fixHint && (
                      <p className="text-[9px] italic text-white/28">
                        Fix direction: {fixHint}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </CollapsibleSection>

          {/* E — Missing decisions */}
          <CollapsibleSection
            label="Missing decisions"
            count={result.missing_decisions.length}
            defaultOpen
          >
            {result.missing_decisions.map((d, i) => (
              <div
                key={i}
                className="rounded border border-white/[0.07] bg-white/[0.02] px-3 py-2.5 space-y-1.5"
              >
                <div className="flex items-start gap-2">
                  <HelpCircle className="mt-0.5 h-3 w-3 shrink-0 text-indigo-400/40" />
                  <div className="space-y-1">
                    <p className="text-[9px] font-mono text-white/22">{d.key}</p>
                    <p className="text-[10px] leading-snug text-white/45">{d.question}</p>
                  </div>
                </div>
                {d.suggested_options.length > 0 && (
                  <div className="flex flex-wrap gap-1 pl-5">
                    {d.suggested_options.map((opt, j) => (
                      <span
                        key={j}
                        className="rounded border border-white/[0.06] bg-white/[0.02] px-2 py-0.5 text-[9px] text-white/28"
                      >
                        {opt}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </CollapsibleSection>

          {/* Recommended next questions (if any, no section header duplication) */}
          {result.recommended_next_questions.length > 0 && (
            <div>
              <SectionLabel>Recommended next questions</SectionLabel>
              <ul className="space-y-1">
                {result.recommended_next_questions.map((q, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-[10px] text-white/35">
                    <span className="mt-0.5 text-white/18">·</span>
                    {q}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* F1 — Generated categories */}
          {(result.generated_categories?.length ?? 0) > 0 && (
            <div className="space-y-1.5">
              <SectionLabel>Generated accounting categories</SectionLabel>
              <div className="overflow-hidden rounded border border-white/[0.07] bg-white/[0.02]">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-white/[0.05]">
                      <th className="px-3 py-1.5 text-left text-[9px] font-bold uppercase tracking-widest text-white/20">Code</th>
                      <th className="px-3 py-1.5 text-left text-[9px] font-bold uppercase tracking-widest text-white/20">Account</th>
                      <th className="px-3 py-1.5 text-left text-[9px] font-bold uppercase tracking-widest text-white/20">Proj req.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.generated_categories!.map((cat, i) => (
                      <tr key={i} className="border-b border-white/[0.04] last:border-0">
                        <td className="px-3 py-1.5 font-mono text-[10px] text-white/55">{cat.code}</td>
                        <td className="px-3 py-1.5 text-[10px] text-white/38">{cat.expense_account_code ?? <span className="text-white/18">—</span>}</td>
                        <td className="px-3 py-1.5 text-[10px] text-white/38">{cat.requires_project ? "Yes" : "No"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button
                type="button"
                onClick={handleApplyCategories}
                disabled={categoriesApplying || categoriesApplied}
                className="inline-flex w-full items-center justify-center gap-1.5 rounded border border-white/[0.1] bg-white/[0.04] px-3 py-1.5 text-[10px] font-semibold text-white/55 transition-colors hover:bg-white/[0.07] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {categoriesApplying
                  ? <><Loader2 className="h-3 w-3 animate-spin" /> Applying…</>
                  : categoriesApplied
                  ? <><CheckCircle2 className="h-3 w-3 text-emerald-400/60" /> Categories applied</>
                  : "Apply categories"
                }
              </button>
              {categoriesError && (
                <p className="text-[10px] text-red-400/60">{categoriesError}</p>
              )}
            </div>
          )}

          {/* F — Suggested patches grouped by domain */}
          {hasDiscardedKeys && (
            <p className="text-[9px] text-white/22 italic">
              Some AI suggestions were ignored because they do not match the current platform schema.
            </p>
          )}
          {totalPatches > 0 && (
            <div className="space-y-1.5">
              <SectionLabel>Suggested patches</SectionLabel>
              {PATCH_SECTIONS.map(({ key, label }) => {
                const allowed = ALLOWED_PATCH_KEYS[key];
                const entries = Object.entries(result.suggested_patches[key] ?? {})
                  .filter(([field]) => allowed.has(field));
                if (entries.length === 0) return null;
                const sectionApplied = appliedSections.has(key);
                return (
                  <div key={key} className="overflow-hidden rounded border border-white/[0.07] bg-white/[0.02]">
                    <div className="flex items-center justify-between border-b border-white/[0.05] px-3 py-1.5">
                      <p className="text-[9px] font-bold uppercase tracking-widest text-white/22">{label}</p>
                      <button
                        type="button"
                        onClick={() => handleApplySection(key)}
                        disabled={sectionApplied}
                        className="text-[9px] font-medium text-violet-300/55 transition-colors hover:text-violet-300/80 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {sectionApplied ? "Applied" : "Apply this patch"}
                      </button>
                    </div>
                    <table className="w-full">
                      <tbody>
                        {entries.map(([field, value]) => (
                          <tr key={field} className="border-b border-white/[0.04] last:border-0">
                            <td className="px-3 py-1.5 text-[10px] text-white/32">
                              {field.replace(/_/g, " ")}
                            </td>
                            <td className="px-3 py-1.5 text-right text-[10px] font-medium text-white/55">
                              {patchValueLabel(value)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                );
              })}
            </div>
          )}

          {/* G — Apply all / apply draft button */}
          {totalPatches > 0 && (
            <button
              type="button"
              onClick={handleApply}
              disabled={applied}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded border border-violet-500/25 bg-violet-600/15 px-3 py-1.5 text-[10px] font-semibold text-violet-300/70 transition-colors hover:bg-violet-600/25 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {applied
                ? <><CheckCircle2 className="h-3 w-3 text-emerald-400/60" /> All drafts applied</>
                : <><Zap className="h-3 w-3" /> Apply all drafts</>
              }
            </button>
          )}

          {/* H — Save summary + notes to company setup */}
          <div className="space-y-1.5 border-t border-white/[0.06] pt-3">
            <SectionLabel>Save to company setup</SectionLabel>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => { setNotes(e.target.value); setSaved(false); }}
              placeholder="Optional notes for this setup session…"
              className="w-full resize-none rounded border border-white/[0.08] bg-white/[0.03] px-2.5 py-2 text-[10px] text-white/55 placeholder-white/18 outline-none focus:border-violet-500/35"
            />
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleSaveSummary}
                disabled={saving || saved}
                className="inline-flex items-center gap-1.5 rounded border border-white/[0.1] bg-white/[0.04] px-3 py-1.5 text-[10px] font-semibold text-white/55 transition-colors hover:bg-white/[0.07] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving
                  ? <><Loader2 className="h-3 w-3 animate-spin" /> Saving…</>
                  : saved
                  ? <><CheckCircle2 className="h-3 w-3 text-emerald-400/60" /> Saved</>
                  : "Save summary + notes"
                }
              </button>
              {saveError && (
                <p className="text-[10px] text-red-400/60">{saveError}</p>
              )}
            </div>
          </div>

        </div>
      )}

    </div>
  );
}
