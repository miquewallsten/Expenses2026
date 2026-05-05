"use client";

export const dynamic = "force-dynamic";

/**
 * Phase 8.5 frontend — agent insights digest dashboard.
 *
 * Wraps GET /agent/insights/{cid}, POST /agent/insights/{cid}/{id}/status,
 * and POST /agent/insights/run. Lets admins triage the daily digest
 * (unmatched amex aging · pending approval aging · cfdi cancelled).
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  ChevronLeft,
  Lightbulb,
  Loader2,
  AlertTriangle,
  AlertCircle,
  Info,
  RefreshCw,
  Check,
  X,
  Mail,
} from "lucide-react";
import { getCurrentCompanyId } from "@/lib/session";
import { apiCall, apiPost } from "@/lib/api/client";

interface Insight {
  id: number;
  kind: string;
  severity: "info" | "warn" | "alert" | string;
  title: string;
  body: string | null;
  data: Record<string, unknown> | null;
  suggested_prompt: string | null;
  status: "open" | "acknowledged" | "resolved" | "dismissed" | string;
  created_at: string;
}

type StatusAction = "acknowledged" | "resolved" | "dismissed";

export default function InsightsPage() {
  const t = useTranslations("admin.insights");
  const [companyId, setCompanyId] = useState<number | null>(null);
  const [rows, setRows] = useState<Insight[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const cid = getCurrentCompanyId();
    if (cid) setCompanyId(Number(cid));
  }, []);

  const load = useCallback(
    async (cid: number, refresh = false) => {
      setError(null);
      setLoading(true);
      try {
        const url = `/agent/insights/${cid}${refresh ? "?refresh=true" : ""}`;
        const json = await apiCall<Insight[]>(url);
        setRows(json);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error");
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (companyId) void load(companyId);
  }, [companyId, load]);

  const runScan = useCallback(
    async (sendDigest: boolean) => {
      if (!companyId) return;
      setRunning(true);
      setError(null);
      try {
        await apiPost(`/agent/insights/run${sendDigest ? "?send_digest=true" : ""}`);
        await load(companyId);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error");
      } finally {
        setRunning(false);
      }
    },
    [companyId, load],
  );

  const setStatus = useCallback(
    async (insight: Insight, status: StatusAction) => {
      if (!companyId) return;
      setBusyId(insight.id);
      setError(null);
      try {
        await apiPost(`/agent/insights/${companyId}/${insight.id}/status`, { status });
        // remove from open list — backend filters status='open'
        setRows((prev) => prev.filter((r) => r.id !== insight.id));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error");
      } finally {
        setBusyId(null);
      }
    },
    [companyId],
  );

  if (!companyId) {
    return (
      <main className="min-h-screen bg-surface-0 text-primary">
        <div className="mx-auto max-w-5xl px-6 py-10">
          <div className="rounded border border-amber-500/20 bg-amber-500/[0.05] p-4 text-[12px] text-warning/80">
            {t("noCompany")}
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-surface-0 text-primary">
      <div className="mx-auto max-w-5xl px-6 py-6">
        {/* Header */}
        <div className="mb-5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link
              href="/super-admin"
              className="flex items-center gap-1 rounded border border-subtle bg-surface-1 px-2 py-1 text-[11px] text-secondary transition hover:border-strong hover:text-secondary"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              {t("back")}
            </Link>
            <div>
              <h1 className="flex items-center gap-2 text-[14px] font-semibold tracking-tight text-primary">
                <Lightbulb className="h-4 w-4 text-warning/70" />
                {t("title")}
              </h1>
              <p className="text-[10.5px] text-muted">{t("subtitle")}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={running || loading}
              onClick={() => void runScan(false)}
              className="flex items-center gap-1.5 rounded border border-subtle bg-surface-2 px-2.5 py-1 text-[11px] text-tertiary transition hover:border-strong hover:bg-surface-3 disabled:opacity-50"
            >
              {running ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              {t("rescan")}
            </button>
            <button
              type="button"
              disabled={running || loading}
              onClick={() => void runScan(true)}
              className="flex items-center gap-1.5 rounded border border-amber-500/25 bg-amber-500/[0.08] px-2.5 py-1 text-[11px] text-warning transition hover:border-amber-500/40 hover:bg-amber-500/[0.12] disabled:opacity-50"
            >
              <Mail className="h-3.5 w-3.5" />
              {t("sendDigest")}
            </button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-3 flex items-start gap-2 rounded border border-error bg-rose-500/[0.08] p-2.5 text-[11px] text-rose-200">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span className="break-all">{error}</span>
          </div>
        )}

        {/* Counts */}
        <div className="mb-3 text-[10.5px] uppercase tracking-wide text-muted">
          {t("openCount", { count: rows.length })}
        </div>

        {/* List */}
        {loading ? (
          <div className="flex items-center gap-2 rounded border border-subtle bg-surface-1 p-6 text-[11px] text-secondary">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {t("loading")}
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded border border-subtle bg-surface-1 p-8 text-center">
            <div className="mx-auto mb-2 flex h-9 w-9 items-center justify-center rounded-full border border-emerald-500/30 bg-emerald-500/[0.08]">
              <Check className="h-4 w-4 text-emerald-300" />
            </div>
            <div className="text-[12px] text-tertiary">{t("emptyTitle")}</div>
            <div className="text-[10.5px] text-muted">{t("emptyBody")}</div>
          </div>
        ) : (
          <ul className="space-y-2">
            {rows.map((r) => (
              <InsightRow
                key={r.id}
                insight={r}
                busy={busyId === r.id}
                onAck={() => void setStatus(r, "acknowledged")}
                onResolve={() => void setStatus(r, "resolved")}
                onDismiss={() => void setStatus(r, "dismissed")}
                t={t}
              />
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}

interface RowProps {
  insight: Insight;
  busy: boolean;
  onAck: () => void;
  onResolve: () => void;
  onDismiss: () => void;
  t: ReturnType<typeof useTranslations>;
}

function InsightRow({ insight, busy, onAck, onResolve, onDismiss, t }: RowProps) {
  const sev = severityStyles(insight.severity);
  const Icon = sev.icon;
  return (
    <li
      className={`rounded border ${sev.border} ${sev.bg} p-3`}
    >
      <div className="flex items-start gap-3">
        <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${sev.iconColor}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span
              className={`rounded px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide ${sev.pill}`}
            >
              {insight.severity}
            </span>
            <span className="rounded border border-subtle bg-surface-1 px-1.5 py-0.5 text-[9px] text-secondary">
              {insight.kind}
            </span>
            <span className="text-[9.5px] text-muted">
              {new Date(insight.created_at).toLocaleString()}
            </span>
          </div>
          <div className="mt-1.5 text-[12px] font-medium text-primary">
            {insight.title}
          </div>
          {insight.body && (
            <div className="mt-1 whitespace-pre-wrap text-[11px] leading-snug text-secondary">
              {insight.body}
            </div>
          )}
          {insight.suggested_prompt && (
            <div className="mt-2 rounded border border-subtle bg-black/20 p-2 font-mono text-[10.5px] text-secondary">
              <span className="text-muted">›</span> {insight.suggested_prompt}
            </div>
          )}
        </div>
        <div className="flex shrink-0 flex-col gap-1">
          <button
            type="button"
            disabled={busy}
            onClick={onAck}
            className="flex items-center gap-1 rounded border border-subtle bg-surface-2 px-2 py-1 text-[10px] text-tertiary transition hover:border-strong hover:bg-surface-3 disabled:opacity-50"
          >
            {busy ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Check className="h-3 w-3" />
            )}
            {t("actions.ack")}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onResolve}
            className="flex items-center gap-1 rounded border border-emerald-500/25 bg-emerald-500/[0.06] px-2 py-1 text-[10px] text-emerald-300 transition hover:border-success hover:bg-emerald-500/[0.10] disabled:opacity-50"
          >
            <Check className="h-3 w-3" />
            {t("actions.resolve")}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onDismiss}
            className="flex items-center gap-1 rounded border border-subtle bg-surface-1 px-2 py-1 text-[10px] text-muted transition hover:border-default hover:text-tertiary disabled:opacity-50"
          >
            <X className="h-3 w-3" />
            {t("actions.dismiss")}
          </button>
        </div>
      </div>
    </li>
  );
}

function severityStyles(sev: string) {
  switch (sev) {
    case "alert":
      return {
        border: "border-rose-500/25",
        bg: "bg-rose-500/[0.04]",
        icon: AlertCircle,
        iconColor: "text-rose-300",
        pill: "bg-rose-500/15 text-rose-200",
      };
    case "warn":
      return {
        border: "border-amber-500/25",
        bg: "bg-amber-500/[0.04]",
        icon: AlertTriangle,
        iconColor: "text-warning",
        pill: "bg-amber-500/15 text-warning",
      };
    default:
      return {
        border: "border-subtle",
        bg: "bg-surface-1",
        icon: Info,
        iconColor: "text-accent",
        pill: "bg-accent-muted text-sky-200",
      };
  }
}
