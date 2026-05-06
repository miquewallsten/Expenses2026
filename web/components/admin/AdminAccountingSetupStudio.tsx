"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Save, Loader2, CheckCircle2, AlertTriangle, Calculator } from "lucide-react";
import { apiPatch } from "@/lib/api/client";
import {
  PremiumHeader,
  SectionPanel,
  Row,
  RowStack,
  Toggle,
  SectionLabel as PatternSectionLabel,
  inputClasses,
  SECTION_ACCENTS,
} from "@/components/admin/shared/AdminPatterns";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SetupData = Record<string, any>;

interface Props {
  companyId: number;
  setup: SetupData;
  companySetup?: SetupData;
  expensePolicy?: SetupData;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onSaved?: (setup: any) => void;
  draftPatch?: Partial<SetupData>;
}

// ── Main component ────────────────────────────────────────────────────────────

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

  const seed = (field: string, def: unknown) => {
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
      const data = await apiPatch(`/admin/accounting-setup/${companyId}`, body);
      onSaved?.(data);
      setSaved(true);
    } catch (e: any) {
      setError(e?.message ?? tc("save"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-2xl space-y-5">
      <PremiumHeader
        section="accounting-setup"
        icon={<Calculator className="h-4 w-4" />}
        title={t("title")}
        subtitle="Accounting Integration Settings"
        badge={
          draftPatch && Object.keys(draftPatch).length > 0 ? (
            <span className="rounded border border-violet-500/20 bg-violet-500/[0.08] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-violet-300/60">
              {t("aiDraftCount", { count: Object.keys(draftPatch).length }).replace(/\s*\(\d+\)$/, "")}
            </span>
          ) : null
        }
        action={
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-sky-500 to-sky-600 px-4 py-1.5 text-[11px] font-semibold text-white shadow-sm shadow-sky-500/20 transition-all hover:shadow-md hover:shadow-sky-500/30 disabled:opacity-40 disabled:shadow-none"
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            {tc("save")}
          </button>
        }
        metrics={[
          {
            label: tc("saved"),
            value: saved ? "✓" : "-",
            tone: saved ? "success" : "neutral",
          },
        ]}
      />

      {/* Warnings */}
      {warnings.length > 0 && (
        <div className="space-y-2">
          {warnings.map((w, i) => (
            <div key={i} className="flex items-start gap-2 rounded border border-amber-500/20 bg-amber-950/20 px-3 py-2">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-warning/60" />
              <p className="text-[11px] text-warning/60 leading-relaxed">{w}</p>
            </div>
          ))}
        </div>
      )}

      {/* Operating Model */}
      <div>
        <PatternSectionLabel>{t("operatingModel")}</PatternSectionLabel>
        <SectionPanel>
          <Row label={t("accountingReviewMode")} description={t("accountingReviewModeDesc")}>
            <select
              value={accountingReviewMode}
              onChange={(e) => setAccountingReviewMode(e.target.value)}
              className={`${inputClasses.select} w-44`}
            >
              <option value="">—</option>
              {REVIEW_MODE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </Row>
        </SectionPanel>
        <p className="mt-1 px-1 text-[9.5px] text-muted leading-relaxed">
          La preaprobación de gerente y los umbrales se configuran en <span className="text-tertiary">Aprobaciones</span>. La retención de archivo se gestiona en el módulo de Archivo.
        </p>
      </div>

      {/* Compliance & Filing */}
      <div>
        <PatternSectionLabel>{t("complianceFiling")}</PatternSectionLabel>
        <SectionPanel>
          <Row label={t("polizaXmlRequired")} description={t("polizaXmlDesc")}>
            <Toggle value={polizaRequired} onChange={setPolizaRequired} />
          </Row>
        </SectionPanel>
      </div>

      {/* Expense Control */}
      <div>
        <PatternSectionLabel>{t("expenseControlFields")}</PatternSectionLabel>
        <SectionPanel>
          <Row label={t("accountCodeRequired")}>
            <Toggle value={accountCodeRequired} onChange={setAccountCodeRequired} />
          </Row>
          <Row
            label={t("costCenterRequired")}
            description={!costCenterDimActive ? "Habilita Centro de costo en Política de gastos → Dimensiones de distribución." : undefined}
            className={!costCenterDimActive ? "opacity-50" : ""}
          >
            <Toggle
              value={costCenterRequired}
              onChange={setCostCenterRequired}
              disabled={!costCenterDimActive}
            />
          </Row>
          <Row
            label={t("projectRequired")}
            description={!projectDimActive ? "Habilita Proyecto en Política de gastos → Dimensiones de distribución." : undefined}
            className={!projectDimActive ? "opacity-50" : ""}
          >
            <Toggle
              value={projectRequired}
              onChange={setProjectRequired}
              disabled={!projectDimActive}
            />
          </Row>
          <Row
            label={t("clientRequired")}
            description={!clientDimActive ? "Habilita Cliente en Política de gastos → Dimensiones de distribución." : undefined}
            className={!clientDimActive ? "opacity-50" : ""}
          >
            <Toggle
              value={clientRequired}
              onChange={setClientRequired}
              disabled={!clientDimActive}
            />
          </Row>
        </SectionPanel>
        <p className="mt-1 px-1 text-[9.5px] text-muted leading-relaxed">
          Cada toggle activado bloquea el envío y la generación de póliza si el campo no está asignado.
        </p>
      </div>

      {/* Validation */}
      <div>
        <PatternSectionLabel>{t("validationOverride")}</PatternSectionLabel>
        <SectionPanel>
          <Row label={t("allowSubmitWithWarnings")} description={t("allowSubmitWithWarningsDesc")}>
            <Toggle value={allowSubmitWithWarnings} onChange={setAllowSubmitWithWarnings} />
          </Row>
        </SectionPanel>
      </div>

      {/* Status bar at bottom */}
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-error/30 bg-error-muted/20 px-3 py-2">
          <AlertTriangle className="h-3.5 w-3.5 text-error" />
          <p className="text-[10px] text-error">{error}</p>
        </div>
      )}
    </div>
  );
}
