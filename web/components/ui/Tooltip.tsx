"use client";

import { type ReactNode, useState } from "react";
import { cn } from "@/lib/cn";

export interface TooltipProps {
  content: ReactNode;
  children: ReactNode;
  side?: "top" | "bottom" | "left" | "right";
  className?: string;
}

const SIDE: Record<NonNullable<TooltipProps["side"]>, string> = {
  top: "bottom-full left-1/2 -translate-x-1/2 mb-1",
  bottom: "top-full left-1/2 -translate-x-1/2 mt-1",
  left: "right-full top-1/2 -translate-y-1/2 mr-1",
  right: "left-full top-1/2 -translate-y-1/2 ml-1",
};

/** Lightweight CSS-only tooltip; no positioning library. */
export function Tooltip({
  content,
  children,
  side = "top",
  className,
}: TooltipProps) {
  const [show, setShow] = useState(false);
  return (
    <span
      className={cn("relative inline-flex", className)}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
      onFocus={() => setShow(true)}
      onBlur={() => setShow(false)}
    >
      {children}
      {show && (
        <span
          role="tooltip"
          className={cn(
            "absolute z-50 whitespace-nowrap rounded-md border border-white/10",
            "bg-zinc-950 px-2 py-1 text-[10px] text-white/80 shadow-lg",
            "pointer-events-none",
            SIDE[side],
          )}
        >
          {content}
        </span>
      )}
    </span>
  );
}
