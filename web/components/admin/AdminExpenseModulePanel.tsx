"use client";

import { useState, useEffect, useRef } from "react";
import { Save, Loader2, CheckCircle2, AlertCircle, Sparkles, AlertTriangle } from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_BASE_URL;

interface Props {
  companyId: number;
  policy: any;
  onSaved?: (updatedPolicy: any) => void;
  draftPatch?: Partial<any>;
}

// ── Option sets ───────────────────────────────────────────────────────────────

const XML_MODE_OPTIONS = [
  { value: "never",    label: "Never" },
  { value: "mxn_only", label: "MXN expenses only" },
  { value: "always",   label: "All expenses" },
];

// ── Summary helpers ──────────────────────────────────────────────────────────

const XML_MODE_LABELS: Record<string, string> = {
  never:    "XML not required",
  mxn_only: "MXN XML required",
  always:   "XML always required",
};

function buildSummaryTokens(form: Record<string, any>): string[] {
  const tokens: string[] = [];

  const xmlMode = form.xml_required_mode ?? "mxn_only";
  tokens.push(XML_MODE_LABELS[xmlMode] ?? xmlMode);

  if (form.pdf_pair_required_for_cfdi) tokens.push("CFDI PDF required");

  tokens.push(form.tickets_allowed ? "Tickets allowed" : "Tickets blocked");

  tokens.push(form.international_expenses_allowed ? "International: Yes" : "International: No");

  if (form.manager_approval_required)  tokens.push("Manager approval");
  if (form.accounting_review_required) tokens.push("Accounting review");
  if (form.require_proof)              tokens.push("Proof required");
  if (form.require_justification)      tokens.push("Justification required");

  return tokens;
}

function buildWarnings(form: Record<string, any>): string[] {
  const warnings: string[] = [];

  if (form.xml_required_mode === "never" && form.pdf_pair_required_for_cfdi) {
    warnings.push("PDF pairing is enabled while XML is not required.");
  }

  if (form.international_expenses_allowed && !form.require_proof) {
    warnings.push("International expenses are allowed without proof requirement.");
  }

  if (form.tickets_allowed && !form.require_justification) {
    warnings.push("Tickets are allowed without justification requirement.");
  }

  return warnings;
}

// ── Sub-components ────────────────────────────────────────────────────────────

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
  description: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-medium text-white/68">{label}</p>
        <p className="text-[10px] text-white/28">{description}</p>
      </div>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="shrink-0 rounded border border-white/[0.08] bg-zinc-900 px-2 py-1 text-[10px] text-white/55 outline-none focus:border-indigo-500/40"
      >
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
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-medium text-white/68">{label}</p>
        <p className="text-[10px] text-white/28">{description}</p>
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
            checked
              ? "translate-x-3 bg-indigo-400"
              : "translate-x-0.5 bg-white/20"
          }`}
        />
      </button>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function AdminCompanySetupPanel({ companyId, policy, onSaved, draftPatch }: Props) {
  const [form, setForm]           = useState<Record<string, any>>({ ...policy });
  const [dirty, setDirty]         = useState(false);
  const [saving, setSaving]       = useState(false);
  const [saved, setSaved]         = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [aiDrafted, setAiDrafted] = useState(false);
  const prevDraftRef              = useRef<Partial<any> | undefined>(undefined);

  // Sync when parent refreshes policy (e.g. initial load)
  useEffect(() => {
    setForm({ ...policy });
    setDirty(false);
    setSaved(false);
    setAiDrafted(false);
  }, [policy]);

  // Merge draftPatch into form without auto-saving
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
      const res = await fetch(`${API}/expenses/policy/${companyId}`, {
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

  return (
    <div className="max-w-xl space-y-5">

      {/* Header */}
      <div className="border-b border-white/[0.06] pb-3">
        <h2 className="text-sm font-semibold text-white/80">Company Setup</h2>
        <p className="mt-0.5 text-[11px] text-white/35">
          Define how employees submit and how finance controls expenses.
        </p>
      </div>

      {/* Summary banner */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded border border-white/[0.05] bg-white/[0.02] px-3 py-2">
        {buildSummaryTokens(form).map((token, i, arr) => (
          <span key={i} className="flex items-center gap-2">
            <span className="text-[10px] text-white/38">{token}</span>
            {i < arr.length - 1 && (
              <span className="text-[9px] text-white/14" aria-hidden>·</span>
            )}
          </span>
        ))}
      </div>

      {/* Inline warnings */}
      {buildWarnings(form).map((w, i) => (
        <div key={i} className="flex items-start gap-2 rounded border border-amber-500/[0.12] bg-amber-500/[0.04] px-3 py-1.5">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-amber-400/50" />
          <p className="text-[10px] leading-snug text-amber-300/60">{w}</p>
        </div>
      ))}

      {/* A — Expense Rules */}
      <div>
        <SectionLabel>A — Company Expense Rules</SectionLabel>
        <Panel>
          <SelectRow
            label="XML / CFDI required"
            description="When is a CFDI XML file mandatory?"
            value={form.xml_required_mode ?? "mxn_only"}
            options={XML_MODE_OPTIONS}
            onChange={(v) => set("xml_required_mode", v)}
          />
          <ToggleRow
            label="Paired PDF required for CFDI"
            description="Require a matching PDF alongside each XML document."
            checked={!!form.pdf_pair_required_for_cfdi}
            onChange={(v) => set("pdf_pair_required_for_cfdi", v)}
          />
          <ToggleRow
            label="International expenses allowed"
            description="Allow expenses in currencies other than MXN."
            checked={!!form.international_expenses_allowed}
            onChange={(v) => set("international_expenses_allowed", v)}
          />
          <ToggleRow
            label="Tickets allowed"
            description="Allow receipt or ticket documents as expense proof."
            checked={!!form.tickets_allowed}
            onChange={(v) => set("tickets_allowed", v)}
          />
        </Panel>
      </div>

      {/* B — Supporting Information */}
      <div>
        <SectionLabel>B — Required Supporting Information</SectionLabel>
        <Panel>
          <ToggleRow
            label="Justification required"
            description="Employees must attach a written justification."
            checked={!!form.require_justification}
            onChange={(v) => set("require_justification", v)}
          />
          <ToggleRow
            label="Proof required"
            description="Employees must attach a supporting proof document."
            checked={!!form.require_proof}
            onChange={(v) => set("require_proof", v)}
          />
        </Panel>
      </div>

      {/* C — Approval Flow */}
      <div>
        <SectionLabel>C — Approval Flow</SectionLabel>
        <Panel>
          <ToggleRow
            label="Manager approval required"
            description="Submitted expenses must be approved by a manager."
            checked={!!form.manager_approval_required}
            onChange={(v) => set("manager_approval_required", v)}
          />
          <ToggleRow
            label="Accounting review required"
            description="Expenses must pass an accounting review before finalization."
            checked={!!form.accounting_review_required}
            onChange={(v) => set("accounting_review_required", v)}
          />
        </Panel>
      </div>

      {/* D — AI Assistance */}
      <div>
        <SectionLabel>D — AI Assistance</SectionLabel>
        <Panel>
          <ToggleRow
            label="AI policy assist enabled"
            description="Use AI to suggest allocation and flag policy violations automatically."
            checked={!!form.ai_policy_assist_enabled}
            onChange={(v) => set("ai_policy_assist_enabled", v)}
          />
        </Panel>
      </div>

      {/* Save bar */}
      <div className="flex items-center justify-between gap-3 rounded-lg border border-white/[0.06] bg-white/[0.015] px-4 py-2.5">
        <div className="flex items-center gap-2 flex-wrap">
          {aiDrafted && !saved && (
            <span className="inline-flex items-center gap-1 rounded border border-violet-500/25 bg-violet-500/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-violet-300/80">
              <Sparkles className="h-2.5 w-2.5" /> AI Draft Applied
            </span>
          )}
          {dirty && !saving && !saved && (
            <span className="text-[10px] text-amber-400/60">Unsaved changes</span>
          )}
          {saved && (
            <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400/70">
              <CheckCircle2 className="h-3 w-3" /> Saved
            </span>
          )}
          {error && (
            <span className="inline-flex items-center gap-1 text-[10px] text-red-400/70">
              <AlertCircle className="h-3 w-3" /> {error}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={save}
          disabled={saving || !dirty}
          className="inline-flex items-center gap-1.5 rounded border border-indigo-500/30 bg-indigo-600/20 px-3 py-1 text-[10px] font-semibold text-indigo-300 transition-colors hover:bg-indigo-600/30 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
          {saving ? "Saving…" : "Save"}
        </button>
      </div>

    </div>
  );
}
