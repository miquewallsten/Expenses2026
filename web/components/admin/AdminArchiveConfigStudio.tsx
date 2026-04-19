"use client";

import { useEffect, useState } from "react";
import { Save, Loader2, CheckCircle2 } from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_BASE_URL;

interface Props {
  companyId: number;
  config: any;
  onSaved?: (config: any) => void;
  draftPatch?: Partial<any>;
}

// ── Preview helpers (mirrors archive_service.py logic) ────────────────────────

/** Sample context matching backend _build_context() with fixed values for preview. */
const PREVIEW_CTX: Record<string, string> = {
  company:    "1",
  company_id: "1",
  expense_id: "123",
  date:       "2026-04-18",
  year:       "2026",
  month:      "04",
  day:        "18",
  filename:   "receipt",
};

/** Replace {token} with context value; unknown tokens left as-is (matches backend). */
function renderPattern(pattern: string): string {
  return pattern.replace(/\{(\w+)\}/g, (_, key) => PREVIEW_CTX[key] ?? `{${key}}`);
}

/** Strip trailing dot-extension from a rendered stem (mirrors _strip_extension). */
function stripExtension(s: string): string {
  const dot = s.lastIndexOf(".");
  // Only strip if there's a dot and something follows it (looks like an extension)
  if (dot > 0 && s.length - dot <= 5) return s.slice(0, dot);
  return s;
}

/** Derive file preview: render → strip extension → append sample ext if none present. */
function filePreview(pattern: string): string {
  const rendered = renderPattern(pattern);
  const stem = stripExtension(rendered);
  // If stripped something, the pattern had an extension — show it back from the stem
  const hadExt = stem !== rendered;
  return hadExt ? `${stem}.pdf` : `${rendered}.pdf`;
}

/** Derive folder preview: render → strip surrounding slashes. */
function folderPreview(pattern: string): string {
  return renderPattern(pattern).replace(/^\/+|\/+$/g, "") || "/";
}

// ── Sub-components ────────────────────────────────────────────────────────────

function FieldRow({
  label,
  value,
  onChange,
  tokens,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  tokens: string;
}) {
  return (
    <div className="border-b border-white/[0.05] px-4 py-3 last:border-0">
      <div className="mb-1 flex items-baseline justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-white/30">
          {label}
        </span>
        <span className="font-mono text-[9px] text-white/18">{tokens}</span>
      </div>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded border border-white/[0.07] bg-black/20 px-2.5 py-1.5 font-mono text-[11px] text-white/70 outline-none focus:border-white/20"
        spellCheck={false}
      />
    </div>
  );
}

function PathPreview({ folderPat, filePat }: { folderPat: string; filePat: string }) {
  const folder = folderPreview(folderPat);
  const file   = filePreview(filePat);
  const full   = `${folder}/${file}`;

  return (
    <div className="overflow-hidden rounded-lg border border-white/[0.05] bg-black/15">
      <div className="border-b border-white/[0.04] px-3 py-1.5">
        <span className="text-[9px] font-bold uppercase tracking-widest text-white/22">
          Path preview
        </span>
        <span className="ml-2 text-[8px] text-white/14">
          company=1 · expense_id=123 · date=2026-04-18
        </span>
      </div>
      <div className="divide-y divide-white/[0.03] px-3">
        <div className="flex items-baseline gap-2 py-1.5">
          <span className="w-12 shrink-0 text-[9px] uppercase tracking-wide text-white/22">Folder</span>
          <span className="font-mono text-[10px] text-sky-300/55">{folder}</span>
        </div>
        <div className="flex items-baseline gap-2 py-1.5">
          <span className="w-12 shrink-0 text-[9px] uppercase tracking-wide text-white/22">File</span>
          <span className="font-mono text-[10px] text-sky-300/55">{file}</span>
        </div>
        <div className="flex items-baseline gap-2 py-1.5">
          <span className="w-12 shrink-0 text-[9px] uppercase tracking-wide text-white/22">Full</span>
          <span className="font-mono text-[10px] text-emerald-300/50 break-all">{full}</span>
        </div>
      </div>
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function AdminArchiveConfigStudio({
  companyId,
  config,
  onSaved,
  draftPatch,
}: Props) {
  const [filePattern,   setFilePattern]   = useState<string>(
    config?.file_pattern   ?? "{company}_{date}_{expense_id}",
  );
  const [folderPattern, setFolderPattern] = useState<string>(
    config?.folder_pattern ?? "{year}/{month}",
  );

  const [saving, setSaving] = useState(false);
  const [saved,  setSaved]  = useState(false);
  const [error,  setError]  = useState<string | null>(null);

  // Apply incoming draft patch (e.g. from AI orchestrator)
  useEffect(() => {
    if (!draftPatch) return;
    if (draftPatch.file_pattern   !== undefined) setFilePattern(draftPatch.file_pattern);
    if (draftPatch.folder_pattern !== undefined) setFolderPattern(draftPatch.folder_pattern);
    setSaved(false);
  }, [draftPatch]);

  // Re-seed when parent config changes (e.g. initial portal-config load)
  useEffect(() => {
    if (config?.file_pattern   !== undefined) setFilePattern(config.file_pattern);
    if (config?.folder_pattern !== undefined) setFolderPattern(config.folder_pattern);
  }, [config]);

  const handleChange = (setter: (v: string) => void) => (v: string) => {
    setter(v);
    setSaved(false);
    setError(null);
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch(`${API}/admin/archive-config/${companyId}`, {
        method:  "PUT",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ file_pattern: filePattern, folder_pattern: folderPattern }),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      const data = await res.json();
      onSaved?.(data);
      setSaved(true);
    } catch (e: any) {
      setError(e?.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const isDirty =
    filePattern   !== (config?.file_pattern   ?? "{company}_{date}_{expense_id}") ||
    folderPattern !== (config?.folder_pattern ?? "{year}/{month}");

  return (
    <div className="max-w-lg">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-white">Archive Config</h2>
        {isDirty && (
          <span className="rounded border border-violet-500/20 bg-violet-500/[0.08] px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-wide text-violet-300/50">
            Unsaved
          </span>
        )}
      </div>

      {/* Fields */}
      <div className="overflow-hidden rounded-lg border border-white/[0.07]">
        <FieldRow
          label="File pattern"
          value={filePattern}
          onChange={handleChange(setFilePattern)}
          tokens="{company}  {date}  {expense_id}  {filename}"
        />
        <FieldRow
          label="Folder pattern"
          value={folderPattern}
          onChange={handleChange(setFolderPattern)}
          tokens="{year}  {month}  {company}"
        />
      </div>

      {/* Path preview */}
      <div className="mt-3">
        <PathPreview folderPat={folderPattern} filePat={filePattern} />
      </div>

      {/* Actions */}
      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center gap-1.5 rounded border border-white/10 bg-white/[0.05] px-3 py-1.5 text-[10px] font-semibold text-white/60 transition-colors hover:bg-white/[0.09] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? (
            <><Loader2 className="h-3 w-3 animate-spin" /> Saving…</>
          ) : (
            <><Save className="h-3 w-3" /> Save</>
          )}
        </button>
        {saved && (
          <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400/60">
            <CheckCircle2 className="h-3 w-3" /> Saved
          </span>
        )}
        {error && (
          <span className="text-[10px] text-red-400/60">{error}</span>
        )}
      </div>
    </div>
  );
}
