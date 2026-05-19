"use client";

import { useState, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { Calculator, Save, Loader2, CheckCircle2, AlertTriangle, AlertCircle } from "lucide-react";
import { apiCall } from "@/lib/api/client";
import {
  getPortalConfigConflicts,
  type PortalConfigConflict,
} from "@/lib/portal-config-conflicts";
import {
  PremiumHeader,
  SectionPanel,
  Row,
  RowStack,
  Toggle,
  SectionLabel as PatternSectionLabel,
  inputClasses,
} from "@/components/admin/shared/AdminPatterns";

// ── Configured-by badge ─────────────────────────────────────────────────────
// Shows who configured a field: accountant (amber badge) or admin (neutral)
function ConfiguredByBadge({ field, configuredBy }: { field: string; configuredBy?: Record<string, string> | null }) {
  if (!configuredBy || !configuredBy[field]) return null;
  const who = configuredBy[field];
  if (who === "accountant") {
    return (
      <span className="ml-1.5 inline-flex items-center gap-1 rounded-full border border-warning/20 bg-warning/10 px-1.5 py-0.5 text-[7px] font-bold uppercase tracking-widest text-warning">
        Contador
      </span>
    );
  }
  return null;
}

type SetupData = Record<string, any>;

interface Props {
  companyId: number;
  setup: SetupData;
  companySetup?: SetupData;
  expensePolicy?: SetupData;
  onSaved?: (setup: any) => void;
  draftPatch?: Partial<SetupData>;
}

// ── Conflict codes ───────────────────────────────────────────────────────────

const ACCOUNTING_CODES = new Set([
  "ACCOUNTING_DISABLED_REVIEW_ACTIVE",
  "ROUTE_TO_ACCOUNTING_MODULE_DISABLED",
  "POLIZA_NO_REVIEW_MODE",
  "THRESHOLD_NO_AMOUNT",
]);

export default function AdminAccountingSetupStudio({ companyId, setup, companySetup, expensePolicy, onSaved, draftPatch }: Props) {
  const t = useTranslations("admin.accountingSetup");
  const tc = useTranslations("common");

  // ── Option sets ────────────────────────────────────────────────────────────
  const REVIEW_MODE_OPTIONS = [
    { value: "all", label: t("modeAll") },
    { value: "exceptions_only", label: t("modeExceptionsOnly") },
    { value: "none", label: t("modeNone") },
  ];

  // ── Unified form state ─────────────────────────────────────────────────────
  const base = { ...setup, ...draftPatch };
  const [form, setForm] = useState<SetupData>(base);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (draftPatch) {
      setForm((f) => ({ ...f, ...draftPatch }));
      setDirty(true);
      setSaved(false);
    }
  }, [draftPatch]);

  useEffect(() => {
    setForm({ ...setup });
    setDirty(false);
    setSaved(false);
  }, [setup]);

  function set(key: string, val: any) {
    setForm((f) => ({ ...f, [key]: val }));
    setDirty(true);
    setSaved(false);
    setError(null);
  }

  // ── Cross-domain conflicts ─────────────────────────────────────────────────
  const configConflicts = getPortalConfigConflicts({
    company_setup: companySetup ?? {},
    expense_policy: expensePolicy ?? {},
    accounting_setup: form,
    approval_setup: {},
    workflow_setup: {},
  }).filter((c) => ACCOUNTING_CODES.has(c.code));

  // ── Dimension availability ──────────────────────────────────────────────────
  const costCenterDimActive = expensePolicy?.allocation_dimensions?.includes("cost_center") ?? false;
  const projectDimActive = expensePolicy?.allocation_dimensions?.includes("project") ?? false;
  const clientDimActive = expensePolicy?.allocation_dimensions?.includes("client") ?? false;

  // ── Local warnings ─────────────────────────────────────────────────────────
  const warnings: string[] = [];
  if (form.poliza_required && form.accounting_review_mode === "none")
    warnings.push(t("warnPolizaNoReview"));
  if (form.manager_approval_mode === "threshold_only" && !form.manager_approval_threshold_amount)
    warnings.push(t("warnThresholdNoAmount"));

  // ── Active config count ─────────────────────────────────────────────────────
  const activeCount = [
    form.poliza_required,
    form.account_code_required,
    form.cost_center_required,
    form.project_required,
    form.client_required,
    form.auto_account_suggestion_enabled,
    form.require_final_accounting_review_before_export,
  ].filter(Boolean).length;

  // ── Save ────────────────────────────────────────────────────────────────────
  const saveTimer = useRef<ReturnType<typeof setTimeout>>(null);
  async function handleSave() {
    setSaving(true); setError(null);
    try {
      const res = await apiCall(`/admin/accounting-setup/${companyId}`, {
        method: "PATCH",
        body: JSON.stringify(form),
      });
      setDirty(false); setSaved(true);
      onSaved?.(res);
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => setSaved(false), 3000);
    } catch (e: any) {
      setError(e?.message ?? "Error al guardar");
    } finally { setSaving(false); }
  }

  return (
    <div className="space-y-4">
      <PremiumHeader
        icon={<Calculator className="h-4 w-4" />}
        title={t("operatingModel")}
        section="accounting-setup"
        metrics={[
          { label: tc("active"), value: activeCount, tone: activeCount > 0 ? "success" : "neutral" },
        ]}
        action={
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !dirty}
            className="inline-flex items-center gap-2 rounded-md bg-accent px-4 py-1.5 text-[10px] font-semibold text-white shadow-sm transition-all hover:bg-accent-hover disabled:opacity-40"
          >
            {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
            {saving ? tc("saving") : tc("save")}
          </button>
        }
      />

      {/* Summary strip */}
      <div className="flex items-center gap-3 px-1">
        <span className="text-[10px] text-muted">
          {form.accounting_review_mode === "all" ? "Revisión total" :
           form.accounting_review_mode === "exceptions_only" ? "Solo excepciones" :
           form.accounting_review_mode === "none" ? "Sin revisión" : "Sin configuración"}
        </span>
        {dirty && !saved && (
          <span className="flex items-center gap-1.5 text-[10px] text-warning">
            <AlertCircle className="h-3 w-3" /> {tc("unsavedChanges")}
          </span>
        )}
        {saved && !dirty && (
          <span className="flex items-center gap-1.5 text-[10px] text-success">
            <CheckCircle2 className="h-3 w-3" /> {tc("saved")}
          </span>
        )}
      </div>

      {/* Conflicts */}
      {configConflicts.length > 0 && (
        <div className="space-y-1.5">
          {configConflicts.map((c, i) => (
            <div key={i} className={`flex items-start gap-2 rounded-md border px-3 py-2 ${
              c.severity === "critical" ? "border-error/15 bg-error/[0.04]" : "border-warning/15 bg-warning/[0.04]"
            }`}>
              {c.severity === "critical"
                ? <AlertCircle className="mt-0.5 h-3 w-3 shrink-0 text-error/55" />
                : <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-warning/55" />
              }
              <p className={`text-[10px] leading-relaxed ${c.severity === "critical" ? "text-error/60" : "text-warning/55"}`}>{c.message}</p>
            </div>
          ))}
        </div>
      )}

      {/* Warnings */}
      {warnings.length > 0 && (
        <div className="space-y-1.5">
          {warnings.map((w, i) => (
            <div key={i} className="flex items-start gap-2 rounded-md border border-warning/15 bg-warning/[0.04] px-3 py-2">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-warning/55" />
              <p className="text-[10px] leading-relaxed text-warning/55">{w}</p>
            </div>
          ))}
        </div>
      )}

      {/* 1 - Operating Model */}
      <div>
        <PatternSectionLabel>{t("operatingModel")}</PatternSectionLabel>
        <SectionPanel>
          <Row label={t("accountingReviewMode")} description={t("accountingReviewModeDesc")}>
            <div className="flex items-center gap-2">
              <select
                value={form.accounting_review_mode ?? "all"}
                onChange={(e) => set("accounting_review_mode", e.target.value)}
                className={`${inputClasses.select} w-44`}
              >
                {REVIEW_MODE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              <ConfiguredByBadge field="accounting_review_mode" configuredBy={form.configured_by} />
            </div>
          </Row>
          <Row label={t("polizaXmlRequired")} description={t("polizaXmlDesc")}>
            <div className="flex items-center gap-2">
              <Toggle value={!!form.poliza_required} onChange={(v) => set("poliza_required", v)} />
              <ConfiguredByBadge field="poliza_required" configuredBy={form.configured_by} />
            </div>
          </Row>
          <Row label={t("aiDraftCount")} description={undefined}>
            <Toggle value={!!form.auto_account_suggestion_enabled} onChange={(v) => set("auto_account_suggestion_enabled", v)} />
          </Row>
        </SectionPanel>
        <p className="mt-1.5 px-1 text-[9px] text-muted leading-relaxed">
          La preaprobación de gerente y umbrales se configuran en <span className="text-tertiary">Aprobaciones</span>. La retención de archivo se gestiona en el módulo de Archivo.
        </p>
      </div>

      {/* 2 - Expense Control Fields */}
      <div>
        <PatternSectionLabel>{t("expenseControlFields")}</PatternSectionLabel>
        <SectionPanel>
          <Row label={t("accountCodeRequired")}>
            <div className="flex items-center gap-2">
              <Toggle value={!!form.account_code_required} onChange={(v) => set("account_code_required", v)} />
              <ConfiguredByBadge field="account_code_required" configuredBy={form.configured_by} />
            </div>
          </Row>
          <Row
            label={t("costCenterRequired")}
            description={!costCenterDimActive ? "Habilita Centro de costo en Política de gastos." : undefined}
            className={!costCenterDimActive ? "opacity-50" : ""}
          >
            <div className="flex items-center gap-2">
              <Toggle value={!!form.cost_center_required} onChange={(v) => set("cost_center_required", v)} disabled={!costCenterDimActive} />
              <ConfiguredByBadge field="cost_center_required" configuredBy={form.configured_by} />
            </div>
          </Row>
          <Row
            label={t("projectRequired")}
            description={!projectDimActive ? "Habilita Proyecto en Política de gastos." : undefined}
            className={!projectDimActive ? "opacity-50" : ""}
          >
            <Toggle value={!!form.project_required} onChange={(v) => set("project_required", v)} disabled={!projectDimActive} />
          </Row>
          <Row
            label={t("clientRequired")}
            description={!clientDimActive ? "Habilita Cliente en Política de gastos." : undefined}
            className={!clientDimActive ? "opacity-50" : ""}
          >
            <Toggle value={!!form.client_required} onChange={(v) => set("client_required", v)} disabled={!clientDimActive} />
          </Row>
        </SectionPanel>
        <p className="mt-1.5 px-1 text-[9px] text-muted leading-relaxed">
          Cada toggle activado bloquea el envío y la generación de póliza si el campo no está asignado.
        </p>
      </div>

      {/* 3 - Validation & Override */}
      <div>
        <PatternSectionLabel>{t("validationOverride")}</PatternSectionLabel>
        <SectionPanel>
          <Row label={t("allowSubmitWithWarnings")} description={t("allowSubmitWithWarningsDesc")}>
            <Toggle value={!!form.allow_submit_with_warnings} onChange={(v) => set("allow_submit_with_warnings", v)} />
          </Row>
          <Row label="Revisión final antes de exportar" description="Requiere que un contador revise y apruebe antes de generar cualquier exportación contable.">
            <Toggle value={!!form.require_final_accounting_review_before_export} onChange={(v) => set("require_final_accounting_review_before_export", v)} />
          </Row>
          <Row label="Permitir override contable" description="Permite al contador cambiar la cuenta contable sugerida por la IA.">
            <Toggle value={!!form.allow_accounting_override} onChange={(v) => set("allow_accounting_override", v)} />
          </Row>
        </SectionPanel>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 rounded-md border border-error/30 bg-error/5 px-3 py-2">
          <AlertCircle className="h-3.5 w-3.5 text-error" />
          <p className="text-[10px] text-error">{error}</p>
        </div>
      )}
    </div>
  );
}
