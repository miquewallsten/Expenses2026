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
  accountingSetup?: any;
  expensePolicy?: any;
  onSaved?: (setup: any) => void;
  draftPatch?: Partial<any>;
}

// ── Conflict codes relevant to the Approval section ─────────────────────────

const APPROVAL_CODES = new Set([
  "MANAGER_FLOW_NO_MANAGERS",
  "REQUIRE_MANAGER_ALL_NO_MANAGERS",
  "EXPENSE_POLICY_MANAGER_APPROVAL_NO_MANAGERS",
  "ESCALATE_MISSING_DOCS_NO_MANAGERS",
  "APPROVALS_ENABLED_NO_MODE",
  "THRESHOLD_APPROVAL_NO_THRESHOLD",
  "INTL_ESCALATION_INTL_DISABLED",
  "INTL_ROUTING_INTL_DISABLED",
]);

// Local-only warnings the shared lib can't detect from portal config alone
function buildLocalWarnings(
  form: Record<string, any>,
  accountingSetup?: any,
): string[] {
  const w: string[] = [];

  const mode = form.approval_mode ?? "none";
  const needsAccounting = ["accounting_only", "manager_then_accounting", "threshold_based"].includes(mode);

  if (needsAccounting && accountingSetup?.accounting_review_mode === "none")
    w.push("Approval mode routes to accounting, but accounting review mode is set to \u2018none\u2019 in Accounting Setup.");

  if (form.require_manager_for_all_employees && form.allow_self_submission_without_manager)
    w.push("Manager is required for all employees, but self-submission without a manager is also allowed \u2014 these settings conflict.");

  if (form.escalate_policy_failures_to_accounting && accountingSetup?.accounting_review_mode === "none")
    w.push("Policy failures are set to escalate to accounting, but accounting review mode is \u2018none\u2019 \u2014 escalations will have no reviewer.");

  return w;
}

// ── Option sets ───────────────────────────────────────────────────────────────

const APPROVAL_MODE_OPTIONS = [
  { value: "none",                       label: "None — no approval required" },
  { value: "manager_only",               label: "Manager only" },
  { value: "accounting_only",            label: "Accounting only" },
  { value: "manager_then_accounting",    label: "Manager then accounting" },
  { value: "threshold_based",            label: "Threshold-based" },
];

// ── Summary builder ───────────────────────────────────────────────────────────

function buildSummary(form: Record<string, any>): string {
  const parts: string[] = [];
  const modeLabel = APPROVAL_MODE_OPTIONS.find((o) => o.value === form.approval_mode)?.label;
  if (modeLabel) parts.push(modeLabel);
  if (form.approval_mode === "threshold_based") {
    if (form.manager_threshold_amount != null)
      parts.push(`manager threshold ${form.manager_threshold_amount}`);
    if (form.accounting_threshold_amount != null)
      parts.push(`accounting threshold ${form.accounting_threshold_amount}`);
  }
  const escalations: string[] = [];
  if (form.escalate_policy_failures_to_accounting) escalations.push("policy failures");
  if (form.escalate_international_to_accounting)   escalations.push("international");
  if (form.escalate_missing_documents_to_manager)  escalations.push("missing docs");
  if (escalations.length) parts.push(`escalates: ${escalations.join(", ")}`);
  if (form.ai_approval_assist_enabled) parts.push("AI assist on");
  return parts.join(" · ") || "No approval routing configured.";
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

function NumberRow({
  label,
  description,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  description?: string;
  value: number | null;
  placeholder?: string;
  onChange: (v: number | null) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-medium text-white/68">{label}</p>
        {description && <p className="text-[10px] text-white/28">{description}</p>}
      </div>
      <input
        type="number"
        value={value ?? ""}
        placeholder={placeholder ?? "—"}
        onChange={(e) => {
          const v = e.target.value;
          onChange(v === "" ? null : parseFloat(v));
        }}
        className="w-32 shrink-0 rounded border border-white/[0.08] bg-zinc-900 px-2 py-1 text-[10px] text-white/55 placeholder:text-white/20 outline-none focus:border-indigo-500/40"
      />
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

export default function AdminApprovalSetupStudio({
  companyId,
  setup,
  companySetup,
  accountingSetup,
  expensePolicy,
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
      const res = await fetch(`${API}/admin/approval-setup/${companyId}`, {
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

  const isThreshold = form.approval_mode === "threshold_based";
  const localWarnings = buildLocalWarnings(form, accountingSetup);

  // Cross-domain conflicts — use live form as approval_setup
  const configConflicts: PortalConfigConflict[] = getPortalConfigConflicts({
    company_setup:    companySetup    ?? {},
    expense_policy:   expensePolicy   ?? {},
    accounting_setup: accountingSetup ?? {},
    approval_setup:   form,
    workflow_setup:   {},
  }).filter((c) => APPROVAL_CODES.has(c.code));

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

      {/* A — Approval Routing */}
      <div>
        <SectionLabel>A — Approval Routing</SectionLabel>
        <Panel>
          <SelectRow
            label="Approval mode"
            description="How expense reports are routed for approval"
            value={form.approval_mode ?? "none"}
            options={APPROVAL_MODE_OPTIONS}
            onChange={(v) => set("approval_mode", v)}
          />
          {isThreshold && (
            <>
              <NumberRow
                label="Manager threshold amount"
                description="Expenses at or above this amount require manager approval"
                value={form.manager_threshold_amount ?? null}
                placeholder="e.g. 5000"
                onChange={(v) => set("manager_threshold_amount", v)}
              />
              <NumberRow
                label="Accounting threshold amount"
                description="Expenses at or above this amount require accounting review"
                value={form.accounting_threshold_amount ?? null}
                placeholder="e.g. 10000"
                onChange={(v) => set("accounting_threshold_amount", v)}
              />
            </>
          )}
        </Panel>
      </div>

      {/* B — Default Review Rules */}
      <div>
        <SectionLabel>B — Default Review Rules</SectionLabel>
        <Panel>
          <ToggleRow
            label="Require manager for all employees"
            description="All employees must have a manager assigned for approval"
            checked={!!form.require_manager_for_all_employees}
            onChange={(v) => set("require_manager_for_all_employees", v)}
          />
          <ToggleRow
            label="Require accounting for all expenses"
            description="Every expense report goes through accounting review"
            checked={!!form.require_accounting_for_all_expenses}
            onChange={(v) => set("require_accounting_for_all_expenses", v)}
          />
          <ToggleRow
            label="Allow self-submission without manager"
            description="Employees without a manager can still submit expense reports"
            checked={!!form.allow_self_submission_without_manager}
            onChange={(v) => set("allow_self_submission_without_manager", v)}
          />
          <ToggleRow
            label="Allow resubmission after rejection"
            description="Employees can correct and resubmit rejected reports"
            checked={!!form.allow_resubmission_after_rejection}
            onChange={(v) => set("allow_resubmission_after_rejection", v)}
          />
        </Panel>
      </div>

      {/* C — Escalation Rules */}
      <div>
        <SectionLabel>C — Escalation Rules</SectionLabel>
        <Panel>
          <ToggleRow
            label="Escalate policy failures to accounting"
            description="Reports with policy violations are routed to accounting"
            checked={!!form.escalate_policy_failures_to_accounting}
            onChange={(v) => set("escalate_policy_failures_to_accounting", v)}
          />
          <ToggleRow
            label="Escalate international expenses to accounting"
            description="Foreign-currency or cross-border expenses require accounting review"
            checked={!!form.escalate_international_to_accounting}
            onChange={(v) => set("escalate_international_to_accounting", v)}
          />
          <ToggleRow
            label="Escalate missing documents to manager"
            description="Reports with missing attachments are flagged to the manager"
            checked={!!form.escalate_missing_documents_to_manager}
            onChange={(v) => set("escalate_missing_documents_to_manager", v)}
          />
        </Panel>
      </div>

      {/* D — AI Assistance */}
      <div>
        <SectionLabel>D — AI Assistance</SectionLabel>
        <Panel>
          <ToggleRow
            label="AI approval assist enabled"
            description="AI suggests approval decisions based on policy and history"
            checked={!!form.ai_approval_assist_enabled}
            onChange={(v) => set("ai_approval_assist_enabled", v)}
          />
          <TextareaRow
            label="AI approval notes"
            description="Custom instructions for AI approval behaviour"
            value={form.ai_approval_notes ?? ""}
            placeholder="Optional notes for AI approval logic…"
            onChange={(v) => set("ai_approval_notes", v || null)}
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
          Save approval setup
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
