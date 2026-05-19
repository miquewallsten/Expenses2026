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
  draft:            { dot: "bg-muted",    text: "text-tertiary",    badge: "border-default bg-surface-2 text-secondary" },
  submitted:        { dot: "bg-sky-400/65",     text: "text-accent/70",     badge: "border-sky-500/30 bg-accent/12 text-accent" },
  manager_approved: { dot: "bg-violet-400/65",  text: "text-violet-300/70",  badge: "border-violet-500/30 bg-violet-500/12 text-violet-300" },
  approved:         { dot: "bg-emerald-400/70", text: "text-emerald-300/70", badge: "border-emerald-500/30 bg-emerald-500/12 text-emerald-300" },
  rejected:         { dot: "bg-red-400/65",     text: "text-error/70",     badge: "border-error bg-red-500/12 text-error" },
  uploading:        { dot: "bg-accent/65",  text: "text-accent/70",  badge: "bg-accent-muted bg-blue-500/12 text-accent" },
  ok:               { dot: "bg-emerald-400/70", text: "text-success/65", badge: "border-emerald-500/25 bg-success-muted text-emerald-300/75" },
  warn:             { dot: "bg-amber-400/70",   text: "text-warning/65",   badge: "border-amber-500/25 bg-warning-muted text-warning/75" },
  unconfigured:     { dot: "bg-muted",    text: "text-muted",       badge: "border-subtle bg-surface-2 text-muted" },
};

function getConfig(status: string) {
  return STATUS_CONFIG[status as StatusVariant] ?? STATUS_CONFIG.draft;
}

// ── Components ────────────────────────────────────────────────────────────────

/** Tiny colored dot - used in compact list rows */
export function StatusDot({ status, className = "" }: { status: string; className?: string }) {
  const cfg = getConfig(status);
  return <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${cfg.dot} ${className}`} />;
}

/** Inline text in status color - used in list row secondary lines */
export function StatusText({ status, children, className = "" }: { status: string; children?: React.ReactNode; className?: string }) {
  const cfg = getConfig(status);
  return (
    <span className={`${cfg.text} ${className}`}>
      {children ?? status.replace(/_/g, " ")}
    </span>
  );
}

/** Pill badge - used in queue rows and card headers */
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
