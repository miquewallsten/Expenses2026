"use client";

import { useState, useEffect } from "react";
import { Save, Loader2, CheckCircle2, AlertTriangle } from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_BASE_URL;

interface Props {
  companyId: number;
  setup: any;
  onSaved?: (setup: any) => void;
  draftPatch?: Partial<any>;
}

// ── Option sets ───────────────────────────────────────────────────────────────

const REVIEW_MODE_OPTIONS = [
  { value: "all",             label: "All — review every expense" },
  { value: "exceptions_only", label: "Exceptions only" },
  { value: "none",            label: "None — skip accounting review" },
];

const MANAGER_APPROVAL_OPTIONS = [
  { value: "disabled",       label: "Disabled" },
  { value: "all",            label: "All expenses" },
  { value: "threshold_only", label: "Above threshold" },
];

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
        className="w-28 shrink-0 rounded border border-white/[0.08] bg-zinc-900 px-2 py-1 text-[10px] text-white/55 placeholder:text-white/20 outline-none focus:border-indigo-500/40"
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

// ── Draft indicator ───────────────────────────────────────────────────────────

function DraftBadge({ patch }: { patch: Partial<any> | undefined }) {
  if (!patch || Object.keys(patch).length === 0) return null;
  const count = Object.keys(patch).length;
  return (
    <span className="rounded border border-violet-500/20 bg-violet-500/[0.08] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-violet-300/60">
      {count} AI draft{count !== 1 ? "s" : ""}
    </span>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function AdminAccountingSetupStudio({ companyId, setup, onSaved, draftPatch }: Props) {
  const seed = (field: string, def: any) => {
    if (draftPatch && field in draftPatch) return draftPatch[field];
    return setup[field] ?? def;
  };

  const [accountingReviewMode,               setAccountingReviewMode]              = useState<string>(seed("accounting_review_mode", "all"));
  const [managerApprovalMode,                setManagerApprovalMode]               = useState<string>(seed("manager_approval_mode", "disabled"));
  const [managerApprovalThreshold,           setManagerApprovalThreshold]          = useState<number | null>(seed("manager_approval_threshold_amount", null));
  const [reimbursementEntityRequired,        setReimbursementEntityRequired]       = useState<boolean>(seed("reimbursement_entity_required", false));
  const [polizaRequired,                     setPolizaRequired]                    = useState<boolean>(seed("poliza_required", false));
  const [archiveRetentionYears,              setArchiveRetentionYears]             = useState<number | null>(seed("archive_retention_years", 5));
  const [accountCodeRequired,                setAccountCodeRequired]               = useState<boolean>(seed("account_code_required", false));
  const [subaccountRequired,                 setSubaccountRequired]                = useState<boolean>(seed("subaccount_required", false));
  const [autoAccountSuggestion,              setAutoAccountSuggestion]             = useState<boolean>(seed("auto_account_suggestion_enabled", true));
  const [costCenterRequired,                 setCostCenterRequired]                = useState<boolean>(seed("cost_center_required", false));
  const [projectRequired,                    setProjectRequired]                   = useState<boolean>(seed("project_required", false));
  const [clientRequired,                     setClientRequired]                    = useState<boolean>(seed("client_required", false));
  const [allowAccountingOverride,            setAllowAccountingOverride]           = useState<boolean>(seed("allow_accounting_override", true));
  const [allowSubmitWithWarnings,            setAllowSubmitWithWarnings]           = useState<boolean>(seed("allow_submit_with_warnings", false));
  const [requireFinalReviewBeforeExport,     setRequireFinalReviewBeforeExport]    = useState<boolean>(seed("require_final_accounting_review_before_export", true));
  const [aiAssistEnabled,                    setAiAssistEnabled]                   = useState<boolean>(seed("ai_accounting_assist_enabled", true));
  const [aiNotes,                            setAiNotes]                           = useState<string>(seed("ai_accounting_notes", "") ?? "");

  const [saving, setSaving] = useState(false);
  const [saved,  setSaved]  = useState(false);
  const [error,  setError]  = useState<string | null>(null);

  // Re-seed when draftPatch changes
  useEffect(() => {
    if (!draftPatch) return;
    if ("accounting_review_mode" in draftPatch)               setAccountingReviewMode(draftPatch.accounting_review_mode);
    if ("manager_approval_mode" in draftPatch)                setManagerApprovalMode(draftPatch.manager_approval_mode);
    if ("manager_approval_threshold_amount" in draftPatch)    setManagerApprovalThreshold(draftPatch.manager_approval_threshold_amount);
    if ("reimbursement_entity_required" in draftPatch)        setReimbursementEntityRequired(draftPatch.reimbursement_entity_required);
    if ("poliza_required" in draftPatch)                      setPolizaRequired(draftPatch.poliza_required);
    if ("archive_retention_years" in draftPatch)              setArchiveRetentionYears(draftPatch.archive_retention_years);
    if ("account_code_required" in draftPatch)                setAccountCodeRequired(draftPatch.account_code_required);
    if ("subaccount_required" in draftPatch)                  setSubaccountRequired(draftPatch.subaccount_required);
    if ("auto_account_suggestion_enabled" in draftPatch)      setAutoAccountSuggestion(draftPatch.auto_account_suggestion_enabled);
    if ("cost_center_required" in draftPatch)                 setCostCenterRequired(draftPatch.cost_center_required);
    if ("project_required" in draftPatch)                     setProjectRequired(draftPatch.project_required);
    if ("client_required" in draftPatch)                      setClientRequired(draftPatch.client_required);
    if ("allow_accounting_override" in draftPatch)            setAllowAccountingOverride(draftPatch.allow_accounting_override);
    if ("allow_submit_with_warnings" in draftPatch)           setAllowSubmitWithWarnings(draftPatch.allow_submit_with_warnings);
    if ("require_final_accounting_review_before_export" in draftPatch) setRequireFinalReviewBeforeExport(draftPatch.require_final_accounting_review_before_export);
    if ("ai_accounting_assist_enabled" in draftPatch)         setAiAssistEnabled(draftPatch.ai_accounting_assist_enabled);
    if ("ai_accounting_notes" in draftPatch)                  setAiNotes(draftPatch.ai_accounting_notes ?? "");
  }, [draftPatch]);

  // Local warnings
  const warnings: string[] = [];
  if (accountingReviewMode === "none" && polizaRequired)
    warnings.push("Póliza is required but accounting review mode is 'none' — no one will validate the XML.");
  if (managerApprovalMode === "threshold_only" && !managerApprovalThreshold)
    warnings.push("Manager approval mode is 'threshold only' but no threshold amount is set.");

  const handleSave = async () => {
    setSaving(true); setError(null); setSaved(false);
    try {
      const body = {
        accounting_review_mode: accountingReviewMode,
        manager_approval_mode: managerApprovalMode,
        manager_approval_threshold_amount: managerApprovalThreshold,
        reimbursement_entity_required: reimbursementEntityRequired,
        poliza_required: polizaRequired,
        archive_retention_years: archiveRetentionYears ?? 5,
        account_code_required: accountCodeRequired,
        subaccount_required: subaccountRequired,
        auto_account_suggestion_enabled: autoAccountSuggestion,
        cost_center_required: costCenterRequired,
        project_required: projectRequired,
        client_required: clientRequired,
        allow_accounting_override: allowAccountingOverride,
        allow_submit_with_warnings: allowSubmitWithWarnings,
        require_final_accounting_review_before_export: requireFinalReviewBeforeExport,
        ai_accounting_assist_enabled: aiAssistEnabled,
        ai_accounting_notes: aiNotes || null,
      };
      const res = await fetch(`${API}/admin/accounting-setup/${companyId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      const data = await res.json();
      onSaved?.(data);
      setSaved(true);
    } catch (e: any) {
      setError(e?.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-2xl space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-semibold text-white">Accounting Setup</h2>
        <DraftBadge patch={draftPatch} />
      </div>

      {/* Warnings */}
      {warnings.map((w, i) => (
        <div key={i} className="flex items-start gap-2 rounded border border-amber-500/20 bg-amber-950/20 px-3 py-2">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-amber-400/60" />
          <p className="text-[11px] text-amber-300/60 leading-relaxed">{w}</p>
        </div>
      ))}

      {/* Operating Model */}
      <div>
        <SectionLabel>Operating model</SectionLabel>
        <Panel>
          <SelectRow
            label="Accounting review mode"
            description="Which expenses go through accounting review"
            value={accountingReviewMode}
            options={REVIEW_MODE_OPTIONS}
            onChange={setAccountingReviewMode}
          />
          <SelectRow
            label="Manager pre-approval"
            description="When manager approval is required before accounting"
            value={managerApprovalMode}
            options={MANAGER_APPROVAL_OPTIONS}
            onChange={setManagerApprovalMode}
          />
          {managerApprovalMode === "threshold_only" && (
            <NumberRow
              label="Manager approval threshold"
              description="Expenses above this amount require manager pre-approval"
              value={managerApprovalThreshold}
              placeholder="e.g. 500"
              onChange={setManagerApprovalThreshold}
            />
          )}
          <NumberRow
            label="Archive retention (years)"
            description="How long to retain archived expense records"
            value={archiveRetentionYears}
            placeholder="5"
            onChange={setArchiveRetentionYears}
          />
        </Panel>
      </div>

      {/* Compliance & Filing */}
      <div>
        <SectionLabel>Compliance & filing</SectionLabel>
        <Panel>
          <ToggleRow
            label="Póliza XML required"
            description="Require a valid CFDI/XML document before export"
            checked={polizaRequired}
            onChange={setPolizaRequired}
          />
          <ToggleRow
            label="Reimbursement entity required"
            description="Expenses must be linked to a legal entity for reimbursement"
            checked={reimbursementEntityRequired}
            onChange={setReimbursementEntityRequired}
          />
          <ToggleRow
            label="Require final accounting review before export"
            description="All expenses must be marked reviewed before export bundle is generated"
            checked={requireFinalReviewBeforeExport}
            onChange={setRequireFinalReviewBeforeExport}
          />
        </Panel>
      </div>

      {/* Expense Control */}
      <div>
        <SectionLabel>Expense control fields</SectionLabel>
        <Panel>
          <ToggleRow label="Account code required" checked={accountCodeRequired} onChange={setAccountCodeRequired} />
          <ToggleRow label="Sub-account required"  checked={subaccountRequired}  onChange={setSubaccountRequired} />
          <ToggleRow label="Cost center required"  checked={costCenterRequired}  onChange={setCostCenterRequired} />
          <ToggleRow label="Project required"       checked={projectRequired}     onChange={setProjectRequired} />
          <ToggleRow label="Client required"        checked={clientRequired}      onChange={setClientRequired} />
        </Panel>
      </div>

      {/* Validation & Override */}
      <div>
        <SectionLabel>Validation & override</SectionLabel>
        <Panel>
          <ToggleRow
            label="Allow accounting override"
            description="Accounting team can override validation errors on individual expenses"
            checked={allowAccountingOverride}
            onChange={setAllowAccountingOverride}
          />
          <ToggleRow
            label="Allow submit with warnings"
            description="Employees can submit expenses even when there are non-blocking validation warnings"
            checked={allowSubmitWithWarnings}
            onChange={setAllowSubmitWithWarnings}
          />
        </Panel>
      </div>

      {/* AI Assistance */}
      <div>
        <SectionLabel>AI assistance</SectionLabel>
        <Panel>
          <ToggleRow
            label="AI accounting assist"
            description="AI suggestions for account codes and cost centers during review"
            checked={aiAssistEnabled}
            onChange={setAiAssistEnabled}
          />
          <ToggleRow
            label="Auto account code suggestion"
            description="AI pre-fills account codes on new expenses based on category patterns"
            checked={autoAccountSuggestion}
            onChange={setAutoAccountSuggestion}
          />
          <div className="px-4 py-2.5">
            <p className="mb-1 text-[11px] font-medium text-white/68">AI notes</p>
            <p className="mb-1.5 text-[10px] text-white/28">Optional context for the AI about your chart of accounts or accounting policies</p>
            <textarea
              value={aiNotes}
              onChange={(e) => setAiNotes(e.target.value)}
              rows={3}
              placeholder="e.g. We use a 4-digit chart of accounts based on the Mexican SAT catálogo…"
              className="w-full resize-none rounded border border-white/[0.07] bg-black/20 px-2.5 py-1.5 text-[11px] text-white/60 placeholder:text-white/20 outline-none focus:border-white/20"
            />
          </div>
        </Panel>
      </div>

      {/* Save row */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center gap-1.5 rounded border border-white/10 bg-white/[0.05] px-3 py-1.5 text-[10px] font-semibold text-white/60 transition-colors hover:bg-white/[0.09] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving
            ? <><Loader2 className="h-3 w-3 animate-spin" /> Saving…</>
            : <><Save className="h-3 w-3" /> Save</>
          }
        </button>
        {saved && (
          <span className="flex items-center gap-1 text-[10px] text-emerald-400/60">
            <CheckCircle2 className="h-3 w-3" /> Saved
          </span>
        )}
        {error && <span className="text-[10px] text-red-400/60">{error}</span>}
      </div>
    </div>
  );
}
