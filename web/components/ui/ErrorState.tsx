"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface ErrorStateProps {
  title?: ReactNode;
  message?: ReactNode;
  requestId?: string | null;
  onRetry?: () => void;
  retryLabel?: string;
  className?: string;
}

export function ErrorState({
  title = "Something went wrong",
  message,
  requestId,
  onRetry,
  retryLabel = "Retry",
  className,
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-center justify-center text-center",
        "py-10 px-4 rounded-md border border-red-500/20 bg-red-500/[0.05]",
        className,
      )}
    >
      <div className="text-[11px] font-medium text-error/85 uppercase tracking-widest">
        {title}
      </div>
      {message && (
        <div className="mt-1 text-[11px] text-tertiary max-w-sm">{message}</div>
      )}
      {requestId && (
        <div className="mt-2 text-[10px] text-muted font-mono">
          ref: {requestId}
        </div>
      )}
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-3 h-7 px-3 text-[11px] rounded-md border border-default bg-surface-2 hover:bg-surface-3 text-secondary"
        >
          {retryLabel}
        </button>
      )}
    </div>
  );
}
