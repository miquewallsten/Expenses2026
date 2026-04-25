"use client";

import { forwardRef, type TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  function Textarea({ invalid, className, ...rest }, ref) {
    return (
      <textarea
        ref={ref}
        aria-invalid={invalid || undefined}
        className={cn(
          "w-full rounded-md border bg-white/[0.03] text-white/85 px-2.5 py-2 text-xs",
          "border-white/10 placeholder:text-white/30 resize-y min-h-[60px]",
          "focus:outline-none focus:border-indigo-400/45 focus:bg-white/[0.05]",
          "disabled:opacity-60 disabled:cursor-not-allowed",
          invalid && "border-red-500/50 focus:border-red-400/65",
          className,
        )}
        {...rest}
      />
    );
  },
);
