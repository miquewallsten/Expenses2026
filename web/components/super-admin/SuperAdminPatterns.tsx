"use client";

import type { ReactNode } from "react";
import { Loader2, CheckCircle2, AlertTriangle, AlertCircle, Circle } from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// SUPER ADMIN DESIGN TOKENS
// Strict adherence to DESIGN.md "Quiet Cockpit" philosophy
// ─────────────────────────────────────────────────────────────────────────────

export const SA_COLORS = {
  // Surfaces - tonal layers
  canvas: "bg-surface-0",
  panel: "bg-surface-1",
  surface: "bg-surface-2",
  elevated: "bg-surface-3",
  
  // Text - opacity-based
  primary: "text-primary",
  secondary: "text-primary/60",
  tertiary: "text-primary/35",
  muted: "text-primary/30",
  
  // Borders - opacity-based
  hairline: "border-subtle",
  subtle: "border-subtle",
  standard: "border-default",
  active: "border-accent/35",
  
  // Accent - the ONE voice
  accent: "bg-accent",
  accentHover: "hover:bg-accent-hover",
  accentMuted: "bg-accent/[0.12]",
  accentBorder: "border-accent/30",
  accentText: "text-accent",
  
  // Semantic
  success: "bg-success",
  successMuted: "bg-success/[0.12]",
  successBorder: "border-success/30",
  successText: "text-success",
  
  warning: "bg-warning",
  warningMuted: "bg-warning/[0.12]",
  warningBorder: "border-warning/30",
  warningText: "text-warning",
  
  danger: "bg-error",
  dangerMuted: "bg-error/[0.12]",
  dangerBorder: "border-error/30",
  dangerText: "text-error",
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// STATUS BADGE
// Consistent status indicators - background at 12%, border at 30%
// ─────────────────────────────────────────────────────────────────────────────

export type StatusTone = "success" | "warning" | "error" | "neutral" | "processing";

interface StatusBadgeProps {
  status: StatusTone;
  label: string;
  size?: "sm" | "md" | "lg";
}

export function StatusBadge({ status, label, size = "md" }: StatusBadgeProps) {
  const toneMap: Record<StatusTone, { bg: string; text: string; border: string; icon: ReactNode }> = {
    success: {
      bg: SA_COLORS.successMuted,
      text: SA_COLORS.successText,
      border: SA_COLORS.successBorder,
      icon: <CheckCircle2 className={size === "sm" ? "h-2.5 w-2.5" : "h-3 w-3"} />,
    },
    warning: {
      bg: SA_COLORS.warningMuted,
      text: SA_COLORS.warningText,
      border: SA_COLORS.warningBorder,
      icon: <AlertTriangle className={size === "sm" ? "h-2.5 w-2.5" : "h-3 w-3"} />,
    },
    error: {
      bg: SA_COLORS.dangerMuted,
      text: SA_COLORS.dangerText,
      border: SA_COLORS.dangerBorder,
      icon: <AlertCircle className={size === "sm" ? "h-2.5 w-2.5" : "h-3 w-3"} />,
    },
    neutral: {
      bg: "bg-surface-2",
      text: "text-primary/50",
      border: "border-default",
      icon: <Circle className={size === "sm" ? "h-2.5 w-2.5" : "h-3 w-3"} />,
    },
    processing: {
      bg: SA_COLORS.accentMuted,
      text: SA_COLORS.accentText,
      border: SA_COLORS.accentBorder,
      icon: <Loader2 className={`h-3 w-3 animate-spin ${size === "sm" ? "h-2.5 w-2.5" : ""}`} />,
    },
  };

  const tone = toneMap[status];
  const sizeClasses = size === "sm" ? "px-1.5 py-0.5 text-[8px] gap-1" : size === "lg" ? "px-3 py-1 text-[11px] gap-1.5" : "px-2 py-0.5 text-[9px] gap-1";

  return (
    <span className={`inline-flex items-center rounded-full border ${tone.bg} ${tone.text} ${tone.border} font-semibold uppercase tracking-wider ${sizeClasses}`}>
      {tone.icon}
      {label}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// BUTTON COMPONENTS
// One Primary Rule - every screen has one primary action
// ─────────────────────────────────────────────────────────────────────────────

interface ButtonProps {
  children: ReactNode;
  onClick?: () => void;
  type?: "button" | "submit";
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  disabled?: boolean;
  className?: string;
}

export function Button({ 
  children, 
  onClick, 
  type = "button",
  variant = "primary", 
  size = "md",
  disabled = false,
  className = "" 
}: ButtonProps) {
  const baseClasses = "inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition-all";
  
  const sizeClasses = {
    sm: "px-2 py-1 text-[10px]",
    md: "px-3 py-1.5 text-[11px]",
    lg: "px-4 py-2 text-[12px]",
  };
  
  const variantClasses = {
    primary: `${SA_COLORS.accent} text-primary hover:bg-accent-hover disabled:opacity-50`,
    secondary: "bg-surface-2 text-primary/75 hover:bg-surface-3 border border-default",
    ghost: "bg-transparent text-primary/55 hover:bg-surface-2 hover:text-primary/80",
    danger: `${SA_COLORS.dangerMuted} ${SA_COLORS.dangerText} ${SA_COLORS.dangerBorder} border hover:bg-error/[0.20]`,
  };
  
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`${baseClasses} ${sizeClasses[size]} ${variantClasses[variant]} ${className}`}
    >
      {children}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// INPUT COMPONENTS
// Surface-0 background, standard border, 6px radius
// ─────────────────────────────────────────────────────────────────────────────

interface InputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: "text" | "email" | "password" | "number";
  className?: string;
}

export function Input({ value, onChange, placeholder, type = "text", className = "" }: InputProps) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={`w-full rounded-md border border-default bg-surface-1 px-3 py-2 text-[13px] text-primary placeholder:text-primary/30 focus:border-accent/35 focus:outline-none focus:ring-2 focus:ring-accent/10 ${className}`}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SEARCH INPUT
// Specialized input with search icon
// ─────────────────────────────────────────────────────────────────────────────

import { Search } from "lucide-react";

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export function SearchInput({ value, onChange, placeholder = "Search...", className = "" }: SearchInputProps) {
  return (
    <div className={`relative ${className}`}>
      <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-primary/30" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-md border border-default bg-surface-1 py-2 pl-8 pr-3 text-[11px] text-primary placeholder:text-primary/30 focus:border-default focus:outline-none"
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CARD / CONTAINER
// 6px radius, Surface background, subtle border
// ─────────────────────────────────────────────────────────────────────────────

interface CardProps {
  children: ReactNode;
  className?: string;
  padding?: "none" | "sm" | "md" | "lg";
}

export function Card({ children, className = "", padding = "md" }: CardProps) {
  const paddingClasses = {
    none: "",
    sm: "p-3",
    md: "p-4",
    lg: "p-6",
  };
  
  return (
    <div className={`rounded-md border border-subtle bg-surface-2 ${paddingClasses[padding]} ${className}`}>
      {children}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// EMPTY STATE
// Consistent empty state display
// ─────────────────────────────────────────────────────────────────────────────

interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-lg bg-surface-2 text-primary/30">
        {icon}
      </div>
      <p className="text-[13px] font-medium text-primary/75">{title}</p>
      {description && <p className="mt-1 text-[11px] text-primary/45">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// LOADING SPINNER
// ─────────────────────────────────────────────────────────────────────────────

export function LoadingSpinner({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const sizeClasses = {
    sm: "h-4 w-4",
    md: "h-5 w-5",
    lg: "h-8 w-8",
  };
  
  return <Loader2 className={`${sizeClasses[size]} animate-spin text-primary/30`} />;
}

// ─────────────────────────────────────────────────────────────────────────────
// METRIC CARD
// Small stat display with icon
// ─────────────────────────────────────────────────────────────────────────────

import type { LucideIcon } from "lucide-react";

interface MetricCardProps {
  icon: LucideIcon;
  label: string;
  value: string | number;
  tone?: "default" | "success" | "warning" | "error";
}

export function MetricCard({ icon: Icon, label, value, tone = "default" }: MetricCardProps) {
  const toneClasses = {
    default: "",
    success: `border-success/20 bg-success/[0.03]`,
    warning: `border-warning/20 bg-warning/[0.03]`,
    error: `border-error/20 bg-error/[0.03]`,
  };
  
  return (
    <div className={`rounded-lg border border-subtle bg-surface-2 p-4 ${toneClasses[tone]}`}>
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-primary/35">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <div className="mt-2 text-xl font-bold text-primary">
        {value}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// DATA TABLE
// Consistent table styling
// ─────────────────────────────────────────────────────────────────────────────

interface TableColumn<T> {
  key: keyof T | string;
  header: string;
  render?: (item: T) => ReactNode;
  className?: string;
}

interface DataTableProps<T> {
  columns: TableColumn<T>[];
  data: T[];
  keyExtractor: (item: T) => string | number;
  onRowClick?: (item: T) => void;
  emptyMessage?: string;
}

export function DataTable<T>({ 
  columns, 
  data, 
  keyExtractor, 
  onRowClick,
  emptyMessage = "No data available"
}: DataTableProps<T>) {
  if (data.length === 0) {
    return (
      <div className="px-4 py-12 text-center text-[11px] text-primary/30">
        {emptyMessage}
      </div>
    );
  }
  
  return (
    <table className="w-full text-[11px]">
      <thead>
        <tr className="border-b border-subtle bg-surface-1 text-left text-[9px] uppercase tracking-widest text-primary/35">
          {columns.map((col) => (
            <th key={String(col.key)} className={`px-4 py-2.5 ${col.className || ""}`}>
              {col.header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {data.map((item) => (
          <tr 
            key={keyExtractor(item)}
            onClick={() => onRowClick?.(item)}
            className={`border-b border-subtle last:border-0 hover:bg-surface-1 transition-colors ${onRowClick ? "cursor-pointer" : ""}`}
          >
            {columns.map((col) => (
              <td key={String(col.key)} className={`px-4 py-3 ${col.className || ""}`}>
                {col.render ? col.render(item) : String((item as any)[col.key])}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}