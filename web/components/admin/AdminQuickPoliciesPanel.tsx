"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2, Save, CheckCircle2 } from "lucide-react";
import { getAuthHeaders } from "@/lib/session";

const API = process.env.NEXT_PUBLIC_API_BASE_URL;

// ── helpers ───────────────────────────────────────────────────────────────────

function Row({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-white/[0.04] px-3 py-2 last:border-0">
      <div className="min-w-0">
        <p className="text-[10.5px] text-white/55">{label}</p>
        {hint && <p className="text-[9px] text-white/22 leading-snug mt-0.5">{hint}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function Toggle({
  value,
  onChange,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className={`relative inline-flex h-4 w-7 items-center rounded-full transition-colors ${
        value ? "bg-teal-500/50" : "bg-white/[0.12]"
      }`}
    >
      <span
        className={`inline-block h-3 w-3 rounded-full bg-white/70 shadow transition-transform ${
          value ? "translate-x-3.5" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}

function Select({
  value,
  options,
  onChange,
}: {
  value: string;
  options: { label: string; value: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded border border-white/[0.08] bg-zinc-900 px-2 py-0.5 text-[10px] text-white/60 outline-none focus:border-white/20"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

function NumberInput({
  value,
  onChange,
  placeholder,
}: {
  value: number | null | undefined;
  onChange: (v: number | null) => void;
  placeholder?: string;
}) {
  return (
    <input
      type="number"
      value={value ?? ""}
      onChange={(e) =>
        onChange(e.target.value === "" ? null : Number(e.target.value))
      }
      placeholder={placeholder ?? "—"}
      className="w-24 rounded border border-white/[0.08] bg-zinc-900 px-2 py-0.5 text-right text-[10px] text-white/60 outline-none focus:border-white/20"
    />
  );
}

function GroupHeader({ title }: { title: string }) {
  return (
    <p className="px-3 pb-0.5 pt-3 text-[8.5px] font-bold uppercase tracking-[0.12em] text-white/20">
      {title}
    </p>
  );
}

// ── types ──────────────────────────────────────────────────────────────────────

interface PolicyState {
  // Expense
  xml_required_mode: string;
  tickets_allowed: boolean;
  require_justification: boolean;
  require_proof: boolean;
  max_amount_per_expense: number | null;
  manager_approval_required: boolean;
  // Approval
  approval_mode: string;
  manager_approval_threshold: number | null;
  escalate_policy_failures_to_accounting: boolean;
  allow_resubmission_after_rejection: boolean;
  // Accounting
  poliza_required: boolean;
  cost_center_required: boolean;
  project_required: boolean;
  accounting_review_threshold: number | null;
  // Workflow
  block_submit_on_failed_validation: boolean;
  route_policy_failures_to: string;
  auto_approve_below_threshold: boolean;
  auto_approve_threshold: number | null;
}

function buildState(ep: any, ap: any, ac: any, wf: any): PolicyState {
  return {
    xml_required_mode:                     ep?.xml_required_mode                     ?? "always",
    tickets_allowed:                        ep?.tickets_allowed                        ?? false,
    require_justification:                  ep?.require_justification                  ?? false,
    require_proof:                          ep?.require_proof                          ?? false,
    max_amount_per_expense:                 ep?.max_amount_per_expense                 ?? null,
    manager_approval_required:              ep?.manager_approval_required              ?? false,
    approval_mode:                          ap?.approval_mode                          ?? "none",
    manager_approval_threshold:             ap?.manager_approval_threshold             ?? null,
    escalate_policy_failures_to_accounting: ap?.escalate_policy_failures_to_accounting ?? false,
    allow_resubmission_after_rejection:     ap?.allow_resubmission_after_rejection     ?? false,
    poliza_required:                        ac?.poliza_required                        ?? false,
    cost_center_required:                   ac?.cost_center_required                   ?? false,
    project_required:                       ac?.project_required                       ?? false,
    accounting_review_threshold:            ac?.accounting_review_threshold            ?? null,
    block_submit_on_failed_validation:      wf?.block_submit_on_failed_validation      ?? false,
    route_policy_failures_to:               wf?.route_policy_failures_to               ?? "none",
    auto_approve_below_threshold:           wf?.auto_approve_below_threshold           ?? false,
    auto_approve_threshold:                 wf?.auto_approve_threshold                 ?? null,
  };
}

// ── main ──────────────────────────────────────────────────────────────────────

export default function AdminQuickPoliciesPanel({
  companyId,
  expensePolicy,
  approvalSetup,
  accountingSetup,
  workflowSetup,
  onSaved,
}: {
  companyId: number;
  expensePolicy: any;
  approvalSetup: any;
  accountingSetup: any;
  workflowSetup: any;
  onSaved: (domain: "expense" | "approval" | "accounting" | "workflow", data: any) => void;
}) {
  const [state, setState] = useState<PolicyState>(() =>
    buildState(expensePolicy, approvalSetup, accountingSetup, workflowSetup)
  );
  const [saving, setSaving] = useState(false);
  const [saved,  setSaved]  = useState(false);
  const [error,  setError]  = useState<string | null>(null);
  const t = useTranslations("admin.quickPolicies");

  const patch = <K extends keyof PolicyState>(key: K, value: PolicyState[K]) => {
    setState((s) => ({ ...s, [key]: value }));
    setSaved(false);
  };

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    setError(null);
    const h = { "Content-Type": "application/json", ...getAuthHeaders() };
    try {
      const [epRes, apRes, acRes, wfRes] = await Promise.all([
        // Expense policy
        fetch(`${API}/expenses/policy/${companyId}`, {
          method: "PUT", headers: h,
          body: JSON.stringify({
            ...(expensePolicy ?? {}),
            xml_required_mode:        state.xml_required_mode,
            tickets_allowed:           state.tickets_allowed,
            require_justification:     state.require_justification,
            require_proof:             state.require_proof,
            max_amount_per_expense:    state.max_amount_per_expense,
            manager_approval_required: state.manager_approval_required,
          }),
        }),
        // Approval setup
        fetch(`${API}/admin/approval-setup/${companyId}`, {
          method: "PUT", headers: h,
          body: JSON.stringify({
            ...(approvalSetup ?? {}),
            approval_mode:                          state.approval_mode,
            manager_approval_threshold:             state.manager_approval_threshold,
            escalate_policy_failures_to_accounting: state.escalate_policy_failures_to_accounting,
            allow_resubmission_after_rejection:     state.allow_resubmission_after_rejection,
          }),
        }),
        // Accounting setup
        fetch(`${API}/admin/accounting-setup/${companyId}`, {
          method: "PUT", headers: h,
          body: JSON.stringify({
            ...(accountingSetup ?? {}),
            poliza_required:             state.poliza_required,
            cost_center_required:        state.cost_center_required,
            project_required:            state.project_required,
            accounting_review_threshold: state.accounting_review_threshold,
          }),
        }),
        // Workflow setup
        fetch(`${API}/admin/workflow-setup/${companyId}`, {
          method: "PUT", headers: h,
          body: JSON.stringify({
            ...(workflowSetup ?? {}),
            block_submit_on_failed_validation: state.block_submit_on_failed_validation,
            route_policy_failures_to:          state.route_policy_failures_to,
            auto_approve_below_threshold:      state.auto_approve_below_threshold,
            auto_approve_threshold:            state.auto_approve_threshold,
          }),
        }),
      ]);

      const failures = [epRes, apRes, acRes, wfRes].filter((r) => !r.ok);
      if (failures.length > 0) throw new Error(`${failures.length} domain(s) failed to save`);

      const [epData, apData, acData, wfData] = await Promise.all([
        epRes.json(), apRes.json(), acRes.json(), wfRes.json(),
      ]);
      onSaved("expense",    epData);
      onSaved("approval",   apData);
      onSaved("accounting", acData);
      onSaved("workflow",   wfData);
      setSaved(true);
    } catch (e: any) {
      setError(e?.message ?? t("saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  const xmlOptions = [
    { value: "always",           label: t("xmlAlways") },
    { value: "above_threshold",  label: t("xmlAboveThreshold") },
    { value: "optional",         label: t("xmlOptional") },
    { value: "never",            label: t("xmlNever") },
  ];
  const approvalModeOptions = [
    { value: "none",                    label: t("approvalNone") },
    { value: "manager_only",            label: t("approvalManagerOnly") },
    { value: "accounting_only",         label: t("approvalAccountingOnly") },
    { value: "manager_then_accounting", label: t("approvalManagerThenAccounting") },
    { value: "accounting_then_manager", label: t("approvalAccountingThenManager") },
  ];
  const routeOptions = [
    { value: "none",       label: t("routeNone") },
    { value: "manager",    label: t("routeManager") },
    { value: "accounting", label: t("routeAccounting") },
  ];

  return (
    <div className="space-y-1">
      {/* Receipts */}
      <GroupHeader title={t("receipts")} />
      <div className="overflow-hidden rounded border border-white/[0.07] bg-white/[0.01]">
        <Row label={t("cfdiXmlRequirement")}>
          <Select value={state.xml_required_mode} options={xmlOptions} onChange={(v) => patch("xml_required_mode", v)} />
        </Row>
        <Row label={t("acceptTicketReceipts")} hint={t("nonCfdiHint")}>
          <Toggle value={state.tickets_allowed} onChange={(v) => patch("tickets_allowed", v)} />
        </Row>
        <Row label={t("requireJustification")}>
          <Toggle value={state.require_justification} onChange={(v) => patch("require_justification", v)} />
        </Row>
        <Row label={t("requireProof")}>
          <Toggle value={state.require_proof} onChange={(v) => patch("require_proof", v)} />
        </Row>
        <Row label={t("maxAmountPerExpense")} hint={t("noCapHint")}>
          <NumberInput value={state.max_amount_per_expense} onChange={(v) => patch("max_amount_per_expense", v)} placeholder={t("noCap")} />
        </Row>
      </div>

      {/* Approvals */}
      <GroupHeader title={t("approvals")} />
      <div className="overflow-hidden rounded border border-white/[0.07] bg-white/[0.01]">
        <Row label={t("managerApprovalRequired")}>
          <Toggle value={state.manager_approval_required} onChange={(v) => patch("manager_approval_required", v)} />
        </Row>
        <Row label={t("approvalFlow")}>
          <Select value={state.approval_mode} options={approvalModeOptions} onChange={(v) => patch("approval_mode", v)} />
        </Row>
        <Row label={t("managerApprovalThreshold")} hint={t("requireManagerAboveHint")}>
          <NumberInput value={state.manager_approval_threshold} onChange={(v) => patch("manager_approval_threshold", v)} placeholder={t("allAmounts")} />
        </Row>
        <Row label={t("escalatePolicyFailures")}>
          <Toggle value={state.escalate_policy_failures_to_accounting} onChange={(v) => patch("escalate_policy_failures_to_accounting", v)} />
        </Row>
        <Row label={t("allowResubmission")}>
          <Toggle value={state.allow_resubmission_after_rejection} onChange={(v) => patch("allow_resubmission_after_rejection", v)} />
        </Row>
      </div>

      {/* Accounting */}
      <GroupHeader title={t("accounting")} />
      <div className="overflow-hidden rounded border border-white/[0.07] bg-white/[0.01]">
        <Row label={t("polizaRequired")}>
          <Toggle value={state.poliza_required} onChange={(v) => patch("poliza_required", v)} />
        </Row>
        <Row label={t("costCenterRequired")}>
          <Toggle value={state.cost_center_required} onChange={(v) => patch("cost_center_required", v)} />
        </Row>
        <Row label={t("projectRequired")}>
          <Toggle value={state.project_required} onChange={(v) => patch("project_required", v)} />
        </Row>
        <Row label={t("accountingReviewThreshold")} hint={t("reviewAboveHint")}>
          <NumberInput value={state.accounting_review_threshold} onChange={(v) => patch("accounting_review_threshold", v)} placeholder={t("allAmounts")} />
        </Row>
      </div>

      {/* Workflow */}
      <GroupHeader title={t("workflow")} />
      <div className="overflow-hidden rounded border border-white/[0.07] bg-white/[0.01]">
        <Row label={t("blockSubmission")}>
          <Toggle value={state.block_submit_on_failed_validation} onChange={(v) => patch("block_submit_on_failed_validation", v)} />
        </Row>
        <Row label={t("routePolicyFailures")}>
          <Select value={state.route_policy_failures_to} options={routeOptions} onChange={(v) => patch("route_policy_failures_to", v)} />
        </Row>
        <Row label={t("autoApproveBelow")}>
          <Toggle value={state.auto_approve_below_threshold} onChange={(v) => patch("auto_approve_below_threshold", v)} />
        </Row>
        {state.auto_approve_below_threshold && (
          <Row label={t("autoApproveThreshold")}>
            <NumberInput value={state.auto_approve_threshold} onChange={(v) => patch("auto_approve_threshold", v)} />
          </Row>
        )}
      </div>

      {/* Save bar */}
      <div className="flex items-center gap-3 pt-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center gap-1.5 rounded border border-teal-500/25 bg-teal-600/[0.09] px-3 py-1.5 text-[10px] font-semibold text-teal-300/65 transition-colors hover:bg-teal-600/[0.16] disabled:cursor-not-allowed disabled:opacity-40"
        >
          {saving ? <><Loader2 className="h-3 w-3 animate-spin" /> {t("saving")}</> : <><Save className="h-3 w-3" /> {t("savePolicies")}</>}
        </button>
        {saved && (
          <span className="flex items-center gap-1 text-[10px] text-emerald-400/60">
            <CheckCircle2 className="h-3 w-3" /> {t("savedAcrossDomains")}
          </span>
        )}
        {error && <span className="text-[10px] text-red-400/60">{error}</span>}
      </div>
    </div>
  );
}
