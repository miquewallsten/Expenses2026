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
          "w-full rounded-md border bg-surface-1 text-primary px-2.5 py-2 text-xs",
          "border-subtle placeholder:text-muted resize-y min-h-[60px]",
          "focus:outline-none focus:bg-accent-muted/50 focus:bg-surface-2",
          "focus:ring-2 focus:ring-blue-400/20 focus:ring-offset-0",
          "transition-colors duration-150",
          "disabled:opacity-60 disabled:cursor-not-allowed",
          invalid && "border-red-500/50 focus:border-red-400/65 focus:ring-red-400/20",
          className,
        )}
        {...rest}
      />
    );
  },
);
