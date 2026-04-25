"use client";

import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

const BASE = cn(
  "w-full rounded-md border bg-white/[0.03] text-white/85",
  "border-white/10 placeholder:text-white/30",
  "focus:outline-none focus:border-indigo-400/45 focus:bg-white/[0.05]",
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
        invalid && "border-red-500/50 focus:border-red-400/65",
        className,
      )}
      {...rest}
    />
  );
});
