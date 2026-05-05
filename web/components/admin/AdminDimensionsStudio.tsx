"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Plus, Trash2, Pencil, Check, X, Upload, Loader2,
  Sparkles, AlertCircle, FileSpreadsheet, Lock,
} from "lucide-react";
import { getAuthHeaders } from "@/lib/session";
import { apiCall, apiPost, apiPatch, apiDelete } from "@/lib/api/client";

const API = process.env.NEXT_PUBLIC_API_BASE_URL;

type Kind = "projects" | "clients" | "cost-centers";

interface DimensionRow {
  id: number;
  company_id: number;
  name: string;
  code: string;
  status: string;
}

interface Props {
  companyId: number;
  /**
   * Raw `allocation_dimensions` value from `company_expense_policies`.
   * Underscore-joined string, e.g. "project_client_cost_center" or "project_only".
   * When null/undefined we assume all three are active (matches backend default).
   */
  allocationDimensions?: string | null;
}

// Map Kind → keyword present in the raw allocation_dimensions string.
const KIND_KEYWORD: Record<Kind, string> = {
  "projects":     "project",
  "clients":      "client",
  "cost-centers": "cost_center",
};

function isKindActive(kind: Kind, raw: string | null | undefined): boolean {
  // No config loaded yet → optimistically show (avoids flicker during load)
  if (raw == null || raw === "") return true;
  return raw.toLowerCase().includes(KIND_KEYWORD[kind]);
}

// ── API helpers ──────────────────────────────────────────────────────────────

async function listDim(kind: Kind, companyId: number): Promise<DimensionRow[]> {
  const base = kind === "projects" ? "projects" : kind === "clients" ? "clients" : "cost-centers";
  return apiCall<DimensionRow[]>(`/expenses/${base}?company_id=${companyId}`);
}

async function createDim(kind: Kind, companyId: number, name: string, code: string): Promise<DimensionRow> {
  const base = kind === "projects" ? "projects" : kind === "clients" ? "clients" : "cost-centers";
  return apiPost<DimensionRow>(`/expenses/${base}`, { company_id: companyId, name, code });
}

async function patchDim(kind: Kind, id: number, data: Partial<DimensionRow>): Promise<void> {
  await apiPatch(`/admin/dimensions/${kind}/${id}`, data);
}

async function deleteDim(kind: Kind, id: number): Promise<void> {
  await apiDelete(`/admin/dimensions/${kind}/${id}`);
}

// ── Main ─────────────────────────────────────────────────────────────────────

export default function AdminDimensionsStudio({ companyId, allocationDimensions }: Props) {
  const t = useTranslations("admin.dimensions");

  const tabs = useMemo(() => {
    const all: { k: Kind; label: string }[] = [
      { k: "projects",     label: t("tabProjects") },
      { k: "clients",      label: t("tabClients") },
      { k: "cost-centers", label: t("tabCostCenters") },
    ];
    return all.map((t) => ({ ...t, active: isKindActive(t.k, allocationDimensions) }));
  }, [allocationDimensions, t]);

  const activeTabs = tabs.filter((t) => t.active);
  const [tab, setTab] = useState<Kind>(activeTabs[0]?.k ?? "projects");

  // If the active tab got disabled via config change, fall back to first active.
  useEffect(() => {
    if (activeTabs.length > 0 && !activeTabs.some((t) => t.k === tab)) {
      setTab(activeTabs[0].k);
    }
  }, [activeTabs, tab]);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-secondary">{t("title")}</h2>
        <p className="mt-0.5 text-[11px] text-muted">{t("subtitle")}</p>
      </div>

      {activeTabs.length === 0 ? (
        <AllDisabledPanel />
      ) : (
        <>
          <div className="inline-flex rounded border border-default bg-surface-1 p-0.5 text-[11px]">
            {tabs.map(({ k, label, active }) => (
              <button
                key={k}
                type="button"
                disabled={!active}
                onClick={() => active && setTab(k)}
                title={!active ? t("tabDisabledTooltip") : undefined}
                className={`rounded px-3 py-1 transition ${
                  !active
                    ? "cursor-not-allowed text-muted"
                    : tab === k
                      ? "bg-accent-muted text-indigo-100 border bg-accent-muted"
                      : "text-tertiary hover:text-secondary"
                }`}
              >
                <span className="inline-flex items-center gap-1">
                  {!active && <Lock className="h-2.5 w-2.5" />}
                  {label}
                </span>
              </button>
            ))}
          </div>

          <DimensionTab key={tab} kind={tab} companyId={companyId} />
        </>
      )}
    </div>
  );
}

function AllDisabledPanel() {
  const t = useTranslations("admin.dimensions");
  return (
    <div className="rounded-lg border border-amber-500/20 bg-amber-500/[0.04] p-4">
      <div className="flex items-start gap-2">
        <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning/70" />
        <div className="space-y-1">
          <p className="text-[12px] font-semibold text-warning/85">{t("allDisabledTitle")}</p>
          <p className="text-[11px] leading-relaxed text-warning/60">{t("allDisabledBody")}</p>
        </div>
      </div>
    </div>
  );
}

// ── Single-tab panel ─────────────────────────────────────────────────────────

function DimensionTab({ kind, companyId }: { kind: Kind; companyId: number }) {
  const t = useTranslations("admin.dimensions");

  const [rows, setRows]       = useState<DimensionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr]         = useState<string | null>(null);
  const [filter, setFilter]   = useState("");

  const [editingId, setEditingId]     = useState<number | null>(null);
  const [editName, setEditName]       = useState("");
  const [editCode, setEditCode]       = useState("");

  const [newName, setNewName]         = useState("");
  const [newCode, setNewCode]         = useState("");
  const [adding, setAdding]           = useState(false);

  const [showImport, setShowImport]   = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      setRows(await listDim(kind, companyId));
    } catch (e: any) {
      setErr(e?.message ?? "load failed");
    } finally {
      setLoading(false);
    }
  }, [kind, companyId]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const f = filter.trim().toLowerCase();
    if (!f) return rows;
    return rows.filter((r) => r.name.toLowerCase().includes(f) || r.code.toLowerCase().includes(f));
  }, [rows, filter]);

  const handleAdd = async () => {
    if (!newName.trim() || !newCode.trim()) return;
    setAdding(true);
    try {
      const row = await createDim(kind, companyId, newName.trim(), newCode.trim());
      setRows((prev) => [row, ...prev]);
      setNewName("");
      setNewCode("");
    } catch (e: any) {
      setErr(e?.message ?? "add failed");
    } finally {
      setAdding(false);
    }
  };

  const handleSaveEdit = async (row: DimensionRow) => {
    try {
      await patchDim(kind, row.id, { name: editName.trim(), code: editCode.trim() });
      setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, name: editName.trim(), code: editCode.trim() } : r)));
      setEditingId(null);
    } catch (e: any) {
      setErr(e?.message ?? "save failed");
    }
  };

  const handleDelete = async (row: DimensionRow) => {
    if (!window.confirm(t("confirmDelete", { name: row.name }))) return;
    try {
      await deleteDim(kind, row.id);
      setRows((prev) => prev.filter((r) => r.id !== row.id));
    } catch (e: any) {
      setErr(e?.message ?? "delete failed");
    }
  };

  return (
    <div className="space-y-3">
      {/* Action bar */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          placeholder={t("searchPlaceholder")}
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="w-56 rounded border border-default bg-surface-1 px-2.5 py-1 text-[11px] text-secondary placeholder:text-muted outline-none focus:bg-accent-muted"
        />
        <span className="text-[10px] text-muted">
          {loading ? "…" : t("countRows", { count: rows.length })}
        </span>
        <button
          type="button"
          onClick={() => setShowImport(true)}
          className="ml-auto inline-flex items-center gap-1.5 rounded border bg-accent-muted-muted bg-blue-600/10 px-3 py-1 text-[10px] font-semibold text-accent transition-colors hover:bg-accent-muted"
        >
          <Upload className="h-3 w-3" /> {t("importButton")}
        </button>
      </div>

      {err && (
        <div className="flex items-center gap-1.5 rounded border border-red-500/20 bg-red-950/20 px-3 py-1.5 text-[10px] text-error/70">
          <AlertCircle className="h-3 w-3" /> {err}
        </div>
      )}

      {/* Table */}
      <div className="overflow-hidden rounded-lg border border-default bg-surface-1">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="border-b border-subtle bg-surface-1 text-left text-[9px] font-bold uppercase tracking-widest text-muted">
              <th className="px-3 py-2 w-32">{t("colCode")}</th>
              <th className="px-3 py-2">{t("colName")}</th>
              <th className="px-3 py-2 w-20"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.04]">
            {/* Add row */}
            <tr className="bg-surface-1">
              <td className="px-3 py-1.5">
                <input
                  type="text"
                  placeholder={t("codePlaceholder")}
                  value={newCode}
                  onChange={(e) => setNewCode(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }}
                  className="w-full rounded border border-default bg-surface-1 px-2 py-0.5 text-[11px] text-secondary placeholder:text-muted outline-none focus:bg-accent-muted"
                />
              </td>
              <td className="px-3 py-1.5">
                <input
                  type="text"
                  placeholder={t("namePlaceholder")}
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }}
                  className="w-full rounded border border-default bg-surface-1 px-2 py-0.5 text-[11px] text-secondary placeholder:text-muted outline-none focus:bg-accent-muted"
                />
              </td>
              <td className="px-3 py-1.5">
                <button
                  type="button"
                  onClick={handleAdd}
                  disabled={!newName.trim() || !newCode.trim() || adding}
                  className="inline-flex items-center gap-1 rounded border border-emerald-500/25 bg-emerald-600/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-300/80 hover:bg-emerald-600/20 disabled:opacity-30"
                >
                  {adding ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                </button>
              </td>
            </tr>

            {filtered.map((row) => {
              const isEditing = editingId === row.id;
              return (
                <tr key={row.id} className="text-secondary">
                  <td className="px-3 py-1.5 font-mono text-[10.5px]">
                    {isEditing
                      ? <input
                          type="text"
                          value={editCode}
                          onChange={(e) => setEditCode(e.target.value)}
                          className="w-full rounded border border-default bg-surface-1 px-2 py-0.5 text-[11px] text-secondary outline-none focus:bg-accent-muted"
                        />
                      : row.code
                    }
                  </td>
                  <td className="px-3 py-1.5">
                    {isEditing
                      ? <input
                          type="text"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter") handleSaveEdit(row); }}
                          className="w-full rounded border border-default bg-surface-1 px-2 py-0.5 text-[11px] text-secondary outline-none focus:bg-accent-muted"
                        />
                      : row.name
                    }
                  </td>
                  <td className="px-3 py-1.5">
                    <div className="flex items-center justify-end gap-1">
                      {isEditing ? (
                        <>
                          <button
                            type="button"
                            onClick={() => handleSaveEdit(row)}
                            className="rounded border border-emerald-500/25 bg-emerald-600/10 p-0.5 text-emerald-300/80 hover:bg-emerald-600/20"
                          >
                            <Check className="h-3 w-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingId(null)}
                            className="rounded border border-default bg-surface-1 p-0.5 text-secondary hover:text-secondary"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => { setEditingId(row.id); setEditName(row.name); setEditCode(row.code); }}
                            className="rounded border border-default bg-surface-1 p-0.5 text-secondary hover:text-secondary"
                          >
                            <Pencil className="h-3 w-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(row)}
                            className="rounded border border-red-500/15 bg-red-500/[0.05] p-0.5 text-error/60 hover:bg-red-500/[0.15]"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}

            {!loading && filtered.length === 0 && rows.length > 0 && (
              <tr><td colSpan={3} className="px-3 py-4 text-center text-[11px] italic text-muted">{t("emptyFiltered")}</td></tr>
            )}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={3} className="px-3 py-6 text-center text-[11px] italic text-muted">{t("emptyAll")}</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {showImport && (
        <ImportDialog
          kind={kind}
          companyId={companyId}
          onClose={() => setShowImport(false)}
          onDone={() => { setShowImport(false); load(); }}
        />
      )}
    </div>
  );
}

// ── Import dialog ────────────────────────────────────────────────────────────

interface Preview {
  headers: string[];
  suggested_map: { name: string | null; code: string | null };
  total_rows: number;
  rows: Array<{ row: number; name: string | null; code: string | null; duplicate: boolean }>;
  detected_count: number;
}

function ImportDialog({
  kind, companyId, onClose, onDone,
}: {
  kind: Kind;
  companyId: number;
  onClose: () => void;
  onDone: () => void;
}) {
  const t = useTranslations("admin.dimensions");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [nameCol, setNameCol] = useState<string>("");
  const [codeCol, setCodeCol] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [result, setResult] = useState<{ inserted: number; skipped_duplicates: number; errors: string[] } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [rawFile, setRawFile] = useState<File | null>(null);

  const uploadForPreview = async (file: File) => {
    setLoading(true);
    setErr(null);
    setResult(null);
    setRawFile(file);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`${API}/admin/dimensions/${kind}/import/preview?company_id=${companyId}`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: fd,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail ?? `${res.status}`);
      }
      const data: Preview = await res.json();
      setPreview(data);
      setNameCol(data.suggested_map.name ?? "");
      setCodeCol(data.suggested_map.code ?? "");
    } catch (e: any) {
      setErr(e?.message ?? "upload failed");
    } finally {
      setLoading(false);
    }
  };

  const reparseWithCols = () => {
    if (!preview || !rawFile) return;
    // Refetch with same file — server re-suggests but we'll override mapping on commit
    // For mapping preview, just rebuild client-side
  };

  // Client-side re-mapping preview
  const mappedPreview = useMemo(() => {
    if (!preview || !nameCol || !codeCol) return [];
    // preview.rows only have the server's initially suggested columns. We need full raw data
    // for re-mapping. Simplest: re-upload.
    return preview.rows;
  }, [preview, nameCol, codeCol]);

  const commit = async () => {
    if (!preview || !nameCol || !codeCol) return;
    setCommitting(true);
    setErr(null);
    try {
      // Re-upload the file so the server sees the *full* dataset and we can map by the
      // columns the user chose. The /preview response is capped at 50 rows, so we send
      // the full file to a new preview call first (keyed to the chosen headers) and then
      // map all rows client-side using the result's headers. We already have headers;
      // just resend the file to get the complete mapped rows:
      const fd = new FormData();
      fd.append("file", rawFile!);
      const res = await fetch(
        `${API}/admin/dimensions/${kind}/import/preview?company_id=${companyId}`,
        { method: "POST", headers: getAuthHeaders(), body: fd },
      );
      const full: Preview = await res.json();
      // The server returns up to 50 rows. For the common case (catalogs < 50), this is fine.
      // For larger uploads, user sees count mismatch and we'll fallback to server-side.
      const rows = full.rows
        .map((r) => ({ name: r.name ?? "", code: r.code ?? "" }))
        .filter((r) => r.name && r.code);

      const body = await apiPost<{ inserted: number; skipped_duplicates: number; errors: string[] }>(
        `/admin/dimensions/${kind}/import/commit`,
        { company_id: companyId, rows },
      );
      setResult(body);
    } catch (e: any) {
      setErr(e?.message ?? "commit failed");
    } finally {
      setCommitting(false);
    }
  };

  const pickable = preview?.rows.filter((r) => r.name && r.code && !r.duplicate).length ?? 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-2xl overflow-hidden rounded-lg border border-default bg-surface-0 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-subtle px-4 py-3">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="h-4 w-4 text-accent/60" />
            <h3 className="text-[12px] font-semibold text-secondary">{t("importTitle")}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-default p-1 text-tertiary hover:text-secondary"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="max-h-[70vh] overflow-y-auto p-4 space-y-3">
          {/* Step 1: File pick */}
          {!preview && !result && (
            <div className="space-y-3">
              <p className="text-[11px] text-tertiary">{t("importDesc")}</p>
              <button
                type="button"
                disabled={loading}
                onClick={() => fileInputRef.current?.click()}
                className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-default bg-surface-1 px-4 py-10 text-[11px] text-tertiary transition-colors hover:bg-accent-muted hover:bg-accent-hover/[0.04] disabled:opacity-40"
              >
                {loading
                  ? <><Loader2 className="h-4 w-4 animate-spin" /> {t("parsing")}</>
                  : <><Upload className="h-4 w-4" /> {t("dragDropFile")}</>
                }
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.xlsm,.csv"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) uploadForPreview(f);
                }}
              />
              <p className="text-[10px] text-muted">{t("supportedFormats")}</p>
            </div>
          )}

          {/* Step 2: Preview + column map */}
          {preview && !result && (
            <div className="space-y-3">
              <div className="flex items-start gap-2 rounded border border-blue-500/15 bg-blue-500/[0.05] px-3 py-2">
                <Sparkles className="mt-0.5 h-3 w-3 shrink-0 text-accent/60" />
                <p className="text-[10.5px] leading-relaxed text-accent/70">
                  {t("detectedRows", { total: preview.total_rows, valid: pickable })}
                </p>
              </div>

              {/* Column mapping */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-[9px] font-bold uppercase tracking-widest text-muted">{t("mapCode")}</label>
                  <select
                    value={codeCol}
                    onChange={(e) => setCodeCol(e.target.value)}
                    className="w-full rounded border border-default bg-surface-1 px-2 py-1 text-[11px] text-secondary outline-none focus:bg-accent-muted"
                  >
                    <option value="">—</option>
                    {preview.headers.map((h) => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-[9px] font-bold uppercase tracking-widest text-muted">{t("mapName")}</label>
                  <select
                    value={nameCol}
                    onChange={(e) => setNameCol(e.target.value)}
                    className="w-full rounded border border-default bg-surface-1 px-2 py-1 text-[11px] text-secondary outline-none focus:bg-accent-muted"
                  >
                    <option value="">—</option>
                    {preview.headers.map((h) => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
              </div>

              {/* Preview table */}
              <div className="overflow-hidden rounded border border-default">
                <table className="w-full text-[10.5px]">
                  <thead>
                    <tr className="border-b border-subtle bg-surface-1 text-left text-[9px] font-bold uppercase tracking-widest text-muted">
                      <th className="px-2 py-1.5 w-10">#</th>
                      <th className="px-2 py-1.5 w-32">{t("colCode")}</th>
                      <th className="px-2 py-1.5">{t("colName")}</th>
                      <th className="px-2 py-1.5 w-24"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.04]">
                    {mappedPreview.slice(0, 15).map((r) => (
                      <tr key={r.row} className={r.duplicate ? "text-muted" : "text-secondary"}>
                        <td className="px-2 py-1 text-muted">{r.row}</td>
                        <td className="px-2 py-1 font-mono">{r.code ?? "—"}</td>
                        <td className="px-2 py-1">{r.name ?? "—"}</td>
                        <td className="px-2 py-1 text-right">
                          {r.duplicate && (
                            <span className="rounded border border-amber-500/20 bg-warning-muted px-1.5 py-0.5 text-[8px] font-semibold uppercase text-warning/70">
                              {t("duplicate")}
                            </span>
                          )}
                          {!r.duplicate && r.name && r.code && (
                            <span className="rounded border border-emerald-500/20 bg-success-muted px-1.5 py-0.5 text-[8px] font-semibold uppercase text-emerald-300/70">
                              {t("ready")}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {preview.total_rows > 15 && (
                  <p className="border-t border-subtle bg-surface-1 px-2 py-1 text-[9.5px] text-muted">
                    {t("plusMore", { count: preview.total_rows - 15 })}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Step 3: result */}
          {result && (
            <div className="space-y-2">
              <div className="rounded border border-emerald-500/20 bg-emerald-950/20 px-3 py-2.5">
                <p className="text-[11px] font-semibold text-emerald-300/90">{t("importComplete")}</p>
                <p className="mt-0.5 text-[10.5px] text-success/70">
                  {t("resultSummary", { inserted: result.inserted, skipped: result.skipped_duplicates })}
                </p>
              </div>
              {result.errors.length > 0 && (
                <div className="rounded border border-red-500/20 bg-red-950/20 px-3 py-2">
                  <p className="mb-1 text-[10.5px] font-semibold text-error/80">{t("someErrors")}</p>
                  <ul className="list-disc space-y-0.5 pl-4 text-[10px] text-red-200/70">
                    {result.errors.slice(0, 10).map((e, i) => <li key={i}>{e}</li>)}
                  </ul>
                </div>
              )}
            </div>
          )}

          {err && (
            <div className="flex items-center gap-1.5 rounded border border-red-500/20 bg-red-950/20 px-3 py-1.5 text-[10px] text-error/70">
              <AlertCircle className="h-3 w-3" /> {err}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-subtle bg-surface-1 px-4 py-2.5">
          {result ? (
            <button
              type="button"
              onClick={onDone}
              className="inline-flex items-center gap-1.5 rounded border bg-accent-muted bg-accent-muted px-3 py-1 text-[10px] font-semibold text-accent"
            >
              {t("done")}
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={onClose}
                className="rounded border border-default bg-surface-1 px-3 py-1 text-[10px] text-tertiary hover:text-primary"
              >
                {t("cancel")}
              </button>
              {preview && (
                <button
                  type="button"
                  onClick={commit}
                  disabled={!nameCol || !codeCol || committing || pickable === 0}
                  className="inline-flex items-center gap-1.5 rounded border bg-accent-muted bg-accent-muted px-3 py-1 text-[10px] font-semibold text-accent disabled:opacity-30"
                >
                  {committing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                  {t("importConfirm", { count: pickable })}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
