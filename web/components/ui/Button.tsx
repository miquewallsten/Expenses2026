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
    "bg-indigo-600/85 hover:bg-indigo-500/85 text-white border-indigo-500/40 disabled:bg-indigo-900/40",
  secondary:
    "bg-white/[0.04] hover:bg-white/[0.07] text-white/75 border-white/10",
  ghost:
    "bg-transparent hover:bg-white/[0.05] text-white/55 border-transparent",
  danger:
    "bg-red-600/80 hover:bg-red-500/85 text-white border-red-500/40 disabled:bg-red-900/40",
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
        "transition-colors disabled:cursor-not-allowed disabled:opacity-60",
        "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-indigo-400/50",
        VARIANT[variant],
        SIZE[size],
        className,
      )}
      {...rest}
    >
      {loading ? (
        <span className="h-3 w-3 animate-spin rounded-full border border-white/40 border-t-transparent" />
      ) : null}
      {children}
    </button>
  );
});
