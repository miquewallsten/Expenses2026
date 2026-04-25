"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Save, Loader2, CheckCircle2, AlertTriangle } from "lucide-react";
import { getAuthHeaders } from "@/lib/session";

const API = process.env.NEXT_PUBLIC_API_BASE_URL;

interface Props {
  companyId: number;
  setup: any;
  companySetup?: any;
  expensePolicy?: any;
  onSaved?: (setup: any) => void;
  draftPatch?: Partial<any>;
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
  disabled = false,
  disabledHint,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  disabledHint?: string;
}) {
  return (
    <div className={`flex items-center justify-between gap-4 px-4 py-2.5 ${disabled ? "opacity-50" : ""}`}>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-medium text-white/68">{label}</p>
        {disabled && disabledHint
          ? <p className="text-[10px] text-amber-300/50">{disabledHint}</p>
          : description && <p className="text-[10px] text-white/28">{description}</p>
        }
      </div>
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && onChange(!checked)}
        className={`relative inline-flex h-4 w-7 shrink-0 rounded-full border transition-colors ${
          disabled ? "cursor-not-allowed" : "cursor-pointer"
        } ${
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

// ── Main component ────────────────────────────────────────────────────────────

export default function AdminAccountingSetupStudio({ companyId, setup, companySetup, expensePolicy, onSaved, draftPatch }: Props) {
  const t = useTranslations("admin.accountingSetup");
  const tc = useTranslations("common");

  // ── Option sets (inside component to use t()) ──────────────────────────────
  const REVIEW_MODE_OPTIONS = [
    { value: "all",             label: t("modeAll") },
    { value: "exceptions_only", label: t("modeExceptionsOnly") },
    { value: "none",            label: t("modeNone") },
  ];

  const MANAGER_APPROVAL_OPTIONS = [
    { value: "disabled",       label: t("mgrDisabled") },
    { value: "all",            label: t("mgrAll") },
    { value: "threshold_only", label: t("mgrThresholdOnly") },
  ];

  // ── Draft badge ──────────────────────────────────────────────────────────
  function DraftBadge({ patch }: { patch: Partial<any> | undefined }) {
    if (!patch || Object.keys(patch).length === 0) return null;
    const count = Object.keys(patch).length;
    return (
      <span className="rounded border border-violet-500/20 bg-violet-500/[0.08] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-violet-300/60">
        {t("aiDraftCount", { count })}
      </span>
    );
  }

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
  const [autoAccountSuggestion,              setAutoAccountSuggestion]             = useState<boolean>(seed("auto_account_suggestion_enabled", true));
  const [costCenterRequired,                 setCostCenterRequired]                = useState<boolean>(seed("cost_center_required", false));
  const [projectRequired,                    setProjectRequired]                   = useState<boolean>(seed("project_required", false));
  const [clientRequired,                     setClientRequired]                    = useState<boolean>(seed("client_required", false));
  const [allowAccountingOverride,            setAllowAccountingOverride]           = useState<boolean>(seed("allow_accounting_override", true));
  const [allowSubmitWithWarnings,            setAllowSubmitWithWarnings]           = useState<boolean>(seed("allow_submit_with_warnings", false));
  const [requireFinalReviewBeforeExport,     setRequireFinalReviewBeforeExport]    = useState<boolean>(seed("require_final_accounting_review_before_export", true));

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
    if ("auto_account_suggestion_enabled" in draftPatch)      setAutoAccountSuggestion(draftPatch.auto_account_suggestion_enabled);
    if ("cost_center_required" in draftPatch)                 setCostCenterRequired(draftPatch.cost_center_required);
    if ("project_required" in draftPatch)                     setProjectRequired(draftPatch.project_required);
    if ("client_required" in draftPatch)                      setClientRequired(draftPatch.client_required);
    if ("allow_accounting_override" in draftPatch)            setAllowAccountingOverride(draftPatch.allow_accounting_override);
    if ("allow_submit_with_warnings" in draftPatch)           setAllowSubmitWithWarnings(draftPatch.allow_submit_with_warnings);
    if ("require_final_accounting_review_before_export" in draftPatch) setRequireFinalReviewBeforeExport(draftPatch.require_final_accounting_review_before_export);
  }, [draftPatch]);

  // Local warnings
  const warnings: string[] = [];
  if (accountingReviewMode === "none" && polizaRequired)
    warnings.push(t("warnPolizaNoReview"));
  if (managerApprovalMode === "threshold_only" && !managerApprovalThreshold)
    warnings.push(t("warnThresholdNoAmount"));

  // Cross-setup dependency warnings
  // allocation_dimensions lives on expense_policy (not company_setup).
  const dims: string = expensePolicy?.allocation_dimensions ?? "";
  const dimsIncludes = (k: string) => dims.includes(k);
  const projectDimActive     = dims === "" || dimsIncludes("project");
  const clientDimActive      = dims === "" || dimsIncludes("client");
  const costCenterDimActive  = dims === "" || dimsIncludes("cost_center");

  // Force-clear required-toggles when the corresponding dimension was disabled
  // elsewhere. Prevents silent breakage: employees could never satisfy the rule.
  useEffect(() => {
    if (!projectDimActive     && projectRequired)     setProjectRequired(false);
    if (!clientDimActive      && clientRequired)      setClientRequired(false);
    if (!costCenterDimActive  && costCenterRequired)  setCostCenterRequired(false);
  }, [projectDimActive, clientDimActive, costCenterDimActive, projectRequired, clientRequired, costCenterRequired]);

  if (managerApprovalMode !== "disabled" && companySetup && !companySetup.has_managers)
    warnings.push("La aprobación de gerente está activa pero la empresa no tiene gerentes configurados.");
  if (polizaRequired && expensePolicy && (expensePolicy.xml_required_mode ?? "mxn_only") === "never")
    warnings.push("“Póliza contable obligatoria” sin CFDI requerido: la mayoría de gastos no generará XML apto.");

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
        auto_account_suggestion_enabled: autoAccountSuggestion,
        cost_center_required: costCenterRequired,
        project_required: projectRequired,
        client_required: clientRequired,
        allow_accounting_override: allowAccountingOverride,
        allow_submit_with_warnings: allowSubmitWithWarnings,
        require_final_accounting_review_before_export: requireFinalReviewBeforeExport,
      };
      const res = await fetch(`${API}/admin/accounting-setup/${companyId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      const data = await res.json();
      onSaved?.(data);
      setSaved(true);
    } catch (e: any) {
      setError(e?.message ?? tc("save"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-2xl space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-semibold text-white">{t("title")}</h2>
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
        <SectionLabel>{t("operatingModel")}</SectionLabel>
        <Panel>
          <SelectRow
            label={t("accountingReviewMode")}
            description={t("accountingReviewModeDesc")}
            value={accountingReviewMode}
            options={REVIEW_MODE_OPTIONS}
            onChange={setAccountingReviewMode}
          />
        </Panel>
        <p className="mt-1 px-1 text-[9.5px] text-white/22 leading-relaxed">
          La preaprobación de gerente y los umbrales se configuran en <span className="text-white/40">Aprobaciones</span>. La retención de archivo se gestiona en el módulo de Archivo.
        </p>
      </div>

      {/* Compliance & Filing */}
      <div>
        <SectionLabel>{t("complianceFiling")}</SectionLabel>
        <Panel>
          <ToggleRow
            label={t("polizaXmlRequired")}
            description={t("polizaXmlDesc")}
            checked={polizaRequired}
            onChange={setPolizaRequired}
          />
        </Panel>
      </div>

      {/* Expense Control */}
      <div>
        <SectionLabel>{t("expenseControlFields")}</SectionLabel>
        <Panel>
          <ToggleRow label={t("accountCodeRequired")} checked={accountCodeRequired} onChange={setAccountCodeRequired} />
          <ToggleRow
            label={t("costCenterRequired")}
            checked={costCenterRequired}
            onChange={setCostCenterRequired}
            disabled={!costCenterDimActive}
            disabledHint="Habilita Centro de costo en Política de gastos → Dimensiones de distribución."
          />
          <ToggleRow
            label={t("projectRequired")}
            checked={projectRequired}
            onChange={setProjectRequired}
            disabled={!projectDimActive}
            disabledHint="Habilita Proyecto en Política de gastos → Dimensiones de distribución."
          />
          <ToggleRow
            label={t("clientRequired")}
            checked={clientRequired}
            onChange={setClientRequired}
            disabled={!clientDimActive}
            disabledHint="Habilita Cliente en Política de gastos → Dimensiones de distribución."
          />
        </Panel>
        <p className="mt-1 px-1 text-[9.5px] text-white/22 leading-relaxed">
          Cada toggle activado bloquea el envío y la generación de póliza si el campo no está asignado.
        </p>
      </div>

      {/* Validation */}
      <div>
        <SectionLabel>{t("validationOverride")}</SectionLabel>
        <Panel>
          <ToggleRow
            label={t("allowSubmitWithWarnings")}
            description={t("allowSubmitWithWarningsDesc")}
            checked={allowSubmitWithWarnings}
            onChange={setAllowSubmitWithWarnings}
          />
        </Panel>
      </div>

      {/* Sticky Save bar */}
      <div className="sticky bottom-0 -mx-4 mt-6 border-t border-white/[0.08] bg-zinc-950/95 px-4 py-2.5 backdrop-blur supports-[backdrop-filter]:bg-zinc-950/80">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded border border-indigo-500/30 bg-indigo-500/[0.10] px-3 py-1.5 text-[10px] font-semibold text-indigo-200/80 transition-colors hover:bg-indigo-500/[0.18] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving
              ? <><Loader2 className="h-3 w-3 animate-spin" /> {tc("saving")}</>
              : <><Save className="h-3 w-3" /> {tc("save")}</>
            }
          </button>
          {saved && (
            <span className="flex items-center gap-1 text-[10px] text-emerald-400/60">
              <CheckCircle2 className="h-3 w-3" /> {tc("saved")}
            </span>
          )}
          {error && <span className="text-[10px] text-red-400/60">{error}</span>}
        </div>
      </div>
    </div>
  );
}
