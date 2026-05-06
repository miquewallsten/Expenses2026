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
    // we only want this on mount + manual reloads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  // ── Render ──────────────────────────────────────────────────────────────────

  if (loading && !integrations) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-0 text-tertiary">
        <Loader2 className="h-4 w-4 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface-0">
      <div className="mx-auto max-w-6xl px-6 py-6">
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

        <div className="mt-5">
          {error && (
            <div className="mb-4 rounded-lg border border-red-500/25 bg-red-500/[0.06] px-3 py-2 text-[10.5px] text-red-200/85">
              <AlertTriangle className="mr-2 inline h-3.5 w-3.5" />
              {error}
            </div>
          )}

          {!integrations || integrations.length === 0 ? (
            <div className="mt-8 rounded-md border border-dashed border-default bg-surface-1 px-6 py-10 text-center">
              <p className="text-[12px] text-tertiary">{t("emptyTitle")}</p>
              <p className="mt-1 text-[10.5px] text-muted">{t("emptyBody")}</p>
            </div>
          ) : (
            <div className="mt-5 grid grid-cols-12 gap-4">
              {/* Left rail — integrations list */}
              <aside className="col-span-4">
                <div className="text-[9.5px] uppercase tracking-wider text-muted">
                  {t("listLabel")}
                </div>
                <ul className="mt-2 space-y-1">
                  {integrations.map((it) => {
                    const isActive = it.id === activeId;
                    return (
                      <li key={it.id}>
                        <button
                          type="button"
                          onClick={() => setActiveId(it.id)}
                          className={`flex w-full items-center justify-between rounded border px-2.5 py-1.5 text-left text-[10.5px] transition-colors ${
                            isActive
                              ? "border-blue-500/50 bg-blue-500/[0.08] text-primary"
                              : "border-subtle bg-surface-1 text-tertiary hover:border-default hover:text-primary"
                          }`}
                        >
                          <span className="flex min-w-0 flex-1 flex-col">
                            <span className="truncate font-medium">
                              {it.name}
                            </span>
                            <span className="truncate text-[9.5px] text-muted">
                              {it.vendor} · {t(`kind.${it.kind}`)}
                            </span>
                          </span>
                          <span
                            className={`ml-2 inline-block h-1.5 w-1.5 shrink-0 rounded-full ${
                              it.is_enabled ? "bg-emerald-400/85" : "bg-surface-3"
                            }`}
                            aria-label={
                              it.is_enabled ? t("enabled") : t("disabled")
                            }
                          />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </aside>

              {/* Right pane — detail */}
              <section className="col-span-8 rounded-md border border-subtle bg-surface-1">
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
                  <div className="px-5 py-8 text-center text-[11px] text-muted">
                    {t("selectPrompt")}
                  </div>
                )}
              </section>
            </div>
          )}
        </div>
      </div>
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
    <div>
      {/* Title row */}
      <header className="flex items-center justify-between border-b border-subtle px-5 py-3">
        <div>
          <h2 className="text-[13.5px] font-semibold text-primary">
            {active.name}
          </h2>
          <p className="mt-0.5 text-[10px] text-tertiary">
            {active.vendor} · {t(`kind.${active.kind}`)} ·{" "}
            {active.is_enabled ? (
              <span className="text-emerald-300/85">{t("enabled")}</span>
            ) : (
              <span className="text-warning/85">{t("disabled")}</span>
            )}
          </p>
        </div>
      </header>

      {/* Run actions */}
      <section className="border-b border-subtle px-5 py-3">
        <div className="text-[9.5px] uppercase tracking-wider text-muted">
          {t("runNow")}
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {RUNNABLE_ENDPOINTS.map((ep) => {
            const isRunning = running === ep;
            const disabled = !active.is_enabled || running !== null;
            return (
              <button
                key={ep}
                type="button"
                onClick={() => onRun(ep)}
                disabled={disabled}
                className="flex items-center gap-1 rounded border bg-accent-muted bg-blue-500/[0.08] px-2.5 py-1 text-[10.5px] text-accent/85 hover:border-blue-500/50 hover:bg-accent-hover/[0.14] disabled:cursor-not-allowed disabled:opacity-30"
              >
                {isRunning ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Play className="h-3 w-3" />
                )}
                {t(`endpoint.${ep}`)}
              </button>
            );
          })}
          {!active.is_enabled && (
            <span className="text-[9.5px] text-warning/70">
              {t("enableToRun")}
            </span>
          )}
        </div>
      </section>

      {/* Endpoints */}
      <section className="border-b border-subtle px-5 py-3">
        <div className="flex items-center justify-between">
          <div className="text-[9.5px] uppercase tracking-wider text-muted">
            {t("endpointsLabel")}
          </div>
          {detailLoading && (
            <Loader2 className="h-3 w-3 animate-spin text-muted" />
          )}
        </div>
        {endpoints.length === 0 ? (
          <p className="mt-2 text-[10.5px] text-muted">{t("noEndpoints")}</p>
        ) : (
          <ul className="mt-2 divide-y divide-white/[0.04] rounded border border-subtle">
            {endpoints.map((ep) => (
              <li
                key={ep.id}
                className="flex items-center gap-3 px-2.5 py-1.5 text-[10.5px]"
              >
                <span className="flex h-1.5 w-1.5 shrink-0 rounded-full bg-current">
                  <span
                    className={
                      ep.is_enabled ? "text-success/85" : "text-muted"
                    }
                  />
                </span>
                <span className="flex-1 font-mono text-secondary">
                  {ep.endpoint}
                </span>
                <span className="text-muted">
                  {ep.auth_strategy ?? "—"}
                </span>
                <span className="font-mono text-[9.5px] text-muted">
                  {ep.schedule_cron ?? t("noSchedule")}
                </span>
                <StatusBadge status={ep.last_status} t={t} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Recent runs */}
      <section className="px-5 py-3">
        <div className="text-[9.5px] uppercase tracking-wider text-muted">
          {t("runsLabel")}
        </div>
        {runs.length === 0 ? (
          <p className="mt-2 text-[10.5px] text-muted">{t("noRuns")}</p>
        ) : (
          <ul className="mt-2 divide-y divide-white/[0.04] rounded border border-subtle">
            {runs.map((r) => (
              <li
                key={r.id}
                className="grid grid-cols-12 items-center gap-2 px-2.5 py-1.5 text-[10.5px]"
              >
                <span className="col-span-3 font-mono text-secondary">
                  {fmtDateTime(r.started_at)}
                </span>
                <span className="col-span-3 truncate font-mono text-tertiary">
                  {r.endpoint}
                </span>
                <span className="col-span-1 text-[9.5px] text-muted">
                  {r.direction === "outbound" ? "↑" : "↓"}
                </span>
                <span className="col-span-2 font-mono tabular-nums text-emerald-300/75">
                  {r.items_ok}
                  <span className="text-muted"> / </span>
                  <span className="text-error/75">{r.items_failed}</span>
                </span>
                <span className="col-span-3 flex justify-end">
                  <RunStatusBadge status={r.status} t={t} />
                </span>
                {r.error_summary && (
                  <span className="col-span-12 truncate pl-0 pt-0.5 font-mono text-[9.5px] text-error/70">
                    {r.error_summary}
                  </span>
                )}
              </li>
            ))}
          </ul>
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
  if (!status) {
    return <span className="text-[9.5px] text-muted">—</span>;
  }
  const tone =
    status === "succeeded"
      ? "border-emerald-500/25 bg-emerald-500/[0.07] text-success/85"
      : status === "failed"
        ? "border-red-500/25 bg-red-500/[0.07] text-red-200/85"
        : status === "partial"
          ? "border-amber-500/25 bg-amber-500/[0.07] text-warning/85"
          : "border-default bg-surface-1 text-tertiary";
  return (
    <span
      className={`inline-block rounded-full border px-1.5 py-0 text-[9px] uppercase tracking-wider ${tone}`}
    >
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
  const Icon =
    status === "succeeded"
      ? CheckCircle2
      : status === "failed"
        ? XCircle
        : status === "partial"
          ? AlertTriangle
          : CircleDashed;
  const tone =
    status === "succeeded"
      ? "text-emerald-300/85"
      : status === "failed"
        ? "text-error/85"
        : status === "partial"
          ? "text-warning/85"
          : "text-tertiary";
  return (
    <span className={`flex items-center gap-1 ${tone}`}>
      <Icon className="h-3 w-3" />
      <span className="text-[9.5px] uppercase tracking-wider">
        {t(`status.${status}`)}
      </span>
    </span>
  );
}

function fmtDateTime(iso: string): string {
  // YYYY-MM-DD HH:MM
  return iso.replace("T", " ").slice(0, 16);
}
