"use client";

import { useState, useEffect, useRef } from "react";
import { Save, Loader2, CheckCircle2, Sparkles, AlertTriangle, AlertCircle } from "lucide-react";
import {
  getPortalConfigConflicts,
  type PortalConfigConflict,
} from "@/lib/portal-config-conflicts";

const API = process.env.NEXT_PUBLIC_API_BASE_URL;

interface Props {
  companyId: number;
  setup: any;
  companySetup?: any;
  expensePolicy?: any;
  accountingSetup?: any;
  approvalSetup?: any;
  onSaved?: (setup: any) => void;
  draftPatch?: Partial<any>;
}

// ── Option sets ───────────────────────────────────────────────────────────────

const WORKFLOW_MODE_OPTIONS = [
  { value: "standard",               label: "Standard" },
  { value: "manager_only",           label: "Manager only" },
  { value: "accounting_only",        label: "Accounting only" },
  { value: "manager_then_accounting",label: "Manager then accounting" },
  { value: "direct_accounting",      label: "Direct to accounting" },
  { value: "policy_driven",          label: "Policy-driven" },
];

const ROUTE_TO_OPTIONS = [
  { value: "manager",    label: "Manager" },
  { value: "accounting", label: "Accounting" },
  { value: "employee",   label: "Employee" },
  { value: "none",       label: "None" },
];

// ── Conflict codes relevant to the Workflow section ─────────────────────────

const WORKFLOW_CODES = new Set([
  "MANAGER_WORKFLOW_NO_MANAGERS",
  "ROUTE_POLICY_FAILURES_NO_MANAGERS",
  "ROUTE_MISSING_DOCS_NO_MANAGERS",
  "INTL_ROUTING_INTL_DISABLED",
  "TICKETS_DISABLED_POLICY_ROUTE",
  "TICKETS_DISABLED_INTL_ROUTE",
  "ACCOUNTING_DISABLED_REVIEW_ACTIVE",
  "ROUTE_TO_ACCOUNTING_MODULE_DISABLED",
]);

// Local-only warnings the shared lib can't detect from portal config alone
function buildLocalWarnings(
  form: Record<string, any>,
  expensePolicy?: any,
  accountingSetup?: any,
  approvalSetup?: any,
): string[] {
  const w: string[] = [];

  const mode = form.default_expense_workflow_mode ?? "standard";

  // Accounting-routing mode but accounting review is disabled
  const needsAccounting = ["accounting_only", "manager_then_accounting", "direct_accounting"].includes(mode);
  if (needsAccounting && accountingSetup?.accounting_review_mode === "none")
    w.push("Workflow mode routes to accounting, but accounting review mode is set to \u2018none\u2019 in Accounting Setup.");

  // Auto-submit without validation block
  if (form.auto_submit_on_complete_upload && !form.block_submit_on_failed_validation)
    w.push("Auto-submit on upload is enabled but failed validation will not block submission \u2014 invalid documents may be submitted automatically.");

  // Allow submit with warnings while strict document rules are in place
  const strictDocPolicy =
    expensePolicy?.xml_required_mode === "always" ||
    expensePolicy?.pdf_pair_required_for_cfdi === true ||
    !expensePolicy?.tickets_allowed;
  if (form.allow_submit_with_warnings && strictDocPolicy)
    w.push("Submit with warnings is allowed, but the expense policy enforces strict document requirements \u2014 employees may bypass incomplete document checks.");

  // Validation not blocked while strict approval/accounting controls are active
  const strictControls =
    approvalSetup?.require_accounting_for_all_expenses === true ||
    accountingSetup?.accounting_review_mode === "always" ||
    accountingSetup?.poliza_required === true;
  if (!form.block_submit_on_failed_validation && strictControls)
    w.push("Validation failure does not block submission, but strict accounting or approval controls are active \u2014 invalid expenses may reach accounting review.");

  // Routing missing docs to none while strict policy active
  if (form.route_missing_documents_to === "none" && strictDocPolicy)
    w.push("Missing document routing is set to \u2018none\u2019, but the expense policy enforces strict XML or PDF requirements \u2014 missing documents will not be flagged to any reviewer.");

  // Policy failures to none
  if (form.route_policy_failures_to === "none")
    w.push("Policy failure routing is set to \u2018none\u2019 \u2014 policy-violating reports will not be escalated to any reviewer.");

  // Policy-driven mode with no reviewers
  if (mode === "policy_driven" && approvalSetup?.approval_mode === "none" && accountingSetup?.accounting_review_mode === "none")
    w.push("Policy-driven workflow mode is selected, but neither approval mode nor accounting review mode is configured \u2014 the workflow has no active reviewers.");

  return w;
}

// ── Summary builder ───────────────────────────────────────────────────────────

function buildSummary(form: Record<string, any>): string {
  const parts: string[] = [];
  const modeLabel = WORKFLOW_MODE_OPTIONS.find((o) => o.value === form.default_expense_workflow_mode)?.label;
  if (modeLabel) parts.push(modeLabel);
  if (form.auto_submit_on_complete_upload) parts.push("auto-submit on upload");
  if (form.block_submit_on_failed_validation) parts.push("blocks on failure");
  if (form.allow_submit_with_warnings) parts.push("allows warnings");
  const routes: string[] = [];
  if (form.route_policy_failures_to && form.route_policy_failures_to !== "none")
    routes.push(`policy→${form.route_policy_failures_to}`);
  if (form.route_missing_documents_to && form.route_missing_documents_to !== "none")
    routes.push(`missing docs→${form.route_missing_documents_to}`);
  if (form.route_international_expenses_to && form.route_international_expenses_to !== "none")
    routes.push(`intl→${form.route_international_expenses_to}`);
  if (routes.length) parts.push(routes.join(", "));
  if (form.ai_workflow_assist_enabled) parts.push("AI assist on");
  return parts.join(" · ") || "No workflow configuration set.";
}

// ── Shared sub-components ─────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-1 px-1 text-[9px] font-bold uppercase tracking-widest text-white/22">
      {children}
    </p>
  );
}

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-lg border border-white/[0.07] bg-white/[0.02] divide-y divide-white/[0.05]">
      {children}
    </div>
  );
}

function SelectRow({
  label,
  description,
  value,
  options,
  onChange,
}: {
  label: string;
  description?: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-medium text-white/68">{label}</p>
        {description && <p className="text-[10px] text-white/28">{description}</p>}
      </div>
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        className="shrink-0 rounded border border-white/[0.08] bg-zinc-900 px-2 py-1 text-[10px] text-white/55 outline-none focus:border-indigo-500/40"
      >
        <option value="">—</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-medium text-white/68">{label}</p>
        {description && <p className="text-[10px] text-white/28">{description}</p>}
      </div>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-4 w-7 shrink-0 cursor-pointer rounded-full border transition-colors ${
          checked
            ? "border-indigo-500/40 bg-indigo-600/30"
            : "border-white/[0.1] bg-white/[0.04]"
        }`}
      >
        <span
          className={`absolute top-0.5 h-3 w-3 rounded-full transition-transform ${
            checked ? "translate-x-3 bg-indigo-400" : "translate-x-0.5 bg-white/20"
          }`}
        />
      </button>
    </div>
  );
}

function TextareaRow({
  label,
  description,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  description?: string;
  value: string;
  placeholder?: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5 px-4 py-2.5">
      <div>
        <p className="text-[11px] font-medium text-white/68">{label}</p>
        {description && <p className="text-[10px] text-white/28">{description}</p>}
      </div>
      <textarea
        rows={2}
        value={value ?? ""}
        placeholder={placeholder ?? "—"}
        onChange={(e) => onChange(e.target.value)}
        className="w-full resize-none rounded border border-white/[0.08] bg-zinc-900 px-2 py-1.5 text-[10px] text-white/55 placeholder:text-white/20 outline-none focus:border-indigo-500/40"
      />
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function AdminWorkflowSetupStudio({
  companyId,
  setup,
  companySetup,
  expensePolicy,
  accountingSetup,
  approvalSetup,
  onSaved,
  draftPatch,
}: Props) {
  const [form, setForm]           = useState<Record<string, any>>({ ...setup });
  const [dirty, setDirty]         = useState(false);
  const [saving, setSaving]       = useState(false);
  const [saved, setSaved]         = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [aiDrafted, setAiDrafted] = useState(false);
  const prevDraftRef              = useRef<Partial<any> | undefined>(undefined);

  useEffect(() => {
    setForm({ ...setup });
    setDirty(false);
    setSaved(false);
    setAiDrafted(false);
  }, [setup]);

  useEffect(() => {
    if (!draftPatch || draftPatch === prevDraftRef.current) return;
    prevDraftRef.current = draftPatch;
    setForm((prev) => ({ ...prev, ...draftPatch }));
    setDirty(true);
    setSaved(false);
    setAiDrafted(true);
  }, [draftPatch]);

  const set = (key: string, value: any) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
    setSaved(false);
    setError(null);
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch(`${API}/admin/workflow-setup/${companyId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", "X-User-Id": "1" },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      const updated = await res.json();
      setDirty(false);
      setSaved(true);
      setAiDrafted(false);
      onSaved?.(updated);
    } catch (e: any) {
      setError(e?.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const localWarnings = buildLocalWarnings(form, expensePolicy, accountingSetup, approvalSetup);

  // Cross-domain conflicts — use live form as workflow_setup
  const configConflicts: PortalConfigConflict[] = getPortalConfigConflicts({
    company_setup:    companySetup    ?? {},
    expense_policy:   expensePolicy   ?? {},
    accounting_setup: accountingSetup ?? {},
    approval_setup:   approvalSetup   ?? {},
    workflow_setup:   form,
  }).filter((c) => WORKFLOW_CODES.has(c.code));

  return (
    <div className="max-w-2xl space-y-5">

      {/* Summary banner */}
      <div className="rounded-lg border border-white/[0.07] bg-white/[0.02] px-4 py-2.5">
        <div className="flex items-start justify-between gap-3">
          <p className="text-[10px] leading-relaxed text-white/35">{buildSummary(form)}</p>
          {aiDrafted && (
            <span className="flex shrink-0 items-center gap-1 rounded border border-indigo-500/20 bg-indigo-500/[0.06] px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-widest text-indigo-300/50">
              <Sparkles className="h-2.5 w-2.5" /> AI Draft
            </span>
          )}
        </div>
      </div>

      {/* Cross-domain config conflicts */}
      {configConflicts.length > 0 && (
        <div className="space-y-1.5">
          {configConflicts.map((c, i) => (
            <div
              key={i}
              className={`flex items-start gap-2 rounded border px-3 py-2 ${
                c.severity === "critical"
                  ? "border-red-500/15 bg-red-500/[0.04]"
                  : "border-amber-500/15 bg-amber-500/[0.04]"
              }`}
            >
              {c.severity === "critical"
                ? <AlertCircle   className="mt-0.5 h-3 w-3 shrink-0 text-red-400/55" />
                : <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-amber-400/55" />
              }
              <p className={`text-[10px] leading-relaxed ${
                c.severity === "critical" ? "text-red-300/60" : "text-amber-300/55"
              }`}>{c.message}</p>
            </div>
          ))}
        </div>
      )}

      {/* Local setup warnings */}
      {localWarnings.length > 0 && (
        <div className="space-y-1.5">
          {localWarnings.map((w, i) => (
            <div key={i} className="flex items-start gap-2 rounded border border-amber-500/15 bg-amber-500/[0.04] px-3 py-2">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-amber-400/55" />
              <p className="text-[10px] leading-relaxed text-amber-300/55">{w}</p>
            </div>
          ))}
        </div>
      )}

      {/* A — Workflow Mode */}
      <div>
        <SectionLabel>A — Workflow Mode</SectionLabel>
        <Panel>
          <SelectRow
            label="Default expense workflow mode"
            description="How expense reports flow through the system by default"
            value={form.default_expense_workflow_mode ?? "standard"}
            options={WORKFLOW_MODE_OPTIONS}
            onChange={(v) => set("default_expense_workflow_mode", v)}
          />
          <ToggleRow
            label="Auto-submit on complete upload"
            description="Automatically submit an expense when all required documents are uploaded"
            checked={!!form.auto_submit_on_complete_upload}
            onChange={(v) => set("auto_submit_on_complete_upload", v)}
          />
          <ToggleRow
            label="Auto-assign review stage"
            description="Automatically move expenses to the appropriate review stage on submission"
            checked={!!form.auto_assign_review_stage}
            onChange={(v) => set("auto_assign_review_stage", v)}
          />
        </Panel>
      </div>

      {/* B — Submission Controls */}
      <div>
        <SectionLabel>B — Submission Controls</SectionLabel>
        <Panel>
          <ToggleRow
            label="Block submit on failed validation"
            description="Prevent submission if the expense document fails validation"
            checked={!!form.block_submit_on_failed_validation}
            onChange={(v) => set("block_submit_on_failed_validation", v)}
          />
          <ToggleRow
            label="Allow submit with warnings"
            description="Employees may submit even when validation warnings are present"
            checked={!!form.allow_submit_with_warnings}
            onChange={(v) => set("allow_submit_with_warnings", v)}
          />
          <ToggleRow
            label="Allow draft save"
            description="Employees can save incomplete expenses as drafts before submitting"
            checked={!!form.allow_draft_save}
            onChange={(v) => set("allow_draft_save", v)}
          />
          <ToggleRow
            label="Allow resubmit after return"
            description="Employees can correct and resubmit expenses returned by a reviewer"
            checked={!!form.allow_resubmit_after_return}
            onChange={(v) => set("allow_resubmit_after_return", v)}
          />
        </Panel>
      </div>

      {/* C — Routing Rules */}
      <div>
        <SectionLabel>C — Routing Rules</SectionLabel>
        <Panel>
          <SelectRow
            label="Route policy failures to"
            description="Who receives expenses that violate policy rules"
            value={form.route_policy_failures_to ?? "accounting"}
            options={ROUTE_TO_OPTIONS}
            onChange={(v) => set("route_policy_failures_to", v)}
          />
          <SelectRow
            label="Route missing documents to"
            description="Who receives expenses with incomplete document sets"
            value={form.route_missing_documents_to ?? "employee"}
            options={ROUTE_TO_OPTIONS}
            onChange={(v) => set("route_missing_documents_to", v)}
          />
          <SelectRow
            label="Route international expenses to"
            description="Who reviews cross-border or foreign-currency expenses"
            value={form.route_international_expenses_to ?? "accounting"}
            options={ROUTE_TO_OPTIONS}
            onChange={(v) => set("route_international_expenses_to", v)}
          />
        </Panel>
      </div>

      {/* D — Employee Guidance */}
      <div>
        <SectionLabel>D — Employee Guidance</SectionLabel>
        <Panel>
          <ToggleRow
            label="Show next-action guidance"
            description="Display contextual hints to employees about what to do next with an expense"
            checked={!!form.show_next_action_guidance}
            onChange={(v) => set("show_next_action_guidance", v)}
          />
        </Panel>
      </div>

      {/* E — AI Assistance */}
      <div>
        <SectionLabel>E — AI Assistance</SectionLabel>
        <Panel>
          <ToggleRow
            label="AI workflow assist enabled"
            description="AI provides routing suggestions and next-action recommendations"
            checked={!!form.ai_workflow_assist_enabled}
            onChange={(v) => set("ai_workflow_assist_enabled", v)}
          />
          <TextareaRow
            label="AI workflow notes"
            description="Custom instructions for AI workflow behaviour"
            value={form.ai_workflow_notes ?? ""}
            placeholder="Optional notes for AI workflow logic…"
            onChange={(v) => set("ai_workflow_notes", v || null)}
          />
        </Panel>
      </div>

      {/* Save bar */}
      {error && (
        <p className="text-[10px] text-red-400/70">{error}</p>
      )}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={saving || !dirty}
          className="flex items-center gap-1.5 rounded border border-indigo-500/30 bg-indigo-600/20 px-4 py-1.5 text-[10px] font-semibold text-indigo-300 transition-colors hover:bg-indigo-600/30 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
          Save workflow setup
        </button>
        {saved && !dirty && (
          <span className="flex items-center gap-1 text-[10px] text-emerald-400/60">
            <CheckCircle2 className="h-3 w-3" /> Saved
          </span>
        )}
      </div>

    </div>
  );
}
