"use client";

/**
 * FinanceAnalyticsModule — Phase 4.7 + 5.7.
 *
 * Read-only finance dashboard. Pulls from /analytics/finance/* endpoints.
 * Layout: tile row (totals + SLA) + two charts (spend by month bar,
 * spend by category bar) + approval funnel strip.
 *
 * All data is server-aggregated and company-scoped.
 */

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { BarChart2, Clock, TrendingUp, AlertTriangle } from "lucide-react";
import { apiCall } from "@/lib/api/client";

// ── Types matching backend response models ───────────────────────────────────

interface MonthlyBucket { period: string; total: string; count: number }
interface CategoryBucket { category_code: string | null; total: string; count: number }
interface FunnelBucket { status: string; count: number; total: string }
interface SlaResponse {
  approved_count: number;
  p50_hours: number;
  p75_hours: number;
  p95_hours: number;
  max_hours: number;
  open_count: number;
  open_p50_hours: number;
  open_p95_hours: number;
  open_max_hours: number;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtMoney(s: string) {
  const n = parseFloat(s);
  if (isNaN(n)) return s;
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0,
  }).format(n);
}

function fmtHours(h: number) {
  if (h >= 24) return `${(h / 24).toFixed(1)}d`;
  if (h >= 1) return `${h.toFixed(1)}h`;
  return `${Math.round(h * 60)}m`;
}

const STATUS_TONE: Record<string, string> = {
  draft: "bg-white/10",
  submitted: "bg-sky-500/55",
  manager_approved: "bg-indigo-500/55",
  approved: "bg-emerald-500/60",
  rejected: "bg-red-500/55",
};

// ── Module ───────────────────────────────────────────────────────────────────

export default function FinanceAnalyticsModule() {
  const t = useTranslations("financeAnalytics");
  const [monthly, setMonthly] = useState<MonthlyBucket[]>([]);
  const [categories, setCategories] = useState<CategoryBucket[]>([]);
  const [funnel, setFunnel] = useState<FunnelBucket[]>([]);
  const [sla, setSla] = useState<SlaResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([
      apiCall<{ items: MonthlyBucket[] }>("/analytics/finance/spend-by-month?months=12"),
      apiCall<{ items: CategoryBucket[] }>("/analytics/finance/spend-by-category"),
      apiCall<{ items: FunnelBucket[] }>("/analytics/finance/approval-funnel"),
      apiCall<SlaResponse>("/analytics/finance/approval-sla"),
    ])
      .then(([m, c, f, s]) => {
        if (cancelled) return;
        setMonthly(m.items ?? []);
        setCategories(c.items ?? []);
        setFunnel(f.items ?? []);
        setSla(s);
      })
      .catch(() => !cancelled && setError(t("errorLoad")))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [t]);

  const totals = useMemo(() => {
    const totalApproved = funnel.find((f) => f.status === "approved");
    const totalRejected = funnel.find((f) => f.status === "rejected");
    const totalPending = funnel
      .filter((f) => f.status === "submitted" || f.status === "manager_approved")
      .reduce((acc, f) => acc + f.count, 0);
    return {
      approvedCount: totalApproved?.count ?? 0,
      approvedTotal: totalApproved?.total ?? "0.00",
      rejectedCount: totalRejected?.count ?? 0,
      pendingCount: totalPending,
    };
  }, [funnel]);

  const monthMax = useMemo(
    () => Math.max(...monthly.map((m) => parseFloat(m.total)), 1),
    [monthly],
  );
  const categoryMax = useMemo(
    () => Math.max(...categories.map((c) => parseFloat(c.total)), 1),
    [categories],
  );
  const funnelMax = useMemo(
    () => Math.max(...funnel.map((f) => f.count), 1),
    [funnel],
  );

  return (
    <div className="flex h-full flex-col bg-zinc-950">
      {/* Header */}
      <header className="border-b border-white/[0.06] px-5 py-3">
        <div className="flex items-center gap-2">
          <BarChart2 className="h-4 w-4 text-white/40" />
          <h1 className="text-[12px] font-semibold uppercase tracking-wider text-white/70">
            {t("title")}
          </h1>
        </div>
        <p className="mt-0.5 text-[10.5px] text-white/35">{t("subtitle")}</p>
      </header>

      {error && (
        <div className="m-5 flex items-center gap-2 rounded-md border border-red-500/25 bg-red-500/[0.06] px-3 py-2 text-[11px] text-red-200/80">
          <AlertTriangle className="h-3.5 w-3.5" />
          {error}
        </div>
      )}

      {/* Body */}
      <div className="flex-1 overflow-auto px-5 py-4">
        {/* Tile row */}
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <Tile
            label={t("tiles.approvedTotal")}
            value={loading ? "—" : fmtMoney(totals.approvedTotal)}
            sub={loading ? "" : t("tiles.approvedCount", { count: totals.approvedCount })}
            tone="emerald"
          />
          <Tile
            label={t("tiles.pending")}
            value={loading ? "—" : String(totals.pendingCount)}
            sub={loading ? "" : t("tiles.pendingSub")}
            tone="sky"
          />
          <Tile
            label={t("tiles.rejected")}
            value={loading ? "—" : String(totals.rejectedCount)}
            sub={loading ? "" : t("tiles.rejectedSub")}
            tone="red"
          />
          <Tile
            label={t("tiles.slaP95")}
            value={loading || !sla ? "—" : fmtHours(sla.p95_hours)}
            sub={
              loading || !sla
                ? ""
                : t("tiles.slaP50", { hours: fmtHours(sla.p50_hours) })
            }
            tone="indigo"
            icon={<Clock className="h-3 w-3 opacity-60" />}
          />
        </div>

        {/* Charts */}
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* Spend by month */}
          <Panel title={t("charts.byMonth")} icon={<TrendingUp className="h-3.5 w-3.5" />}>
            {loading ? (
              <Empty msg={t("loading")} />
            ) : monthly.length === 0 ? (
              <Empty msg={t("empty")} />
            ) : (
              <div className="flex h-44 items-end gap-1.5">
                {monthly.map((m) => {
                  const v = parseFloat(m.total);
                  const h = Math.max(2, (v / monthMax) * 100);
                  return (
                    <div key={m.period} className="group flex flex-1 flex-col items-center gap-1">
                      <div className="relative flex w-full flex-1 items-end">
                        <div
                          className="w-full rounded-t bg-indigo-500/55 transition-colors group-hover:bg-indigo-400/75"
                          style={{ height: `${h}%` }}
                          title={`${m.period} · ${fmtMoney(m.total)} · ${m.count}`}
                        />
                      </div>
                      <span className="text-[8.5px] text-white/35">{m.period.slice(5)}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </Panel>

          {/* Spend by category */}
          <Panel title={t("charts.byCategory")} icon={<BarChart2 className="h-3.5 w-3.5" />}>
            {loading ? (
              <Empty msg={t("loading")} />
            ) : categories.length === 0 ? (
              <Empty msg={t("empty")} />
            ) : (
              <ul className="space-y-1.5">
                {categories.slice(0, 8).map((c) => {
                  const v = parseFloat(c.total);
                  const w = (v / categoryMax) * 100;
                  return (
                    <li key={c.category_code ?? "_uncat"} className="flex items-center gap-2">
                      <span className="w-24 truncate text-[10.5px] text-white/55">
                        {c.category_code ?? t("uncategorized")}
                      </span>
                      <div className="relative flex-1 overflow-hidden rounded bg-white/[0.04]">
                        <div
                          className="h-3 bg-emerald-500/55"
                          style={{ width: `${Math.max(2, w)}%` }}
                        />
                      </div>
                      <span className="w-20 text-right font-mono text-[10px] text-white/65">
                        {fmtMoney(c.total)}
                      </span>
                      <span className="w-8 text-right text-[9.5px] text-white/35">×{c.count}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>
        </div>

        {/* Approval funnel */}
        <Panel
          className="mt-4"
          title={t("charts.funnel")}
          icon={<BarChart2 className="h-3.5 w-3.5" />}
        >
          {loading ? (
            <Empty msg={t("loading")} />
          ) : (
            <div className="grid grid-cols-5 gap-1.5">
              {funnel.map((f) => {
                const w = (f.count / funnelMax) * 100;
                const statusLabel = (() => {
                  switch (f.status) {
                    case "draft": return t("funnelStatus.draft");
                    case "submitted": return t("funnelStatus.submitted");
                    case "manager_approved": return t("funnelStatus.manager_approved");
                    case "approved": return t("funnelStatus.approved");
                    case "rejected": return t("funnelStatus.rejected");
                    default: return f.status;
                  }
                })();
                return (
                  <div key={f.status} className="rounded border border-white/[0.06] bg-white/[0.02] p-2">
                    <div className="text-[9.5px] uppercase tracking-wider text-white/40">
                      {statusLabel}
                    </div>
                    <div className="mt-0.5 text-[15px] font-semibold tabular-nums text-white/85">
                      {f.count}
                    </div>
                    <div className="mt-0.5 text-[9.5px] text-white/35">{fmtMoney(f.total)}</div>
                    <div className="mt-1.5 h-1 overflow-hidden rounded bg-white/[0.04]">
                      <div
                        className={`h-1 ${STATUS_TONE[f.status] ?? "bg-white/15"}`}
                        style={{ width: `${Math.max(2, w)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Panel>

        {/* SLA detail */}
        {sla && !loading && (
          <Panel
            className="mt-4"
            title={t("charts.sla")}
            icon={<Clock className="h-3.5 w-3.5" />}
          >
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <SlaCell label={t("sla.p50")} value={fmtHours(sla.p50_hours)} />
              <SlaCell label={t("sla.p75")} value={fmtHours(sla.p75_hours)} />
              <SlaCell label={t("sla.p95")} value={fmtHours(sla.p95_hours)} />
              <SlaCell label={t("sla.max")} value={fmtHours(sla.max_hours)} />
              <SlaCell
                label={t("sla.openCount")}
                value={String(sla.open_count)}
                tone={sla.open_count > 0 ? "amber" : "neutral"}
              />
              <SlaCell label={t("sla.openP50")} value={fmtHours(sla.open_p50_hours)} />
              <SlaCell label={t("sla.openP95")} value={fmtHours(sla.open_p95_hours)} />
              <SlaCell label={t("sla.openMax")} value={fmtHours(sla.open_max_hours)} />
            </div>
          </Panel>
        )}
      </div>
    </div>
  );
}

// ── Subcomponents ────────────────────────────────────────────────────────────

const TILE_TONE: Record<string, string> = {
  emerald: "border-emerald-500/20 text-emerald-300/80",
  sky: "border-sky-500/20 text-sky-300/80",
  red: "border-red-500/20 text-red-300/80",
  indigo: "border-indigo-500/20 text-indigo-300/80",
};

function Tile({
  label,
  value,
  sub,
  tone,
  icon,
}: {
  label: string;
  value: string;
  sub: string;
  tone: keyof typeof TILE_TONE;
  icon?: React.ReactNode;
}) {
  return (
    <div className={`rounded-md border bg-white/[0.02] px-3 py-2 ${TILE_TONE[tone]}`}>
      <div className="flex items-center gap-1 text-[9.5px] uppercase tracking-wider opacity-70">
        {icon}
        {label}
      </div>
      <div className="mt-0.5 text-[18px] font-semibold tabular-nums text-white/90">
        {value}
      </div>
      {sub && <div className="text-[10px] text-white/35">{sub}</div>}
    </div>
  );
}

function Panel({
  title,
  icon,
  children,
  className = "",
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-md border border-white/[0.06] bg-white/[0.015] ${className}`}
    >
      <header className="flex items-center gap-1.5 border-b border-white/[0.05] px-3 py-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-white/55">
        {icon}
        {title}
      </header>
      <div className="p-3">{children}</div>
    </section>
  );
}

function Empty({ msg }: { msg: string }) {
  return (
    <div className="flex h-32 items-center justify-center text-[10.5px] text-white/30">
      {msg}
    </div>
  );
}

function SlaCell({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "amber";
}) {
  const text = tone === "amber" ? "text-amber-300/85" : "text-white/85";
  return (
    <div>
      <div className="text-[9.5px] uppercase tracking-wider text-white/40">{label}</div>
      <div className={`mt-0.5 text-[14px] font-semibold tabular-nums ${text}`}>{value}</div>
    </div>
  );
}
