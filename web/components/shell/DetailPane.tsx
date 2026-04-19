"use client";

import { type ReactNode } from "react";

interface DetailPaneProps {
  children: ReactNode;
}

export default function DetailPane({ children }: DetailPaneProps) {
  return (
    <div className="flex h-full flex-col overflow-hidden border-x border-white/[0.06] bg-zinc-950">
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {children}
      </div>
    </div>
  );
}
