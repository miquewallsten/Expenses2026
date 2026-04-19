"use client";

/**
 * StatusNextAction — unified status + guided-action strip.
 *
 * Renders one horizontal bar:
 *   [ raw-status chip ]  module-framed explanation  ·  Next action to take  [ N ⚠ ]
 *
 * Driven entirely by an ExpenseDecision so there are no local conditions.
 * Drop a single <StatusNextAction decision={decision} /> wherever a module
 * previously had a status badge + nextAction <p> + inline blocker list.
 */

import { AlertTriangle } from "lucide-react";
import type { ExpenseDecision } from "@/lib/my-work/expenseDecision";

// Mirrors STATUS_CLS used across modules — keep in sync if palette changes.
const STATUS_BADGE: Record<string, string> = {
  draft:            "bg-zinc-500/15 text-zinc-400 border-zinc-500/30",
  submitted:        "bg-sky-500/15 text-sky-300 border-sky-500/30",
  manager_approved: "bg-violet-500/15 text-violet-300 border-violet-500/30",
  approved:         "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  rejected:         "bg-red-500/15 text-red-300 border-red-500/30",
};

function chipCls(rawStatus: string): string {
  return STATUS_BADGE[rawStatus] ?? "bg-zinc-500/15 text-zinc-400 border-zinc-500/30";
}

interface Props {
  decision: ExpenseDecision;
  className?: string;
}

export default function StatusNextAction({ decision, className = "" }: Props) {
  const { primaryStatus, nextAction } = decision;
  const { currentStatus, blockerCount } = decision.assistantContext;

  // Empty-decision sentinel: no item selected — render nothing.
  if (!currentStatus) return null;

  return (
    <div className={`flex min-w-0 items-center gap-2 ${className}`}>

      {/* Raw-status chip — color encodes lifecycle stage */}
      <span
        className={`shrink-0 rounded border px-1.5 py-px text-[8px] font-bold uppercase tracking-widest ${chipCls(currentStatus)}`}
      >
        {currentStatus.replace(/_/g, " ")}
      </span>

      {/* Module-framed explanation of what the status means right now */}
      <span className="shrink-0 text-[10px] text-white/38">
        {primaryStatus}
      </span>

      {/* Visual separator */}
      <span className="shrink-0 select-none text-[10px] text-white/12" aria-hidden>·</span>

      {/* Next action — the single highest-priority CTA */}
      <span className="min-w-0 flex-1 truncate text-[10px] font-medium text-white/65">
        {nextAction}
      </span>

      {/* Blocker count badge — only when blockers exist */}
      {blockerCount > 0 && (
        <span className="flex shrink-0 items-center gap-1 rounded border border-red-500/25 bg-red-500/[0.07] px-1.5 py-px text-[8px] font-semibold text-red-300/65">
          <AlertTriangle className="h-2 w-2" />
          {blockerCount}
        </span>
      )}

    </div>
  );
}
