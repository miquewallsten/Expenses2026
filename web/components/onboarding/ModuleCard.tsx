"use client";

import { Check, Receipt, Clock, ShoppingCart, BookOpen, Sparkles } from "lucide-react";
import type { ModuleType, ModuleDefinition } from "@/types/onboarding";

interface ModuleCardProps {
  module: ModuleDefinition;
  selected: boolean;
  onToggle: () => void;
}

const ICON_MAP: Record<ModuleType, React.ComponentType<{ className?: string }>> = {
  expenses: Receipt,
  timesheets: Clock,
  requests: ShoppingCart,
  accounting: BookOpen,
  ai: Sparkles,
};

export function ModuleCard({ module, selected, onToggle }: ModuleCardProps) {
  const Icon = ICON_MAP[module.type];

  return (
    <button
      type="button"
      onClick={onToggle}
      className={`group relative flex flex-col items-start rounded-lg border p-3 text-left transition-colors ${
        selected
          ? "border-indigo-500/40 bg-indigo-500/[0.06] text-white/90"
          : "border-white/[0.06] bg-white/[0.015] text-white/60 hover:border-white/[0.12] hover:bg-white/[0.03]"
      }`}
    >
      <div className="flex w-full items-start justify-between">
        <div
          className={`flex h-8 w-8 items-center justify-center rounded-lg ${
            selected ? "bg-indigo-500/20 text-indigo-300/80" : "bg-white/[0.04] text-white/40"
          }`}
        >
          <Icon className="h-4 w-4" />
        </div>
        <div
          className={`flex h-5 w-5 items-center justify-center rounded-full border text-[10px] ${
            selected
              ? "border-indigo-500/50 bg-indigo-500/25 text-indigo-200"
              : "border-white/[0.08] bg-transparent"
          }`}
        >
          {selected && <Check className="h-3 w-3" />}
        </div>
      </div>

      <h3 className="mt-2 text-[12px] font-medium">{module.name}</h3>
      <p className="mt-0.5 text-[10px] leading-relaxed text-white/45">{module.description}</p>
    </button>
  );
}