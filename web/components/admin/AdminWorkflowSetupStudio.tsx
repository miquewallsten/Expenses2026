"use client";

import { useState, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { Save, Loader2, CheckCircle2, Sparkles, AlertTriangle, AlertCircle } from "lucide-react";
import { apiCall, HttpError } from "@/lib/api/client";
import {
  getPortalConfigConflicts,
  type PortalConfigConflict,
} from "@/lib/portal-config-conflicts";

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
  const t = useTranslations("admin.workflowSetup");
  const tc = useTranslations("common");

  // ── Option sets (inside component to use t()) ──────────────────────────────
  const WORKFLOW_MODE_OPTIONS = [
    { value: "standard",                label: t("modeStandard") },
    { value: "manager_only",            label: t("modeManagerOnly") },
    { value: "accounting_only",         label: t("modeAccountingOnly") },
    { value: "manager_then_accounting", label: t("modeManagerThenAccounting") },
    { value: "direct_accounting",       label: t("modeDirectAccounting") },
    { value: "policy_driven",           label: t("modePolicyDriven") },
  ];

  const ROUTE_TO_OPTIONS = [
    { value: "manager",    label: t("routeToManager") },
    { value: "accounting", label: t("routeToAccounting") },
    { value: "employee",   label: t("routeToEmployee") },
    { value: "none",       label: t("routeToNone") },
  ];

  // ── Local-only warnings ──────────────────────────────────────────────────
  function buildLocalWarnings(
    form: Record<string, any>,
    expensePolicy?: any,
    accountingSetup?: any,
    approvalSetup?: any,
  ): string[] {
    const w: string[] = [];
    const mode = form.default_expense_workflow_mode ?? "standard";
    const needsAccounting = ["accounting_only", "manager_then_accounting", "direct_accounting"].includes(mode);
    if (needsAccounting && accountingSetup?.accounting_review_mode === "none")
      w.push(t("warnAccountingModeNone"));
    if (form.auto_submit_on_complete_upload && !form.block_submit_on_failed_validation)
      w.push(t("warnAutoSubmitNoBlock"));
    const strictDocPolicy =
      expensePolicy?.xml_required_mode === "always" ||
      expensePolicy?.pdf_pair_required_for_cfdi === true ||
      !expensePolicy?.tickets_allowed;
    if (form.allow_submit_with_warnings && strictDocPolicy)
      w.push(t("warnSubmitWithWarningsStrict"));
    const strictControls =
      approvalSetup?.require_accounting_for_all_expenses === true ||
      accountingSetup?.accounting_review_mode === "always" ||
      accountingSetup?.poliza_required === true;
    if (!form.block_submit_on_failed_validation && strictControls)
      w.push(t("warnNoBlockStrictControls"));
    if (form.route_missing_documents_to === "none" && strictDocPolicy)
      w.push(t("warnMissingDocsNoneStrict"));
    if (form.route_policy_failures_to === "none")
      w.push(t("warnPolicyFailuresNone"));
    if (mode === "policy_driven" && approvalSetup?.approval_mode === "none" && accountingSetup?.accounting_review_mode === "none")
      w.push(t("warnPolicyDrivenNoReviewers"));
    return w;
  }

  // ── Summary builder ──────────────────────────────────────────────────────
  function buildSummary(form: Record<string, any>): string {
    const parts: string[] = [];
    const modeLabel = WORKFLOW_MODE_OPTIONS.find((o) => o.value === form.default_expense_workflow_mode)?.label;
    if (modeLabel) parts.push(modeLabel);
    if (form.ai_workflow_assist_enabled) parts.push("AI");
    return parts.join(" · ") || t("noWorkflowConfigured");
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
      const updated = await apiCall(`/admin/workflow-setup/${companyId}`, {
        method: "PUT",
        json: form,
      });
      setDirty(false);
      setSaved(true);
      setAiDrafted(false);
      onSaved?.(updated);
    } catch (e: any) {
      setError(e instanceof HttpError ? e.message : tc("save"));
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
      <div className="rounded-lg border border-default bg-surface-1 px-4 py-2.5">
        <div className="flex items-start justify-between gap-3">
          <p className="text-[10px] leading-relaxed text-muted">{buildSummary(form)}</p>
          {aiDrafted && (
            <span className="flex shrink-0 items-center gap-1 rounded border border-blue-500/20 bg-blue-500/[0.06] px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-widest text-accent/50">
              <Sparkles className="h-2.5 w-2.5" /> {tc("draft")}
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

      {/* A — Workflow Mode */}
      <div>
        <SectionLabel>{t("sectionA")}</SectionLabel>
        <Panel>
          <SelectRow
            label={t("defaultWorkflowMode")}
            description={t("defaultWorkflowModeDesc")}
            value={form.default_expense_workflow_mode ?? "standard"}
            options={WORKFLOW_MODE_OPTIONS}
            onChange={(v) => set("default_expense_workflow_mode", v)}
          />
          <ToggleRow
            label={t("autoSubmitOnUpload")}
            description={t("autoSubmitOnUploadDesc")}
            checked={!!form.auto_submit_on_complete_upload}
            onChange={(v) => set("auto_submit_on_complete_upload", v)}
          />
          <ToggleRow
            label={t("autoAssignReviewStage")}
            description={t("autoAssignReviewStageDesc")}
            checked={!!form.auto_assign_review_stage}
            onChange={(v) => set("auto_assign_review_stage", v)}
          />
        </Panel>
      </div>

      {/* B — Submission Controls */}
      <div>
        <SectionLabel>{t("sectionB")}</SectionLabel>
        <Panel>
          <ToggleRow
            label={t("blockOnFailedValidation")}
            description={t("blockOnFailedValidationDesc")}
            checked={!!form.block_submit_on_failed_validation}
            onChange={(v) => set("block_submit_on_failed_validation", v)}
          />
          <ToggleRow
            label={t("allowSubmitWithWarnings")}
            description={t("allowSubmitWithWarningsDesc")}
            checked={!!form.allow_submit_with_warnings}
            onChange={(v) => set("allow_submit_with_warnings", v)}
          />
          <ToggleRow
            label={t("allowDraftSave")}
            description={t("allowDraftSaveDesc")}
            checked={!!form.allow_draft_save}
            onChange={(v) => set("allow_draft_save", v)}
          />
          <ToggleRow
            label={t("allowResubmitAfterReturn")}
            description={t("allowResubmitAfterReturnDesc")}
            checked={!!form.allow_resubmit_after_return}
            onChange={(v) => set("allow_resubmit_after_return", v)}
          />
        </Panel>
      </div>

      {/* C — Routing Rules */}
      <div>
        <SectionLabel>{t("sectionC")}</SectionLabel>
        <Panel>
          <SelectRow
            label={t("routePolicyFailures")}
            description={t("routePolicyFailuresDesc")}
            value={form.route_policy_failures_to ?? "accounting"}
            options={ROUTE_TO_OPTIONS}
            onChange={(v) => set("route_policy_failures_to", v)}
          />
          <SelectRow
            label={t("routeMissingDocs")}
            description={t("routeMissingDocsDesc")}
            value={form.route_missing_documents_to ?? "employee"}
            options={ROUTE_TO_OPTIONS}
            onChange={(v) => set("route_missing_documents_to", v)}
          />
          <SelectRow
            label={t("routeInternational")}
            description={t("routeInternationalDesc")}
            value={form.route_international_expenses_to ?? "accounting"}
            options={ROUTE_TO_OPTIONS}
            onChange={(v) => set("route_international_expenses_to", v)}
          />
        </Panel>
      </div>

      {/* D — Employee Guidance */}
      <div>
        <SectionLabel>{t("sectionD")}</SectionLabel>
        <Panel>
          <ToggleRow
            label={t("showNextAction")}
            description={t("showNextActionDesc")}
            checked={!!form.show_next_action_guidance}
            onChange={(v) => set("show_next_action_guidance", v)}
          />
        </Panel>
      </div>

      {/* E — AI Assistance */}
      <div>
        <SectionLabel>{t("sectionE")}</SectionLabel>
        <Panel>
          <ToggleRow
            label={t("aiWorkflowAssist")}
            description={t("aiWorkflowAssistDesc")}
            checked={!!form.ai_workflow_assist_enabled}
            onChange={(v) => set("ai_workflow_assist_enabled", v)}
          />
          <TextareaRow
            label={t("aiWorkflowNotes")}
            description={t("aiWorkflowNotesDesc")}
            value={form.ai_workflow_notes ?? ""}
            placeholder={t("aiWorkflowNotesPlaceholder")}
            onChange={(v) => set("ai_workflow_notes", v || null)}
          />
        </Panel>
      </div>

      {/* Save bar */}
      {error && (
        <p className="text-[10px] text-error/70">{error}</p>
      )}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={saving || !dirty}
          className="flex items-center gap-1.5 rounded border bg-accent-muted bg-accent-muted px-4 py-1.5 text-[10px] font-semibold text-accent transition-colors hover:bg-accent-muted disabled:cursor-not-allowed disabled:opacity-40"
        >
          {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
          {t("saveWorkflowSetup")}
        </button>
        {saved && !dirty && (
          <span className="flex items-center gap-1 text-[10px] text-success/60">
            <CheckCircle2 className="h-3 w-3" /> {tc("saved")}
          </span>
        )}
      </div>

    </div>
  );
}
