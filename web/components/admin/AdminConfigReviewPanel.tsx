"use client";

import { useTranslations } from "next-intl";
import { ChevronRight } from "lucide-react";

// ── helpers ───────────────────────────────────────────────────────────────────

function fmt(v: any): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "boolean") return v ? "yes" : "no";
  return String(v).replace(/_/g, " ");
}

function money(v: number | null | undefined, currency = "MXN"): string {
  if (!v && v !== 0) return "—";
  return `${currency} ${Number(v).toLocaleString()}`;
}

// ── types ──────────────────────────────────────────────────────────────────────

interface Rule {
  text: string;
  section: string;
  badge?: "ok" | "warn" | "info";
}

// ── sub-components ────────────────────────────────────────────────────────────

function ReviewSection({
  title,
  rules,
  onNavigate,
  editLabel,
}: {
  title: string;
  rules: Rule[];
  onNavigate: (s: string) => void;
  editLabel: string;
}) {
  if (rules.length === 0) return null;
  return (
    <div className="space-y-0.5">
      <p className="pb-0.5 text-[8.5px] font-bold uppercase tracking-[0.12em] text-white/20">{title}</p>
      {rules.map((r, i) => (
        <div
          key={i}
          className={`group flex items-start gap-2 rounded border px-2.5 py-1.5 ${
            r.badge === "warn"
              ? "border-amber-500/[0.12] bg-amber-500/[0.03]"
              : r.badge === "ok"
              ? "border-white/[0.06] bg-white/[0.01]"
              : "border-white/[0.06] bg-white/[0.01]"
          }`}
        >
          <p
            className={`flex-1 text-[10.5px] leading-snug ${
              r.badge === "warn" ? "text-amber-300/55" : "text-white/42"
            }`}
          >
            {r.text}
          </p>
          <button
            type="button"
            onClick={() => onNavigate(r.section)}
            className="shrink-0 flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 rounded px-1 py-0.5 text-[8px] font-medium text-white/28 hover:bg-white/[0.05] hover:text-white/55"
          >
            {editLabel} <ChevronRight className="h-2.5 w-2.5" />
          </button>
        </div>
      ))}
    </div>
  );
}

// ── main component ────────────────────────────────────────────────────────────

export default function AdminConfigReviewPanel({
  portalConfig,
  companySetup,
  expensePolicy,
  accountingSetup,
  approvalSetup,
  workflowSetup,
  onNavigate,
}: {
  portalConfig: any;
  companySetup: any;
  expensePolicy: any;
  accountingSetup: any;
  approvalSetup: any;
  workflowSetup: any;
  onNavigate: (section: string) => void;
}) {
  const t = useTranslations("admin.configReview");

  // ── Expense rules ──────────────────────────────────────────────────────────
  const expenseRules: Rule[] = [];
  if (expensePolicy) {
    const xmlMode = expensePolicy.xml_required_mode;
    if (xmlMode === "always") {
      expenseRules.push({ text: "CFDI/XML receipt required on every expense.", section: "Expense Policy", badge: "ok" });
    } else if (xmlMode === "above_threshold") {
      expenseRules.push({
        text: `CFDI/XML required for expenses above ${money(expensePolicy.xml_threshold_amount)}.`,
        section: "Expense Policy", badge: "ok",
      });
    } else {
      expenseRules.push({ text: "CFDI/XML not required. Expenses can be submitted without a digital receipt.", section: "Expense Policy", badge: "warn" });
    }

    if (expensePolicy.tickets_allowed) {
      expenseRules.push({ text: "Ticket-based (non-CFDI) receipts are accepted as supporting documents.", section: "Expense Policy" });
    }
    if (expensePolicy.require_justification) {
      expenseRules.push({ text: "Written justification is required on every expense submission.", section: "Expense Policy", badge: "ok" });
    }
    if (expensePolicy.require_proof) {
      expenseRules.push({ text: "Proof of payment (image or PDF) must be attached to every expense.", section: "Expense Policy", badge: "ok" });
    }
    if (!expensePolicy.require_justification && !expensePolicy.require_proof) {
      expenseRules.push({ text: "Neither justification nor proof is required — consider enabling at least one for audit trails.", section: "Expense Policy", badge: "warn" });
    }

    if (expensePolicy.max_amount_per_expense) {
      expenseRules.push({
        text: `Single-expense cap: ${money(expensePolicy.max_amount_per_expense)}.`,
        section: "Expense Policy",
      });
    }
    if (expensePolicy.reimbursable_only != null) {
      expenseRules.push({
        text: expensePolicy.reimbursable_only
          ? "Only reimbursable expenses are accepted."
          : "Both reimbursable and non-reimbursable expenses are accepted.",
        section: "Expense Policy",
      });
    }
  } else {
    expenseRules.push({ text: "Expense policy not configured yet.", section: "Expense Policy", badge: "warn" });
  }

  // ── Approval chain ─────────────────────────────────────────────────────────
  const approvalRules: Rule[] = [];
  if (approvalSetup) {
    const mode = (approvalSetup.approval_mode ?? "none").replace(/_/g, " ");
    approvalRules.push({ text: `Approval mode: ${mode}.`, section: "Approval Setup" });

    if (expensePolicy?.manager_approval_required) {
      approvalRules.push({ text: "Manager approval is required before the expense reaches accounting.", section: "Approval Setup", badge: "ok" });
    } else {
      approvalRules.push({ text: "Manager approval is disabled — expenses go directly to accounting review.", section: "Approval Setup", badge: "warn" });
    }

    if (approvalSetup.manager_approval_threshold != null && approvalSetup.manager_approval_threshold > 0) {
      approvalRules.push({
        text: `Manager approval required for expenses above ${money(approvalSetup.manager_approval_threshold)}.`,
        section: "Approval Setup",
      });
    }

    if (approvalSetup.escalate_policy_failures_to_accounting) {
      approvalRules.push({ text: "Policy failures automatically escalate to accounting for review.", section: "Approval Setup", badge: "ok" });
    } else {
      approvalRules.push({ text: "Policy failures are not escalated — they must be reviewed manually.", section: "Approval Setup", badge: "warn" });
    }

    if (approvalSetup.allow_resubmission_after_rejection) {
      approvalRules.push({ text: "Employees may resubmit an expense after it has been rejected.", section: "Approval Setup" });
    } else {
      approvalRules.push({ text: "Resubmission after rejection is disabled — employees must contact an admin.", section: "Approval Setup" });
    }
  } else {
    approvalRules.push({ text: "Approval setup not configured yet.", section: "Approval Setup", badge: "warn" });
  }

  // ── Accounting ─────────────────────────────────────────────────────────────
  const accountingRules: Rule[] = [];
  if (accountingSetup) {
    const reviewMode = (accountingSetup.accounting_review_mode ?? "all").replace(/_/g, " ");
    accountingRules.push({ text: `Accounting reviews: ${reviewMode}.`, section: "Accounting Setup" });

    if (accountingSetup.accounting_review_threshold != null && accountingSetup.accounting_review_threshold > 0) {
      accountingRules.push({
        text: `Accounting review required for expenses above ${money(accountingSetup.accounting_review_threshold)}.`,
        section: "Accounting Setup",
      });
    }

    if (accountingSetup.poliza_required) {
      accountingRules.push({ text: "Póliza XML is required before an export bundle can be generated.", section: "Accounting Setup", badge: "ok" });
    } else {
      accountingRules.push({ text: "Póliza XML is not required for export.", section: "Accounting Setup" });
    }

    const dims: string[] = [];
    if (accountingSetup.project_required) dims.push("project");
    if (accountingSetup.cost_center_required) dims.push("cost center");
    if (dims.length > 0) {
      accountingRules.push({ text: `Allocation required: employees must assign a ${dims.join(" and ")} to every expense.`, section: "Accounting Setup", badge: "ok" });
    } else {
      accountingRules.push({ text: "No allocation dimensions (project / cost center) are required.", section: "Accounting Setup" });
    }

    if (accountingSetup.operating_multi_country) {
      accountingRules.push({ text: "Multi-country mode is active — expenses may span multiple legal entities.", section: "Accounting Setup" });
    }
  } else {
    accountingRules.push({ text: "Accounting setup not configured yet.", section: "Accounting Setup", badge: "warn" });
  }

  // ── Workflow ───────────────────────────────────────────────────────────────
  const workflowRules: Rule[] = [];
  if (workflowSetup) {
    const wfMode = (workflowSetup.default_expense_workflow_mode ?? "standard").replace(/_/g, " ");
    workflowRules.push({ text: `Expense workflow: ${wfMode}.`, section: "Workflow Setup" });

    if (workflowSetup.block_submit_on_failed_validation) {
      workflowRules.push({ text: "Submission is blocked when validation fails — invalid expenses cannot be sent forward.", section: "Workflow Setup", badge: "ok" });
    } else {
      workflowRules.push({ text: "Failed validation does not block submission — expenses can still be forwarded.", section: "Workflow Setup", badge: "warn" });
    }

    const failRoute = workflowSetup.route_policy_failures_to;
    if (failRoute && failRoute !== "none") {
      workflowRules.push({ text: `Policy failures are routed to: ${fmt(failRoute)}.`, section: "Workflow Setup" });
    }

    if (workflowSetup.auto_approve_below_threshold && workflowSetup.auto_approve_threshold) {
      workflowRules.push({
        text: `Expenses below ${money(workflowSetup.auto_approve_threshold)} are automatically approved.`,
        section: "Workflow Setup",
      });
    }
  } else {
    workflowRules.push({ text: "Workflow setup not configured yet.", section: "Workflow Setup", badge: "warn" });
  }

  // ── Modules ────────────────────────────────────────────────────────────────
  const moduleRules: Rule[] = [];
  if (companySetup) {
    const flags: [string, string][] = [
      ["purchase_requests_module_enabled", "Purchase Requests"],
      ["time_allocation_module_enabled", "Time Tracking"],
      ["archive_module_enabled", "Document Archive"],
      ["ai_copilot_enabled", "AI Copilot"],
      ["subcontractor_module_enabled", "Subcontractors"],
    ];
    const enabled = flags.filter(([k]) => !!companySetup[k]).map(([, label]) => label);
    const disabled = flags.filter(([k]) => !companySetup[k]).map(([, label]) => label);
    if (enabled.length > 0) {
      moduleRules.push({ text: `Active modules: ${enabled.join(", ")}.`, section: "Add-Ons", badge: "ok" });
    }
    if (disabled.length > 0) {
      moduleRules.push({ text: `Inactive: ${disabled.join(", ")}.`, section: "Add-Ons" });
    }
  }

  const noConfig = !expensePolicy && !approvalSetup && !accountingSetup && !workflowSetup;

  return (
    <div className="space-y-4">
      {noConfig ? (
        <div className="rounded border border-white/[0.07] bg-white/[0.02] px-4 py-6 text-center">
          <p className="text-[11px] text-white/28">{t("noConfigLoaded")}</p>
          <p className="mt-1 text-[10px] text-white/18">{t("noConfigHint")}</p>
        </div>
      ) : (
        <>
          <ReviewSection title={t("sectionExpenseRules")} rules={expenseRules} onNavigate={onNavigate} editLabel={t("edit")} />
          <ReviewSection title={t("sectionApprovalChain")} rules={approvalRules} onNavigate={onNavigate} editLabel={t("edit")} />
          <ReviewSection title={t("sectionAccounting")} rules={accountingRules} onNavigate={onNavigate} editLabel={t("edit")} />
          <ReviewSection title={t("sectionWorkflow")} rules={workflowRules} onNavigate={onNavigate} editLabel={t("edit")} />
          {moduleRules.length > 0 && (
            <ReviewSection title={t("sectionModules")} rules={moduleRules} onNavigate={onNavigate} editLabel={t("edit")} />
          )}
        </>
      )}
    </div>
  );
}
