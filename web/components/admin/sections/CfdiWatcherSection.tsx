"use client";

/**
 * Phase 4.8 frontend - SAT cancel watcher reversal panel section.
 *
 * Wraps GET /expenses/cfdi/cancelled and POST /expenses/cfdi/recheck/{id}.
 * Read-only triage list of expenses whose CFDI flipped to Cancelado, with a
 * one-click manual recheck (in case SAT toggles back to Vigente).
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  XOctagon,
  Loader2,
  AlertTriangle,
  RefreshCw,
  ExternalLink,
  Coins,
  PlayCircle,
} from "lucide-react";
import {
  PremiumHeader,
  SectionPanel,
  SectionLabel,
} from "@/components/admin/shared/AdminPatterns";
import { apiCall, apiPost } from "@/lib/api/client";


interface CancelledRow {
  id: number;
  description: string;
  amount: number;
  status: string;
  expense_date: string | null;
  cfdi_uuid: string | null;
  cfdi_status: string | null;
  cfdi_last_checked_at: string | null;
  cfdi_amount_mismatch: boolean;
}

export default function CfdiWatcherSection() {
  const t = useTranslations("admin.cfdiWatcher");
  const [rows, setRows] = useState<CancelledRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [batchRunning, setBatchRunning] = useState(false);
  const [batchSummary, setBatchSummary] = useState<{
    checked: number;
    flipped: number;
    skipped: number;
  } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiCall<CancelledRow[]>(`/expenses/cfdi/cancelled`);
      setRows(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const recheck = useCallback(
    async (row: CancelledRow) => {
      setBusyId(row.id);
      setError(null);
      try {
        const body = await apiPost<{ cfdi_status: string; cfdi_last_checked_at: string }>(`/expenses/cfdi/recheck/${row.id}`);
        // If still Cancelado, just refresh timestamp; else drop from list.
        if (body.cfdi_status === "Cancelado") {
          setRows((prev) =>
            prev.map((r) =>
              r.id === row.id
                ? { ...r, cfdi_last_checked_at: body.cfdi_last_checked_at }
                : r,
            ),
          );
        } else {
          setRows((prev) => prev.filter((r) => r.id !== row.id));
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error");
      } finally {
        setBusyId(null);
      }
    },
    [],
  );

  const runBatch = useCallback(async () => {
    setBatchRunning(true);
    setBatchSummary(null);
    setError(null);
    try {
      const res: any = await apiPost(`/expenses/cfdi/recheck-pending`);
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `${res.status}`);
      }
      const body = (await res.json()) as {
        checked: number;
        flipped: number;
        skipped: number;
      };
      setBatchSummary({
        checked: body.checked,
        flipped: body.flipped,
        skipped: body.skipped,
      });
      // Refresh listing in case anything flipped back to Vigente.
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setBatchRunning(false);
    }
  }, [load]);

  return (
    <div className="space-y-6">
      <PremiumHeader
        section="cfdi-watcher"
        icon={<XOctagon className="h-4 w-4" />}
        title={t("title")}
        subtitle="SAT Cancelled CFDI Monitor"
        action={
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={batchRunning || loading}
              onClick={() => void runBatch()}
              className="flex items-center gap-1.5 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-[10px] font-bold text-rose-400 transition-all hover:bg-rose-500/20 disabled:opacity-40"
            >
              {batchRunning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PlayCircle className="h-3.5 w-3.5" />}
              {t("runBatch")}
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={() => void load()}
              className="flex items-center gap-1.5 rounded-lg border border-default bg-surface-1 px-3 py-1.5 text-[10px] font-bold text-tertiary transition hover:border-strong hover:text-secondary disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              {t("refresh")}
            </button>
          </div>
        }
      />

      {batchSummary && (
        <div className="flex items-center gap-3 rounded-lg border border-blue-500/30 bg-blue-500/5 p-3 text-[11px] text-blue-200 shadow-sm animate-in fade-in slide-in-from-top-1">
          <div className="h-2 w-2 rounded-full bg-blue-400 animate-pulse" />
          <span className="font-mono tabular-nums">
            {t("batchChecked", { count: batchSummary.checked })} ·{" "}
            {t("batchFlipped", { count: batchSummary.flipped })} ·{" "}
            {t("batchSkipped", { count: batchSummary.skipped })}
          </span>
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-error bg-rose-500/[0.08] p-3 text-[11px] text-rose-200">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span className="break-all">{error}</span>
        </div>
      )}

      <div className="space-y-4">
        <SectionLabel>{t("count", { count: rows.length })}</SectionLabel>
        
        {loading ? (
          <div className="p-16 text-center text-muted animate-pulse">
            <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
            {t("loading")}
          </div>
        ) : rows.length === 0 ? (
          <SectionPanel>
            <div className="p-20 text-center space-y-3">
              <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400">
                <XOctagon className="h-5 w-5" />
              </div>
              <div className="space-y-1">
                <div className="text-[12.5px] font-bold text-primary">{t("emptyTitle")}</div>
                <div className="text-[11px] text-muted max-w-xs mx-auto">{t("emptyBody")}</div>
              </div>
            </div>
          </SectionPanel>
        ) : (
          <SectionPanel>
            <div className="overflow-hidden">
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="border-b border-subtle bg-surface-2/30 text-[9px] uppercase tracking-widest text-muted">
                    <th className="p-3 font-semibold">{t("th.expense")}</th>
                    <th className="p-3 font-semibold">{t("th.amount")}</th>
                    <th className="p-3 font-semibold">{t("th.uuid")}</th>
                    <th className="p-3 font-semibold text-right">{t("th.checked")}</th>
                    <th className="p-3 w-32" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-subtle">
                  {rows.map((r) => (
                    <tr
                      key={r.id}
                      className="group hover:bg-surface-2/40 transition-colors"
                    >
                      <td className="p-3">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-bold text-secondary">#{r.id}</span>
                          <span className="text-primary font-medium truncate max-w-[200px]">{r.description}</span>
                          <Link
                            href={`/employee/expenses/${r.id}`}
                            className="text-muted hover:text-accent transition-colors"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                          </Link>
                        </div>
                        <div className="flex items-center gap-2 text-[9px] font-bold uppercase tracking-wide text-muted">
                          <span>{r.expense_date ?? " - "}</span>
                          <span className="separator-dot">•</span>
                          <span>{r.status}</span>
                          {r.cfdi_amount_mismatch && (
                            <span className="ml-1 text-rose-400">Mismatch Detected</span>
                          )}
                        </div>
                      </td>
                      <td className="p-3">
                        <div className="font-mono font-bold text-secondary tabular-nums">
                          ${r.amount.toFixed(2)}
                        </div>
                      </td>
                      <td className="p-3">
                        <code className="text-[9.5px] text-tertiary font-mono bg-surface-2 px-1.5 py-0.5 rounded">
                          {r.cfdi_uuid?.slice(0, 8) ?? " - "}…{r.cfdi_uuid?.slice(-8)}
                        </code>
                      </td>
                      <td className="p-3 text-right text-muted font-medium">
                        {r.cfdi_last_checked_at
                          ? new Date(r.cfdi_last_checked_at).toLocaleDateString()
                          : " - "}
                      </td>
                      <td className="p-3 text-right">
                        <button
                          disabled={busyId === r.id}
                          onClick={() => void recheck(r)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-default bg-surface-1 px-3 py-1.5 text-[10px] font-bold text-secondary transition-all hover:border-strong hover:text-primary disabled:opacity-40"
                        >
                          {busyId === r.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                          {t("recheck")}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionPanel>
        )}
      </div>
    </div>
  );
}
