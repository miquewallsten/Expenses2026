"use client";

import { useState, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { Save, Loader2, CheckCircle2, Sparkles, AlertTriangle, AlertCircle, GitBranch } from "lucide-react";
import { apiCall } from "@/lib/api/client";
import {
  getPortalConfigConflicts,
  type PortalConfigConflict,
} from "@/lib/portal-config-conflicts";

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

// ── Shared sub-components ─────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-1 px-1 text-[9px] font-bold uppercase tracking-widest text-muted">
      {children}
    </p>
  );
}

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-lg border border-default bg-surface-1 divide-y divide-white/[0.05]">
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
        <p className="text-[11px] font-medium text-secondary">{label}</p>
        {description && <p className="text-[10px] text-muted">{description}</p>}
      </div>
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        className="shrink-0 rounded border border-default bg-surface-1 px-2 py-1 text-[10px] text-tertiary outline-none focus:bg-accent-muted"
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
        <p className="text-[11px] font-medium text-secondary">{label}</p>
        {description && <p className="text-[10px] text-muted">{description}</p>}
      </div>
      <input
        type="number"
        value={value ?? ""}
        placeholder={placeholder ?? "—"}
        onChange={(e) => {
          const v = e.target.value;
          onChange(v === "" ? null : parseFloat(v));
        }}
        className="w-32 shrink-0 rounded border border-default bg-surface-1 px-2 py-1 text-[10px] text-tertiary placeholder:text-muted outline-none focus:bg-accent-muted"
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
        <p className="text-[11px] font-medium text-secondary">{label}</p>
        {description && <p className="text-[10px] text-muted">{description}</p>}
      </div>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-4 w-7 shrink-0 cursor-pointer rounded-full border transition-colors ${
          checked
            ? "bg-accent-muted bg-accent-muted"
            : "border-default bg-surface-2"
        }`}
      >
        <span
          className={`absolute top-0.5 h-3 w-3 rounded-full transition-transform ${
            checked ? "translate-x-3 bg-accent" : "translate-x-0.5 bg-surface-2"
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
        <p className="text-[11px] font-medium text-secondary">{label}</p>
        {description && <p className="text-[10px] text-muted">{description}</p>}
      </div>
      <textarea
        rows={2}
        value={value ?? ""}
        placeholder={placeholder ?? "—"}
        onChange={(e) => onChange(e.target.value)}
        className="w-full resize-none rounded border border-default bg-surface-1 px-2 py-1.5 text-[10px] text-tertiary placeholder:text-muted outline-none focus:bg-accent-muted"
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
  const t = useTranslations("admin.approvalSetup");
  const tc = useTranslations("common");

  // ── Option sets (inside component to use t()) ──────────────────────────────
  const APPROVAL_MODE_OPTIONS = [
    { value: "none",                    label: t("modeNone") },
    { value: "manager_only",            label: t("modeManagerOnly") },
    { value: "accounting_only",         label: t("modeAccountingOnly") },
    { value: "manager_then_accounting", label: t("modeManagerThenAccounting") },
    { value: "threshold_based",         label: t("modeThresholdBased") },
  ];

  // ── Local-only warnings ──────────────────────────────────────────────────
  function buildLocalWarnings(form: Record<string, any>, accountingSetup?: any): string[] {
    const w: string[] = [];
    const mode = form.approval_mode ?? "none";
    const needsAccounting = ["accounting_only", "manager_then_accounting", "threshold_based"].includes(mode);
    if (needsAccounting && accountingSetup?.accounting_review_mode === "none")
      w.push(t("warnAccountingModeNone"));
    if (form.escalate_policy_failures_to_accounting && accountingSetup?.accounting_review_mode === "none")
      w.push(t("warnEscalateNoReviewer"));
    return w;
  }

  // ── Summary builder ──────────────────────────────────────────────────────
  function buildSummary(form: Record<string, any>): string {
    const parts: string[] = [];
    const modeLabel = APPROVAL_MODE_OPTIONS.find((o) => o.value === form.approval_mode)?.label;
    if (modeLabel) parts.push(modeLabel);
    if (form.approval_mode === "threshold_based") {
      if (form.manager_threshold_amount != null)
        parts.push(`${form.manager_threshold_amount}`);
    }
    return parts.join(" · ") || t("noApprovalConfigured");
  }

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
      const updated = await apiCall(`/admin/approval-setup/${companyId}`, {
        method: "PUT",
        json: form,
      });
      setDirty(false);
      setSaved(true);
      setAiDrafted(false);
      onSaved?.(updated);
    } catch (e: any) {
      setError(e?.message ?? tc("save"));
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

      {/* Premium header with amber accent */}
      <div className="relative overflow-hidden rounded-xl border border-default bg-gradient-to-r from-surface-1 via-surface-1 to-amber-500/[0.02]">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--color-amber-500)/5%,_transparent_50%)]" />
        <div className="relative flex items-center justify-between border-b border-subtle px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500 to-amber-600 shadow-sm shadow-amber-500/30">
              <GitBranch className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-primary">{t("title")}</h2>
              <p className="text-[10px] text-muted">Approval Routing Configuration</p>
            </div>
            {aiDrafted && (
              <span className="flex items-center gap-1.5 rounded-full border border-ai/30 bg-ai-muted px-2 py-0.5 text-[9px] font-semibold text-ai">
                <Sparkles className="h-3 w-3" /> {tc("draft")}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={save}
            disabled={saving || !dirty}
            className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-amber-500 to-amber-600 px-4 py-2 text-[11px] font-semibold text-white shadow-sm shadow-amber-500/20 transition-all hover:shadow-md hover:shadow-amber-500/30 disabled:opacity-40 disabled:shadow-none"
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            {tc("save")}
          </button>
        </div>

        {/* Status indicators */}
        <div className="relative flex items-center gap-4 px-5 py-2.5">
          <span className="text-[10px] text-muted">{buildSummary(form)}</span>
          {dirty && !saved && (
            <span className="flex items-center gap-1.5 text-[10px] text-warning">
              <AlertCircle className="h-3 w-3" />
              {t("unsavedChanges")}
            </span>
          )}
          {saved && !dirty && (
            <span className="flex items-center gap-1.5 text-[10px] text-success">
              <CheckCircle2 className="h-3 w-3" />
              {tc("saved")}
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
                ? <AlertCircle   className="mt-0.5 h-3 w-3 shrink-0 text-error/55" />
                : <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-warning/55" />
              }
              <p className={`text-[10px] leading-relaxed ${
                c.severity === "critical" ? "text-error/60" : "text-warning/55"
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
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-warning/55" />
              <p className="text-[10px] leading-relaxed text-warning/55">{w}</p>
            </div>
          ))}
        </div>
      )}

      {/* A — Approval Routing */}
      <div>
        <SectionLabel>{t("sectionA")}</SectionLabel>
        <Panel>
          <SelectRow
            label={t("approvalMode")}
            description={t("approvalModeDesc")}
            value={form.approval_mode ?? "none"}
            options={APPROVAL_MODE_OPTIONS}
            onChange={(v) => set("approval_mode", v)}
          />
          {isThreshold && (
            <NumberRow
              label={t("managerThreshold")}
              description={t("managerThresholdDesc")}
              value={form.manager_threshold_amount ?? null}
              placeholder={t("managerThresholdPlaceholder")}
              onChange={(v) => set("manager_threshold_amount", v)}
            />
          )}
        </Panel>
      </div>

      {/* B — Default Review Rules */}
      <div>
        <SectionLabel>{t("sectionB")}</SectionLabel>
        <Panel>
          <ToggleRow
            label={t("requireManagerAll")}
            description={t("requireManagerAllDesc")}
            checked={!!form.require_manager_for_all_employees}
            onChange={(v) => set("require_manager_for_all_employees", v)}
          />
          <ToggleRow
            label={t("requireAccountingAll")}
            description={t("requireAccountingAllDesc")}
            checked={!!form.require_accounting_for_all_expenses}
            onChange={(v) => set("require_accounting_for_all_expenses", v)}
          />
          <ToggleRow
            label={t("allowResubmission")}
            description={t("allowResubmissionDesc")}
            checked={!!form.allow_resubmission_after_rejection}
            onChange={(v) => set("allow_resubmission_after_rejection", v)}
          />
        </Panel>
      </div>

      {/* C — Escalation Rules */}
      <div>
        <SectionLabel>{t("sectionC")}</SectionLabel>
        <Panel>
          <ToggleRow
            label={t("escalatePolicyFailures")}
            description={t("escalatePolicyFailuresDesc")}
            checked={!!form.escalate_policy_failures_to_accounting}
            onChange={(v) => set("escalate_policy_failures_to_accounting", v)}
          />
          <ToggleRow
            label={t("escalateInternational")}
            description={t("escalateInternationalDesc")}
            checked={!!form.escalate_international_to_accounting}
            onChange={(v) => set("escalate_international_to_accounting", v)}
          />
        </Panel>
        <p className="mt-1 px-1 text-[9.5px] text-muted leading-relaxed">
          Para reglas más específicas (por monto, por proveedor, por categoría), usa <span className="text-tertiary">Políticas de IA</span>.
        </p>
      </div>

      {/* Save bar - minimal since save is in header */}
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-error/30 bg-error-muted/20 px-3 py-2">
          <AlertCircle className="h-3.5 w-3.5 text-error" />
          <p className="text-[10px] text-error">{error}</p>
        </div>
      )}

    </div>
  );
}
