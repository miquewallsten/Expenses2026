"use client";

import { useState, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { Save, Loader2, CheckCircle2, Sparkles, AlertTriangle, AlertCircle, GitBranch } from "lucide-react";
import { apiCall, HttpError } from "@/lib/api/client";
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
  SECTION_ACCENTS,
} from "@/components/admin/shared/AdminPatterns";

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
      <PremiumHeader
        section="approval-workflow"
        icon={<GitBranch className="h-4 w-4" />}
        title={t("title")}
        subtitle="Approval Flow Configuration"
        badge={
          aiDrafted ? (
            <span className="flex items-center gap-1.5 rounded-full border border-ai/30 bg-ai-muted px-2 py-0.5 text-[9px] font-semibold text-ai">
              <Sparkles className="h-3 w-3" /> {tc("draft")}
            </span>
          ) : null
        }
        action={
          <button
            type="button"
            onClick={save}
            disabled={saving || !dirty}
            className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-indigo-500 to-indigo-600 px-4 py-1.5 text-[11px] font-semibold text-white shadow-sm shadow-indigo-500/20 transition-all hover:shadow-md hover:shadow-indigo-500/30 disabled:opacity-40 disabled:shadow-none"
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            {tc("save")}
          </button>
        }
        metrics={[
          {
            label: t("unsavedChanges"),
            value: dirty ? "!" : "0",
            tone: dirty ? "warning" : "neutral",
          },
        ]}
      />

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
              {c.severity === "critical" ? (
                <AlertCircle className="mt-0.5 h-3 w-3 shrink-0 text-error/55" />
              ) : (
                <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-warning/55" />
              )}
              <p className={`text-[10px] leading-relaxed ${c.severity === "critical" ? "text-error/60" : "text-warning/55"}`}>
                {c.message}
              </p>
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
        <PatternSectionLabel>{t("sectionA")}</PatternSectionLabel>
        <SectionPanel>
          <Row label={t("defaultWorkflowMode")} description={t("defaultWorkflowModeDesc")}>
            <select
              value={form.default_expense_workflow_mode ?? "standard"}
              onChange={(e) => set("default_expense_workflow_mode", e.target.value)}
              className={`${inputClasses.select} w-44`}
            >
              <option value="">—</option>
              {WORKFLOW_MODE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </Row>
          <Row label={t("autoSubmitOnUpload")} description={t("autoSubmitOnUploadDesc")}>
            <Toggle
              value={!!form.auto_submit_on_complete_upload}
              onChange={(v) => set("auto_submit_on_complete_upload", v)}
            />
          </Row>
          <Row label={t("autoAssignReviewStage")} description={t("autoAssignReviewStageDesc")}>
            <Toggle value={!!form.auto_assign_review_stage} onChange={(v) => set("auto_assign_review_stage", v)} />
          </Row>
        </SectionPanel>
      </div>

      {/* B — Submission Controls */}
      <div>
        <PatternSectionLabel>{t("sectionB")}</PatternSectionLabel>
        <SectionPanel>
          <Row label={t("blockOnFailedValidation")} description={t("blockOnFailedValidationDesc")}>
            <Toggle
              value={!!form.block_submit_on_failed_validation}
              onChange={(v) => set("block_submit_on_failed_validation", v)}
            />
          </Row>
          <Row label={t("allowSubmitWithWarnings")} description={t("allowSubmitWithWarningsDesc")}>
            <Toggle value={!!form.allow_submit_with_warnings} onChange={(v) => set("allow_submit_with_warnings", v)} />
          </Row>
          <Row label={t("allowDraftSave")} description={t("allowDraftSaveDesc")}>
            <Toggle value={!!form.allow_draft_save} onChange={(v) => set("allow_draft_save", v)} />
          </Row>
          <Row label={t("allowResubmitAfterReturn")} description={t("allowResubmitAfterReturnDesc")}>
            <Toggle value={!!form.allow_resubmit_after_return} onChange={(v) => set("allow_resubmit_after_return", v)} />
          </Row>
        </SectionPanel>
      </div>

      {/* C — Routing Rules */}
      <div>
        <PatternSectionLabel>{t("sectionC")}</PatternSectionLabel>
        <SectionPanel>
          <Row label={t("routePolicyFailures")} description={t("routePolicyFailuresDesc")}>
            <select
              value={form.route_policy_failures_to ?? "accounting"}
              onChange={(e) => set("route_policy_failures_to", e.target.value)}
              className={`${inputClasses.select} w-44`}
            >
              {ROUTE_TO_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </Row>
          <Row label={t("routeMissingDocs")} description={t("routeMissingDocsDesc")}>
            <select
              value={form.route_missing_documents_to ?? "employee"}
              onChange={(e) => set("route_missing_documents_to", e.target.value)}
              className={`${inputClasses.select} w-44`}
            >
              {ROUTE_TO_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </Row>
          <Row label={t("routeInternational")} description={t("routeInternationalDesc")}>
            <select
              value={form.route_international_expenses_to ?? "accounting"}
              onChange={(e) => set("route_international_expenses_to", e.target.value)}
              className={`${inputClasses.select} w-44`}
            >
              {ROUTE_TO_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </Row>
        </SectionPanel>
      </div>

      {/* D — Employee Guidance */}
      <div>
        <PatternSectionLabel>{t("sectionD")}</PatternSectionLabel>
        <SectionPanel>
          <Row label={t("showNextAction")} description={t("showNextActionDesc")}>
            <Toggle value={!!form.show_next_action_guidance} onChange={(v) => set("show_next_action_guidance", v)} />
          </Row>
        </SectionPanel>
      </div>

      {/* E — AI Assistance */}
      <div>
        <PatternSectionLabel>{t("sectionE")}</PatternSectionLabel>
        <SectionPanel>
          <Row label={t("aiWorkflowAssist")} description={t("aiWorkflowAssistDesc")}>
            <Toggle value={!!form.ai_workflow_assist_enabled} onChange={(v) => set("ai_workflow_assist_enabled", v)} />
          </Row>
          <RowStack label={t("aiWorkflowNotes")} description={t("aiWorkflowNotesDesc")}>
            <textarea
              rows={2}
              value={form.ai_workflow_notes ?? ""}
              placeholder={t("aiWorkflowNotesPlaceholder")}
              onChange={(e) => set("ai_workflow_notes", e.target.value || null)}
              className={`${inputClasses.textarea} w-full`}
            />
          </RowStack>
        </SectionPanel>
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
