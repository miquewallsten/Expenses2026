"use client";

import { type ReactNode } from "react";
import { SlidersHorizontal } from "lucide-react";

interface WorkListPaneProps {
  title: string;
  children: ReactNode;
}

export default function WorkListPane({ title, children }: WorkListPaneProps) {
  return (
    <div className="flex h-full flex-col overflow-hidden border-r border-white/[0.07] bg-zinc-950">
      {/* Pinned header */}
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-white/[0.07] px-3">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-white/40">
          {title}
        </span>
        <button
          type="button"
          title="Filter / sort"
          className="flex h-5 w-5 items-center justify-center rounded text-white/20 transition-colors hover:bg-white/[0.05] hover:text-white/45"
        >
          <SlidersHorizontal className="h-3 w-3" />
        </button>
      </div>

      {/* Scrollable content */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {children}
      </div>
    </div>
  );
}
