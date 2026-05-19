"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useTranslations } from "next-intl";
import {
  GitBranch, Save, Loader2, CheckCircle2, AlertTriangle, AlertCircle,
  ArrowRight, RefreshCw, Shield, Zap,
} from "lucide-react";
import { apiCall, apiPost } from "@/lib/api/client";
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
  StatusBadge,
} from "@/components/admin/shared/AdminPatterns";

// ── Types ────────────────────────────────────────────────────────────────────

interface Stage {
  id: number;
  company_id: number;
  module_key: string;
  stage_key: string;
  stage_name: string;
  stage_order: number;
  is_terminal: boolean;
  created_at: string;
}

interface Transition {
  id: number;
  company_id: number;
  module_key: string;
  from_stage_key: string;
  to_stage_key: string;
  action_key: string;
  required_permission_key: string;
  created_at: string;
}

interface Props {
  companyId: number;
  workflowSetup: any;
  approvalSetup: any;
  companySetup?: any;
  expensePolicy?: any;
  accountingSetup?: any;
  onSaved?: (setup: any) => void;
  draftPatch?: Partial<any>;
}

// ── Conflict code sets ───────────────────────────────────────────────────────

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

// ── Approval mode options ────────────────────────────────────────────────────

const APPROVAL_MODE_OPTIONS = [
  { value: "none", labelKey: "modeNone" },
  { value: "manager_only", labelKey: "modeManagerOnly" },
  { value: "accounting_only", labelKey: "modeAccountingOnly" },
  { value: "manager_then_accounting", labelKey: "modeManagerThenAccounting" },
  { value: "threshold", labelKey: "modeThresholdBased" },
];

// ── Workflow mode options ────────────────────────────────────────────────────

const WORKFLOW_MODE_OPTIONS = [
  { value: "standard", labelKey: "modeStandard" },
  { value: "manager_only", labelKey: "modeManagerOnly" },
  { value: "accounting_only", labelKey: "modeAccountingOnly" },
  { value: "manager_then_accounting", labelKey: "modeManagerThenAccounting" },
  { value: "direct_accounting", labelKey: "modeDirectAccounting" },
  { value: "policy_driven", labelKey: "modePolicyDriven" },
];

const ROUTE_TO_OPTIONS = [
  { value: "manager", labelKey: "routeToManager" },
  { value: "accounting", labelKey: "routeToAccounting" },
  { value: "employee", labelKey: "routeToEmployee" },
  { value: "none", labelKey: "routeToNone" },
];

// ── Stage color scheme ─────────────────────────────────────────────────────

function stageColors(key: string): { fill: string; border: string; text: string } {
  if (/paid|complete/.test(key))
    return { fill: "var(--color-emerald-500)", border: "var(--color-emerald-500)", text: "var(--color-emerald-300)" };
  if (/^approved$/.test(key))
    return { fill: "var(--color-emerald-500)", border: "var(--color-emerald-500)", text: "var(--color-emerald-300)" };
  if (/reject/.test(key))
    return { fill: "var(--color-rose-500)", border: "var(--color-rose-500)", text: "var(--color-rose-300)" };
  if (/accounting/.test(key))
    return { fill: "var(--color-violet-500)", border: "var(--color-violet-500)", text: "var(--color-violet-300)" };
  if (/manager/.test(key))
    return { fill: "var(--color-amber-500)", border: "var(--color-amber-500)", text: "var(--color-amber-300)" };
  if (/submit/.test(key))
    return { fill: "var(--color-blue-400)", border: "var(--color-blue-400)", text: "var(--color-blue-300)" };
  return { fill: "var(--color-surface-2)", border: "var(--color-default)", text: "var(--color-secondary)" };
}

// ── Presets ────────────────────────────────────────────────────────────────

const PRESETS = [
  {
    key: "simple",
    label: "Simple",
    desc: "Draft → Submit → Approve → Paid",
    stages: [
      { stage_key: "draft", stage_name: "Draft", stage_order: 1, is_terminal: false },
      { stage_key: "submitted", stage_name: "Submitted", stage_order: 2, is_terminal: false },
      { stage_key: "approved", stage_name: "Approved", stage_order: 3, is_terminal: false },
      { stage_key: "paid", stage_name: "Paid", stage_order: 4, is_terminal: true },
    ],
    transitions: [
      { from_stage_key: "draft", to_stage_key: "submitted", action_key: "submit", required_permission_key: "submit_expense" },
      { from_stage_key: "submitted", to_stage_key: "approved", action_key: "approve", required_permission_key: "approve_expense" },
      { from_stage_key: "approved", to_stage_key: "paid", action_key: "mark_paid", required_permission_key: "mark_paid" },
    ],
  },
  {
    key: "two_tier",
    label: "Two-tier",
    desc: "Draft → Submit → Manager → Accounting → Paid",
    stages: [
      { stage_key: "draft", stage_name: "Draft", stage_order: 1, is_terminal: false },
      { stage_key: "submitted", stage_name: "Submitted", stage_order: 2, is_terminal: false },
      { stage_key: "manager_approved", stage_name: "Manager Approved", stage_order: 3, is_terminal: false },
      { stage_key: "accounting_approved", stage_name: "Accounting Approved", stage_order: 4, is_terminal: false },
      { stage_key: "paid", stage_name: "Paid", stage_order: 5, is_terminal: true },
    ],
    transitions: [
      { from_stage_key: "draft", to_stage_key: "submitted", action_key: "submit", required_permission_key: "submit_expense" },
      { from_stage_key: "submitted", to_stage_key: "manager_approved", action_key: "manager_approve", required_permission_key: "manager_approve_expense" },
      { from_stage_key: "manager_approved", to_stage_key: "accounting_approved", action_key: "accounting_approve", required_permission_key: "accounting_approve_expense" },
      { from_stage_key: "accounting_approved", to_stage_key: "paid", action_key: "mark_paid", required_permission_key: "mark_paid" },
    ],
  },
  {
    key: "auto_small",
    label: "Auto-approve small",
    desc: "Draft → Submit → Auto Approved → Paid",
    stages: [
      { stage_key: "draft", stage_name: "Draft", stage_order: 1, is_terminal: false },
      { stage_key: "submitted", stage_name: "Submitted", stage_order: 2, is_terminal: false },
      { stage_key: "auto_approved", stage_name: "Auto Approved", stage_order: 3, is_terminal: false },
      { stage_key: "paid", stage_name: "Paid", stage_order: 4, is_terminal: true },
    ],
    transitions: [
      { from_stage_key: "draft", to_stage_key: "submitted", action_key: "submit", required_permission_key: "submit_expense" },
      { from_stage_key: "submitted", to_stage_key: "auto_approved", action_key: "auto_approve", required_permission_key: "auto_approve_expense" },
      { from_stage_key: "auto_approved", to_stage_key: "paid", action_key: "mark_paid", required_permission_key: "mark_paid" },
    ],
  },
];

// ── SVG layout constants ────────────────────────────────────────────────────

const NODE_W = 130;
const NODE_H = 32;
const H_GAP = 70;
const V_GAP = 50;

// ── Component ────────────────────────────────────────────────────────────────

export default function AdminApprovalWorkflowPanel({
  companyId,
  workflowSetup,
  approvalSetup,
  companySetup,
  expensePolicy,
  accountingSetup,
  onSaved,
  draftPatch,
}: Props) {
  const ta = useTranslations("admin.approvalSetup");
  const tw = useTranslations("admin.workflowSetup");
  const tm = useTranslations("admin.workflowMap");
  const tc = useTranslations("common");

  // ── i18n-driven option sets ────────────────────────────────────────────────
  const approvalModeOptions = APPROVAL_MODE_OPTIONS.map((o) => ({
    value: o.value,
    label: ta(o.labelKey),
  }));

  const workflowModeOptions = WORKFLOW_MODE_OPTIONS.map((o) => ({
    value: o.value,
    label: tw(o.labelKey),
  }));

  const routeToOptions = ROUTE_TO_OPTIONS.map((o) => ({
    value: o.value,
    label: tw(o.labelKey),
  }));

  // ── Approval form state ───────────────────────────────────────────────────
  const [approvalForm, setApprovalForm] = useState<Record<string, any>>({
    ...approvalSetup,
    ...draftPatch,
  });

  // ── Workflow form state ───────────────────────────────────────────────────
  const [workflowForm, setWorkflowForm] = useState<Record<string, any>>({
    ...workflowSetup,
  });

  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── SVG state ─────────────────────────────────────────────────────────────
  const [stages, setStages] = useState<Stage[]>([]);
  const [transitions, setTransitions] = useState<Transition[]>([]);
  const [selectedStage, setSelectedStage] = useState<Stage | null>(null);
  const [selectedTx, setSelectedTx] = useState<Transition | null>(null);
  const [loadingMap, setLoadingMap] = useState(true);
  const [applying, setApplying] = useState<string | null>(null);

  // ── Sync props ────────────────────────────────────────────────────────────
  useEffect(() => {
    setApprovalForm({ ...approvalSetup, ...draftPatch });
    setWorkflowForm({ ...workflowSetup });
    setDirty(false);
    setSaved(false);
  }, [approvalSetup, workflowSetup]);

  useEffect(() => {
    if (draftPatch) {
      setApprovalForm((f) => ({ ...f, ...draftPatch }));
      setDirty(true);
      setSaved(false);
    }
  }, [draftPatch]);

  // ── Helpers ────────────────────────────────────────────────────────────────
  function setApproval(key: string, val: any) {
    setApprovalForm((f) => ({ ...f, [key]: val }));
    setDirty(true);
    setSaved(false);
  }

  function setWorkflow(key: string, val: any) {
    setWorkflowForm((f) => ({ ...f, [key]: val }));
    setDirty(true);
    setSaved(false);
  }

  // ── Cross-domain conflicts ────────────────────────────────────────────────
  const allConflicts = getPortalConfigConflicts({
    company_setup: companySetup ?? {},
    expense_policy: expensePolicy ?? {},
    accounting_setup: accountingSetup ?? {},
    approval_setup: approvalForm,
    workflow_setup: workflowForm,
  }).filter((c) => APPROVAL_CODES.has(c.code) || WORKFLOW_CODES.has(c.code));

  // ── Approval warnings ─────────────────────────────────────────────────────
  const approvalWarnings: string[] = [];
  if (approvalForm.approval_mode !== "none" && !companySetup?.has_managers)
    approvalWarnings.push("Modo de aprobación activo pero no hay gerentes configurados.");
  if (approvalForm.require_accounting_for_all_expenses && accountingSetup?.accounting_review_mode === "none")
    approvalWarnings.push("Se requiere revisión contable pero el modo de revisión es 'ninguno'.");

  // ── Workflow warnings ──────────────────────────────────────────────────────
  const workflowWarnings: string[] = [];
  const mode = workflowForm.default_expense_workflow_mode ?? "standard";
  if (["accounting_only", "manager_then_accounting", "direct_accounting"].includes(mode) && accountingSetup?.accounting_review_mode === "none")
    workflowWarnings.push(tw("warnAccountingModeNone"));
  if (workflowForm.auto_submit_on_complete_upload && !workflowForm.block_submit_on_failed_validation)
    workflowWarnings.push(tw("warnAutoSubmitNoBlock"));
  if (workflowForm.route_policy_failures_to === "none")
    workflowWarnings.push(tw("warnPolicyFailuresNone"));

  // ── Active rule count ──────────────────────────────────────────────────────
  const activeRules = [
    approvalForm.require_manager_for_all_employees,
    approvalForm.require_accounting_for_all_expenses,
    approvalForm.allow_resubmission_after_rejection,
    approvalForm.escalate_policy_failures_to_accounting,
    approvalForm.escalate_international_to_accounting,
    workflowForm.block_submit_on_failed_validation,
    workflowForm.show_next_action_guidance,
    workflowForm.ai_workflow_assist_enabled,
  ].filter(Boolean).length;

  const isThreshold = approvalForm.approval_mode === "threshold";

  // ── Load stages & transitions ──────────────────────────────────────────────
  function loadMap() {
    setLoadingMap(true);
    apiCall(`/company/${companyId}/workflow/stages?module_key=expenses`)
      .then((d: any) => { setStages(d.stages ?? d); setLoadingMap(false); })
      .catch(() => setLoadingMap(false));
    apiCall(`/company/${companyId}/workflow/transitions?module_key=expenses`)
      .then((d: any) => setTransitions(d.transitions ?? d))
      .catch(() => {});
  }

  useEffect(() => { loadMap(); }, [companyId]);

  // ── Apply preset ───────────────────────────────────────────────────────────
  async function applyPreset(preset: typeof PRESETS[number]) {
    setApplying(preset.key);
    try {
      await apiPost(`/company/${companyId}/workflow/stages/bulk`, {
        module_key: "expenses", stages: preset.stages,
      });
      await apiPost(`/company/${companyId}/workflow/transitions/bulk`, {
        module_key: "expenses", transitions: preset.transitions,
      });
      loadMap();
    } catch { } finally { setApplying(null); }
  }

  // ── Unified save ──────────────────────────────────────────────────────────
  const saveTimer = useRef<ReturnType<typeof setTimeout>>(null);
  async function handleSave() {
    setSaving(true); setError(null);
    try {
      const results = await Promise.all([
        apiCall(`/company/${companyId}/approval-setup`, {
          method: "PUT",
          body: JSON.stringify(approvalForm),
        }),
        apiCall(`/company/${companyId}/workflow-setup`, {
          method: "PUT",
          body: JSON.stringify(workflowForm),
        }),
      ]);
      setDirty(false); setSaved(true);
      onSaved?.(results[0]);
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => setSaved(false), 3000);
    } catch (e: any) {
      setError(e?.message ?? "Error al guardar");
    } finally { setSaving(false); }
  }

  // ── SVG layout ────────────────────────────────────────────────────────────
  const nodePositions = stages
    .sort((a, b) => a.stage_order - b.stage_order)
    .map((stage, i) => ({
      stage,
      x: 24 + (i % 5) * (NODE_W + H_GAP),
      y: 24 + Math.floor(i / 5) * (NODE_H + V_GAP),
    }));

  function edgePath(from: { x: number; y: number }, to: { x: number; y: number }): string {
    const x1 = from.x + NODE_W;
    const y1 = from.y + NODE_H / 2;
    const x2 = to.x;
    const y2 = to.y + NODE_H / 2;
    const cx = (x1 + x2) / 2;
    return `M ${x1} ${y1} C ${cx} ${y1}, ${cx} ${y2}, ${x2} ${y2}`;
  }

  const canvasW = Math.max(600, nodePositions.length > 0 ? nodePositions[nodePositions.length - 1].x + NODE_W + 24 : 600);
  const canvasH = Math.max(120, nodePositions.length > 0 ? nodePositions[nodePositions.length - 1].y + NODE_H + 24 : 120);

  // ── Summary ────────────────────────────────────────────────────────────────
  const modeLabel = approvalModeOptions.find((o) => o.value === approvalForm.approval_mode)?.label;
  const summaryParts: string[] = [];
  if (modeLabel) summaryParts.push(modeLabel);
  if (approvalForm.require_manager_for_all_employees) summaryParts.push("Gerente obligatorio");
  if (approvalForm.require_accounting_for_all_expenses) summaryParts.push("Contabilidad obligatoria");
  if (stages.length > 0) summaryParts.push(`${stages.length} etapas`);

  return (
    <div className="space-y-5">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <PremiumHeader
        icon={<GitBranch className="h-4 w-4" />}
        title={ta("title")}
        section="approval-workflow"
        metrics={[
          { label: tc("active"), value: activeRules, tone: activeRules > 0 ? "success" : "neutral" },
          { label: tm("stagesUnit"), value: stages.length },
          { label: tm("transitionsUnit"), value: transitions.length },
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

      {/* ── Summary strip ──────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-1">
        <span className="text-[10px] text-muted">{summaryParts.join(" · ") || "Sin configuración"}</span>
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

      {/* ── Conflicts ──────────────────────────────────────────────────────── */}
      {allConflicts.length > 0 && (
        <div className="space-y-1.5">
          {allConflicts.map((c, i) => (
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

      {/* ── 1. Approval Routing ────────────────────────────────────────────── */}
      <div>
        <PatternSectionLabel>{ta("sectionA")}</PatternSectionLabel>
        <SectionPanel>
          <Row label={ta("approvalMode")} description={ta("approvalModeDesc")}>
            <select
              value={approvalForm.approval_mode ?? "none"}
              onChange={(e) => setApproval("approval_mode", e.target.value)}
              className={`${inputClasses.select} w-52`}
            >
              {approvalModeOptions.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </Row>
          {isThreshold && (
            <Row label={ta("managerThreshold")} description={ta("managerThresholdDesc")}>
              <input
                type="number"
                value={approvalForm.manager_threshold_amount ?? ""}
                placeholder={ta("managerThresholdPlaceholder")}
                onChange={(e) => {
                  const v = e.target.value;
                  setApproval("manager_threshold_amount", v === "" ? null : parseFloat(v));
                }}
                className={`${inputClasses.base} w-36`}
              />
            </Row>
          )}
          <Row label={ta("requireManagerAll")} description={ta("requireManagerAllDesc")}>
            <Toggle value={!!approvalForm.require_manager_for_all_employees} onChange={(v) => setApproval("require_manager_for_all_employees", v)} />
          </Row>
          <Row label={ta("requireAccountingAll")} description={ta("requireAccountingAllDesc")}>
            <Toggle value={!!approvalForm.require_accounting_for_all_expenses} onChange={(v) => setApproval("require_accounting_for_all_expenses", v)} />
          </Row>
          <Row label={ta("allowResubmission")} description={ta("allowResubmissionDesc")}>
            <Toggle value={!!approvalForm.allow_resubmission_after_rejection} onChange={(v) => setApproval("allow_resubmission_after_rejection", v)} />
          </Row>
        </SectionPanel>
      </div>

      {/* ── Approval warnings ──────────────────────────────────────────────── */}
      {approvalWarnings.length > 0 && (
        <div className="space-y-1.5">
          {approvalWarnings.map((w, i) => (
            <div key={i} className="flex items-start gap-2 rounded-md border border-warning/15 bg-warning/[0.04] px-3 py-2">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-warning/55" />
              <p className="text-[10px] leading-relaxed text-warning/55">{w}</p>
            </div>
          ))}
        </div>
      )}

      {/* ── 2. Escalation Rules ────────────────────────────────────────────── */}
      <div>
        <PatternSectionLabel>{ta("sectionC")}</PatternSectionLabel>
        <SectionPanel>
          <Row label={ta("escalatePolicyFailures")} description={ta("escalatePolicyFailuresDesc")}>
            <Toggle value={!!approvalForm.escalate_policy_failures_to_accounting} onChange={(v) => setApproval("escalate_policy_failures_to_accounting", v)} />
          </Row>
          <Row label={ta("escalateInternational")} description={ta("escalateInternationalDesc")}>
            <Toggle value={!!approvalForm.escalate_international_to_accounting} onChange={(v) => setApproval("escalate_international_to_accounting", v)} />
          </Row>
        </SectionPanel>
        <p className="mt-1.5 px-1 text-[9px] text-muted leading-relaxed">
          Para reglas más específicas (por monto, proveedor, categoría), usa <span className="text-tertiary">Políticas de IA</span>.
        </p>
      </div>

      {/* ── 3. Workflow Map ────────────────────────────────────────────────── */}
      <div>
        <PatternSectionLabel>{tm("canvasTitle")}</PatternSectionLabel>

        {/* Presets strip */}
        <div className="mb-2 flex items-center gap-2 flex-wrap">
          {PRESETS.map((p) => (
            <button
              key={p.key}
              type="button"
              disabled={applying !== null}
              onClick={() => applyPreset(p)}
              className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1 text-[9px] font-medium transition-all ${
                applying === p.key
                  ? "border-accent/40 bg-accent/10 text-accent"
                  : "border-default bg-surface-2 text-secondary hover:border-strong hover:bg-surface-3"
              } disabled:opacity-40`}
            >
              {applying === p.key && <Loader2 className="h-3 w-3 animate-spin" />}
              <span className="font-semibold">{p.label}</span>
              <span className="text-muted">{p.desc}</span>
            </button>
          ))}
          <button
            type="button"
            onClick={loadMap}
            className="inline-flex items-center gap-1.5 rounded-md border border-default bg-surface-2 px-3 py-1 text-[9px] font-medium text-muted transition-all hover:border-strong hover:text-secondary"
          >
            <RefreshCw className="h-3 w-3" /> {tm("refresh")}
          </button>
        </div>

        {/* Canvas */}
        <div className="rounded-md border border-default bg-surface-1 overflow-hidden">
          {loadingMap ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-muted" />
            </div>
          ) : stages.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <p className="text-[10px] text-muted">{tm("noStages")}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <svg width={canvasW} height={canvasH} viewBox={`0 0 ${canvasW} ${canvasH}`} className="block">
                <defs>
                  <marker id="wf-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                    <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--color-tertiary)" />
                  </marker>
                  <marker id="wf-arrow-sel" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                    <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--color-accent)" />
                  </marker>
                </defs>

                {transitions.map((tx) => {
                  const fromNP = nodePositions.find((n) => n.stage.stage_key === tx.from_stage_key);
                  const toNP = nodePositions.find((n) => n.stage.stage_key === tx.to_stage_key);
                  if (!fromNP || !toNP) return null;
                  const isSel = selectedTx?.id === tx.id;
                  const midX = (fromNP.x + NODE_W + toNP.x) / 2;
                  const midY = (fromNP.y + NODE_H / 2 + toNP.y + NODE_H / 2) / 2;
                  return (
                    <g key={tx.id} onClick={() => { setSelectedTx(tx); setSelectedStage(null); }} style={{ cursor: "pointer" }}>
                      <path d={edgePath(fromNP, toNP)} fill="none" stroke="transparent" strokeWidth={10} />
                      <path d={edgePath(fromNP, toNP)} fill="none"
                        stroke={isSel ? "var(--color-accent)" : "var(--color-tertiary)"}
                        strokeWidth={isSel ? 2 : 1.5}
                        markerEnd={isSel ? "url(#wf-arrow-sel)" : "url(#wf-arrow)"}
                      />
                      <text x={midX} y={midY - 7} textAnchor="middle"
                        style={{ fontSize: "9px", fill: "var(--color-tertiary)", fontFamily: "monospace" }}>
                        {tx.action_key}
                      </text>
                    </g>
                  );
                })}

                {nodePositions.map(({ stage, x, y }) => {
                  const { fill, border, text } = stageColors(stage.stage_key);
                  const isSel = selectedStage?.id === stage.id;
                  const label = stage.stage_name.length > 14 ? stage.stage_name.slice(0, 13) + "…" : stage.stage_name;
                  return (
                    <g key={stage.id} onClick={() => { setSelectedStage(stage); setSelectedTx(null); }} style={{ cursor: "pointer" }}>
                      <rect x={x} y={y} width={NODE_W} height={NODE_H} rx={5}
                        fill={fill} stroke={isSel ? "var(--color-accent)" : border} strokeWidth={isSel ? 2 : 1} />
                      <text x={x + NODE_W / 2} y={y + NODE_H / 2 + 1}
                        textAnchor="middle" dominantBaseline="middle"
                        style={{ fontSize: "10px", fontWeight: 600, fill: text, fontFamily: "system-ui,sans-serif" }}>
                        {label}
                      </text>
                      {stage.is_terminal && (
                        <circle cx={x + NODE_W - 8} cy={y + 8} r={3.5} fill="var(--color-emerald-500)" />
                      )}
                    </g>
                  );
                })}
              </svg>
            </div>
          )}

          {/* Inspector strip */}
          {(selectedStage || selectedTx) && (
            <div className="border-t border-subtle bg-surface-2/50 px-4 py-3">
              {selectedStage && (
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-[9px] font-bold uppercase tracking-widest text-muted">{tm("inspStage")}</p>
                    <p className="mt-1 text-[11px] font-semibold text-secondary">{selectedStage.stage_name}</p>
                    <p className="mt-0.5 font-mono text-[9px] text-muted">{selectedStage.stage_key}</p>
                    <p className="mt-0.5 text-[9px] text-muted">
                      {tm("orderLabel")}: {selectedStage.stage_order} · {selectedStage.is_terminal ? tm("terminal") : tm("notTerminal")}
                    </p>
                  </div>
                  <button onClick={() => setSelectedStage(null)} className="shrink-0 text-[10px] text-muted hover:text-secondary">✕</button>
                </div>
              )}
              {selectedTx && (
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-[9px] font-bold uppercase tracking-widest text-muted">{tm("inspTransition")}</p>
                    <p className="mt-1 font-mono text-[10px] text-secondary">
                      {selectedTx.from_stage_key} <ArrowRight className="inline h-3 w-3 text-muted" /> {selectedTx.to_stage_key}
                    </p>
                    <p className="mt-0.5 text-[9px] text-muted">
                      {tm("actionLabel")}: <span className="font-mono text-accent/70">{selectedTx.action_key}</span>
                    </p>
                    <p className="mt-0.5 text-[9px] text-muted">
                      {tm("permLabel")}: <span className="font-mono text-accent/60">{selectedTx.required_permission_key}</span>
                    </p>
                  </div>
                  <button onClick={() => setSelectedTx(null)} className="shrink-0 text-[10px] text-muted hover:text-secondary">✕</button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── 4. Workflow Mode ────────────────────────────────────────────────── */}
      <div>
        <PatternSectionLabel>{tw("sectionA")}</PatternSectionLabel>
        <SectionPanel>
          <Row label={tw("defaultWorkflowMode")} description={tw("defaultWorkflowModeDesc")}>
            <select
              value={workflowForm.default_expense_workflow_mode ?? "standard"}
              onChange={(e) => setWorkflow("default_expense_workflow_mode", e.target.value)}
              className={`${inputClasses.select} w-52`}
            >
              {workflowModeOptions.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </Row>
          <Row label={tw("autoSubmitOnUpload")} description={tw("autoSubmitOnUploadDesc")}>
            <Toggle value={!!workflowForm.auto_submit_on_complete_upload} onChange={(v) => setWorkflow("auto_submit_on_complete_upload", v)} />
          </Row>
          <Row label={tw("autoAssignReviewStage")} description={tw("autoAssignReviewStageDesc")}>
            <Toggle value={!!workflowForm.auto_assign_review_stage} onChange={(v) => setWorkflow("auto_assign_review_stage", v)} />
          </Row>
        </SectionPanel>
      </div>

      {/* ── 5. Submission Controls ─────────────────────────────────────────── */}
      <div>
        <PatternSectionLabel>{tw("sectionB")}</PatternSectionLabel>
        <SectionPanel>
          <Row label={tw("blockOnFailedValidation")} description={tw("blockOnFailedValidationDesc")}>
            <Toggle value={!!workflowForm.block_submit_on_failed_validation} onChange={(v) => setWorkflow("block_submit_on_failed_validation", v)} />
          </Row>
          <Row label={tw("allowSubmitWithWarnings")} description={tw("allowSubmitWithWarningsDesc")}>
            <Toggle value={!!workflowForm.allow_submit_with_warnings} onChange={(v) => setWorkflow("allow_submit_with_warnings", v)} />
          </Row>
          <Row label={tw("allowDraftSave")} description={tw("allowDraftSaveDesc")}>
            <Toggle value={!!workflowForm.allow_draft_save} onChange={(v) => setWorkflow("allow_draft_save", v)} />
          </Row>
          <Row label={tw("allowResubmitAfterReturn")} description={tw("allowResubmitAfterReturnDesc")}>
            <Toggle value={!!workflowForm.allow_resubmit_after_return} onChange={(v) => setWorkflow("allow_resubmit_after_return", v)} />
          </Row>
        </SectionPanel>
      </div>

      {/* ── Workflow warnings ───────────────────────────────────────────────── */}
      {workflowWarnings.length > 0 && (
        <div className="space-y-1.5">
          {workflowWarnings.map((w, i) => (
            <div key={i} className="flex items-start gap-2 rounded-md border border-warning/15 bg-warning/[0.04] px-3 py-2">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-warning/55" />
              <p className="text-[10px] leading-relaxed text-warning/55">{w}</p>
            </div>
          ))}
        </div>
      )}

      {/* ── 6. Routing Rules ───────────────────────────────────────────────── */}
      <div>
        <PatternSectionLabel>{tw("sectionC")}</PatternSectionLabel>
        <SectionPanel>
          <Row label={tw("routePolicyFailures")} description={tw("routePolicyFailuresDesc")}>
            <select
              value={workflowForm.route_policy_failures_to ?? "accounting"}
              onChange={(e) => setWorkflow("route_policy_failures_to", e.target.value)}
              className={`${inputClasses.select} w-44`}
            >
              {routeToOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </Row>
          <Row label={tw("routeMissingDocs")} description={tw("routeMissingDocsDesc")}>
            <select
              value={workflowForm.route_missing_documents_to ?? "employee"}
              onChange={(e) => setWorkflow("route_missing_documents_to", e.target.value)}
              className={`${inputClasses.select} w-44`}
            >
              {routeToOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </Row>
          <Row label={tw("routeInternational")} description={tw("routeInternationalDesc")}>
            <select
              value={workflowForm.route_international_expenses_to ?? "accounting"}
              onChange={(e) => setWorkflow("route_international_expenses_to", e.target.value)}
              className={`${inputClasses.select} w-44`}
            >
              {routeToOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </Row>
        </SectionPanel>
      </div>

      {/* ── 7. Employee Guidance ───────────────────────────────────────────── */}
      <div>
        <PatternSectionLabel>{tw("sectionD")}</PatternSectionLabel>
        <SectionPanel>
          <Row label={tw("showNextAction")} description={tw("showNextActionDesc")}>
            <Toggle value={!!workflowForm.show_next_action_guidance} onChange={(v) => setWorkflow("show_next_action_guidance", v)} />
          </Row>
        </SectionPanel>
      </div>

      {/* ── 8. AI Assistance ───────────────────────────────────────────────── */}
      <div>
        <PatternSectionLabel>{tw("sectionE")}</PatternSectionLabel>
        <SectionPanel>
          <Row label={tw("aiWorkflowAssist")} description={tw("aiWorkflowAssistDesc")}>
            <Toggle value={!!workflowForm.ai_workflow_assist_enabled} onChange={(v) => setWorkflow("ai_workflow_assist_enabled", v)} />
          </Row>
          <RowStack label={tw("aiWorkflowNotes")} description={tw("aiWorkflowNotesDesc")}>
            <textarea
              rows={2}
              value={workflowForm.ai_workflow_notes ?? ""}
              placeholder={tw("aiWorkflowNotesPlaceholder")}
              onChange={(e) => setWorkflow("ai_workflow_notes", e.target.value || null)}
              className={`${inputClasses.textarea} w-full`}
            />
          </RowStack>
        </SectionPanel>
      </div>

      {/* ── Error ──────────────────────────────────────────────────────────── */}
      {error && (
        <div className="flex items-center gap-2 rounded-md border border-error/30 bg-error/5 px-3 py-2">
          <AlertCircle className="h-3.5 w-3.5 text-error" />
          <p className="text-[10px] text-error">{error}</p>
        </div>
      )}
    </div>
  );
}
