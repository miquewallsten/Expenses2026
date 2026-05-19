"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  maxWidth?: string;
  /** Shorthand: "sm" | "md" | "lg" | "xl" | "2xl" → maps to max-w-{size} */
  size?: string;
  /** Optional footer area below the main content */
  footer?: ReactNode;
}

export default function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  maxWidth,
  size,
}: ModalProps) {
  const [mounted, setMounted] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const resolvedMaxWidth = maxWidth ?? (size ? `max-w-${size}` : "max-w-lg");

  useEffect(() => {
    setMounted(true);
  }, []);

  // Close on Escape key
  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  // Only render on client to avoid hydration issues
  if (!mounted || !open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" role="dialog" aria-modal="true">
      {/* backdrop */}
      <div
        className="absolute inset-0 overlay-backdrop-blur"
        onClick={onClose}
      />
      {/* panel */}
      <div
        ref={panelRef}
        className={`relative w-full ${resolvedMaxWidth} rounded-xl border border-default bg-surface-1 shadow-2xl`}
      >
        {title && (
          <header className="flex h-11 shrink-0 items-center gap-2 border-b border-default px-4">
            <span className="text-sm font-semibold text-primary">{title}</span>
            <button
              type="button"
              onClick={onClose}
              className="ml-auto flex h-6 w-6 items-center justify-center rounded text-muted hover:bg-surface-2 hover:text-primary"
              aria-label="Close"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </header>
        )}
        <div className="p-4">{children}</div>
        {footer && (
          <div className="border-t border-default px-4 py-3">{footer}</div>
        )}
      </div>
    </div>
  );
}
