"use client";

import {
  Receipt, CheckSquare, Calculator, Clock, Archive, Download, CreditCard,
  type LucideIcon,
} from "lucide-react";
import { useMyWorkContext } from "@/context/MyWorkContext";

const ICON_MAP: Record<string, LucideIcon> = {
  Receipt,
  CheckSquare,
  Calculator,
  Clock,
  Archive,
  Download,
  CreditCard,
};

function resolveIcon(name: string | undefined): LucideIcon | null {
  return name ? (ICON_MAP[name] ?? null) : null;
}

interface MyWorkSidebarProps {
  onSelect?: () => void;
}

export default function MyWorkSidebar({ onSelect }: MyWorkSidebarProps) {
  const { visibleModules, activeModule, setActiveModule } = useMyWorkContext();

  if (!visibleModules.length) return null;

  return (
    <nav aria-label="Module navigation" className="flex flex-col gap-0.5 px-2 py-1.5">
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
            className={`group relative flex items-center gap-2.5 rounded py-1.5 px-2.5 text-left text-xs font-medium transition-colors ${
              isActive
                ? "bg-accent-muted text-primary"
                : "text-secondary hover:bg-surface-2 hover:text-primary"
            }`}
          >
            {isActive && (
              <span className="absolute left-0 top-1/2 h-3.5 w-0.5 -translate-y-1/2 rounded-r bg-accent" />
            )}
            {Icon && (
              <Icon
                className={`h-3.5 w-3.5 shrink-0 ${
                  isActive ? "text-accent" : "text-muted group-hover:text-secondary"
                }`}
                aria-hidden="true"
              />
            )}
            <span className="truncate">{mod.label}</span>
          </button>
        );
      })}
    </nav>
  );
}