"use client";

import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

const BASE = cn(
  "w-full rounded-md border bg-surface-1 text-primary",
  "border-subtle placeholder:text-muted",
  "focus:outline-none focus:bg-accent-muted/50 focus:bg-surface-2",
  "focus:ring-2 focus:ring-blue-400/20 focus:ring-offset-0",
  "transition-colors duration-150",
  "disabled:opacity-60 disabled:cursor-not-allowed",
);

const SIZE = "h-8 px-2.5 text-xs";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { invalid, className, ...rest },
  ref,
) {
  return (
    <input
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(
        BASE,
        SIZE,
        invalid && "border-red-500/50 focus:border-red-400/65 focus:ring-red-400/20",
        className,
      )}
      {...rest}
    />
  );
});
