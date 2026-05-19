"use client";

/**
 * ERP Connections manager — universal integration configuration.
 *
 * Shows all registered integrations for the company with status,
 * endpoints, and last sync info. Supports "Run Now" for manual syncs.
 * The creation flow is currently admin-only (backend endpoint needed).
 */

import {
  PremiumHeader,
  SectionPanel,
  Row,
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
  Plus,
  ArrowRightLeft,
  ExternalLink,
} from "lucide-react";
import { apiCall, apiPost } from "@/lib/api/client";

// ── Types ────────────────────────────────────────────────────────────────────

interface Integration {
  id: number;
  company_id: number;
  kind: string;
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
  status: string;
  started_at: string;
  finished_at: string | null;
  items_ok: number;
  items_failed: number;
  error_summary: string | null;
  request_id: string | null;
}

// ── Vendor info ──────────────────────────────────────────────────────────────

const VENDOR_INFO: Record<string, { label: string; desc: string }> = {
  contpaqi: { label: "CONTPAQi", desc: "Exportación de pólizas en formato XML CONTPAQi" },
  aspel: { label: "Aspel COI", desc: "Exportación batch de pólizas para Aspel COI" },
  sap: { label: "SAP", desc: "Integración con SAP ERP vía API o archivo" },
  netsuite: { label: "NetSuite", desc: "Sincronización bidireccional con Oracle NetSuite" },
  oracle: { label: "Oracle JDE", desc: "Integración con Oracle JD Edwards" },
  quickbooks: { label: "QuickBooks", desc: "Sincronización con QuickBooks Online" },
  xero: { label: "Xero", desc: "Conexión vía API con Xero" },
  custom: { label: "Personalizado", desc: "Webhook genérico o CSV/JSON personalizado" },
};

const KIND_LABELS: Record<string, string> = {
  erp: "ERP",
  bank_statement: "Estado de cuenta",
  hris: "RRHH",
  generic_webhook: "Webhook",
};

const ENDPOINT_LABELS: Record<string, string> = {
  export_polizas: "Exportar pólizas",
  export_approved_expenses: "Exportar gastos aprobados",
  receive_payment_confirmations: "Recibir confirmaciones de pago",
  sync_users: "Sincronizar usuarios",
  sync_cost_centers: "Sincronizar centros de costo",
  sync_accounting_categories: "Sincronizar categorías contables",
};

// ── Component ────────────────────────────────────────────────────────────────

export default function IntegrationsSection() {
  const t = useTranslations("admin.integrations");
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [endpoints, setEndpoints] = useState<IntegrationEndpoint[]>([]);
  const [runs, setRuns] = useState<SyncRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [running, setRunning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadList = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiCall(`/integrations`);
      const list = Array.isArray(data) ? data : [];
      setIntegrations(list);
      if (list.length > 0 && activeId == null) setActiveId(list[0].id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [activeId]);

  const loadDetail = useCallback(async (id: number) => {
    setDetailLoading(true);
    try {
      const [eR, rR]: any[] = await Promise.all([
        apiCall(`/integrations/${id}/endpoints`),
        apiCall(`/integrations/${id}/runs?limit=20`),
      ]);
      setEndpoints(Array.isArray(eR) ? eR : eR?.endpoints ?? []);
      setRuns(Array.isArray(rR) ? rR : rR?.runs ?? []);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => { loadList(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (activeId != null) loadDetail(activeId); }, [activeId, loadDetail]);

  const triggerRun = async (endpoint: string) => {
    if (activeId == null) return;
    setRunning(endpoint);
    try {
      await apiPost(`/integrations/${activeId}/run`, { endpoint });
      await loadDetail(activeId);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(null);
    }
  };

  const activeIntegration = integrations.find((i) => i.id === activeId);
  const vendorInfo = activeIntegration ? VENDOR_INFO[activeIntegration.vendor] : null;

  return (
    <div className="space-y-4">
      <SectionPanel>
        <PremiumHeader
          icon={<ArrowRightLeft className="h-4 w-4" />}
          title={t("listLabel")}
          subtitle={t("intro")}
          section="integrations"
          action={
            <button
              type="button"
              onClick={loadList}
              disabled={loading}
              className="flex items-center gap-1.5 rounded-md border border-default bg-surface-2 px-3 py-1.5 text-[10px] font-medium text-secondary hover:border-strong disabled:opacity-50"
            >
              <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
              {t("refresh")}
            </button>
          }
        />

        <div className="px-4 pb-4 pt-3">
          {error && (
            <div className="mb-3 flex items-center gap-2 rounded-md border border-error/20 bg-error/5 px-3 py-2 text-[10px] text-error">
              <AlertTriangle className="h-3.5 w-3.5" />
              {error}
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-8"><Loader2 className="h-4 w-4 animate-spin text-muted" /></div>
          ) : integrations.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Plug className="h-8 w-8 text-muted/30 mb-2" />
              <p className="text-[11px] font-medium text-secondary">{t("emptyTitle")}</p>
              <p className="text-[9px] text-muted mt-1">{t("emptyBody")}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {integrations.map((ig) => {
                const vInfo = VENDOR_INFO[ig.vendor];
                const isActive = activeId === ig.id;
                return (
                  <button
                    key={ig.id}
                    type="button"
                    onClick={() => setActiveId(ig.id)}
                    className={`flex w-full items-center gap-3 rounded-md border px-3 py-2.5 text-left transition-all ${
                      isActive ? "border-accent/30 bg-accent/5" : "border-default hover:border-strong hover:bg-surface-1/50"
                    }`}
                  >
                    <div className={`flex h-8 w-8 items-center justify-center rounded-md ${ig.is_enabled ? "bg-success/10" : "bg-surface-2"}`}>
                      <ArrowRightLeft className={`h-4 w-4 ${ig.is_enabled ? "text-success" : "text-muted"}`} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-semibold text-primary truncate">{ig.name}</p>
                      <p className="text-[9px] text-muted">
                        {vInfo?.label ?? ig.vendor} · {KIND_LABELS[ig.kind] ?? ig.kind}
                      </p>
                    </div>
                    <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[8px] font-bold uppercase tracking-widest ${
                      ig.is_enabled ? "border-success/20 bg-success/10 text-success" : "border-default bg-surface-2 text-muted"
                    }`}>
                      {ig.is_enabled ? t("enabled") : t("disabled")}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </SectionPanel>

      {/* ── Integration detail ────────────────────────────────────────────────── */}
      {activeIntegration && (
        <SectionPanel>
          <PremiumHeader
            icon={<Plug className="h-4 w-4" />}
            title={activeIntegration.name}
            subtitle={vendorInfo?.desc ?? `${KIND_LABELS[activeIntegration.kind] ?? activeIntegration.kind} · ${activeIntegration.vendor}`}
            section="integrations"
          />

          <div className="px-4 pb-4 pt-3 space-y-4">
            {/* Vendor info */}
            <div className="rounded-md border border-default bg-surface-1 px-3 py-2">
              <div className="flex items-center gap-2 mb-2">
                <ArrowRightLeft className="h-3.5 w-3.5 text-accent" />
                <span className="text-[10px] font-semibold text-primary">{vendorInfo?.label ?? activeIntegration.vendor}</span>
                <span className="text-[9px] text-muted">· {KIND_LABELS[activeIntegration.kind] ?? activeIntegration.kind}</span>
              </div>
              <p className="text-[9px] text-muted">{vendorInfo?.desc ?? "Conexión con sistema externo"}</p>
            </div>

            {/* Endpoints */}
            <div>
              <SectionLabel>{t("endpointsLabel")}</SectionLabel>
              {detailLoading ? (
                <div className="flex items-center justify-center py-4"><Loader2 className="h-3 w-3 animate-spin text-muted" /></div>
              ) : endpoints.length === 0 ? (
                <p className="py-2 text-[10px] text-muted italic">{t("noEndpoints")}</p>
              ) : (
                <div className="space-y-1.5">
                  {endpoints.map((ep) => {
                    const epLabel = ENDPOINT_LABELS[ep.endpoint] ?? ep.endpoint;
                    return (
                      <div key={ep.id} className="flex items-center gap-3 rounded-md border border-default px-3 py-2">
                        <span className={`h-2 w-2 rounded-full ${ep.is_enabled ? "bg-success" : "bg-muted/40"}`} />
                        <div className="min-w-0 flex-1">
                          <p className="text-[10px] font-medium text-secondary">{epLabel}</p>
                          <p className="text-[9px] text-muted font-mono">{ep.endpoint}</p>
                        </div>
                        {ep.auth_strategy && (
                          <span className="text-[8px] text-muted rounded border border-default bg-surface-2 px-1.5 py-0.5">{ep.auth_strategy}</span>
                        )}
                        {ep.last_status && (
                          <span className={`text-[8px] font-bold uppercase rounded-md border px-1.5 py-0.5 ${
                            ep.last_status === "succeeded" ? "border-success/20 bg-success/10 text-success" :
                            ep.last_status === "failed" ? "border-error/20 bg-error/10 text-error" :
                            "border-default bg-surface-2 text-muted"
                          }`}>
                            {ep.last_status}
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => triggerRun(ep.endpoint)}
                          disabled={running === ep.endpoint || !activeIntegration.is_enabled}
                          className="flex items-center gap-1 rounded-md border border-accent/20 bg-accent/5 px-2 py-1 text-[9px] font-semibold text-accent hover:bg-accent/10 disabled:opacity-40"
                        >
                          {running === ep.endpoint ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <Play className="h-2.5 w-2.5" />}
                          {t("runNow")}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Run history */}
            <div>
              <SectionLabel>{t("runsLabel")}</SectionLabel>
              {detailLoading ? (
                <div className="flex items-center justify-center py-4"><Loader2 className="h-3 w-3 animate-spin text-muted" /></div>
              ) : runs.length === 0 ? (
                <p className="py-2 text-[10px] text-muted italic">{t("noRuns")}</p>
              ) : (
                <div className="space-y-1">
                  {runs.slice(0, 8).map((r) => (
                    <div key={r.id} className="flex items-center gap-3 rounded-md border border-default px-3 py-1.5">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <span className="text-[9px] font-mono text-secondary">{r.endpoint}</span>
                        <span className="text-[8px] text-muted">{r.direction === "outbound" ? "→" : "←"}</span>
                        <span className={`text-[8px] font-bold uppercase ${
                          r.status === "succeeded" ? "text-success" :
                          r.status === "failed" ? "text-error" :
                          r.status === "running" ? "text-accent" : "text-muted"
                        }`}>
                          {r.status}
                        </span>
                      </div>
                      <span className="text-[8px] text-muted tabular-nums">{new Date(r.started_at).toLocaleString("es-MX", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                      <span className="text-[8px] text-success/80">✓{r.items_ok}</span>
                      {r.items_failed > 0 && <span className="text-[8px] text-error/80">✗{r.items_failed}</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </SectionPanel>
      )}
    </div>
  );
}
