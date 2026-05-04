"use client";

import { type ReactNode } from "react";

interface DetailPaneProps {
  children: ReactNode;
  /** When true, renders with no padding and overflow-hidden for self-managed layouts */
  flush?: boolean;
}

export default function DetailPane({ children, flush = false }: DetailPaneProps) {
  return (
    <div className={`flex h-full flex-col overflow-hidden border-x border-subtle bg-surface-0 ${
      flush ? "" : ""
    }`}>
      <div className={flush ? "min-h-0 flex-1 overflow-hidden" : "min-h-0 flex-1 overflow-y-auto px-4 py-3"}>
        {children}
      </div>
    </div>
  );
}