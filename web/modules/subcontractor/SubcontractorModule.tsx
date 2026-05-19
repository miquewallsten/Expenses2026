"use client";

/**
 * SubcontractorModule — workspace component for the Subcontractor portal.
 *
 * Two-panel layout: report list (left) + report detail with invoices (right).
 * Mirrors the MyExpensesModule pattern: local state drives selection, API calls
 * are centralized here and passed down as callbacks.
 *
 * When the user is admin/accounting, shows AccountingActions (validate/approve/reject/pay).
 * When the user is a subcontractor, shows the submission workflow.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { useMyWorkContext } from "@/context/MyWorkContext";
import { useUserContext } from "@/context/UserContext";
import { apiCall, apiPost } from "@/lib/api/client";
import SubcontractorReportList, { type Report } from "./SubcontractorReportList";
import SubcontractorReportDetail, {
  type Invoice,
  type InvoiceCreateData,
  AccountingActions,
} from "./SubcontractorReportDetail";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ApiReport {
  id: number;
  title: string;
  status: string;
  total_amount: string;
  total_isr_retention: string;
  total_iva_retention: string;
  total_net: string;
  subcontractor_id: number | null;
  validation_status: string | null;
  period_start: string | null;
  period_end: string | null;
  invoice_count: number;
  created_at: string;
  updated_at: string;
}

interface ApiInvoice {
  id: number;
  report_id: number;
  amount: string;
  isr_retention: string;
  iva_retention: string;
  subtotal: string;
  iva_amount: string;
  description: string | null;
  invoice_date: string | null;
  series: string | null;
  folio: string | null;
  uuid: string | null;
  sat_status: string | null;
  status: string;
  created_at: string;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function SubcontractorModule() {
  const ctx = useMyWorkContext() as any;
  const user = useUserContext();
  const t = useTranslations("subcontractor");
  const companyId = user.companyId;
  const role = user.role;

  const isAccountingOrAdmin = role === "admin" || role === "accounting" || role === "super_admin";

  // ── State ──────────────────────────────────────────────────────────────────
  const [reports, setReports] = useState<Report[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);

  const selectedReport = useMemo(
    () => reports.find((r) => r.id === selectedId) ?? null,
    [reports, selectedId]
  );

  // ── Fetch reports ──────────────────────────────────────────────────────────
  const loadReports = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const data = await apiCall<ApiReport[]>(
        `/subcontractor/${companyId}/reports`
      );
      setReports(
        data.map((r) => ({
          ...r,
          invoice_count: r.invoice_count ?? 0,
        }))
      );
    } catch (e) {
      console.error("Failed to load subcontractor reports", e);
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  // ── Fetch invoices for selected report ─────────────────────────────────────
  const loadInvoices = useCallback(async () => {
    if (!companyId || !selectedId) {
      setInvoices([]);
      return;
    }
    setDetailLoading(true);
    try {
      const data = await apiCall<ApiReport & { invoices: ApiInvoice[] }>(
        `/subcontractor/${companyId}/reports/${selectedId}`
      );
      setInvoices(
        (data.invoices ?? []).map((i) => ({
          ...i,
        }))
      );
    } catch (e) {
      console.error("Failed to load invoices", e);
      setInvoices([]);
    } finally {
      setDetailLoading(false);
    }
  }, [companyId, selectedId]);

  useEffect(() => {
    loadInvoices();
  }, [loadInvoices]);

  // ── Create new report ──────────────────────────────────────────────────────
  const handleCreateNew = useCallback(async () => {
    if (!companyId) return;
    const now = new Date();
    const title = `${t("reportTitle")} ${now.toLocaleDateString("es-MX", { month: "short", year: "numeric" })}`;
    try {
      const data = await apiPost<ApiReport>(`/subcontractor/${companyId}/reports`, {
        title,
        period_start: now.toISOString().slice(0, 10),
      });
      setReports((prev) => [
        {
          ...data,
          invoice_count: 0,
        },
        ...prev,
      ]);
      setSelectedId(data.id);
    } catch (e) {
      console.error("Failed to create report", e);
    }
  }, [companyId, t]);

  // ── Add invoice ────────────────────────────────────────────────────────────
  const handleAddInvoice = useCallback(
    async (data: InvoiceCreateData) => {
      if (!companyId || !selectedId) return;
      await apiPost<ApiInvoice>(
        `/subcontractor/${companyId}/reports/${selectedId}/invoices`,
        data
      );
      await loadInvoices();
      await loadReports();
    },
    [companyId, selectedId, loadInvoices, loadReports]
  );

  // ── Submit report ──────────────────────────────────────────────────────────
  const handleSubmitReport = useCallback(async () => {
    if (!companyId || !selectedId) return;
    await apiCall<ApiReport>(
      `/subcontractor/${companyId}/reports/${selectedId}/submit`,
      { method: "PATCH" }
    );
    await loadReports();
    await loadInvoices();
  }, [companyId, selectedId, loadReports, loadInvoices]);

  // ── Accounting actions ─────────────────────────────────────────────────────
  const handleValidate = useCallback(async () => {
    if (!companyId || !selectedId) return;
    await apiCall<ApiReport>(
      `/subcontractor/${companyId}/reports/${selectedId}/validate`,
      { method: "PATCH" }
    );
    await loadReports();
    await loadInvoices();
  }, [companyId, selectedId, loadReports, loadInvoices]);

  const handleApprove = useCallback(async () => {
    if (!companyId || !selectedId) return;
    await apiCall<ApiReport>(
      `/subcontractor/${companyId}/reports/${selectedId}/approve`,
      { method: "PATCH" }
    );
    await loadReports();
    await loadInvoices();
  }, [companyId, selectedId, loadReports, loadInvoices]);

  const handleReject = useCallback(async (reason?: string) => {
    if (!companyId || !selectedId) return;
    const url = `/subcontractor/${companyId}/reports/${selectedId}/reject${reason ? `?reason=${encodeURIComponent(reason)}` : ""}`;
    await apiCall<ApiReport>(url, { method: "PATCH" });
    await loadReports();
    await loadInvoices();
  }, [companyId, selectedId, loadReports, loadInvoices]);

  const handleMarkPaid = useCallback(async (reference?: string) => {
    if (!companyId || !selectedId) return;
    const url = `/subcontractor/${companyId}/reports/${selectedId}/pay${reference ? `?payment_reference=${encodeURIComponent(reference)}` : ""}`;
    await apiCall<ApiReport>(url, { method: "PATCH" });
    await loadReports();
    await loadInvoices();
  }, [companyId, selectedId, loadReports, loadInvoices]);

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-1 min-h-0">
        {/* ── Left: Report List ────────────────────────────────────────────── */}
        <div className="h-full w-[280px] shrink-0 border-r border-default">
          <SubcontractorReportList
            reports={reports}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onCreateNew={handleCreateNew}
            loading={loading}
          />
        </div>

        {/* ── Right: Report Detail ──────────────────────────────────────────── */}
        <div className="h-full flex-1 min-w-0 flex flex-col">
          <div className="flex-1 min-h-0">
            <SubcontractorReportDetail
              report={selectedReport}
              invoices={invoices}
              onAddInvoice={handleAddInvoice}
              onSubmitReport={handleSubmitReport}
              onBack={() => setSelectedId(null)}
              loading={detailLoading}
            />
          </div>

          {/* ── Accounting actions (only for admin/accounting) ────────── */}
          {isAccountingOrAdmin && selectedReport && (
            <AccountingActions
              report={selectedReport}
              onValidate={handleValidate}
              onApprove={handleApprove}
              onReject={handleReject}
              onMarkPaid={handleMarkPaid}
            />
          )}
        </div>
      </div>
    </div>
  );
}
