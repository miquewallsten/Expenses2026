"use client";

import { useTranslations } from "next-intl";
import { AlertTriangle, ReceiptText, ClipboardList } from "lucide-react";
import { StatusBadge } from "@/components/ui/StatusBadge";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ReviewQueueListProps {
  items: any[];
  selectedId?: number | null;
  onSelect?: (item: any) => void;
  variant: "manager" | "accounting";
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } catch {
    return iso;
  }
}

// ── Skeleton row ──────────────────────────────────────────────────────────────

function SkeletonRow() {
  return (
    <li className="border-b border-white/[0.05] px-4 py-3">
      <div className="flex items-start justify-between gap-2">
        <div className="skeleton h-2.5 w-3/5 rounded" />
        <div className="skeleton h-4 w-16 rounded-full" />
      </div>
      <div className="mt-1.5 flex items-center justify-between gap-2">
        <div className="skeleton h-2 w-24 rounded" />
        <div className="skeleton h-2 w-12 rounded" />
      </div>
    </li>
  );
}

// ── Issue badges ──────────────────────────────────────────────────────────────

function IssueBadges({ item, variant }: { item: any; variant: "manager" | "accounting" }) {
  const t = useTranslations("accounting");
  const badges: React.ReactNode[] = [];

  if (variant === "accounting" && !item.account_code) {
    badges.push(
      <span
        key="no-code"
        className="inline-flex items-center gap-0.5 rounded border border-amber-500/20 bg-amber-500/[0.06] px-1.5 py-0.5 text-[8px] text-amber-300/65"
      >
        <AlertTriangle className="h-2 w-2 shrink-0" />
        {t("noAccountCode")}
      </span>
    );
  }

  if (item.detected_category) {
    badges.push(
      <span
        key="category"
        className="inline-flex items-center gap-0.5 rounded border border-white/[0.08] bg-white/[0.03] px-1.5 py-0.5 text-[8px] text-white/38"
      >
        <ReceiptText className="h-2 w-2 shrink-0 text-amber-400/50" />
        {item.detected_category}
      </span>
    );
  }

  if (!badges.length) return null;
  return <div className="mt-1.5 flex flex-wrap gap-1">{badges}</div>;
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
  const t = useTranslations("review");

  const secondaryParts: string[] = [];
  if (item.id) secondaryParts.push(`#${item.id}`);
  if (item.created_at) secondaryParts.push(formatDate(item.created_at));
  if (item.report_id != null) secondaryParts.push(`Report ${item.report_id}`);
  if (variant === "accounting" && item.account_code) secondaryParts.push(item.account_code);

  const status = item.status ?? "draft";
  let hint: string | null = null;
  if (variant === "manager") {
    if (status === "submitted")     hint = t("approvalPending");
    else if (status === "approved") hint = t("approvedStatus");
    else if (status === "rejected") hint = t("rejectedNoAction");
  } else {
    if (status === "manager_approved" || status === "submitted") hint = t("accountingReviewPending");
    else if (status === "approved") hint = t("approvedStatus");
    else if (status === "rejected") hint = t("rejectedNoAction");
  }
  const codePending = variant === "accounting" && !item.account_code;

  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        className={`w-full border-b border-white/[0.05] px-4 py-3 text-left transition-colors ${
          selected
            ? "bg-indigo-950/40 shadow-[inset_2px_0_0_0_theme(colors.indigo.500/50%)]"
            : "hover:bg-white/[0.05]"
        }`}
      >
        {/* Row 1: description + status badge */}
        <div className="flex items-start justify-between gap-2">
          <span className={`min-w-0 flex-1 truncate text-xs font-medium ${selected ? "text-white" : "text-white/80"}`}>
            {item.description || t("untitled")}
          </span>
          <StatusBadge status={status} />
        </div>

        {/* Row 2: secondary meta + amount */}
        <div className="mt-0.5 flex items-center justify-between gap-2">
          <span className="text-[10px] text-white/38">
            {secondaryParts.join(" · ") || " "}
          </span>
          <span className="shrink-0 font-mono text-[10px] font-semibold text-white/55">
            {item.amount != null ? `$${Number(item.amount).toFixed(2)}` : "—"}
          </span>
        </div>

        {/* Hint line */}
        {(hint || codePending) && (
          <div className="mt-0.5">
            {hint && <p className="text-[9px] text-white/30">{hint}</p>}
            {codePending && <p className="text-[9px] text-white/25">{t("accountCodePending")}</p>}
          </div>
        )}

        {/* Issue badges */}
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
  const t = useTranslations("review");

  if (!items.length) {
    return (
      <div className="flex flex-col items-center gap-3 px-4 py-14 text-center">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/[0.04] ring-1 ring-white/[0.06]">
          <ClipboardList className="h-5 w-5 text-white/20" />
        </div>
        <div>
          <p className="text-xs font-medium text-white/35">{t("queueEmpty")}</p>
          <p className="mt-0.5 text-[10px] text-white/22">
            {variant === "manager" ? t("queueEmptyManagerHint") : t("queueEmptyAccountingHint")}
          </p>
        </div>
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

export { SkeletonRow as ReviewSkeletonRow };
