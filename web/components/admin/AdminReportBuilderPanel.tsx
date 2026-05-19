"use client";

import {
  PremiumHeader,
  SectionPanel,
  Row,
  SectionLabel,
  inputClasses,
  SECTION_ACCENTS,
} from "@/components/admin/shared/AdminPatterns";
import { useEffect, useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { apiCall, apiPost } from "@/lib/api/client";
import {
  Zap,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Info,
  Eye,
  FileText,
  RefreshCw,
  ChevronRight,
  ChevronDown,
  X,
  ArrowRight,
  Shield,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";

/* ── Types ──────────────────────────────────────────────────────────────── */

interface ReportSummary {
  id: number;
  title: string;
  status: string;
  user_id: number | null;
  period_start: string | null;
  period_end: string | null;
  triggered_by: string;
  total_amount: string | null;
  expense_count: number | null;
  currency: string;
  settlement_type: string;
  needs_accountant_review: boolean;
  generated_at: string | null;
  created_at: string;
  critical_issues?: number;
  warning_issues?: number;
}

interface ReportDetail {
  report: Record<string, unknown>;
  issues: IssueItem[];
  mappings: MappingItem[];
  expenses: ExpenseItem[];
}

interface IssueItem {
  severity: "critical" | "warning" | "info";
  type: string;
  expense_id: number | null;
  message: string;
  detail: Record<string, unknown>;
  resolved: boolean;
  resolved_by?: number | null;
  resolved_at?: string | null;
  resolution?: string;
}

interface MappingItem {
  expense_id: number;
  account_code: string | null;
  account_name: string | null;
  category_code: string | null;
  base_amount: string;
  tax_amount: string;
  total_amount: string;
  tax_behavior: string | null;
  tax_rate: string;
  counter_account_code: string | null;
  currency: string;
  exchange_rate: string | null;
  amount_mxn: string;
  dimension_splits: unknown[];
  poliza_lines: unknown[];
  balanced: boolean;
  issues: IssueItem[];
  notes: string[];
}

interface ExpenseItem {
  id: number;
  description: string;
  amount: number;
  currency: string;
  amount_mxn: number | null;
  category_code: string | null;
  account_code: string | null;
  status: string;
  expense_date: string | null;
  cfdi_uuid: string | null;
  settlement_type: string;
}

/* ── Status badge helper ──────────────────────────────────────────────── */

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-surface-2 text-primary",
  needs_review: "bg-yellow-500/20 text-yellow-400",
  submitted: "bg-blue-500/20 text-blue-400",
  manager_approved: "bg-blue-500/20 text-blue-400",
  approved: "bg-green-500/20 text-green-400",
  rejected: "bg-red-500/20 text-red-400",
};

const SEVERITY_STYLES: Record<string, string> = {
  critical: "text-red-400 border-red-400/30 bg-red-500/10",
  warning: "text-yellow-400 border-yellow-400/30 bg-yellow-500/10",
  info: "text-blue-400 border-blue-400/30 bg-blue-500/10",
};

/* ── Main component ──────────────────────────────────────────────────── */

export default function AdminReportBuilderPanel({ companyId }: { companyId: number }) {
  const t = useTranslations("admin");
  const [reports, setReports] = useState<ReportSummary[]>([]);
  const [pendingReviews, setPendingReviews] = useState<ReportSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [building, setBuilding] = useState(false);
  const [selectedReport, setSelectedReport] = useState<ReportDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [polizaPreview, setPolizaPreview] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchReports = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiCall<ReportSummary[]>("/expenses/report-builder/reports");
      setReports(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load reports");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchPendingReviews = useCallback(async () => {
    try {
      const data = await apiCall<ReportSummary[]>("/expenses/report-builder/pending-reviews");
      setPendingReviews(data);
    } catch {
      /* best effort */
    }
  }, []);

  useEffect(() => {
    fetchReports();
    fetchPendingReviews();
  }, [fetchReports, fetchPendingReviews]);

  const handleBuild = async () => {
    setBuilding(true);
    setError(null);
    try {
      const result = await apiPost<{
        ok: boolean;
        reports_built: number;
        results: unknown[];
      }>("/expenses/report-builder/build", { company_id: companyId, triggered_by: "manual" });
      if (result.ok) {
        await fetchReports();
        await fetchPendingReviews();
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Build failed");
    } finally {
      setBuilding(false);
    }
  };

  const handleViewDetail = async (reportId: number) => {
    setDetailLoading(true);
    setSelectedReport(null);
    setPolizaPreview(null);
    try {
      const detail = await apiCall<ReportDetail>(
        `/expenses/report-builder/reports/${reportId}`
      );
      setSelectedReport(detail);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load detail");
    } finally {
      setDetailLoading(false);
    }
  };

  const handlePolizaPreview = async (reportId: number) => {
    try {
      const preview = await apiCall<Record<string, unknown>>(
        `/expenses/report-builder/reports/${reportId}/poliza-preview`
      );
      setPolizaPreview(preview);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load poliza preview");
    }
  };

  const handleResolveIssue = async (
    reportId: number,
    issueIndex: number,
    action: string,
    resolution: string
  ) => {
    try {
      await apiPost(`/expenses/report-builder/reports/${reportId}/resolve-issue`, {
        issue_index: issueIndex,
        resolution,
        action,
      });
      // Refresh detail
      await handleViewDetail(reportId);
      await fetchPendingReviews();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to resolve");
    }
  };

  const fmtCurrency = (amount: string | number | null) => {
    if (!amount) return "$0.00";
    const num = typeof amount === "string" ? parseFloat(amount) : amount;
    return num.toLocaleString("es-MX", { style: "currency", currency: "MXN" });
  };

  /* ── Render ──────────────────────────────────────────────────────────── */

  return (
    <div className="space-y-6">
      {/* Header */}
      <PremiumHeader
        icon={<FileText className="h-5 w-5" />}
        title={t("reportBuilder.title", { defaultValue: "Report Builder" })}
        subtitle={t("reportBuilder.subtitle", { defaultValue: "Build, review, and resolve expense reports with pre-mapped accounting entries" })}
      />

      {/* Action bar */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleBuild}
          disabled={building}
          className="flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-accent-hover disabled:opacity-40"
        >
          {building ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
          {building
            ? t("reportBuilder.building", { defaultValue: "Building..." })
            : t("reportBuilder.buildNow", { defaultValue: "Build Reports" })}
        </button>
        <button
          onClick={() => { fetchReports(); fetchPendingReviews(); }}
          className="flex items-center gap-2 rounded-md border border-subtle px-3 py-2 text-sm text-secondary hover:bg-surface-2"
        >
          <RefreshCw className="h-4 w-4" />
          {t("common.refresh", { defaultValue: "Refresh" })}
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-md border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Pending reviews */}
      {pendingReviews.length > 0 && (
        <SectionPanel title={t("reportBuilder.needsReview", { defaultValue: "Needs Accountant Review" })} >
          <div className="space-y-2">
            {pendingReviews.map((r) => (
              <div
                key={r.id}
                className="flex items-center justify-between rounded-md border border-yellow-400/20 bg-yellow-500/5 px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  <ShieldAlert className="h-5 w-5 text-yellow-400" />
                  <div>
                    <div className="text-sm font-medium text-primary">{r.title}</div>
                    <div className="text-xs text-secondary">
                      {r.expense_count} gastos • {fmtCurrency(r.total_amount)} • {r.critical_issues || 0} críticos • {r.warning_issues || 0} advertencias
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => handleViewDetail(r.id)}
                  className="flex items-center gap-1 rounded-md bg-yellow-400/20 px-3 py-1.5 text-xs font-medium text-yellow-400 hover:bg-yellow-400/30"
                >
                  <Eye className="h-3.5 w-3.5" />
                  Review
                </button>
              </div>
            ))}
          </div>
        </SectionPanel>
      )}

      {/* Reports list */}
      <SectionPanel title={t("reportBuilder.reports", { defaultValue: "Expense Reports" })} >
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-secondary" />
          </div>
        ) : reports.length === 0 ? (
          <div className="py-8 text-center text-sm text-secondary">
            {t("reportBuilder.noReports", { defaultValue: "No reports yet. Click Build Reports to create one." })}
          </div>
        ) : (
          <div className="space-y-2">
            {reports.map((r) => (
              <div
                key={r.id}
                className="flex items-center justify-between rounded-md border border-subtle bg-surface-1 px-4 py-3 hover:border-default transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[r.status] || STATUS_STYLES.draft}`}>
                    {r.status.replace("_", " ")}
                  </span>
                  <div>
                    <div className="text-sm font-medium text-primary">{r.title}</div>
                    <div className="text-xs text-secondary">
                      {r.expense_count} gastos • {fmtCurrency(r.total_amount)}
                      {r.period_start && ` • ${r.period_start}`}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {r.needs_accountant_review && (
                    <ShieldAlert className="h-4 w-4 text-yellow-400" />
                  )}
                  <button
                    onClick={() => handleViewDetail(r.id)}
                    className="flex items-center gap-1 rounded-md border border-subtle px-2 py-1 text-xs text-secondary hover:bg-surface-2"
                  >
                    <Eye className="h-3 w-3" />
                    Detail
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionPanel>

      {/* Detail view */}
      {selectedReport && (
        <SectionPanel
          title={t("reportBuilder.detail", { defaultValue: `Report #${selectedReport.report?.id}` })}
          
        >
          <div className="space-y-4">
            {/* Report header info */}
            <div className="grid grid-cols-4 gap-4 text-sm">
              <div>
                <span className="text-secondary">Status</span>
                <div className={`mt-1 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[String(selectedReport.report?.status)] || STATUS_STYLES.draft}`}>
                  {String(selectedReport.report?.status || "draft")}
                </div>
              </div>
              <div>
                <span className="text-secondary">Total</span>
                <div className="mt-1 font-medium text-primary">{fmtCurrency(String(selectedReport.report?.total_amount ?? 0))}</div>
              </div>
              <div>
                <span className="text-secondary">Expenses</span>
                <div className="mt-1 font-medium text-primary">{Number(selectedReport.report?.expense_count ?? 0)}</div>
              </div>
              <div>
                <span className="text-secondary">Period</span>
                <div className="mt-1 text-primary">
                  {selectedReport.report?.period_start && selectedReport.report?.period_end
                    ? `${selectedReport.report.period_start} - ${selectedReport.report.period_end}`
                    : "—"}
                </div>
              </div>
            </div>

            {/* Poliza preview button */}
            <button
              onClick={() => handlePolizaPreview(Number(selectedReport.report?.id))}
              className="flex items-center gap-2 rounded-md border border-accent/30 bg-accent/10 px-3 py-2 text-sm font-medium text-accent hover:bg-accent/20"
            >
              <ArrowRight className="h-4 w-4" />
              {t("reportBuilder.previewPoliza", { defaultValue: "Preview Póliza" })}
            </button>

            {/* Poliza preview display */}
            {polizaPreview && (
              <div className="rounded-md border border-subtle bg-surface-0 p-4">
                <div className="mb-3 text-sm font-medium text-primary">
                  Póliza Preview - {polizaPreview.balanced ? (
                    <span className="text-green-400">Balanceado ✓</span>
                  ) : (
                    <span className="text-red-400">Desbalanceado ✗</span>
                  )}
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-subtle text-secondary">
                        <th className="py-1 text-left">Cuenta</th>
                        <th className="py-1 text-left">Nombre</th>
                        <th className="py-1 text-right">Debe</th>
                        <th className="py-1 text-right">Haber</th>
                        <th className="py-1 text-left">Nota</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(polizaPreview.lines as Array<Record<string, string>>)?.map((line, i) => (
                        <tr key={i} className="border-b border-subtle/50">
                          <td className="py-1 font-mono text-primary">{line.account_code}</td>
                          <td className="py-1 text-primary">{line.account_name}</td>
                          <td className="py-1 text-right text-green-400">{line.debit !== "0.00" ? line.debit : ""}</td>
                          <td className="py-1 text-right text-red-400">{line.credit !== "0.00" ? line.credit : ""}</td>
                          <td className="py-1 text-secondary">{line.note}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-default font-medium text-primary">
                        <td colSpan={2}>Total</td>
                        <td className="py-1 text-right">{String(polizaPreview.total_debit)}</td>
                        <td className="py-1 text-right">{String(polizaPreview.total_credit)}</td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}

            {/* Issues */}
            {selectedReport.issues && selectedReport.issues.length > 0 && (
              <div className="space-y-2">
                <SectionLabel>{t("reportBuilder.flaggedIssues", { defaultValue: "Flagged Issues" })}</SectionLabel>
                {selectedReport.issues.map((issue, idx) => (
                  <div
                    key={idx}
                    className={`flex items-start justify-between rounded-md border px-4 py-3 ${SEVERITY_STYLES[issue.severity] || SEVERITY_STYLES.info}`}
                  >
                    <div className="flex items-start gap-2">
                      {issue.severity === "critical" ? (
                        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                      ) : issue.severity === "warning" ? (
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                      ) : (
                        <Info className="mt-0.5 h-4 w-4 shrink-0" />
                      )}
                      <div>
                        <div className="text-sm font-medium">{issue.message}</div>
                        <div className="text-xs opacity-70">
                          {issue.type} {issue.expense_id ? `• Expense #${issue.expense_id}` : ""}
                        </div>
                        {issue.resolved && (
                          <div className="mt-1 flex items-center gap-1 text-xs text-green-400">
                            <ShieldCheck className="h-3 w-3" />
                            Resolved: {issue.resolution || "Acknowledged"}
                          </div>
                        )}
                      </div>
                    </div>
                    {!issue.resolved && (
                      <div className="flex gap-1">
                        <button
                          onClick={() => handleResolveIssue(
                            Number(selectedReport.report?.id),
                            idx,
                            "acknowledge",
                            "Acknowledged by accountant"
                          )}
                          className="rounded bg-surface-2 px-2 py-1 text-xs text-secondary hover:bg-surface-1"
                        >
                          Acknowledge
                        </button>
                        {issue.type === "unmapped_category" || issue.type === "no_account_code" ? (
                          <button
                            onClick={() => {
                              const code = prompt("Enter new account code:");
                              if (code) {
                                handleResolveIssue(
                                  Number(selectedReport.report?.id),
                                  idx,
                                  "remap",
                                  `Remapped to ${code}`,
                                );
                              }
                            }}
                            className="rounded bg-accent/20 px-2 py-1 text-xs text-accent hover:bg-accent/30"
                          >
                            Remap
                          </button>
                        ) : null}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Expense mappings */}
            {selectedReport.mappings && selectedReport.mappings.length > 0 && (
              <div className="space-y-2">
                <SectionLabel>{t("reportBuilder.accountingMappings", { defaultValue: "Accounting Mappings" })}</SectionLabel>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-subtle text-secondary">
                        <th className="py-1 text-left">Expense</th>
                        <th className="py-1 text-left">Category</th>
                        <th className="py-1 text-left">Account</th>
                        <th className="py-1 text-right">Base</th>
                        <th className="py-1 text-right">Tax</th>
                        <th className="py-1 text-right">Total MXN</th>
                        <th className="py-1 text-left">Tax Behavior</th>
                        <th className="py-1 text-center">Balanced</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedReport.mappings.map((m) => (
                        <tr key={m.expense_id} className="border-b border-subtle/50">
                          <td className="py-1 text-primary">#{m.expense_id}</td>
                          <td className="py-1 font-mono text-primary">{m.category_code || "—"}</td>
                          <td className="py-1 font-mono text-primary">{m.account_code || "—"}</td>
                          <td className="py-1 text-right text-primary">{m.base_amount}</td>
                          <td className="py-1 text-right text-primary">{m.tax_amount}</td>
                          <td className="py-1 text-right font-medium text-primary">{m.amount_mxn}</td>
                          <td className="py-1 text-secondary">{m.tax_behavior || "—"}</td>
                          <td className="py-1 text-center">
                            {m.balanced ? (
                              <CheckCircle2 className="inline h-3.5 w-3.5 text-green-400" />
                            ) : (
                              <AlertTriangle className="inline h-3.5 w-3.5 text-yellow-400" />
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </SectionPanel>
      )}
    </div>
  );
}
