"use client";

import { AlertTriangle, ReceiptText } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ReviewQueueListProps {
  items: any[];
  selectedId?: number | null;
  onSelect?: (item: any) => void;
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

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } catch {
    return iso;
  }
}

// ── Issue badges ──────────────────────────────────────────────────────────────

function IssueBadges({ item, variant }: { item: any; variant: "manager" | "accounting" }) {
  const badges: React.ReactNode[] = [];

  if (variant === "accounting" && !item.account_code) {
    badges.push(
      <span
        key="no-code"
        className="inline-flex items-center gap-0.5 rounded border border-amber-500/20 bg-amber-500/[0.05] px-1.5 py-0.5 text-[8px] text-amber-300/55"
      >
        <AlertTriangle className="h-2 w-2 shrink-0" />
        No account code
      </span>
    );
  }

  if (item.detected_category) {
    badges.push(
      <span
        key="category"
        className="inline-flex items-center gap-0.5 rounded border border-white/[0.07] bg-white/[0.03] px-1.5 py-0.5 text-[8px] text-white/30"
      >
        <ReceiptText className="h-2 w-2 shrink-0 text-amber-400/40" />
        {item.detected_category}
      </span>
    );
  }

  if (!badges.length) return null;
  return <div className="mt-1 flex flex-wrap gap-1">{badges}</div>;
}

// ── Row ───────────────────────────────────────────────────────────────────────

function QueueRow({
  item,
  selected,
  onSelect,
  variant,
}: {
  item: any;
  selected: boolean;
  onSelect: () => void;
  variant: "manager" | "accounting";
}) {
  const secondaryParts: string[] = [];
  if (item.id) secondaryParts.push(`#${item.id}`);
  if (item.created_at) secondaryParts.push(formatDate(item.created_at));
  if (item.report_id != null) secondaryParts.push(`Report ${item.report_id}`);
  if (variant === "accounting" && item.account_code) secondaryParts.push(item.account_code);

  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        className={`w-full border-b border-white/[0.05] px-4 py-3 text-left transition-colors ${
          selected ? "bg-white/[0.06]" : "hover:bg-white/[0.03]"
        }`}
      >
        {/* Row 1: description + status */}
        <div className="flex items-start justify-between gap-2">
          <span className="min-w-0 flex-1 truncate text-xs font-medium text-white/80">
            {item.description || "Untitled"}
          </span>
          <span
            className={`shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest ${statusCls(item.status ?? "draft")}`}
          >
            {item.status ?? "—"}
          </span>
        </div>

        {/* Row 2: secondary meta + amount */}
        <div className="mt-0.5 flex items-center justify-between gap-2">
          <span className="text-[10px] text-white/30">
            {secondaryParts.join(" · ") || "\u00a0"}
          </span>
          <span className="shrink-0 font-mono text-[10px] font-semibold text-white/50">
            {item.amount != null ? `$${Number(item.amount).toFixed(2)}` : "—"}
          </span>
        </div>

        {/* Row 3: hint line */}
        {(() => {
          const status = item.status ?? "";
          let hint: string | null = null;
          if (variant === "manager") {
            if (status === "submitted")       hint = "Approval pending";
            else if (status === "approved")   hint = "Approved";
            else if (status === "rejected")   hint = "Rejected — no further action";
          } else {
            if (status === "manager_approved" || status === "submitted")
                                              hint = "Accounting review pending";
            else if (status === "approved")   hint = "Approved";
            else if (status === "rejected")   hint = "Rejected — no further action";
          }
          const codePending = variant === "accounting" && !item.account_code;
          if (!hint && !codePending) return null;
          return (
            <>
              {hint && <p className="mt-0.5 text-[9px] text-white/22">{hint}</p>}
              {codePending && <p className="mt-0.5 text-[9px] text-white/18">Account code pending</p>}
            </>
          );
        })()}

        {/* Row 4: issue badges */}
        <IssueBadges item={item} variant={variant} />
      </button>
    </li>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function ReviewQueueList({
  items,
  selectedId,
  onSelect,
  variant,
}: ReviewQueueListProps) {
  if (!items.length) {
    return (
      <div className="px-4 py-6 text-center text-xs text-white/25">
        No expenses pending {variant === "manager" ? "manager" : "accounting"} review.
      </div>
    );
  }

  return (
    <ul className="flex-1 overflow-y-auto">
      {items.map((item) => (
        <QueueRow
          key={item.id ?? Math.random()}
          item={item}
          selected={selectedId != null && item.id === selectedId}
          onSelect={() => onSelect?.(item)}
          variant={variant}
        />
      ))}
    </ul>
  );
}
