"use client";

/**
 * Admin export section.
 *
 * Wraps GET /api/admin/export/storage and GET /api/admin/export endpoints
 * to display storage usage and export history. Provides UI for creating
 * new exports (full, incremental, or date range).
 */

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Loader2,
  RefreshCw,
  Download,
  Database,
  FileStack,
  HardDrive,
  Package,
} from "lucide-react";
import {
  PremiumHeader,
  SectionPanel,
  Row,
  SectionLabel,
} from "@/components/admin/shared/AdminPatterns";
import { getCurrentCompanyId, getAuthHeaders } from "@/lib/session";

const API = process.env.NEXT_PUBLIC_API_BASE_URL;

interface StorageUsage {
  files_gb: number;
  database_gb: number;
  total_gb: number;
  included_gb: number;
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

function formatGb(value: number): string {
  return value.toFixed(2);
}

function formatBytes(bytes: number | null): string {
  if (bytes === null) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function statusTone(status: string): string {
  switch (status) {
    case "completed":
      return "bg-emerald-500/15 text-emerald-400 border-emerald-500/20";
    case "failed":
      return "bg-rose-500/15 text-rose-400 border-rose-500/20";
    case "processing":
      return "bg-accent/10 text-accent border-accent/20";
    default:
      return "bg-surface-2 text-tertiary border-white/5";
  }
}

export default function ExportSection() {
  const t = useTranslations("admin.export");
  const [companyId, setCompanyId] = useState<number | null>(null);

  const [storage, setStorage] = useState<StorageUsage | null>(null);
  const [exports, setExports] = useState<ExportJob[]>([]);
  const [storageLoading, setStorageLoading] = useState(true);
  const [exportsLoading, setExportsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const cid = getCurrentCompanyId();
    if (cid) setCompanyId(Number(cid));
  }, []);

  const loadStorage = useCallback(async (_cid: number) => {
    setStorageLoading(true);
    try {
      const res = await fetch(`${API}/admin/export/storage`, {
        headers: { ...getAuthHeaders() },
      });
      if (!res.ok) throw new Error(`Failed to load storage: ${res.status}`);
      setStorage(await res.json());
    } catch (e) {
      console.error("Storage load error:", e);
    } finally {
      setStorageLoading(false);
    }
  }, []);

  const loadExports = useCallback(async (_cid: number) => {
    setExportsLoading(true);
    try {
      const res = await fetch(`${API}/admin/export`, {
        headers: { ...getAuthHeaders() },
      });
      if (!res.ok) throw new Error(`Failed to load exports: ${res.status}`);
      const data = await res.json();
      setExports(Array.isArray(data?.exports) ? data.exports : []);
    } catch (e) {
      console.error("Exports load error:", e);
    } finally {
      setExportsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!companyId) return;
    void loadStorage(companyId);
    void loadExports(companyId);
  }, [companyId, loadStorage, loadExports]);

  const handleDownload = async (jobId: number) => {
    if (!companyId) return;
    try {
      const res = await fetch(`${API}/admin/export/${jobId}/download`, {
        headers: { ...getAuthHeaders() },
      });
      if (!res.ok) throw new Error(`Download failed: ${res.status}`);

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `export-${jobId}.zip`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      a.remove();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Download failed");
    }
  };

  const handleRefresh = () => {
    if (!companyId) return;
    void loadStorage(companyId);
    void loadExports(companyId);
  };

  if (!companyId) {
    return (
      <div className="rounded-lg border border-amber-500/20 bg-amber-500/[0.05] p-4 text-[12px] text-warning/80">
        {t("noCompany")}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PremiumHeader
        section="export"
        icon={<Download className="h-4 w-4" />}
        title={t("title")}
        subtitle="Data Export & Backup"
        action={
          <button
            type="button"
            onClick={handleRefresh}
            disabled={storageLoading || exportsLoading}
            className="flex items-center gap-1.5 rounded-lg border border-default bg-surface-1 px-3 py-1.5 text-[10px] font-semibold text-tertiary transition hover:border-strong hover:text-secondary disabled:opacity-50"
          >
            {(storageLoading || exportsLoading) ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            {t("refresh")}
          </button>
        }
      />

      {error && (
        <div className="rounded-lg border border-error bg-rose-500/[0.06] px-3 py-2 text-[10.5px] text-rose-200/85">
          {error}
        </div>
      )}

      {/* Storage Usage */}
      <div className="space-y-3">
        <SectionLabel>{t("storage.title")}</SectionLabel>
        <SectionPanel>
          {storageLoading ? (
            <div className="p-10 text-center text-muted animate-pulse">
              <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
              {t("loading")}
            </div>
          ) : storage ? (
            <div className="grid grid-cols-2 lg:grid-cols-4 divide-x divide-white/5">
              <div className="p-4 space-y-1.5">
                <div className="flex items-center gap-2 text-[9px] font-bold uppercase tracking-widest text-muted">
                  <FileStack className="h-3 w-3" /> {t("storage.files")}
                </div>
                <div className="text-xl font-bold tabular-nums text-primary tracking-tight">
                  {formatGb(storage.files_gb)} <span className="text-[10px] font-medium text-muted uppercase">GB</span>
                </div>
              </div>
              <div className="p-4 space-y-1.5">
                <div className="flex items-center gap-2 text-[9px] font-bold uppercase tracking-widest text-muted">
                   <Database className="h-3 w-3" /> {t("storage.database")}
                </div>
                <div className="text-xl font-bold tabular-nums text-primary tracking-tight">
                   {formatGb(storage.database_gb)} <span className="text-[10px] font-medium text-muted uppercase">GB</span>
                </div>
              </div>
              <div className="p-4 space-y-1.5">
                <div className="flex items-center gap-2 text-[9px] font-bold uppercase tracking-widest text-muted">
                   <Package className="h-3 w-3" /> {t("storage.total")}
                </div>
                <div className="text-xl font-bold tabular-nums text-accent tracking-tight">
                   {formatGb(storage.total_gb)} <span className="text-[10px] font-medium text-accent/50 uppercase">GB</span>
                </div>
              </div>
              <div className="p-4 space-y-1.5">
                <div className="flex items-center gap-2 text-[9px] font-bold uppercase tracking-widest text-muted">
                   {t("storage.included")}
                </div>
                <div className="text-xl font-bold tabular-nums text-secondary tracking-tight">
                   {formatGb(storage.included_gb)} <span className="text-[10px] font-medium text-muted uppercase">GB</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-8 text-center text-[11px] text-muted italic">
              {t("storage.unavailable")}
            </div>
          )}
        </SectionPanel>
      </div>

      {/* Create Export */}
      <div className="space-y-3">
        <SectionLabel>{t("create.title")}</SectionLabel>
        <SectionPanel>
           <div className="p-4">
              <p className="text-[11.5px] text-secondary leading-relaxed mb-4">
                {t("create.description")}
              </p>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  className="rounded-lg border border-accent/20 bg-accent/5 px-4 py-1.5 text-[11px] font-bold text-accent transition-all hover:bg-accent/10 disabled:opacity-40"
                  disabled
                >
                  {t("create.button")}
                </button>
                <span className="text-[10px] font-medium italic text-muted">
                  {t("create.comingSoon")}
                </span>
              </div>
           </div>
        </SectionPanel>
      </div>

      {/* Export History */}
      <div className="space-y-3">
        <SectionLabel>{t("history.title")}</SectionLabel>
        <SectionPanel>
          {exportsLoading ? (
            <div className="p-10 text-center text-muted"><Loader2 className="h-4 w-4 animate-spin mx-auto mb-2" />{t("loading")}</div>
          ) : exports.length === 0 ? (
            <div className="p-16 text-center text-[10.5px] text-muted italic">
              {t("history.empty")}
            </div>
          ) : (
            <div className="overflow-hidden">
              <table className="w-full text-left text-[10.5px]">
                <thead>
                  <tr className="border-b border-white/5 bg-surface-2/30 text-[9px] uppercase tracking-widest text-muted">
                    <th className="p-3 font-semibold">{t("history.date")}</th>
                    <th className="p-3 font-semibold">{t("history.type")}</th>
                    <th className="p-3 font-semibold">{t("history.status")}</th>
                    <th className="p-3 font-semibold">{t("history.size")}</th>
                    <th className="p-3 text-right" />
                  </tr>
                </thead>
                <tbody>
                  {exports.map((job) => (
                    <tr
                      key={job.id}
                      className="border-b border-white/5 last:border-0 hover:bg-surface-2/40 transition-colors"
                    >
                      <td className="p-3 text-secondary tabular-nums">
                        {job.created_at ? new Date(job.created_at).toLocaleString() : "—"}
                      </td>
                      <td className="p-3 font-mono text-[10px] text-tertiary uppercase">
                        {job.export_type}
                      </td>
                      <td className="p-3">
                        <span className={`inline-block rounded-md border px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-widest ${statusTone(job.status)}`}>
                          {job.status}
                        </span>
                      </td>
                      <td className="p-3 text-tertiary font-medium">
                        {formatBytes(job.file_size_bytes)}
                      </td>
                      <td className="p-3 text-right">
                        {job.status === "completed" && job.file_path ? (
                          <button
                            type="button"
                            onClick={() => handleDownload(job.id)}
                            className="rounded-lg border border-default bg-surface-1 px-3 py-1 text-[10px] font-bold text-secondary transition-all hover:border-strong hover:text-primary"
                          >
                            {t("history.download")}
                          </button>
                        ) : (
                          <span className="text-[10px] text-muted font-medium">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionPanel>
      </div>
    </div>
  );
}
