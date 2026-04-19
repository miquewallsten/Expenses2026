"use client";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ReviewQueueSummaryProps {
  summary: any;
  variant: "manager" | "accounting";
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_CLS: Record<string, string> = {
  draft:            "border-zinc-500/30 bg-zinc-500/15 text-zinc-400",
  submitted:        "border-sky-500/30 bg-sky-500/15 text-sky-300",
  manager_approved: "border-violet-500/30 bg-violet-500/15 text-violet-300",
  approved:         "border-emerald-500/30 bg-emerald-500/15 text-emerald-300",
  rejected:         "border-red-500/30 bg-red-500/15 text-red-300",
};
function statusCls(s: string) {
  return STATUS_CLS[s] ?? "border-zinc-500/30 bg-zinc-500/15 text-zinc-400";
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ReviewQueueSummary({ summary, variant }: ReviewQueueSummaryProps) {
  if (!summary) return null;

  const count: number   = summary.total_count ?? 0;
  const amount: number  = summary.total_amount ?? 0;
  const flagged: number = summary.flagged_count ?? 0;
  const statuses: Record<string, number> = summary.statuses ?? {};
  const statusEntries = Object.entries(statuses).filter(([, n]) => n > 0);

  if (count === 0) return null;

  return (
    <div className="shrink-0 border-b border-white/[0.05] bg-black/10 px-3 py-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {/* Item count */}
        <span className="text-[9px] font-semibold tabular-nums text-white/35">
          {count} item{count !== 1 ? "s" : ""}
        </span>

        {/* Total amount */}
        {amount > 0 && (
          <span className="font-mono text-[9px] text-white/28">
            ${amount.toFixed(2)}
          </span>
        )}

        {/* Flagged count */}
        {flagged > 0 && (
          <span className="rounded border border-red-500/20 bg-red-500/[0.06] px-1.5 py-0.5 text-[8px] font-semibold text-red-300/60">
            {flagged} flagged
          </span>
        )}

        {/* Status pills */}
        {statusEntries.map(([s, n]) => (
          <span
            key={s}
            className={`rounded border px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-wider ${statusCls(s)}`}
          >
            {n} {s}
          </span>
        ))}
      </div>
    </div>
  );
}
