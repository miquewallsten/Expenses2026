"use client";

import {
  Receipt, CheckSquare, Calculator, Clock, Archive, Download,
  type LucideIcon,
} from "lucide-react";
import { useMyWorkContext } from "@/context/MyWorkContext";

// ── Icon resolver ─────────────────────────────────────────────────────────────
//
// Modules store icon names as plain strings so the registry stays free of
// React imports.  Resolve them here, at the rendering boundary.

const ICON_MAP: Record<string, LucideIcon> = {
  Receipt,
  CheckSquare,
  Calculator,
  Clock,
  Archive,
  Download,
};

function resolveIcon(name: string | undefined): LucideIcon | null {
  return name ? (ICON_MAP[name] ?? null) : null;
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface MyWorkSidebarProps {
  /**
   * Called after the user selects a module.  AppShell passes `closeDrawer`
   * here when rendering in the mobile drawer so the overlay dismisses
   * automatically.  On desktop/tablet the prop is a no-op (default).
   */
  onSelect?: () => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function MyWorkSidebar({ onSelect }: MyWorkSidebarProps) {
  const { visibleModules, activeModule, setActiveModule } = useMyWorkContext();

  if (!visibleModules.length) return null;

  return (
    <nav aria-label="Module navigation" className="flex flex-col gap-px px-1.5 py-1.5">
      {visibleModules.map((mod) => {
        const Icon = resolveIcon(mod.icon);
        const isActive = activeModule?.id === mod.id;

        return (
          <button
            key={mod.id}
            type="button"
            onClick={() => {
              setActiveModule(mod.id);
              onSelect?.();
            }}
            aria-current={isActive ? "page" : undefined}
            className={`flex min-h-[44px] items-center gap-3 rounded px-2.5 py-2 text-left text-sm font-medium transition-colors md:min-h-0 md:gap-2.5 md:py-1.5 md:text-[11px] ${
              isActive
                ? "bg-white/[0.08] text-white/80"
                : "text-white/35 hover:bg-white/[0.04] hover:text-white/55"
            }`}
          >
            {Icon && (
              <Icon
                className="h-4 w-4 shrink-0 md:h-3.5 md:w-3.5"
                aria-hidden="true"
              />
            )}
            {mod.label}
          </button>
        );
      })}
    </nav>
  );
}
