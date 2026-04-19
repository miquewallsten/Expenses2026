"use client";

import { CheckCircle2, XCircle, Undo2 } from "lucide-react";

interface Props {
  portalRole: "manager" | "accounting";
  actions: {
    can_approve?: boolean;
    can_reject?: boolean;
    can_return?: boolean;
    reasons?: string[];
  } | null;
  acting?: boolean;
  onApprove?: () => void;
  onReject?: () => void;
  onReturn?: () => void;
}

// Mobile: full-width 44 px tap target. Desktop: compact inline.
const BASE =
  "flex w-full items-center justify-center gap-2 rounded border px-3 font-semibold transition-colors " +
  "disabled:cursor-not-allowed disabled:opacity-40 " +
  "min-h-[44px] text-sm " +
  "md:min-h-0 md:w-auto md:justify-start md:gap-1.5 md:py-1.5 md:text-[10px]";

const ICON = "h-4 w-4 md:h-3 md:w-3 shrink-0";

export default function ReviewActionBar({
  actions,
  acting = false,
  onApprove,
  onReject,
  onReturn,
}: Props) {
  if (!actions) return null;

  const { can_approve: approve, can_reject: reject, can_return: ret } = actions;
  const reasons = actions.reasons ?? [];
  const any = approve || reject || ret;

  if (!any && reasons.length === 0) return null;

  // Exactly one action is PRIMARY — the recommended forward path.
  // Priority: approve → reject → return.
  const primaryIs = approve ? "approve" : reject ? "reject" : "return";

  return (
    <div className="flex flex-col gap-2 border-t border-white/[0.06] pt-3 md:flex-row md:flex-wrap md:items-center">

      {/* Approve — always PRIMARY when available */}
      {approve && (
        <button
          type="button"
          disabled={acting}
          onClick={onApprove}
          className={`${BASE} border-emerald-500/40 bg-emerald-600/30 text-emerald-200 hover:bg-emerald-600/40`}
        >
          <CheckCircle2 className={ICON} />
          Approve
        </button>
      )}

      {/* Reject — PRIMARY only when it's the sole available action, else secondary (border-only) */}
      {reject && (
        <button
          type="button"
          disabled={acting}
          onClick={onReject}
          className={`${BASE} ${
            primaryIs === "reject"
              ? "border-red-500/35 bg-red-500/20 text-red-300/85 hover:bg-red-500/28"
              : "border-red-500/20 bg-transparent text-red-300/50 hover:border-red-500/30 hover:text-red-300/70"
          }`}
        >
          <XCircle className={ICON} />
          Reject
        </button>
      )}

      {/* Return — PRIMARY only when sole action, else ghost */}
      {ret && (
        <button
          type="button"
          disabled={acting}
          onClick={onReturn}
          className={`${BASE} ${
            primaryIs === "return"
              ? "border-white/[0.12] bg-white/[0.04] text-white/60 hover:bg-white/[0.08]"
              : "border-transparent text-white/28 hover:bg-white/[0.04] hover:text-white/45"
          }`}
        >
          <Undo2 className={ICON} />
          Return
        </button>
      )}

      {reasons.length > 0 && (
        <p className="w-full text-[9px] leading-snug text-white/25 md:w-auto">
          {reasons.length === 1
            ? reasons[0]
            : reasons.join(" · ")}
        </p>
      )}
    </div>
  );
}
