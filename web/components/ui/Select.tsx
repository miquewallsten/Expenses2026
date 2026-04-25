"use client";

import { forwardRef, type SelectHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  invalid?: boolean;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { invalid, className, children, ...rest },
  ref,
) {
  return (
    <select
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(
        "h-8 w-full rounded-md border bg-zinc-900 text-white/85 px-2 text-xs",
        "border-white/10",
        "focus:outline-none focus:border-indigo-400/45",
        "disabled:opacity-60 disabled:cursor-not-allowed",
        invalid && "border-red-500/50",
        className,
      )}
      {...rest}
    >
      {children}
    </select>
  );
});
