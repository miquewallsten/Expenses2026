"use client";

/**
 * Validations tab content for EmployeeExpenseDetail.
 * Contains document integrity, SAT verification, policy compliance, AI policies.
 * Clean, scannable validation results.
 */

import { useTranslations } from "next-intl";
import type { PolicyCheckRow, ValidationResultRow } from "./types";

interface ExpenseValidationsTabProps {
  loadingVals: boolean;
  validations: ValidationResultRow[];
  policyChecks: PolicyCheckRow[];
}

const STATUS_CONFIG: Record<string, { bg: string; text: string; border: string; icon: string }> = {
  passed: { bg: "bg-emerald-500/[0.08]", text: "text-emerald-300/80", border: "border-emerald-500/20", icon: "✓" },
  warning: { bg: "bg-amber-500/[0.08]", text: "text-amber-300/80", border: "border-amber-500/20", icon: "⚠" },
  failed: { bg: "bg-red-500/[0.08]", text: "text-red-300/80", border: "border-red-500/20", icon: "✗" },
  not_applicable: { bg: "bg-surface-2", text: "text-muted", border: "border-subtle", icon: "—" },
  not_run: { bg: "bg-surface-2", text: "text-muted", border: "border-subtle", icon: "—" },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.not_run;
  return (
    <span className={`shrink-0 rounded border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide ${cfg.bg} ${cfg.text} ${cfg.border}`}>
      {cfg.icon}
    </span>
  );
}

function StatusDot({ status }: { status: string }) {
  const colors: Record<string, string> = {
    passed: "bg-emerald-400",
    warning: "bg-amber-400",
    failed: "bg-red-400",
    not_applicable: "bg-surface-2",
    not_run: "bg-surface-2",
  };
  return <span className={`inline-block h-1.5 w-1.5 rounded-full ${colors[status] ?? colors.not_run}`} />;
}

function Section({ title, items, showTs }: { title: string; items: PolicyCheckRow[]; showTs?: boolean }) {
  if (items.length === 0) return null;
  return (
    <div>
      <p className="mb-1 text-[9px] font-semibold uppercase tracking-widest text-muted">{title}</p>
      <div className="overflow-hidden rounded-lg border border-default">
        {items.map((c, i) => (
          <div key={c.code} className={`flex items-center justify-between gap-3 px-3 py-2 ${i > 0 ? "border-t border-subtle" : ""}`}>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] text-secondary">{c.message}</p>
              {showTs && "timestamp" in c && (c as any).timestamp && (
                <p className="text-[9px] text-muted">{new Date((c as any).timestamp).toLocaleString("es-MX")}</p>
              )}
            </div>
            <StatusBadge status={c.status} />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ExpenseValidationsTab({
  loadingVals,
  validations,
  policyChecks,
}: ExpenseValidationsTabProps) {
  const td = useTranslations("employee.expenseDetail");
  const tc = useTranslations("common");

  const bySource = {
    document: policyChecks.filter((c) => c.group === "document"),
    sat: policyChecks.filter((c) => c.group === "sat"),
    policy: policyChecks.filter((c) => c.group === "policy"),
    ai: policyChecks.filter((c) => c.group === "ai"),
  };

  return (
    <div className="space-y-3 pb-20">
      {loadingVals && (
        <div className="flex items-center justify-center py-8">
          <p className="text-[11px] text-muted">{tc("loading")}</p>
        </div>
      )}

      <Section title={td("valDocIntegrity")} items={bySource.document} />

      {bySource.sat.length > 0 ? (
        <Section title={td("valSatVerification")} items={bySource.sat} showTs />
      ) : (
        <div>
          <p className="mb-1 text-[9px] font-semibold uppercase tracking-widest text-muted">
            {td("valSatVerification")}
          </p>
          <div className="overflow-hidden rounded-lg border border-default">
            <div className="flex items-start gap-2.5 px-3 py-2.5">
              <div className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-default bg-surface-2">
                <StatusDot status="not_run" />
              </div>
              <div>
                <p className="text-[11px] text-muted">{td("valSatLabel")}</p>
                <p className="mt-0.5 text-[10px] text-muted">{td("valSatNotRunHint")}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      <Section title={td("valPolicyCompliance")} items={bySource.policy} />
      <Section title={td("valAiPolicies")} items={bySource.ai} />

      {!loadingVals && policyChecks.length === 0 && (
        <div className="rounded-lg border border-default px-4 py-6 text-center">
          <p className="text-[11px] text-muted">{td("valNoPolicyChecks")}</p>
        </div>
      )}
    </div>
  );
}
