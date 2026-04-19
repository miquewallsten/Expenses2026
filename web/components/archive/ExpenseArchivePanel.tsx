"use client";

import { useEffect, useState } from "react";
import { Archive } from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_BASE_URL;

interface ArchiveFileItem {
  id: number;
  file_name: string;
  file_type: string;
  source_type: string;
  created_at: string;
}

interface ArchiveListResponse {
  expense_id: number;
  items: ArchiveFileItem[];
}

const SOURCE_PILL: Record<string, string> = {
  upload:    "border-sky-500/30  bg-sky-500/10  text-sky-400",
  xml:       "border-indigo-500/30 bg-indigo-500/10 text-indigo-400",
  generated: "border-violet-500/30 bg-violet-500/10 text-violet-400",
  extracted: "border-amber-500/30  bg-amber-500/10  text-amber-400",
};

function sourcePill(s: string) {
  return SOURCE_PILL[s] ?? "border-zinc-500/30 bg-zinc-500/10 text-zinc-400";
}

function fmt(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("en-GB", {
      day:   "2-digit",
      month: "short",
      year:  "numeric",
    });
  } catch {
    return iso;
  }
}

interface Props {
  expenseId: number | null | undefined;
}

export default function ExpenseArchivePanel({ expenseId }: Props) {
  const [items, setItems]     = useState<ArchiveFileItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!expenseId) { setItems([]); return; }
    setLoading(true);
    fetch(`${API}/archive/query/expense/${expenseId}`, {
      headers: { "X-User-Id": "1" },
    })
      .then((r) => (r.ok ? (r.json() as Promise<ArchiveListResponse>) : null))
      .then((data) => setItems(data?.items ?? []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [expenseId]);

  if (!expenseId) return null;

  return (
    <section className="overflow-hidden rounded-lg border border-white/[0.07] bg-zinc-900/70">
      {/* Header */}
      <div className="flex items-center gap-1.5 border-b border-white/[0.05] px-3 py-1.5">
        <Archive className="h-3 w-3 text-white/25" />
        <span className="text-[9px] font-bold uppercase tracking-widest text-white/28">
          Archive
        </span>
        {!loading && items.length > 0 && (
          <span className="ml-auto rounded border border-white/[0.08] bg-white/[0.04] px-1.5 py-px text-[9px] text-white/35">
            {items.length}
          </span>
        )}
      </div>

      {/* Body */}
      <div className="divide-y divide-white/[0.04]">
        {loading && (
          <p className="px-3 py-2 text-[10px] text-white/25">Loading…</p>
        )}

        {!loading && items.length === 0 && (
          <p className="px-3 py-2 text-[10px] text-white/20">No archived files.</p>
        )}

        {!loading && items.map((f) => (
          <div
            key={f.id}
            className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-0.5 px-3 py-1.5"
          >
            {/* Left: filename + type */}
            <div className="min-w-0">
              <p className="truncate font-mono text-[10px] text-white/60">{f.file_name}</p>
              <p className="text-[9px] text-white/28">{f.file_type}</p>
            </div>

            {/* Right: source pill + date */}
            <div className="flex flex-col items-end gap-0.5">
              <span
                className={`rounded border px-1.5 py-px text-[8px] font-semibold uppercase tracking-wide ${sourcePill(f.source_type)}`}
              >
                {f.source_type}
              </span>
              <span className="text-[9px] text-white/25">{fmt(f.created_at)}</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
