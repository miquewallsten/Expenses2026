"use client";

import type { ReactNode } from "react";
import { Loader2, CheckCircle2, AlertTriangle, AlertCircle, Circle } from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// SECTION ACCENT COLORS
// Map each admin section to its committed accent color
// ─────────────────────────────────────────────────────────────────────────────

export const SECTION_ACCENTS = {
  "company-setup": { bg: "bg-emerald-500/10", text: "text-emerald-400", border: "border-emerald-500/20" },
  "expense-policy": { bg: "bg-amber-500/10", text: "text-amber-400", border: "border-amber-500/20" },
  "approval-workflow": { bg: "bg-indigo-500/10", text: "text-indigo-400", border: "border-indigo-500/20" },
  "users-roles": { bg: "bg-violet-500/10", text: "text-violet-400", border: "border-violet-500/20" },
  "accounting-setup": { bg: "bg-sky-500/10", text: "text-sky-400", border: "border-sky-500/20" },
  integrations: { bg: "bg-cyan-500/10", text: "text-cyan-400", border: "border-cyan-500/20" },
  "platform-api": { bg: "bg-rose-500/10", text: "text-rose-400", border: "border-rose-500/20" },
  export: { bg: "bg-teal-500/10", text: "text-teal-400", border: "border-teal-500/20" },
  "audit-log": { bg: "bg-slate-500/10", text: "text-slate-400", border: "border-slate-500/20" },
  "cfdi-watcher": { bg: "bg-rose-500/10", text: "text-rose-400", border: "border-rose-500/20" },
  notifications: { bg: "bg-sky-500/10", text: "text-sky-400", border: "border-sky-500/20" },
  onboarding: { bg: "bg-success/10", text: "text-success", border: "border-success/20" },
  auth: { bg: "bg-violet-500/10", text: "text-violet-400", border: "border-violet-500/20" },
  modules: { bg: "bg-ai/10", text: "text-ai", border: "border-ai/20" },
  channels: { bg: "bg-accent/10", text: "text-accent", border: "border-accent/20" },
  default: { bg: "bg-surface-2", text: "text-secondary", border: "border-default" },
} as const;

export type SectionKey = keyof typeof SECTION_ACCENTS;

// ─────────────────────────────────────────────────────────────────────────────
// PREMIUM HEADER
// Consistent header pattern across all admin config panels
// ─────────────────────────────────────────────────────────────────────────────

interface PremiumHeaderProps {
  icon: ReactNode;
  title: string;
  subtitle?: string;
  section?: SectionKey;
  badge?: ReactNode;
  action?: ReactNode;
  metrics?: Array<{ label: string; value: string | number; tone?: "success" | "warning" | "error" | "neutral" }>;
}

export function PremiumHeader({ icon, title, subtitle, section = "default", badge, action, metrics }: PremiumHeaderProps) {
  const accent = SECTION_ACCENTS[section];

  return (
    <div className="relative overflow-hidden rounded-lg border border-default bg-gradient-to-r from-surface-1 via-surface-1 to-current/[0.02] px-4 py-3">
      {/* Radial accent gradient */}
      <div
        className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--color-current)/5%,_transparent_50%)]"
        style={{ color: `var(--color-${section === "default" ? "surface-2" : section.split("-")[0]})` }}
      />

      <div className="relative flex items-center justify-between">
        <div className="flex items-center gap-3">
          {/* Icon container with colored background */}
          <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${accent.bg}`}>
            <div className={accent.text}>{icon}</div>
          </div>

          <div className="flex flex-col">
            <h2 className="text-sm font-semibold text-primary">{title}</h2>
            {subtitle && <span className="text-[9px] text-muted">{subtitle}</span>}
          </div>

          {badge}
        </div>

        <div className="flex items-center gap-3">
          {metrics && metrics.length > 0 && (
            <div className="flex items-center gap-2">
              {metrics.map((m, i) => (
                <div key={i} className="text-right">
                  <div className="text-[11px] font-semibold tabular-nums text-primary">{m.value}</div>
                  <div className="text-[9px] text-muted">{m.label}</div>
                </div>
              ))}
            </div>
          )}
          {action}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION PANEL
// Consistent panel container for config sections
// ─────────────────────────────────────────────────────────────────────────────

interface SectionPanelProps {
  title?: string;
  description?: string;
  children: ReactNode;
  className?: string;
  collapsible?: boolean;
  defaultOpen?: boolean;
}

export function SectionPanel({ title, description, children, className = "" }: SectionPanelProps) {
  return (
    <div className={`overflow-hidden rounded-lg border border-default bg-surface-1 ${className}`}>
      {title && (
        <div className="border-b border-subtle px-4 py-2.5">
          <p className="text-[9px] font-bold uppercase tracking-widest text-muted">{title}</p>
          {description && <p className="mt-0.5 text-[10px] text-tertiary">{description}</p>}
        </div>
      )}
      {children}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ROW COMPONENTS
// Consistent row patterns for forms and displays
// ─────────────────────────────────────────────────────────────────────────────

interface RowProps {
  label: string;
  description?: string;
  children: ReactNode;
  className?: string;
}

export function Row({ label, description, children, className = "" }: RowProps) {
  return (
    <div className={`flex items-center justify-between gap-4 border-b border-subtle px-4 py-2.5 last:border-0 ${className}`}>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-medium text-secondary">{label}</p>
        {description && <p className="mt-0.5 text-[10px] text-muted">{description}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

interface RowStackProps {
  label: string;
  description?: string;
  children: ReactNode;
  className?: string;
}

export function RowStack({ label, description, children, className = "" }: RowStackProps) {
  return (
    <div className={`border-b border-subtle px-4 py-3 last:border-0 ${className}`}>
      <div className="mb-2">
        <p className="text-[11px] font-medium text-secondary">{label}</p>
        {description && <p className="mt-0.5 text-[10px] text-muted">{description}</p>}
      </div>
      {children}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// STATUS BADGE
// Consistent status indicators across all panels
// ─────────────────────────────────────────────────────────────────────────────

export type StatusTone = "success" | "warning" | "error" | "neutral" | "processing";

interface StatusBadgeProps {
  status: StatusTone;
  label: string;
  size?: "sm" | "md" | "lg";
}

export function StatusBadge({ status, label, size = "md" }: StatusBadgeProps) {
  const toneMap: Record<StatusTone, { bg: string; text: string; icon: ReactNode }> = {
    success: {
      bg: "bg-success/10",
      text: "text-success",
      icon: <CheckCircle2 className={size === "sm" ? "h-2.5 w-2.5" : "h-3 w-3"} />
    },
    warning: {
      bg: "bg-warning/10",
      text: "text-warning",
      icon: <AlertTriangle className={size === "sm" ? "h-2.5 w-2.5" : "h-3 w-3"} />
    },
    error: {
      bg: "bg-error/10",
      text: "text-error",
      icon: <AlertCircle className={size === "sm" ? "h-2.5 w-2.5" : "h-3 w-3"} />
    },
    neutral: {
      bg: "bg-surface-2",
      text: "text-muted",
      icon: <Circle className={size === "sm" ? "h-2.5 w-2.5" : "h-3 w-3"} />
    },
    processing: {
      bg: "bg-accent/10",
      text: "text-accent",
      icon: <Loader2 className={`h-3 w-3 ${size === "sm" ? "h-2.5 w-2.5" : "h-3 w-3"} animate-spin`} />
    },
  };

  const tone = toneMap[status];
  const sizeClasses = size === "sm" ? "px-1.5 py-0.5 text-[8px]" : size === "lg" ? "px-3 py-1 text-[11px]" : "px-2 py-0.5 text-[9px]";

  return (
    <span className={`inline-flex items-center gap-1 rounded-full border border-current/20 ${tone.bg} ${tone.text} ${sizeClasses} font-semibold uppercase tracking-wide`}>
      {tone.icon}
      {label}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// EMPTY STATE
// Consistent empty/first-time state pattern
// ─────────────────────────────────────────────────────────────────────────────

interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
  section?: SectionKey;
}

export function EmptyState({ icon, title, description, action, section = "default" }: EmptyStateProps) {
  const accent = SECTION_ACCENTS[section];

  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className={`flex h-12 w-12 items-center justify-center rounded-full ${accent.bg} mb-3`}>
        <div className={accent.text}>{icon}</div>
      </div>
      <h3 className="text-sm font-medium text-primary mb-1">{title}</h3>
      <p className="text-[11px] text-muted max-w-xs mb-4">{description}</p>
      {action}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TOGGLE SWITCH
// Consistent toggle pattern
// ─────────────────────────────────────────────────────────────────────────────

interface ToggleProps {
  value: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
  size?: "sm" | "md";
}

export function Toggle({ value, onChange, disabled = false, size = "md" }: ToggleProps) {
  const sizeClasses = size === "sm" ? "h-4 w-7" : "h-5 w-9";
  const knobSize = size === "sm" ? "h-2.5 w-2.5" : "h-4 w-4";
  const knobTranslate = value ? (size === "sm" ? "translate-x-3" : "translate-x-4") : "translate-x-0.5";

  return (
    <button
      type="button"
      role="switch"
      aria-checked={value}
      disabled={disabled}
      onClick={() => !disabled && onChange(!value)}
      className={`relative inline-flex shrink-0 items-center rounded-full border transition-colors disabled:opacity-30 ${
        value
          ? "border-accent bg-accent-muted"
          : "border-default bg-surface-2"
      } ${sizeClasses}`}
    >
      <span className={`absolute top-0.5 ${knobSize} rounded-full bg-white shadow transition-transform ${knobTranslate}`} />
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION LABEL
// Consistent section label pattern
// ─────────────────────────────────────────────────────────────────────────────

export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="mb-1 px-1 text-[9px] font-bold uppercase tracking-widest text-muted">
      {children}
    </p>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// FORM INPUT STYLES
// Consistent input styling
// ─────────────────────────────────────────────────────────────────────────────

export const inputClasses = {
  base: "rounded border border-default bg-surface-1 px-2 py-1.5 text-[11px] text-secondary outline-none placeholder:text-muted focus:bg-accent-muted focus:border-accent/40",
  select: "rounded border border-default bg-surface-1 px-2 py-1 text-[10px] text-tertiary outline-none focus:bg-accent-muted",
  textarea: "rounded border border-default bg-surface-1 px-2 py-1.5 text-[11px] text-secondary outline-none placeholder:text-muted focus:bg-accent-muted focus:border-accent/40 resize-none",
  mono: "rounded border border-default bg-surface-1 px-2 py-1.5 font-mono text-[10px] text-tertiary outline-none placeholder:text-muted focus:bg-accent-muted",
};