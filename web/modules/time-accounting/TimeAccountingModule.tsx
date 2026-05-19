"use client";

/**
 * TimeAccountingModule — Accounting review of time entries with cost calculation.
 *
 * Shows submitted time entries per week/user, calculates cost using hourly rates,
 * and allows accounting to approve/reject and export.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import {
  CheckCircle2, XCircle, Clock, DollarSign,
  Loader2, Users, Calendar, ChevronDown, ChevronRight,
} from "lucide-react";
import { apiCall, apiPost } from "@/lib/api/client";
import { useUserContext } from "@/context/UserContext";

// ── Types ─────────────────────────────────────────────────────────────────────

interface SubmittedWeek {
  user_id: number;
  user_name: string | null;
  week_start: string;
  total_hours: string;
  entry_count: number;
  status: string;
  entry_ids: number[];
}

interface SalaryConfig {
  id: number;
  user_id: number;
  hourly_rate: string;
  monthly_salary: string | null;
  currency: string;
  effective_date: string;
  is_active: boolean;
  role_title: string | null;
}

// ── Status pills ───────────────────────────────────────────────────────────────

const STATUS_PILL: Record<string, string> = {
  draft: "bg-surface-2 text-secondary border border-default",
  submitted: "bg-sky-500/10 text-sky-400 border border-sky-500/20",
  approved: "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20",
  rejected: "bg-error/10 text-error border border-error/20",
  partially_approved: "bg-amber-500/10 text-amber-400 border border-amber-500/20",
};

const STATUS_LABEL: Record<string, string> = {
  draft: "Borrador",
  submitted: "Enviado",
  approved: "Aprobado",
  rejected: "Rechazado",
  partially_approved: "Parcial",
};

const AMOUNT_FMT = new Intl.NumberFormat("es-MX", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function fmtMoney(n: string | number): string {
  const v = Number(n);
  return Number.isFinite(v) ? AMOUNT_FMT.format(v) : "0.00";
}

function fmtDate(iso: string): string {
  return new Date(iso + "T00:00:00").toLocaleDateString("es-MX", {
    month: "short",
    day: "numeric",
  });
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function TimeAccountingModule() {
  const t = useTranslations("timeAccounting");
  const user = useUserContext();
  const companyId = user.companyId;

  const [weeks, setWeeks] = useState<SubmittedWeek[]>([]);
  const [salaries, setSalaries] = useState<Record<number, SalaryConfig>>({});
  const [loading, setLoading] = useState(true);
  const [expandedUser, setExpandedUser] = useState<number | null>(null);
  const [actionLoading, setActionLoading] = useState<number | null>(null);

  // ── Fetch incoming weeks ──────────────────────────────────────────────────
  const loadWeeks = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const data = await apiCall<SubmittedWeek[]>(
        `/time/${companyId}/incoming`
      );
      setWeeks(data);
    } catch (e) {
      console.error("Failed to load time entries", e);
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  // ── Fetch salary configs ──────────────────────────────────────────────────
  const loadSalaries = useCallback(async () => {
    if (!companyId) return;
    try {
      const data = await apiCall<SalaryConfig[]>(
        `/time/${companyId}/salaries`
      );
      const map: Record<number, SalaryConfig> = {};
      for (const s of data) {
        map[s.user_id] = s;
      }
      setSalaries(map);
    } catch (e) {
      console.error("Failed to load salaries", e);
    }
  }, [companyId]);

  useEffect(() => {
    loadWeeks();
    loadSalaries();
  }, [loadWeeks, loadSalaries]);

  // ── Group by user ─────────────────────────────────────────────────────────
  const grouped = useMemo(() => {
    const map = new Map<number, SubmittedWeek[]>();
    for (const w of weeks) {
      if (!map.has(w.user_id)) map.set(w.user_id, []);
      map.get(w.user_id)!.push(w);
    }
    return Array.from(map.entries());
  }, [weeks]);

  const totalHours = weeks.reduce((sum, w) => sum + Number(w.total_hours), 0);
  const totalCost = weeks.reduce((sum, w) => {
    const salary = salaries[w.user_id];
    if (!salary) return sum;
    return sum + Number(w.total_hours) * Number(salary.hourly_rate);
  }, 0);

  // ── Approve / Reject ──────────────────────────────────────────────────────
  const handleApprove = useCallback(
    async (week: SubmittedWeek) => {
      if (!companyId) return;
      setActionLoading(week.user_id);
      try {
        await apiPost(`/time/${companyId}/entries/approve?reviewer_id=${user.userId}`, {
          entry_ids: week.entry_ids,
          notes: null,
        });
        await loadWeeks();
      } catch (e) {
        console.error("Failed to approve", e);
      } finally {
        setActionLoading(null);
      }
    },
    [companyId, user.userId, loadWeeks]
  );

  const handleReject = useCallback(
    async (week: SubmittedWeek) => {
      if (!companyId) return;
      setActionLoading(week.user_id);
      try {
        await apiPost(`/time/${companyId}/entries/reject?reviewer_id=${user.userId}`, {
          entry_ids: week.entry_ids,
          rejection_reason: "Rechazado por contabilidad",
        });
        await loadWeeks();
      } catch (e) {
        console.error("Failed to reject", e);
      } finally {
        setActionLoading(null);
      }
    },
    [companyId, user.userId, loadWeeks]
  );

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-full flex-col">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="shrink-0 border-b border-default px-4 py-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-primary">
              {t("accountingReview")}
            </h2>
            <p className="text-[10px] text-tertiary">
              {t("reviewDescription")}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-[9px] text-muted uppercase tracking-widest">{t("totalHours")}</p>
              <p className="text-sm font-bold text-primary tabular-nums">{Number(totalHours).toFixed(1)}h</p>
            </div>
            <div className="text-right">
              <p className="text-[9px] text-muted uppercase tracking-widest">{t("totalCost")}</p>
              <p className="text-sm font-bold text-primary tabular-nums">${fmtMoney(totalCost)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── No salary warning ─────────────────────────────────────────────── */}
      {Object.keys(salaries).length === 0 && !loading && weeks.length > 0 && (
        <div className="shrink-0 border-b border-default bg-amber-500/5 px-4 py-2">
          <div className="flex items-center gap-2">
            <DollarSign className="h-3.5 w-3.5 text-amber-400" />
            <p className="text-[10px] text-amber-300">
              {t("noSalaryWarning")}
            </p>
          </div>
        </div>
      )}

      {/* ── Content ────────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted" />
          </div>
        ) : weeks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Clock className="mb-2 h-8 w-8 text-muted" />
            <p className="text-[11px] text-tertiary">{t("noPending")}</p>
          </div>
        ) : (
          <div className="divide-y divide-subtle">
            {grouped.map(([userId, userWeeks]) => {
              const isExpanded = expandedUser === userId;
              const salary = salaries[userId];
              const userTotalHours = userWeeks.reduce((s, w) => s + Number(w.total_hours), 0);
              const userTotalCost = salary
                ? userTotalHours * Number(salary.hourly_rate)
                : 0;

              return (
                <div key={userId}>
                  {/* ── User header ─────────────────────────────────── */}
                  <button
                    type="button"
                    onClick={() => setExpandedUser(isExpanded ? null : userId)}
                    className="w-full px-4 py-2.5 text-left hover:bg-surface-1 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {isExpanded ? (
                          <ChevronDown className="h-3.5 w-3.5 text-muted" />
                        ) : (
                          <ChevronRight className="h-3.5 w-3.5 text-muted" />
                        )}
                        <Users className="h-3.5 w-3.5 text-muted" />
                        <span className="text-[11px] font-medium text-primary">
                          {userWeeks[0]?.user_name || `Usuario ${userId}`}
                        </span>
                        {salary && (
                          <span className="text-[9px] text-muted">
                            ${fmtMoney(salary.hourly_rate)}/h
                          </span>
                        )}
                        {!salary && (
                          <span className="text-[9px] text-amber-400">
                            {t("noRate")}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-4 text-[10px] tabular-nums">
                        <span className="text-secondary">{userTotalHours.toFixed(1)}h</span>
                        <span className="font-semibold text-primary">${fmtMoney(userTotalCost)}</span>
                      </div>
                    </div>
                  </button>

                  {/* ── Expanded: week list ──────────────────────────── */}
                  {isExpanded && (
                    <div className="bg-surface-1/50 pb-2">
                      {userWeeks.map((w) => {
                        const weekCost = salary
                          ? Number(w.total_hours) * Number(salary.hourly_rate)
                          : 0;
                        const weekStatus = w.status || "submitted";

                        return (
                          <div
                            key={w.week_start}
                            className="flex items-center justify-between px-6 py-1.5"
                          >
                            <div className="flex items-center gap-2">
                              <Calendar className="h-3 w-3 text-muted" />
                              <span className="text-[10px] text-secondary">
                                {fmtDate(w.week_start)}
                              </span>
                              <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[9px] font-semibold ${
                                STATUS_PILL[weekStatus] ?? STATUS_PILL.submitted
                              }`}>
                                {STATUS_LABEL[weekStatus] ?? weekStatus}
                              </span>
                              <span className="text-[9px] text-muted">
                                {w.entry_count} {w.entry_count === 1 ? t("entrySingular") : t("entryPlural")}
                              </span>
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="text-[10px] text-secondary tabular-nums">
                                {Number(w.total_hours).toFixed(1)}h
                              </span>
                              {salary && (
                                <span className="text-[10px] font-medium text-primary tabular-nums">
                                  ${fmtMoney(weekCost)}
                                </span>
                              )}
                              {weekStatus === "submitted" && (
                                <div className="flex items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => handleApprove(w)}
                                    disabled={actionLoading === w.user_id}
                                    className="inline-flex items-center gap-0.5 rounded bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-400 hover:bg-emerald-500/20 disabled:opacity-40"
                                  >
                                    <CheckCircle2 className="h-2.5 w-2.5" />
                                    {t("approve")}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleReject(w)}
                                    disabled={actionLoading === w.user_id}
                                    className="inline-flex items-center gap-0.5 rounded bg-error/10 px-1.5 py-0.5 text-[9px] font-semibold text-error hover:bg-error/20 disabled:opacity-40"
                                  >
                                    <XCircle className="h-2.5 w-2.5" />
                                    {t("reject")}
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
