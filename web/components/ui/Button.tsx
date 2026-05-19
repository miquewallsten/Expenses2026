"use client";

import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "xs" | "sm" | "md";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

const VARIANT: Record<Variant, string> = {
  primary:
    "bg-accent hover:bg-accent-hover text-primary bg-accent-muted disabled:bg-indigo-900/40",
  secondary:
    "bg-surface-2 hover:bg-surface-3 text-secondary border-subtle",
  ghost:
    "bg-transparent hover:bg-surface-2 text-tertiary border-transparent",
  danger:
    "bg-error hover:bg-error text-primary border-error disabled:bg-red-900/40",
};

const SIZE: Record<Size, string> = {
  xs: "h-6 px-2 text-[10px] tracking-wide",
  sm: "h-7 px-2.5 text-[11px]",
  md: "h-8 px-3 text-xs",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "sm", loading, className, children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-md border font-medium",
        "transition-all duration-150 disabled:cursor-not-allowed disabled:opacity-60",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/50 focus-visible:ring-offset-1 focus-visible:ring-offset-zinc-950",
        "active:scale-[0.97] active:brightness-95",
        VARIANT[variant],
        SIZE[size],
        className,
      )}
      {...rest}
    >
      {loading ? (
        <span className="h-3 w-3 animate-spin rounded-full border-2 border-strong border-t-white/80" />
      ) : null}
      {children}
    </button>
  );
});
