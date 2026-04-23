"use client";

// ── Status config ─────────────────────────────────────────────────────────────

export type StatusVariant =
  | "draft"
  | "submitted"
  | "manager_approved"
  | "approved"
  | "rejected"
  | "uploading"
  | "ok"
  | "warn"
  | "unconfigured";

type Size = "dot" | "badge" | "card";

const STATUS_CONFIG: Record<
  StatusVariant,
  { dot: string; text: string; badge: string; label?: string }
> = {
  draft:            { dot: "bg-zinc-400/50",    text: "text-zinc-400/70",    badge: "border-zinc-500/30 bg-zinc-500/12 text-zinc-400" },
  submitted:        { dot: "bg-sky-400/65",     text: "text-sky-300/70",     badge: "border-sky-500/30 bg-sky-500/12 text-sky-300" },
  manager_approved: { dot: "bg-violet-400/65",  text: "text-violet-300/70",  badge: "border-violet-500/30 bg-violet-500/12 text-violet-300" },
  approved:         { dot: "bg-emerald-400/70", text: "text-emerald-300/70", badge: "border-emerald-500/30 bg-emerald-500/12 text-emerald-300" },
  rejected:         { dot: "bg-red-400/65",     text: "text-red-300/70",     badge: "border-red-500/30 bg-red-500/12 text-red-300" },
  uploading:        { dot: "bg-indigo-400/65",  text: "text-indigo-300/70",  badge: "border-indigo-500/30 bg-indigo-500/12 text-indigo-300" },
  ok:               { dot: "bg-emerald-400/70", text: "text-emerald-400/65", badge: "border-emerald-500/25 bg-emerald-500/10 text-emerald-300/75" },
  warn:             { dot: "bg-amber-400/70",   text: "text-amber-400/65",   badge: "border-amber-500/25 bg-amber-500/10 text-amber-300/75" },
  unconfigured:     { dot: "bg-zinc-500/40",    text: "text-white/30",       badge: "border-white/10 bg-white/[0.04] text-white/35" },
};

function getConfig(status: string) {
  return STATUS_CONFIG[status as StatusVariant] ?? STATUS_CONFIG.draft;
}

// ── Components ────────────────────────────────────────────────────────────────

/** Tiny colored dot — used in compact list rows */
export function StatusDot({ status, className = "" }: { status: string; className?: string }) {
  const cfg = getConfig(status);
  return <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${cfg.dot} ${className}`} />;
}

/** Inline text in status color — used in list row secondary lines */
export function StatusText({ status, children, className = "" }: { status: string; children?: React.ReactNode; className?: string }) {
  const cfg = getConfig(status);
  return (
    <span className={`${cfg.text} ${className}`}>
      {children ?? status.replace(/_/g, " ")}
    </span>
  );
}

/** Pill badge — used in queue rows and card headers */
export function StatusBadge({
  status,
  label,
  size = "badge",
  className = "",
}: {
  status: string;
  label?: string;
  size?: Size;
  className?: string;
}) {
  if (size === "dot") return <StatusDot status={status} className={className} />;

  const cfg = getConfig(status);
  const display = label ?? status.replace(/_/g, " ");

  if (size === "card") {
    return (
      <span className={`flex items-center gap-1 text-[9px] font-semibold uppercase tracking-widest ${cfg.text} ${className}`}>
        <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
        {display}
      </span>
    );
  }

  return (
    <span
      className={`shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest ${cfg.badge} ${className}`}
    >
      {display}
    </span>
  );
}

export default StatusBadge;
