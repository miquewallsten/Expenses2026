"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Archive,
  ChevronRight,
  Download,
  FileText,
  FolderOpen,
  Loader2,
  Search,
  Settings2,
  X,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useLocaleFormat } from "@/lib/locale-format";
import { apiCall, apiPatch } from "@/lib/api/client";
import { useMyWorkContext } from "@/context/MyWorkContext";

const API = process.env.NEXT_PUBLIC_API_BASE_URL;

// ── Types ──────────────────────────────────────────────────────────────────

interface ArchiveFile {
  id: number;
  company_id: number;
  expense_id: number | null;
  file_name: string;
  file_type: string;
  size_bytes: number | null;
  source_type: string;
  storage_backend: string;
  storage_key: string;
  content_text: string | null;
  document_type: string | null;
  validation_summary: string | null;
  created_at: string;
}

interface ArchiveConfig {
  id: number;
  company_id: number;
  file_pattern: string;
  folder_pattern: string;
  created_at: string;
  updated_at: string;
}

type ColumnType = "year" | "month" | "type" | "files";

interface ColumnEntry {
  label: string;
  value: string;
  count?: number;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function formatBytes(bytes: number | null): string {
  if (bytes === null || bytes === 0) return " - ";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let size = bytes;
  while (size >= 1024 && i < units.length - 1) { size /= 1024; i++; }
  return `${size.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

const DOC_TYPE_ICONS: Record<string, string> = {
  cfdi_xml: "XML",
  cfdi_pdf: "PDF",
  pdf_unclassified: "PDF",
  ticket: "TCK",
  image: "IMG",
  other: "DOC",
};

const DOC_TYPE_COLORS: Record<string, string> = {
  cfdi_xml: "bg-emerald-500/15 text-emerald-400 border border-emerald-500/20",
  cfdi_pdf: "bg-red-500/15 text-red-400 border border-red-500/20",
  pdf_unclassified: "bg-red-500/15 text-red-400 border border-red-500/20",
  ticket: "bg-amber-500/15 text-amber-400 border border-amber-500/20",
  image: "bg-blue-500/15 text-blue-400 border border-blue-500/20",
  other: "bg-surface-2 text-secondary border border-default",
};

// ── Component ──────────────────────────────────────────────────────────────

export default function ArchiveModule() {
  const { user } = useMyWorkContext() as any;
  const companyId = user?.companyId;
  const t = useTranslations("archive");
  const { formatDate } = useLocaleFormat();

  // ── Data state ───────────────────────────────────────────────────────────
  const [allFiles, setAllFiles] = useState<ArchiveFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedFile, setSelectedFile] = useState<ArchiveFile | null>(null);
  const [showConfig, setShowConfig] = useState(false);

  // ── Config state ─────────────────────────────────────────────────────────
  const [config, setConfig] = useState<ArchiveConfig | null>(null);
  const [folderPattern, setFolderPattern] = useState("");
  const [filePattern, setFilePattern] = useState("");
  const [configSaving, setConfigSaving] = useState(false);
  const [configSaved, setConfigSaved] = useState(false);

  // ── Column navigation state ──────────────────────────────────────────────
  // Each column has a type and a selected value. Clicking a row in a column
  // pushes a new column to the right.
  const [columns, setColumns] = useState<{ type: ColumnType; value: string }[]>([
    { type: "year", value: "" },
  ]);

  // ── Load files ───────────────────────────────────────────────────────────
  const loadFiles = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const data = await apiCall<{ items: ArchiveFile[]; total: number }>(
        `${API}/archive/${companyId}/files?limit=500&offset=0`
      );
      setAllFiles(data.items ?? []);
    } catch {
      setAllFiles([]);
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  // ── Load config ──────────────────────────────────────────────────────────
  const loadConfig = useCallback(async () => {
    if (!companyId) return;
    try {
      const cfg = await apiCall<ArchiveConfig>(
        `${API}/admin/archive-config/${companyId}`
      );
      setConfig(cfg);
      setFolderPattern(cfg.folder_pattern);
      setFilePattern(cfg.file_pattern);
    } catch {
      // Use defaults
      setFolderPattern("{year}/{month}");
      setFilePattern("{company}_{date}_{expense_id}");
    }
  }, [companyId]);

  useEffect(() => {
    loadFiles();
    loadConfig();
  }, [loadFiles, loadConfig]);

  // ── Save config ──────────────────────────────────────────────────────────
  const saveConfig = async () => {
    if (!companyId) return;
    setConfigSaving(true);
    setConfigSaved(false);
    try {
      const updated = await apiPatch<ArchiveConfig>(
        `${API}/admin/archive-config/${companyId}`,
        { folder_pattern: folderPattern, file_pattern: filePattern }
      );
      setConfig(updated);
      setConfigSaved(true);
      setTimeout(() => setConfigSaved(false), 2000);
    } catch {
      // silently fail
    } finally {
      setConfigSaving(false);
    }
  };

  // ── Build column contents from file data ─────────────────────────────────
  const getColumnEntries = useCallback(
    (columnType: ColumnType, parentValue: string, parentType: ColumnType | null): ColumnEntry[] => {
      // Filter files based on all ancestor selections
      let filtered = allFiles;

      // Apply search filter
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        filtered = filtered.filter(
          (f) =>
            f.file_name.toLowerCase().includes(q) ||
            (f.document_type || "").toLowerCase().includes(q) ||
            (f.validation_summary || "").toLowerCase().includes(q)
        );
      }

      // Apply ancestor filters
      for (const col of columns) {
        if (col.type === columnType) break; // stop at current column
        if (!col.value) continue;
        if (col.type === "year") {
          filtered = filtered.filter((f) => new Date(f.created_at).getFullYear().toString() === col.value);
        } else if (col.type === "month") {
          filtered = filtered.filter((f) => (new Date(f.created_at).getMonth() + 1).toString().padStart(2, "0") === col.value);
        } else if (col.type === "type") {
          filtered = filtered.filter((f) => (f.document_type || "other") === col.value);
        }
      }

      // Also apply parent filter if not the first column
      if (parentType && parentValue) {
        if (parentType === "year") {
          filtered = filtered.filter((f) => new Date(f.created_at).getFullYear().toString() === parentValue);
        } else if (parentType === "month") {
          filtered = filtered.filter((f) => (new Date(f.created_at).getMonth() + 1).toString().padStart(2, "0") === parentValue);
        } else if (parentType === "type") {
          filtered = filtered.filter((f) => (f.document_type || "other") === parentValue);
        }
      }

      // Build entries for this column type
      if (columnType === "year") {
        const years = new Map<string, number>();
        for (const f of filtered) {
          const y = new Date(f.created_at).getFullYear().toString();
          years.set(y, (years.get(y) || 0) + 1);
        }
        return Array.from(years.entries())
          .sort((a, b) => b[0].localeCompare(a[0]))
          .map(([label, count]) => ({ label, value: label, count }));
      }

      if (columnType === "month") {
        const months = new Map<string, number>();
        for (const f of filtered) {
          const m = (new Date(f.created_at).getMonth() + 1).toString().padStart(2, "0");
          months.set(m, (months.get(m) || 0) + 1);
        }
        return Array.from(months.entries())
          .sort((a, b) => a[0].localeCompare(b[0]))
          .map(([m, count]) => ({
            label: t(`months.${m}`),
            value: m,
            count,
          }));
      }

      if (columnType === "type") {
        const types = new Map<string, number>();
        for (const f of filtered) {
          const dt = f.document_type || "other";
          types.set(dt, (types.get(dt) || 0) + 1);
        }
        return Array.from(types.entries())
          .sort((a, b) => b[1] - a[1])
          .map(([dt, count]) => ({
            label: t(`detail.docTypes.${dt}`),
            value: dt,
            count,
          }));
      }

      // columnType === "files" — show actual files
      return filtered.map((f) => ({
        label: f.file_name,
        value: String(f.id),
        count: undefined,
        file: f,
      }));
    },
    [allFiles, searchQuery, columns, t]
  );

  // ── Handle column click ──────────────────────────────────────────────────
  const handleColumnClick = (columnIndex: number, entry: ColumnEntry & { file?: ArchiveFile }) => {
    if (entry.file) {
      // Clicked a file — select it
      setSelectedFile(entry.file);
      return;
    }

    // Clicked a folder — drill down
    setSelectedFile(null);
    const currentCol = columns[columnIndex];
    let nextType: ColumnType;

    if (currentCol.type === "year") nextType = "month";
    else if (currentCol.type === "month") nextType = "type";
    else nextType = "files";

    // Truncate columns after this one and add new
    const newColumns = columns.slice(0, columnIndex);
    newColumns[columnIndex] = { ...currentCol, value: entry.value };
    newColumns.push({ type: nextType, value: "" });
    setColumns(newColumns);
  };

  // ── Back navigation ──────────────────────────────────────────────────────
  const navigateBack = (toIndex: number) => {
    setColumns(columns.slice(0, toIndex + 1));
    setSelectedFile(null);
  };

  // ── Breadcrumb ───────────────────────────────────────────────────────────
  const breadcrumb = useMemo(() => {
    const crumbs: { label: string; index: number }[] = [
      { label: t("title"), index: -1 },
    ];
    for (let i = 0; i < columns.length; i++) {
      const col = columns[i];
      if (!col.value) break;
      if (col.type === "year") crumbs.push({ label: col.value, index: i });
      else if (col.type === "month") crumbs.push({ label: t(`months.${col.value}`), index: i });
      else if (col.type === "type") crumbs.push({ label: t(`detail.docTypes.${col.value}`), index: i });
    }
    return crumbs;
  }, [columns, t]);

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="flex h-full flex-col">
      {/* ── Header ──────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between border-b border-default px-4 py-2.5">
        <div className="flex items-center gap-2">
          <Archive className="h-4 w-4 text-accent" />
          <h2 className="text-sm font-semibold text-primary">{t("title")}</h2>
          <span className="text-[11px] text-tertiary">
            {allFiles.length} {allFiles.length === 1 ? t("subtitle").split("|")[0]?.replace("{count}", "1")?.trim() : t("subtitle").split("|")[1]?.replace("{count}", String(allFiles.length))?.trim() || `${allFiles.length}`}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setShowConfig(!showConfig)}
            className="flex h-7 items-center gap-1.5 rounded-md border border-subtle px-2 text-[10px] font-medium text-secondary transition-colors hover:bg-surface-2 hover:text-primary"
          >
            <Settings2 className="h-3 w-3" />
            {t("nomenclature")}
          </button>
        </div>
      </div>

      {/* ── Breadcrumb ──────────────────────────────────────────────── */}
      <div className="flex items-center gap-1 border-b border-subtle px-4 py-1.5">
        {breadcrumb.map((crumb, i) => (
          <span key={i} className="flex items-center gap-1">
            {i > 0 && <ChevronRight className="h-3 w-3 text-muted" />}
            <button
              type="button"
              onClick={() => navigateBack(crumb.index)}
              className={`text-[11px] transition-colors ${
                i === breadcrumb.length - 1
                  ? "font-medium text-primary"
                  : "text-muted hover:text-secondary"
              }`}
            >
              {crumb.label}
            </button>
          </span>
        ))}
      </div>

      {/* ── Search ──────────────────────────────────────────────────── */}
      <div className="border-b border-subtle px-4 py-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-muted" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t("searchPlaceholder")}
            className="w-full rounded-md border border-subtle bg-surface-1 py-1.5 pl-8 pr-3 text-[11px] text-primary placeholder-tertiary outline-none focus:border-accent"
          />
        </div>
      </div>

      {/* ── Config panel ───────────────────────────────────────────── */}
      {showConfig && (
        <div className="border-b border-default bg-surface-1 px-4 py-3">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-xs font-semibold text-primary">{t("nomenclature")}</h3>
            <button type="button" onClick={() => setShowConfig(false)} className="text-muted hover:text-secondary">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-muted">
                {t("folderPattern")}
              </label>
              <input
                type="text"
                value={folderPattern}
                onChange={(e) => setFolderPattern(e.target.value)}
                className="w-full rounded border border-subtle bg-surface-0 px-2 py-1.5 text-xs text-primary outline-none focus:border-accent"
              />
              <p className="mt-1 text-[9px] text-tertiary">{t("folderPatternHelp")}</p>
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-muted">
                {t("filePattern")}
              </label>
              <input
                type="text"
                value={filePattern}
                onChange={(e) => setFilePattern(e.target.value)}
                className="w-full rounded border border-subtle bg-surface-0 px-2 py-1.5 text-xs text-primary outline-none focus:border-accent"
              />
              <p className="mt-1 text-[9px] text-tertiary">{t("filePatternHelp")}</p>
            </div>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={saveConfig}
              disabled={configSaving}
              className="rounded-md bg-accent px-3 py-1.5 text-[11px] font-semibold text-white shadow-sm transition-colors hover:bg-accent-hover disabled:opacity-40"
            >
              {configSaving ? "..." : configSaved ? t("saved") : t("save")}
            </button>
          </div>
        </div>
      )}

      {/* ── Column Browser ──────────────────────────────────────────── */}
      <div className="flex min-h-0 flex-1">
        {loading ? (
          <div className="flex flex-1 items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted" />
          </div>
        ) : allFiles.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2">
            <FolderOpen className="h-8 w-8 text-muted" />
            <p className="text-xs text-muted">{t("noFiles")}</p>
          </div>
        ) : (
          <>
            {/* Columns area */}
            <div className="flex min-h-0 flex-1 divide-x divide-subtle overflow-x-auto">
              {columns.map((col, colIndex) => {
                const entries = getColumnEntries(col.type, col.value, colIndex > 0 ? columns[colIndex - 1].type : null);
                const isLast = colIndex === columns.length - 1;

                return (
                  <div
                    key={colIndex}
                    className={`flex min-w-[180px] max-w-[280px] flex-col ${
                      isLast ? "flex-1" : ""
                    }`}
                  >
                    {/* Column header */}
                    <div className="shrink-0 border-b border-subtle px-3 py-1.5">
                      <span className="text-[9px] font-bold uppercase tracking-widest text-muted">
                        {col.type === "year" && t("columns.year")}
                        {col.type === "month" && t("columns.month")}
                        {col.type === "type" && t("columns.type")}
                        {col.type === "files" && t("columns.all")}
                      </span>
                    </div>

                    {/* Column entries */}
                    <div className="min-h-0 flex-1 overflow-y-auto">
                      {col.type === "files" ? (
                        // File list
                        entries.length === 0 ? (
                          <div className="flex items-center justify-center py-8">
                            <p className="text-[11px] text-muted">{searchQuery ? t("noResults") : t("noFiles")}</p>
                          </div>
                        ) : (
                          (entries as any[]).map((entry) => {
                            const file = entry.file as ArchiveFile;
                            const isSelected = selectedFile?.id === file.id;
                            const docType = file.document_type || "other";
                            const colorClass = DOC_TYPE_COLORS[docType] || DOC_TYPE_COLORS.other;
                            const icon = DOC_TYPE_ICONS[docType] || "DOC";

                            return (
                              <button
                                key={file.id}
                                type="button"
                                onClick={() => setSelectedFile(file)}
                                className={`flex w-full items-center gap-2.5 px-3 py-1.5 text-left transition-colors ${
                                  isSelected
                                    ? "bg-accent/10 text-primary"
                                    : "hover:bg-surface-1 text-secondary hover:text-primary"
                                }`}
                              >
                                <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded text-[9px] font-bold ${colorClass}`}>
                                  {icon}
                                </span>
                                <div className="min-w-0 flex-1">
                                  <p className="truncate text-[11px] font-medium leading-tight">
                                    {file.file_name}
                                  </p>
                                  <p className="text-[9px] text-muted">
                                    {formatDate(file.created_at)} · {formatBytes(file.size_bytes)}
                                  </p>
                                </div>
                              </button>
                            );
                          })
                        )
                      ) : (
                        // Folder list
                        entries.map((entry) => {
                          const isSelected = columns[colIndex]?.value === entry.value;
                          return (
                            <button
                              key={entry.value}
                              type="button"
                              onClick={() => handleColumnClick(colIndex, entry)}
                              className={`flex w-full items-center gap-2 px-3 py-1.5 text-left transition-colors ${
                                isSelected && !isLast
                                  ? "bg-accent/10 text-primary"
                                  : "hover:bg-surface-1 text-secondary hover:text-primary"
                              }`}
                            >
                              <FolderOpen className={`h-3.5 w-3.5 shrink-0 ${isSelected && !isLast ? "text-accent" : "text-muted"}`} />
                              <span className="flex-1 truncate text-[11px] font-medium">{entry.label}</span>
                              {entry.count !== undefined && (
                                <span className="text-[9px] text-muted tabular-nums">{entry.count}</span>
                              )}
                              <ChevronRight className="h-3 w-3 shrink-0 text-muted" />
                            </button>
                          );
                        })
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* ── Detail panel ────────────────────────────────────────── */}
            {selectedFile && (
              <div className="w-72 shrink-0 border-l border-default bg-surface-1 overflow-y-auto">
                <div className="px-4 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-xs font-semibold text-primary leading-snug break-all">
                      {selectedFile.file_name}
                    </h3>
                    <button
                      type="button"
                      onClick={() => setSelectedFile(null)}
                      className="shrink-0 text-muted hover:text-secondary"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  {/* Type badge */}
                  <div className="mt-2">
                    <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[9px] font-bold ${DOC_TYPE_COLORS[selectedFile.document_type || "other"] || DOC_TYPE_COLORS.other}`}>
                      {t(`detail.docTypes.${selectedFile.document_type || "other"}`)}
                    </span>
                  </div>

                  {/* Metadata grid */}
                  <div className="mt-4 space-y-2.5">
                    <DetailRow label={t("detail.fileType")} value={selectedFile.file_type.toUpperCase()} />
                    <DetailRow label={t("detail.size")} value={formatBytes(selectedFile.size_bytes)} />
                    <DetailRow label={t("detail.date")} value={formatDate(selectedFile.created_at)} />
                    {selectedFile.expense_id && (
                      <DetailRow
                        label={t("detail.expenseId")}
                        value={`#${selectedFile.expense_id}`}
                      />
                    )}
                    <DetailRow
                      label={t("detail.sourceType")}
                      value={t(`detail.sourceTypes.${selectedFile.source_type}`)}
                    />
                    {selectedFile.validation_summary && (
                      <DetailRow label={t("detail.validation")} value={selectedFile.validation_summary} />
                    )}
                  </div>

                  {/* Tags */}
                  {selectedFile.content_text && (
                    <div className="mt-4">
                      <p className="text-[9px] font-bold uppercase tracking-widest text-muted mb-1">
                        {t("detail.description")}
                      </p>
                      <p className="text-[10px] text-secondary leading-relaxed line-clamp-4">
                        {selectedFile.content_text.substring(0, 200)}
                        {selectedFile.content_text.length > 200 && "..."}
                      </p>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="mt-4 space-y-1.5">
                    {selectedFile.expense_id && (
                      <button
                        type="button"
                        className="flex w-full items-center justify-center gap-1.5 rounded-md border border-subtle bg-surface-2 px-3 py-1.5 text-[11px] font-medium text-secondary transition-colors hover:bg-surface-3 hover:text-primary"
                      >
                        <FileText className="h-3 w-3" />
                        {t("detail.viewExpense")}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── Detail row helper ──────────────────────────────────────────────────────

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-[10px] text-muted">{label}</span>
      <span className="text-[11px] font-medium text-primary text-right">{value}</span>
    </div>
  );
}
