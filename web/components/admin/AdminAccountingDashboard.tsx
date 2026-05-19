"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  AlertTriangle, CheckCircle2, Clock, FileText, Loader2,
  TrendingUp, Package, AlertCircle,
} from "lucide-react";
import { apiCall } from "@/lib/api/client";

interface DashboardData {
  pending_review: { count: number; amount: number };
  this_month: { approved_count: number; approved_amount: number };
  category_coverage: { total: number; categorized: number; uncategorized: number };
  cfdi: { mismatches: number; missing_uuid: number };
  categories: { active: number; mapped: number; unmapped: number };
}

interface Props {
  companyId: number;
}

function MetricCard({ label, value, sub, icon: Icon, tone }: {
  label: string; value: string; sub?: string; icon: any; tone: "info" | "success" | "warning" | "error";
}) {
  const tones = {
    info: "border-accent/20 bg-accent/5 text-accent",
    success: "border-success/20 bg-success/5 text-success",
    warning: "border-warning/20 bg-warning/5 text-warning",
    error: "border-error/20 bg-error/5 text-error",
  };
  const iconTones = {
    info: "text-accent",
    success: "text-success",
    warning: "text-warning",
    error: "text-error",
  };
  return (
    <div className={`rounded-md border p-3 ${tones[tone]}`}>
      <div className="flex items-center gap-2">
        <Icon className={`h-4 w-4 ${iconTones[tone]}`} />
        <span className="text-[9px] font-bold uppercase tracking-widest opacity-60">{label}</span>
      </div>
      <p className="mt-1 text-base font-semibold">{value}</p>
      {sub && <p className="text-[9px] opacity-50">{sub}</p>}
    </div>
  );
}

export default function AdminAccountingDashboard({ companyId }: Props) {
  const t = useTranslations("admin.accountingDashboard");
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setErr(null);
    try {
      const d = await apiCall<DashboardData>(`/accounting/dashboard/${companyId}`);
      setData(d);
    } catch (e: any) {
      setErr(e?.message ?? "load failed");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [companyId]);

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted" />
      </div>
    );
  }

  if (err) {
    return (
      <div className="flex items-center gap-2 rounded border border-error/20 bg-error/5 px-3 py-2 text-[10px] text-error">
        <AlertCircle className="h-3 w-3" /> {err}
      </div>
    );
  }

  if (!data) return null;

  const fmt = (n: number) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-secondary">{t("title")}</h2>
        <p className="mt-0.5 text-[11px] text-muted">{t("subtitle")}</p>
      </div>

      {/* Top metrics row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <MetricCard
          label={t("pendingReview")}
          value={String(data.pending_review.count)}
          sub={fmt(data.pending_review.amount)}
          icon={Clock}
          tone={data.pending_review.count > 0 ? "warning" : "success"}
        />
        <MetricCard
          label={t("approvedThisMonth")}
          value={String(data.this_month.approved_count)}
          sub={fmt(data.this_month.approved_amount)}
          icon={TrendingUp}
          tone="success"
        />
        <MetricCard
          label={t("uncategorized")}
          value={String(data.category_coverage.uncategorized)}
          sub={`${data.category_coverage.categorized}/${data.category_coverage.total}`}
          icon={FileText}
          tone={data.category_coverage.uncategorized > 0 ? "warning" : "success"}
        />
        <MetricCard
          label={t("cfdiIssues")}
          value={String(data.cfdi.mismatches + data.cfdi.missing_uuid)}
          sub={`${data.cfdi.mismatches} mismatches, ${data.cfdi.missing_uuid} missing`}
          icon={AlertTriangle}
          tone={data.cfdi.mismatches + data.cfdi.missing_uuid > 0 ? "error" : "success"}
        />
        <MetricCard
          label={t("unmappedCategories")}
          value={String(data.categories.unmapped)}
          sub={`${data.categories.mapped}/${data.categories.active} mapped`}
          icon={Package}
          tone={data.categories.unmapped > 0 ? "warning" : "success"}
        />
      </div>

      {/* Auto-categorize CTA */}
      {data.category_coverage.uncategorized > 0 && (
        <div className="rounded-md border border-accent/20 bg-accent/5 px-4 py-3">
          <p className="text-[11px] text-accent/80">
            {t("autoCategorizeHint", { count: data.category_coverage.uncategorized })}
          </p>
        </div>
      )}
    </div>
  );
}
