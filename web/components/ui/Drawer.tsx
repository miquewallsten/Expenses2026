"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";

export interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  side?: "left" | "right";
  width?: string;
}

export default function Drawer({
  open,
  onClose,
  title,
  children,
  side = "right",
  width = "max-w-md",
}: DrawerProps) {
  const [mounted, setMounted] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Only render the portal on the client — avoids hydration issues
  if (!mounted || !open) return null;

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true">
      {/* backdrop */}
      <div
        className="absolute inset-0 overlay-backdrop-blur"
        onClick={onClose}
      />
      {/* panel */}
      <div
        ref={panelRef}
        className={`absolute inset-y-0 ${side === "left" ? "left-0" : "right-0"} flex w-full ${width} flex-col border-${side === "left" ? "r" : "l"} border-default bg-surface-0 shadow-2xl`}
      >
        {title && (
          <header className="flex h-11 shrink-0 items-center gap-2 border-b border-default px-3">
            <span className="text-[11px] font-semibold text-secondary">{title}</span>
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
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
