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
      return "bg-emerald-500/15 text-emerald-300";
    case "failed":
      return "bg-rose-500/15 text-rose-300";
    case "processing":
      return "bg-accent-muted text-accent";
    default:
      return "bg-surface-2 text-tertiary";
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
      <main className="min-h-screen bg-surface-0 text-primary">
        <div className="mx-auto max-w-6xl px-6 py-10">
          <div className="rounded border border-amber-500/20 bg-amber-500/[0.05] p-4 text-[12px] text-warning/80">
            {t("noCompany")}
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-surface-0 text-primary">
      <div className="mx-auto max-w-6xl px-6 py-6">
        {/* Header */}
        <div className="mb-5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-1.5">
            <Download className="h-3.5 w-3.5 text-slate-300/70" />
            <h1 className="text-[12px] font-semibold uppercase tracking-[0.08em] text-primary">
              {t("title")}
            </h1>
          </div>
          <button
            type="button"
            onClick={handleRefresh}
            disabled={storageLoading || exportsLoading}
            className="flex items-center gap-1 rounded border border-subtle bg-surface-2 px-2 py-1 text-[10px] text-tertiary transition hover:border-strong hover:text-secondary disabled:opacity-50"
          >
            {(storageLoading || exportsLoading) ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <RefreshCw className="h-3 w-3" />
            )}
            {t("refresh")}
          </button>
        </div>

        {error && (
          <div className="mb-3 flex items-start gap-2 rounded border border-error bg-rose-500/[0.06] px-3 py-2 text-[10.5px] text-rose-200/85">
            {error}
          </div>
        )}

        {/* Storage Usage Card */}
        <div className="mb-6 rounded border border-default bg-surface-1 p-4">
          <div className="mb-3 flex items-center gap-2">
            <HardDrive className="h-3.5 w-3.5 text-secondary" />
            <h2 className="text-[11px] font-semibold text-secondary">
              {t("storage.title")}
            </h2>
          </div>
          {storageLoading ? (
            <div className="flex items-center gap-2 py-4 text-[11px] text-muted">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> {t("loading")}
            </div>
          ) : storage ? (
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <div className="rounded border border-subtle bg-surface-1 p-3">
                <div className="mb-1 flex items-center gap-1.5 text-[9px] uppercase tracking-wide text-muted">
                  <FileStack className="h-3 w-3" /> {t("storage.files")}
                </div>
                <p className="text-lg font-semibold tabular-nums text-primary">
                  {formatGb(storage.files_gb)} <span className="text-[10px] font-normal text-tertiary">GB</span>
                </p>
              </div>
              <div className="rounded border border-subtle bg-surface-1 p-3">
                <div className="mb-1 flex items-center gap-1.5 text-[9px] uppercase tracking-wide text-muted">
                  <Database className="h-3 w-3" /> {t("storage.database")}
                </div>
                <p className="text-lg font-semibold tabular-nums text-primary">
                  {formatGb(storage.database_gb)} <span className="text-[10px] font-normal text-tertiary">GB</span>
                </p>
              </div>
              <div className="rounded border border-subtle bg-surface-1 p-3">
                <div className="mb-1 flex items-center gap-1.5 text-[9px] uppercase tracking-wide text-muted">
                  <Package className="h-3 w-3" /> {t("storage.total")}
                </div>
                <p className="text-lg font-semibold tabular-nums text-primary">
                  {formatGb(storage.total_gb)} <span className="text-[10px] font-normal text-tertiary">GB</span>
                </p>
              </div>
              <div className="rounded border border-subtle bg-surface-1 p-3">
                <div className="mb-1 flex items-center gap-1.5 text-[9px] uppercase tracking-wide text-muted">
                  {t("storage.included")}
                </div>
                <p className="text-lg font-semibold tabular-nums text-primary">
                  {formatGb(storage.included_gb)} <span className="text-[10px] font-normal text-tertiary">GB</span>
                </p>
              </div>
            </div>
          ) : (
            <div className="py-4 text-center text-[11px] text-muted">
              {t("storage.unavailable")}
            </div>
          )}
        </div>

        {/* Create Export */}
        <div className="mb-6 rounded border border-default bg-surface-1 p-4">
          <div className="mb-3 flex items-center gap-2">
            <Download className="h-3.5 w-3.5 text-secondary" />
            <h2 className="text-[11px] font-semibold text-secondary">
              {t("create.title")}
            </h2>
          </div>
          <p className="mb-3 text-[10.5px] text-tertiary">
            {t("create.description")}
          </p>
          <button
            type="button"
            className="rounded border bg-accent-muted bg-blue-500/[0.18] px-3 py-1.5 text-[11px] font-medium text-accent transition hover:bg-accent-hover/[0.25] disabled:opacity-50"
            disabled
          >
            {t("create.button")}
          </button>
          <p className="mt-2 text-[9px] italic text-muted">
            {t("create.comingSoon")}
          </p>
        </div>

        {/* Export History */}
        <div className="rounded border border-default bg-surface-1 p-4">
          <div className="mb-3 flex items-center gap-2">
            <RefreshCw className="h-3.5 w-3.5 text-secondary" />
            <h2 className="text-[11px] font-semibold text-secondary">
              {t("history.title")}
            </h2>
          </div>
          {exportsLoading ? (
            <div className="flex items-center gap-2 py-4 text-[11px] text-muted">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> {t("loading")}
            </div>
          ) : exports.length === 0 ? (
            <div className="py-6 text-center text-[11px] text-muted">
              {t("history.empty")}
            </div>
          ) : (
            <div className="overflow-hidden rounded border border-subtle">
              <table className="w-full text-[10.5px]">
                <thead>
                  <tr className="border-b border-default bg-surface-1 text-left text-[9.5px] uppercase tracking-wide text-muted">
                    <th className="px-2 py-1.5 font-medium">{t("history.date")}</th>
                    <th className="px-2 py-1.5 font-medium">{t("history.type")}</th>
                    <th className="px-2 py-1.5 font-medium">{t("history.status")}</th>
                    <th className="px-2 py-1.5 font-medium">{t("history.size")}</th>
                    <th className="px-2 py-1.5 font-medium text-right">{t("history.download")}</th>
                  </tr>
                </thead>
                <tbody>
                  {exports.map((job) => (
                    <tr
                      key={job.id}
                      className="border-b border-subtle last:border-b-0 hover:bg-surface-1"
                    >
                      <td className="px-2 py-1.5 text-tertiary tabular-nums">
                        {job.created_at ? new Date(job.created_at).toLocaleString() : "—"}
                      </td>
                      <td className="px-2 py-1.5 font-mono text-secondary">
                        {job.export_type}
                      </td>
                      <td className="px-2 py-1.5">
                        <span className={`rounded px-1.5 py-0.5 font-mono text-[9.5px] ${statusTone(job.status)}`}>
                          {job.status}
                        </span>
                      </td>
                      <td className="px-2 py-1.5 text-tertiary">
                        {formatBytes(job.file_size_bytes)}
                      </td>
                      <td className="px-2 py-1.5 text-right">
                        {job.status === "completed" && job.file_path ? (
                          <button
                            type="button"
                            onClick={() => handleDownload(job.id)}
                            className="rounded border border-subtle bg-surface-2 px-2 py-0.5 text-[10px] text-secondary transition hover:border-strong hover:text-primary"
                          >
                            {t("history.download")}
                          </button>
                        ) : (
                          <span className="text-[10px] text-muted">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
