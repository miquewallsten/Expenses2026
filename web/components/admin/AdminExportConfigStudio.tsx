"use client";

import { useEffect, useState } from "react";
import { Save, Loader2 } from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_BASE_URL;

interface Props {
  companyId: number;
  config: any;
  onSaved?: (config: any) => void;
  draftPatch?: Partial<any>;
}

// ── Preview helpers ───────────────────────────────────────────────────────────

const PREVIEW_CTX: Record<string, string> = {
  company_id: "1",
  date:       "2026-04-18",
  year:       "2026",
  month:      "04",
};

function renderPattern(pattern: string): string {
  return pattern.replace(/\{(\w+)\}/g, (_, key) => PREVIEW_CTX[key] ?? `{${key}}`);
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function AdminExportConfigStudio({
  companyId,
  config,
  onSaved,
  draftPatch,
}: Props) {
  const [bundlePattern, setBundlePattern] = useState<string>(
    config?.bundle_name_pattern ?? "company{company_id}_{date}_export_bundle",
  );
  const [exportFormat, setExportFormat] = useState<string>(
    config?.export_format ?? "json",
  );

  const [saving, setSaving] = useState(false);
  const [saved,  setSaved]  = useState(false);
  const [error,  setError]  = useState<string | null>(null);

  // Apply incoming draft patch
  useEffect(() => {
    if (!draftPatch) return;
    if (draftPatch.bundle_name_pattern !== undefined) setBundlePattern(draftPatch.bundle_name_pattern);
    if (draftPatch.export_format       !== undefined) setExportFormat(draftPatch.export_format);
    setSaved(false);
  }, [draftPatch]);

  // Re-seed when parent config changes
  useEffect(() => {
    if (config?.bundle_name_pattern !== undefined) setBundlePattern(config.bundle_name_pattern);
    if (config?.export_format       !== undefined) setExportFormat(config.export_format);
  }, [config]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch(`${API}/admin/export-config/${companyId}`, {
        method:  "PUT",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ bundle_name_pattern: bundlePattern, export_format: exportFormat }),
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
    bundlePattern !== (config?.bundle_name_pattern ?? "company{company_id}_{date}_export_bundle") ||
    exportFormat  !== (config?.export_format       ?? "json");

  const preview = renderPattern(bundlePattern);

  return (
    <div className="max-w-lg">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-white">Export Config</h2>
        {isDirty && (
          <span className="rounded border border-violet-500/20 bg-violet-500/[0.08] px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-wide text-violet-300/50">
            Unsaved
          </span>
        )}
      </div>

      {/* Fields */}
      <div className="overflow-hidden rounded-lg border border-white/[0.07]">
        {/* Bundle name pattern */}
        <div className="border-b border-white/[0.05] px-4 py-3">
          <div className="mb-1 flex items-baseline justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-white/30">
              Bundle name pattern
            </span>
            <span className="font-mono text-[9px] text-white/18">
              {"{ company_id }  { date }  { year }  { month }"}
            </span>
          </div>
          <input
            type="text"
            value={bundlePattern}
            onChange={(e) => { setBundlePattern(e.target.value); setSaved(false); setError(null); }}
            className="w-full rounded border border-white/[0.07] bg-black/20 px-2.5 py-1.5 font-mono text-[11px] text-white/70 outline-none focus:border-white/20"
            spellCheck={false}
          />
          <div className="mt-1.5 flex items-center gap-1.5">
            <span className="text-[9px] uppercase tracking-widest text-white/20">Preview</span>
            <span className="font-mono text-[10px] text-sky-300/60">{preview}</span>
          </div>
        </div>

        {/* Export format */}
        <div className="px-4 py-3">
          <div className="mb-2">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-white/30">
              Export format
            </span>
          </div>
          <div className="flex gap-2">
            {(["json", "csv"] as const).map((fmt) => (
              <button
                key={fmt}
                type="button"
                onClick={() => { setExportFormat(fmt); setSaved(false); setError(null); }}
                className={`rounded border px-3 py-1 font-mono text-[11px] transition-colors ${
                  exportFormat === fmt
                    ? "border-sky-500/30 bg-sky-500/[0.12] text-sky-300/80"
                    : "border-white/[0.07] bg-black/20 text-white/40 hover:text-white/60"
                }`}
              >
                {fmt}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Preview row */}
      <div className="mt-3 overflow-hidden rounded-lg border border-white/[0.05] bg-black/15">
        <div className="border-b border-white/[0.04] px-3 py-1.5">
          <span className="text-[9px] font-bold uppercase tracking-widest text-white/22">
            Bundle preview
          </span>
          <span className="ml-2 text-[8px] text-white/14">
            company_id=1 · date=2026-04-18
          </span>
        </div>
        <div className="divide-y divide-white/[0.03] px-3">
          <div className="flex items-baseline gap-2 py-1.5">
            <span className="w-14 shrink-0 text-[9px] uppercase tracking-wide text-white/22">Name</span>
            <span className="font-mono text-[10px] text-emerald-300/50 break-all">{preview}</span>
          </div>
          <div className="flex items-baseline gap-2 py-1.5">
            <span className="w-14 shrink-0 text-[9px] uppercase tracking-wide text-white/22">Format</span>
            <span className="font-mono text-[10px] text-sky-300/55">{exportFormat}</span>
          </div>
        </div>
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
        {saved && <span className="text-[10px] text-emerald-400/60">Saved</span>}
        {error && <span className="text-[10px] text-red-400/60">{error}</span>}
      </div>
    </div>
  );
}
