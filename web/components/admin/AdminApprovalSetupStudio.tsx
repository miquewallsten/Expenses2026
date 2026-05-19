"use client";

import { useState, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { GitBranch, Save, Loader2, CheckCircle2, AlertTriangle, AlertCircle } from "lucide-react";
import { apiCall } from "@/lib/api/client";
import {
  getPortalConfigConflicts,
  type PortalConfigConflict,
} from "@/lib/portal-config-conflicts";
import {
  PremiumHeader,
  SectionPanel,
  Row,
  Toggle,
  SectionLabel as PatternSectionLabel,
  inputClasses,
} from "@/components/admin/shared/AdminPatterns";

interface Props {
  companyId: number;
  setup: any;
  companySetup?: any;
  accountingSetup?: any;
  expensePolicy?: any;
  onSaved?: (setup: any) => void;
  draftPatch?: Partial<any>;
}

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

const APPROVAL_MODE_OPTIONS = [
  { value: "none", labelKey: "modeNone" },
  { value: "manager_only", labelKey: "modeManagerOnly" },
  { value: "accounting_only", labelKey: "modeAccountingOnly" },
  { value: "manager_then_accounting", labelKey: "modeManagerThenAccounting" },
  { value: "threshold", labelKey: "modeThresholdBased" },
];

function buildLocalWarnings(
  form: Record<string, any>,
  companySetup?: any,
  accountingSetup?: any,
): string[] {
  const w: string[] = [];
  if (form.approval_mode !== "none" && !companySetup?.has_managers)
    w.push("Modo de aprobación activo pero no hay gerentes configurados.");
  if (form.require_accounting_for_all_expenses && accountingSetup?.accounting_review_mode === "none")
    w.push("Se requiere revisión contable pero el modo de revisión es 'ninguno'.");
  if (form.escalate_international_to_accounting && !form.international_expenses_allowed && form.international_expenses_allowed !== undefined)
    w.push("Escalamiento internacional activo pero gastos internacionales deshabilitados.");
  return w;
}

function buildSummary(form: Record<string, any>, t: (k: string) => string): string {
  const parts: string[] = [];
  const modeOpt = APPROVAL_MODE_OPTIONS.find((o) => o.value === form.approval_mode);
  if (modeOpt) parts.push(t(modeOpt.labelKey));
  if (form.require_manager_for_all_employees) parts.push("Todos → Gerente");
  if (form.require_accounting_for_all_expenses) parts.push("Todos → Contabilidad");
  if (form.escalate_policy_failures_to_accounting) parts.push("Políticas → Contabilidad");
  if (form.escalate_international_to_accounting) parts.push("Internacional → Contabilidad");
  return parts.join(" · ") || "Sin configuración";
}

export default function AdminApprovalSetupStudio({
  companyId,
  setup,
  companySetup,
  accountingSetup,
  expensePolicy,
  onSaved,
  draftPatch,
}: Props) {
  const t = useTranslations("admin.approvalSetup");
  const tc = useTranslations("common");

  const approvalModeOptions = APPROVAL_MODE_OPTIONS.map((o) => ({
    value: o.value,
    label: t(o.labelKey),
  }));

  const base = { ...setup, ...draftPatch };
  const [form, setForm] = useState(base);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { if (draftPatch) setForm((f: any) => ({ ...f, ...draftPatch })); }, [draftPatch]);

  function set(key: string, val: any) {
    setForm((f: any) => ({ ...f, [key]: val }));
    setDirty(true);
    setSaved(false);
  }

  // ── Cross-domain conflicts (synchronous, pure function) ────────────────────
  const configConflicts = getPortalConfigConflicts({
    company_setup:    companySetup    ?? {},
    expense_policy:   expensePolicy   ?? {},
    accounting_setup: accountingSetup ?? {},
    approval_setup:   form,
    workflow_setup:   {},
  }).filter((c) => APPROVAL_CODES.has(c.code));

  const localWarnings = buildLocalWarnings(form, companySetup, accountingSetup);
  const isThreshold = form.approval_mode === "threshold";

  const activeCount = [
    form.require_manager_for_all_employees,
    form.require_accounting_for_all_expenses,
    form.allow_resubmission_after_rejection,
    form.escalate_policy_failures_to_accounting,
    form.escalate_international_to_accounting,
  ].filter(Boolean).length;

  const saveTimer = useRef<ReturnType<typeof setTimeout>>(null);
  async function handleSave() {
    setSaving(true); setError(null);
    try {
      const res = await apiCall(`/company/${companyId}/approval-setup`, { method: "PUT", body: JSON.stringify(form) });
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
        icon={<GitBranch className="h-4 w-4" />}
        title={t("title")}
        subtitle={t("sectionA")}
        section="approval-workflow"
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

      <div className="flex items-center gap-3 px-1">
        <span className="text-[10px] text-muted">{buildSummary(form, t)}</span>
        {dirty && !saved && (
          <span className="flex items-center gap-1.5 text-[10px] text-warning">
            <AlertCircle className="h-3 w-3" />
            {tc("unsavedChanges")}
          </span>
        )}
        {saved && !dirty && (
          <span className="flex items-center gap-1.5 text-[10px] text-success">
            <CheckCircle2 className="h-3 w-3" />
            {tc("saved")}
          </span>
        )}
      </div>

      {configConflicts.length > 0 && (
        <div className="space-y-1.5">
          {configConflicts.map((c, i) => (
            <div
              key={i}
              className={`flex items-start gap-2 rounded-md border px-3 py-2 ${
                c.severity === "critical"
                  ? "border-error/15 bg-error/[0.04]"
                  : "border-warning/15 bg-warning/[0.04]"
              }`}
            >
              {c.severity === "critical"
                ? <AlertCircle className="mt-0.5 h-3 w-3 shrink-0 text-error/55" />
                : <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-warning/55" />
              }
              <p className={`text-[10px] leading-relaxed ${
                c.severity === "critical" ? "text-error/60" : "text-warning/55"
              }`}>{c.message}</p>
            </div>
          ))}
        </div>
      )}

      {localWarnings.length > 0 && (
        <div className="space-y-1.5">
          {localWarnings.map((w, i) => (
            <div key={i} className="flex items-start gap-2 rounded-md border border-warning/15 bg-warning/[0.04] px-3 py-2">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-warning/55" />
              <p className="text-[10px] leading-relaxed text-warning/55">{w}</p>
            </div>
          ))}
        </div>
      )}

      <div>
        <PatternSectionLabel>{t("sectionA")}</PatternSectionLabel>
        <SectionPanel>
          <Row label={t("approvalMode")} description={t("approvalModeDesc")}>
            <select
              value={form.approval_mode ?? "none"}
              onChange={(e) => set("approval_mode", e.target.value)}
              className={`${inputClasses.select} w-52`}
            >
              {approvalModeOptions.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </Row>
          {isThreshold && (
            <Row label={t("managerThreshold")} description={t("managerThresholdDesc")}>
              <input
                type="number"
                value={form.manager_threshold_amount ?? ""}
                placeholder={t("managerThresholdPlaceholder")}
                onChange={(e) => {
                  const v = e.target.value;
                  set("manager_threshold_amount", v === "" ? null : parseFloat(v));
                }}
                className={`${inputClasses.base} w-36`}
              />
            </Row>
          )}
        </SectionPanel>
      </div>

      <div>
        <PatternSectionLabel>{t("sectionB")}</PatternSectionLabel>
        <SectionPanel>
          <Row label={t("requireManagerAll")} description={t("requireManagerAllDesc")}>
            <Toggle value={!!form.require_manager_for_all_employees} onChange={(v) => set("require_manager_for_all_employees", v)} />
          </Row>
          <Row label={t("requireAccountingAll")} description={t("requireAccountingAllDesc")}>
            <Toggle value={!!form.require_accounting_for_all_expenses} onChange={(v) => set("require_accounting_for_all_expenses", v)} />
          </Row>
          <Row label={t("allowResubmission")} description={t("allowResubmissionDesc")}>
            <Toggle value={!!form.allow_resubmission_after_rejection} onChange={(v) => set("allow_resubmission_after_rejection", v)} />
          </Row>
        </SectionPanel>
      </div>

      <div>
        <PatternSectionLabel>{t("sectionC")}</PatternSectionLabel>
        <SectionPanel>
          <Row label={t("escalatePolicyFailures")} description={t("escalatePolicyFailuresDesc")}>
            <Toggle value={!!form.escalate_policy_failures_to_accounting} onChange={(v) => set("escalate_policy_failures_to_accounting", v)} />
          </Row>
          <Row label={t("escalateInternational")} description={t("escalateInternationalDesc")}>
            <Toggle value={!!form.escalate_international_to_accounting} onChange={(v) => set("escalate_international_to_accounting", v)} />
          </Row>
        </SectionPanel>
        <p className="mt-1.5 px-1 text-[9px] text-muted leading-relaxed">
          Para reglas más específicas (por monto, proveedor, categoría), usa <span className="text-tertiary">Políticas de IA</span>.
        </p>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-md border border-error/30 bg-error/5 px-3 py-2">
          <AlertCircle className="h-3.5 w-3.5 text-error" />
          <p className="text-[10px] text-error">{error}</p>
        </div>
      )}
    </div>
  );
}
