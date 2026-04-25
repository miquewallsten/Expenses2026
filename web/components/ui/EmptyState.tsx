"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface EmptyStateProps {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center",
        "py-10 px-4 rounded-md border border-white/[0.06] bg-white/[0.02]",
        className,
      )}
    >
      {icon && (
        <div className="mb-2 text-white/30 [&>svg]:h-6 [&>svg]:w-6">{icon}</div>
      )}
      <div className="text-[11px] font-medium text-white/65 uppercase tracking-widest">
        {title}
      </div>
      {description && (
        <div className="mt-1 text-[11px] text-white/40 max-w-sm">{description}</div>
      )}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}
