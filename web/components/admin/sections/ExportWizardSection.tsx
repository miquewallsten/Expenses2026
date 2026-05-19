"use client";

/**
 * Export Wizard Section — configurable data export with format, scope, and periodicity.
 *
 * Allows accountants/admins to set up recurring or one-time exports of approved
 * expense data. Each export configuration can select format (CONTPAQi XML, COI,
 * SAT Anexo 24, CSV, JSON), scope (single poliza, monthly, date range), and
 * schedule (on-demand, daily, weekly, monthly).
 */

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Download, Loader2, FileText, Calendar, Settings, Clock,
  CheckCircle2, AlertTriangle, Plus, RefreshCw, ChevronDown,
} from "lucide-react";
import {
  PremiumHeader, SectionPanel, Row, Toggle, SectionLabel, inputClasses,
} from "@/components/admin/shared/AdminPatterns";
import { getCurrentCompanyId, getAuthHeaders } from "@/lib/session";
import { apiCall } from "@/lib/api/client";

// ── Types ──────────────────────────────────────────────────────────────────

interface ExportConfig {
  id: number;
  name: string;
  format: string;
  scope: string;
  schedule: string;
  is_active: boolean;
  last_run_at: string | null;
  last_status: string | null;
  created_at: string;
}

interface ExportJob {
  id: number;
  export_type: string;
  status: string;
  created_at: string;
  completed_at: string | null;
  file_size_bytes: number | null;
  file_path: string | null;
  error_message: string | null;
}

const FORMAT_OPTIONS = [
  { value: "contpaqi_xml", label: "CONTPAQi XML", desc: "Formato XML para importar pólizas en CONTPAQi" },
  { value: "coi_aspel", label: "COI (Aspel)", desc: "Formato de texto batch para Aspel COI" },
  { value: "sat_anexo24", label: "SAT Anexo 24", desc: "Pólizas electrónicas SAT para contabilidad electrónica" },
  { value: "csv", label: "CSV", desc: "Comma-separated values para importar a cualquier sistema" },
  { value: "json", label: "JSON", desc: "Formato JSON estructurado para APIs personalizadas" },
];

const SCOPE_OPTIONS = [
  { value: "single_poliza", label: "Póliza individual", desc: "Una póliza por reporte de gastos aprobado" },
  { value: "monthly", label: "Mensual", desc: "Todas las pólizas del período mensual" },
  { value: "date_range", label: "Rango de fechas", desc: "Pólizas en un rango personalizado" },
  { value: "all_approved", label: "Todo lo aprobado", desc: "Exportar todos los gastos aprobados pendientes" },
];

const SCHEDULE_OPTIONS = [
  { value: "on_demand", label: "Bajo demanda", desc: "Ejecutar manualmente cuando se necesite" },
  { value: "daily", label: "Diario", desc: "Ejecutar todos los días" },
  { value: "weekly", label: "Semanal", desc: "Ejecutar cada semana" },
  { value: "monthly", label: "Mensual", desc: "Ejecutar al cierre de cada mes" },
  { value: "on_approval", label: "Al aprobar", desc: "Exportar automáticamente cuando se apruebe un reporte" },
];

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function statusBadge(status: string | null) {
  if (!status) return <span className="text-[9px] text-muted">—</span>;
  const map: Record<string, string> = {
    succeeded: "border-success/20 bg-success/10 text-success",
    completed: "border-success/20 bg-success/10 text-success",
    failed: "border-error/20 bg-error/10 text-error",
    running: "border-accent/20 bg-accent/10 text-accent",
    pending: "border-warning/20 bg-warning/10 text-warning",
    partial: "border-warning/20 bg-warning/10 text-warning",
  };
  const tone = map[status] || "border-default bg-surface-2 text-muted";
  return (
    <span className={`inline-block rounded-md border px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-widest ${tone}`}>
      {status}
    </span>
  );
}

// ── Component ──────────────────────────────────────────────────────────────

export default function ExportWizardSection() {
  const t = useTranslations("admin.integrations");
  const [companyId, setCompanyId] = useState<number | null>(null);
  const [configs, setConfigs] = useState<ExportConfig[]>([]);
  const [jobs, setJobs] = useState<ExportJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);

  // New config form
  const [newName, setNewName] = useState("");
  const [newFormat, setNewFormat] = useState("contpaqi_xml");
  const [newScope, setNewScope] = useState("single_poliza");
  const [newSchedule, setNewSchedule] = useState("on_demand");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    const cid = getCurrentCompanyId();
    if (cid) setCompanyId(Number(cid));
  }, []);

  const load = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const [configsRes, jobsRes]: any[] = await Promise.all([
        apiCall(`/integrations/export-configs?company_id=${companyId}`).catch(() => []),
        apiCall(`/admin/export`).catch(() => ({ exports: [] })),
      ]);
      setConfigs(Array.isArray(configsRes) ? configsRes : configsRes?.configs ?? []);
      setJobs(Array.isArray(jobsRes) ? jobsRes : jobsRes?.exports ?? []);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async () => {
    if (!companyId || !newName.trim()) return;
    setCreating(true);
    try {
      await apiCall(`/integrations/export-configs`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({
          company_id: companyId,
          name: newName.trim(),
          format: newFormat,
          scope: newScope,
          schedule: newSchedule,
          is_active: true,
        }),
      });
      setShowNew(false);
      setNewName("");
      setNewFormat("contpaqi_xml");
      setNewScope("single_poliza");
      setNewSchedule("on_demand");
      await load();
    } catch {
      // silent
    } finally {
      setCreating(false);
    }
  };

  const handleRunNow = async (configId: number) => {
    try {
      await apiCall(`/integrations/export-configs/${configId}/run`, {
        method: "POST",
        headers: getAuthHeaders(),
      });
      await load();
    } catch {
      // silent
    }
  };

  const handleToggle = async (config: ExportConfig) => {
    try {
      await apiCall(`/integrations/export-configs/${config.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ is_active: !config.is_active }),
      });
      await load();
    } catch {
      // silent
    }
  };

  const formatLabel = (v: string) => FORMAT_OPTIONS.find(f => f.value === v)?.label ?? v;
  const scopeLabel = (v: string) => SCOPE_OPTIONS.find(s => s.value === v)?.label ?? v;
  const scheduleLabel = (v: string) => SCHEDULE_OPTIONS.find(s => s.value === v)?.label ?? v;

  return (
    <div className="space-y-4">
      {/* ── Export Configurations ──────────────────────────────────────────── */}
      <SectionPanel>
        <PremiumHeader
          icon={<Download className="h-4 w-4" />}
          title={t("exportConfigsTitle")}
          subtitle={t("exportConfigsSubtitle")}
          section="integrations"
          action={
            <button
              type="button"
              onClick={() => setShowNew(!showNew)}
              className="flex items-center gap-1.5 rounded-md border border-accent/20 bg-accent/5 px-3 py-1.5 text-[10px] font-semibold text-accent transition-all hover:bg-accent/10 hover:border-accent/30"
            >
              <Plus className="h-3 w-3" />
              {t("newExportConfig")}
            </button>
          }
        />

        <div className="px-4 pb-4 pt-3 space-y-3">
          {/* New config form */}
          {showNew && (
            <div className="rounded-md border border-accent/20 bg-accent/5 px-4 py-3 space-y-3">
              <p className="text-[10px] font-semibold text-accent">{t("newExportConfigTitle")}</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <SectionLabel>{t("configNameLabel")}</SectionLabel>
                  <input
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="Pólizas CONTPAQi mensual"
                    className={inputClasses.base}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <SectionLabel>{t("configFormatLabel")}</SectionLabel>
                  <select value={newFormat} onChange={(e) => setNewFormat(e.target.value)} className={inputClasses.select}>
                    {FORMAT_OPTIONS.map((f) => (
                      <option key={f.value} value={f.value}>{f.label}</option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <SectionLabel>{t("configScopeLabel")}</SectionLabel>
                  <select value={newScope} onChange={(e) => setNewScope(e.target.value)} className={inputClasses.select}>
                    {SCOPE_OPTIONS.map((s) => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <SectionLabel>{t("configScheduleLabel")}</SectionLabel>
                  <select value={newSchedule} onChange={(e) => setNewSchedule(e.target.value)} className={inputClasses.select}>
                    {SCHEDULE_OPTIONS.map((s) => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleCreate}
                  disabled={creating || !newName.trim()}
                  className="flex items-center gap-1.5 rounded-md border border-accent/30 bg-accent/10 px-3 py-1.5 text-[10px] font-semibold text-accent hover:bg-accent/20 disabled:opacity-40"
                >
                  {creating && <Loader2 className="h-3 w-3 animate-spin" />}
                  {t("createConfig")}
                </button>
                <button
                  type="button"
                  onClick={() => setShowNew(false)}
                  className="rounded-md border border-default bg-surface-2 px-3 py-1.5 text-[10px] font-medium text-secondary hover:border-strong"
                >
                  {t("cancelConfig")}
                </button>
              </div>
            </div>
          )}

          {/* Configs list */}
          {loading ? (
            <div className="flex items-center justify-center py-8"><Loader2 className="h-4 w-4 animate-spin text-muted" /></div>
          ) : configs.length === 0 && !showNew ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Download className="h-8 w-8 text-muted/30 mb-2" />
              <p className="text-[11px] font-medium text-secondary">{t("noExportConfigs")}</p>
              <p className="text-[9px] text-muted mt-1">{t("noExportConfigsHint")}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {configs.map((cfg) => (
                <div key={cfg.id} className="flex items-center gap-3 rounded-md border border-default px-3 py-2 hover:bg-surface-1/50 transition-colors">
                  <div className="flex h-8 w-8 items-center justify-center rounded-md bg-surface-2">
                    <FileText className="h-4 w-4 text-muted" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-semibold text-primary truncate">{cfg.name}</p>
                    <p className="text-[9px] text-muted">{formatLabel(cfg.format)} · {scopeLabel(cfg.scope)} · {scheduleLabel(cfg.schedule)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {statusBadge(cfg.last_status)}
                    <Toggle value={cfg.is_active} onChange={() => handleToggle(cfg)} />
                    <button
                      type="button"
                      onClick={() => handleRunNow(cfg.id)}
                      className="rounded-md border border-default bg-surface-2 px-2 py-1 text-[9px] font-medium text-secondary hover:border-strong hover:text-primary transition-colors"
                    >
                      {t("runNow")}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </SectionPanel>

      {/* ── Format Reference ────────────────────────────────────────────── */}
      <SectionPanel>
        <PremiumHeader
          icon={<FileText className="h-4 w-4" />}
          title={t("exportFormatsTitle")}
          subtitle={t("exportFormatsSubtitle")}
          section="integrations"
        />
        <div className="px-4 pb-4 pt-3">
          <div className="space-y-2">
            {FORMAT_OPTIONS.map((f) => (
              <div key={f.value} className="flex items-start gap-3 rounded-md border border-default px-3 py-2">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-surface-2">
                  <FileText className="h-3.5 w-3.5 text-muted" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-semibold text-primary">{f.label}</p>
                  <p className="text-[9px] text-muted">{f.desc}</p>
                </div>
                <span className="shrink-0 rounded-md border border-default bg-surface-2 px-2 py-0.5 text-[8px] font-mono text-muted">{f.value}</span>
              </div>
            ))}
          </div>
        </div>
      </SectionPanel>

      {/* ── Export History ────────────────────────────────────────────────── */}
      <SectionPanel>
        <PremiumHeader
          icon={<Clock className="h-4 w-4" />}
          title={t("exportHistoryTitle")}
          subtitle={t("exportHistorySubtitle")}
          section="integrations"
          action={
            <button
              type="button"
              onClick={load}
              disabled={loading}
              className="flex items-center gap-1.5 rounded-md border border-default bg-surface-2 px-3 py-1.5 text-[10px] font-medium text-secondary hover:border-strong disabled:opacity-50"
            >
              <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
              {t("refresh")}
            </button>
          }
        />
        <div className="px-4 pb-4 pt-3">
          {loading ? (
            <div className="flex items-center justify-center py-6"><Loader2 className="h-4 w-4 animate-spin text-muted" /></div>
          ) : jobs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Clock className="h-8 w-8 text-muted/30 mb-2" />
              <p className="text-[11px] text-muted">{t("noExportHistory")}</p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {jobs.slice(0, 10).map((job) => (
                <div key={job.id} className="flex items-center gap-3 rounded-md border border-default px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-[10px] font-medium text-primary">{job.export_type}</p>
                      {statusBadge(job.status)}
                    </div>
                    <p className="text-[9px] text-muted">{fmtDate(job.created_at)}</p>
                    {job.error_message && <p className="text-[9px] text-error line-clamp-1 mt-0.5">{job.error_message}</p>}
                  </div>
                  {job.status === "completed" && (
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          const res = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}/admin/export/${job.id}/download`, {
                            headers: { ...getAuthHeaders() },
                          });
                          if (!res.ok) return;
                          const blob = await res.blob();
                          const url = window.URL.createObjectURL(blob);
                          const a = document.createElement("a");
                          a.href = url;
                          a.download = `export-${job.id}.zip`;
                          document.body.appendChild(a);
                          a.click();
                          window.URL.revokeObjectURL(url);
                          a.remove();
                        } catch { /* silent */ }
                      }}
                      className="flex items-center gap-1 rounded-md border border-accent/20 bg-accent/5 px-2 py-1 text-[9px] font-semibold text-accent hover:bg-accent/10"
                    >
                      <Download className="h-3 w-3" />
                      {t("download")}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </SectionPanel>
    </div>
  );
}
