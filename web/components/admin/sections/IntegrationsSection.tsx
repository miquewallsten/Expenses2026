"use client";

/**
 * Phase 4.3 — Admin integrations panel section.
 *
 * Read-only-first observability + manual "Run now" for the integrations
 * registered for this company. Backed by the existing /integrations API
 * shipped in Phase 4.1+4.3:
 *   GET  /integrations
 *   GET  /integrations/{id}/endpoints
 *   GET  /integrations/{id}/runs?limit=50
 *   POST /integrations/{id}/run  { endpoint, period? }
 *
 * Styling matches /admin/onboarding (zinc-950 chrome, dense rows, no big
 * cards). No create/edit — those endpoints don't exist on the backend yet.
 */

import {
  PremiumHeader,
  SectionPanel,
  Row,
  Toggle,
  SectionLabel,
  inputClasses,
  SECTION_ACCENTS,
} from "@/components/admin/shared/AdminPatterns";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Loader2,
  AlertTriangle,
  Play,
  CheckCircle2,
  XCircle,
  CircleDashed,
  Plug,
  RefreshCw,
} from "lucide-react";
import { getAuthHeaders } from "@/lib/session";

const API = process.env.NEXT_PUBLIC_API_BASE_URL;

// ── Types ────────────────────────────────────────────────────────────────────

type IntegrationKind = "erp" | "bank_statement" | "hris" | "generic_webhook";
type SyncStatus =
  | "pending"
  | "running"
  | "succeeded"
  | "failed"
  | "partial";
type EndpointName =
  | "export_polizas"
  | "sync_users"
  | "sync_cost_centers";

interface Integration {
  id: number;
  company_id: number;
  kind: IntegrationKind;
  vendor: string;
  name: string;
  is_enabled: boolean;
  created_at: string;
  updated_at: string;
}

interface IntegrationEndpoint {
  id: number;
  integration_id: number;
  endpoint: string;
  is_enabled: boolean;
  auth_strategy: string | null;
  target_url: string | null;
  schedule_cron: string | null;
  last_run_at: string | null;
  last_status: string | null;
}

interface SyncRun {
  id: number;
  integration_id: number;
  endpoint: string;
  direction: "outbound" | "inbound";
  status: SyncStatus;
  started_at: string;
  finished_at: string | null;
  items_ok: number;
  items_failed: number;
  error_summary: string | null;
  request_id: string | null;
}

const RUNNABLE_ENDPOINTS: EndpointName[] = [
  "export_polizas",
  "sync_users",
  "sync_cost_centers",
];

// ── Component ──────────────────────────────────────────────────────────────────

export default function IntegrationsSection() {
  const t = useTranslations("admin.integrations");
  const [integrations, setIntegrations] = useState<Integration[] | null>(null);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [endpoints, setEndpoints] = useState<IntegrationEndpoint[]>([]);
  const [runs, setRuns] = useState<SyncRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [running, setRunning] = useState<EndpointName | null>(null);
  const [error, setError] = useState<string | null>(null);

  // List load
  const loadList = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`${API}/integrations`, {
        headers: getAuthHeaders(),
      });
      if (!r.ok) throw new Error(`${r.status}`);
      const rows: Integration[] = await r.json();
      setIntegrations(rows);
      if (rows.length && activeId == null) setActiveId(rows[0].id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [activeId]);

  useEffect(() => {
    void loadList();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Detail load
  const loadDetail = useCallback(
    async (id: number) => {
      setDetailLoading(true);
      try {
        const [eR, rR] = await Promise.all([
          fetch(`${API}/integrations/${id}/endpoints`, {
            headers: getAuthHeaders(),
          }),
          fetch(`${API}/integrations/${id}/runs?limit=50`, {
            headers: getAuthHeaders(),
          }),
        ]);
        if (eR.ok) setEndpoints(await eR.json());
        if (rR.ok) setRuns(await rR.json());
      } finally {
        setDetailLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (activeId != null) void loadDetail(activeId);
  }, [activeId, loadDetail]);

  const triggerRun = useCallback(
    async (endpoint: EndpointName) => {
      if (activeId == null) return;
      setRunning(endpoint);
      try {
        const r = await fetch(`${API}/integrations/${activeId}/run`, {
          method: "POST",
          headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint }),
        });
        if (!r.ok) {
          const msg = await r.text();
          setError(msg || `${r.status}`);
        } else {
          await loadDetail(activeId);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setRunning(null);
      }
    },
    [activeId, loadDetail],
  );

  const active = useMemo(
    () => integrations?.find((i) => i.id === activeId) ?? null,
    [integrations, activeId],
  );

  if (loading && !integrations) {
    return (
      <div className="flex items-center justify-center py-20 text-tertiary">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
        <PremiumHeader
          section="integrations"
          icon={<Plug className="h-4 w-4" />}
          title={t("title")}
          subtitle="External System Connections"
          action={
            <button
              type="button"
              onClick={() => void loadList()}
              className="flex items-center gap-1.5 rounded-lg border border-default bg-surface-1 px-3 py-1.5 text-[10px] font-semibold text-tertiary transition hover:border-strong hover:text-secondary"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              {t("refresh")}
            </button>
          }
        />

        {error && (
          <div className="rounded-lg border border-error bg-rose-500/[0.06] px-3 py-2 text-[10.5px] text-rose-200/85">
            <AlertTriangle className="mr-2 inline h-3.5 w-3.5 shrink-0" />
            {error}
          </div>
        )}

        {!integrations || integrations.length === 0 ? (
          <div className="rounded-xl border border-dashed border-default bg-surface-1 px-6 py-16 text-center">
            <p className="text-[12px] font-medium text-primary">{t("emptyTitle")}</p>
            <p className="mt-1 text-[10.5px] text-muted">{t("emptyBody")}</p>
          </div>
        ) : (
          <div className="grid grid-cols-12 gap-6 items-start">
            <aside className="col-span-4 space-y-2">
              <SectionLabel>{t("listLabel")}</SectionLabel>
              <ul className="space-y-1.5">
                {integrations.map((it) => {
                  const isActive = it.id === activeId;
                  return (
                    <li key={it.id}>
                      <button
                        type="button"
                        onClick={() => setActiveId(it.id)}
                        className={`flex w-full items-center justify-between rounded-xl border p-2.5 text-left text-[11px] transition-all ${
                          isActive
                            ? "border-accent/40 bg-accent/10 text-primary shadow-sm"
                            : "border-transparent bg-surface-1 text-secondary hover:bg-surface-2"
                        }`}
                      >
                        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                          <span className="truncate font-semibold">
                            {it.name}
                          </span>
                          <span className="truncate text-[9.5px] text-muted font-medium uppercase tracking-wide">
                            {it.vendor} · {t(`kind.${it.kind}`)}
                          </span>
                        </span>
                        <span
                          className={`ml-2 h-1.5 w-1.5 shrink-0 rounded-full ${
                            it.is_enabled ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.4)]" : "bg-white/10"
                          }`}
                        />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </aside>

            <section className="col-span-8 rounded-xl border border-default bg-surface-1 overflow-hidden shadow-sm">
              {active ? (
                <DetailPane
                  active={active}
                  endpoints={endpoints}
                  runs={runs}
                  running={running}
                  detailLoading={detailLoading}
                  onRun={triggerRun}
                  t={t}
                />
              ) : (
                <div className="px-5 py-20 text-center text-[11px] text-muted italic">
                  {t("selectPrompt")}
                </div>
              )}
            </section>
          </div>
        )}
    </div>
  );
}

// ── Detail pane ──────────────────────────────────────────────────────────────

function DetailPane({
  active,
  endpoints,
  runs,
  running,
  detailLoading,
  onRun,
  t,
}: {
  active: Integration;
  endpoints: IntegrationEndpoint[];
  runs: SyncRun[];
  running: EndpointName | null;
  detailLoading: boolean;
  onRun: (e: EndpointName) => void;
  t: ReturnType<typeof useTranslations>;
}) {
  return (
    <div className="divide-y divide-white/5">
      <header className="flex items-center justify-between bg-surface-2/30 px-5 py-4">
        <div className="space-y-0.5">
          <h2 className="text-[14px] font-bold text-primary tracking-tight">
            {active.name}
          </h2>
          <div className="flex items-center gap-2 text-[10px] font-medium text-tertiary uppercase tracking-wider">
            <span>{active.vendor}</span>
            <span className="text-white/10">•</span>
            <span>{t(`kind.${active.kind}`)}</span>
            <span className="text-white/10">•</span>
            {active.is_enabled ? (
              <span className="text-emerald-400">{t("enabled")}</span>
            ) : (
              <span className="text-warning">{t("disabled")}</span>
            )}
          </div>
        </div>
      </header>

      <section className="px-5 py-4 space-y-3">
        <SectionLabel>{t("runNow")}</SectionLabel>
        <div className="flex flex-wrap gap-2">
          {RUNNABLE_ENDPOINTS.map((ep) => {
            const isRunning = running === ep;
            const disabled = !active.is_enabled || running !== null;
            return (
              <button
                key={ep}
                type="button"
                onClick={() => onRun(ep)}
                disabled={disabled}
                className="flex items-center gap-2 rounded-lg border border-accent/20 bg-accent/5 px-3 py-1.5 text-[10.5px] font-semibold text-accent transition-all hover:bg-accent/10 disabled:opacity-30"
              >
                {isRunning ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Play className="h-3.5 w-3.5 fill-current" />
                )}
                {t(`endpoint.${ep}`)}
              </button>
            );
          })}
        </div>
      </section>

      <section className="px-5 py-4 space-y-3">
        <div className="flex items-center justify-between">
          <SectionLabel>{t("endpointsLabel")}</SectionLabel>
          {detailLoading && (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-muted" />
          )}
        </div>
        {endpoints.length === 0 ? (
          <p className="py-2 text-[10.5px] text-muted italic">{t("noEndpoints")}</p>
        ) : (
          <div className="overflow-hidden rounded-lg border border-white/5 bg-black/10">
            <ul className="divide-y divide-white/5">
              {endpoints.map((ep) => (
                <li
                  key={ep.id}
                  className="flex items-center gap-3 px-3 py-2 text-[10.5px]"
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${ep.is_enabled ? "bg-emerald-400" : "bg-white/10"}`} />
                  <span className="flex-1 font-mono font-medium text-secondary">
                    {ep.endpoint}
                  </span>
                  <span className="text-muted text-[10px] font-medium px-2 py-0.5 rounded-md bg-white/5 border border-white/5">
                    {ep.auth_strategy ?? "—"}
                  </span>
                  <span className="hidden md:inline font-mono text-[9.5px] text-muted">
                    {ep.schedule_cron ?? t("noSchedule")}
                  </span>
                  <StatusBadge status={ep.last_status} t={t} />
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section className="px-5 py-4 space-y-3">
        <SectionLabel>{t("runsLabel")}</SectionLabel>
        {runs.length === 0 ? (
          <p className="py-2 text-[10.5px] text-muted italic">{t("noRuns")}</p>
        ) : (
          <div className="overflow-hidden rounded-lg border border-white/5">
            <ul className="divide-y divide-white/5">
              {runs.map((r) => (
                <li
                  key={r.id}
                  className="group flex flex-col gap-1.5 px-3 py-2.5 transition-colors hover:bg-white/[0.02]"
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="font-mono text-[10px] font-semibold text-secondary tabular-nums">
                        {fmtDateTime(r.started_at)}
                      </span>
                      <span className="truncate font-mono text-[10px] text-tertiary">
                        {r.endpoint}
                      </span>
                    </div>
                    <RunStatusBadge status={r.status} t={t} />
                  </div>
                  <div className="flex items-center gap-3 text-[9px] font-bold uppercase tracking-widest">
                    <span className="text-muted">{r.direction === "outbound" ? "Export" : "Import"}</span>
                    <span className="text-white/5">•</span>
                    <span className="text-emerald-400/80">OK {r.items_ok}</span>
                    <span className="text-white/5">•</span>
                    <span className="text-rose-400/80">ERR {r.items_failed}</span>
                  </div>
                  {r.error_summary && (
                    <div className="mt-0.5 rounded-md bg-rose-500/10 border border-rose-500/20 px-2.5 py-1.5 font-mono text-[9px] text-rose-300/90 leading-normal break-all">
                      {r.error_summary}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function StatusBadge({
  status,
  t,
}: {
  status: string | null;
  t: ReturnType<typeof useTranslations>;
}) {
  if (!status) return <span className="text-[9.5px] text-muted">—</span>;
  const colors = {
    succeeded: "border-emerald-500/20 bg-emerald-500/10 text-emerald-400",
    failed: "border-rose-500/20 bg-rose-500/10 text-rose-400",
    partial: "border-amber-500/20 bg-amber-500/10 text-amber-400",
  };
  const tone = colors[status as keyof typeof colors] || "border-white/5 bg-white/5 text-muted";
  return (
    <span className={`inline-block rounded-md border px-1.5 py-0.5 text-[8.5px] font-bold uppercase tracking-widest ${tone}`}>
      {t(`status.${status}`)}
    </span>
  );
}

function RunStatusBadge({
  status,
  t,
}: {
  status: SyncStatus;
  t: ReturnType<typeof useTranslations>;
}) {
  const Icon = status === "succeeded" ? CheckCircle2 : status === "failed" ? XCircle : status === "partial" ? AlertTriangle : CircleDashed;
  const colors = {
    succeeded: "text-emerald-400",
    failed: "text-rose-400",
    partial: "text-amber-400",
    pending: "text-muted animate-pulse",
    running: "text-accent animate-spin-slow",
  };
  return (
    <span className={`flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-widest ${colors[status]}`}>
      <Icon className="h-3 w-3" />
      {t(`status.${status}`)}
    </span>
  );
}

function fmtDateTime(iso: string): string {
  return iso.replace("T", " ").slice(0, 16);
}
