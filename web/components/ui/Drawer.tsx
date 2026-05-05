"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/cn";

export interface DrawerProps {
  open: boolean;
  onClose: () => void;
  side?: "right" | "left";
  width?: string;
  title?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}

export function Drawer({
  open,
  onClose,
  side = "right",
  width = "w-96",
  title,
  children,
  footer,
}: DrawerProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open || typeof window === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        className={cn(
          "absolute top-0 bottom-0 bg-surface-1 border-subtle flex flex-col shadow-2xl",
          side === "right" ? "right-0 border-l" : "left-0 border-r",
          width,
        )}
      >
        {title && (
          <div className="px-4 py-3 border-b border-subtle flex items-center justify-between">
            <h2 className="text-[11px] font-bold uppercase tracking-widest text-secondary">
              {title}
            </h2>
            <button
              aria-label="Close drawer"
              onClick={onClose}
              className="text-tertiary hover:text-secondary text-sm leading-none"
            >
              ×
            </button>
          </div>
        )}
        <div className="flex-1 overflow-auto px-4 py-3">{children}</div>
        {footer && (
          <div className="px-4 py-3 border-t border-subtle flex justify-end gap-2">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
