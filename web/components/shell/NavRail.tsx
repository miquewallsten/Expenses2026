"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ChevronLeft, ChevronRight, ChevronDown,
  HelpCircle, Settings, LayoutGrid,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface NavRailItem {
  key: string;
  label: string;
  href: string;
  active?: boolean;
  icon?: string;
  group?: string;
}

interface NavRailProps {
  collapsed: boolean;
  onToggle: () => void;
  items: NavRailItem[];
  /**
   * When true the collapse/expand toggle button is hidden.
   * Used in tablet mode where the rail is pinned to icon-only.
   */
  hideToggle?: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const DEFAULT_GROUPS = ["Workspaces", "Operations", "Administration"];

function initials(label: string): string {
  return label
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

function groupItems(items: NavRailItem[]): { group: string; items: NavRailItem[] }[] {
  // Collect all groups in order, preserving DEFAULT_GROUPS order first
  const seen = new Map<string, NavRailItem[]>();

  // Seed default groups so they appear in order even if empty
  for (const g of DEFAULT_GROUPS) seen.set(g, []);

  for (const item of items) {
    const g = item.group ?? DEFAULT_GROUPS[1]; // default → "Operations"
    if (!seen.has(g)) seen.set(g, []);
    seen.get(g)!.push(item);
  }

  // Drop empty non-default groups; drop empty default groups too (cleaner)
  return Array.from(seen.entries())
    .filter(([, list]) => list.length > 0)
    .map(([group, list]) => ({ group, items: list }));
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function NavRail({ collapsed, onToggle, items, hideToggle = false }: NavRailProps) {
  // Track which groups are open; all open by default
  const groups = groupItems(items);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(groups.map(({ group }) => [group, true]))
  );

  const toggleGroup = (g: string) =>
    setOpenGroups((prev) => ({ ...prev, [g]: !prev[g] }));

  return (
    <nav
      className={`flex shrink-0 flex-col overflow-hidden border-r border-white/[0.06] bg-zinc-950 transition-[width] duration-200 ${
        collapsed ? "w-[72px]" : "w-[260px]"
      }`}
    >
      {/* ── Top control row ──────────────────────────────────────────── */}
      <div className="flex h-10 shrink-0 items-center gap-1.5 border-b border-white/[0.06] px-2">
        {/* App icon placeholder */}
        {!collapsed && (
          <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-indigo-600/30">
            <LayoutGrid className="h-3 w-3 text-indigo-300/80" />
          </div>
        )}
        {/* Spacer */}
        {!collapsed && <span className="flex-1" />}
        {/* Collapse / expand — hidden when hideToggle is set (e.g. tablet pinned mode) */}
        {!hideToggle && (
          <button
            type="button"
            onClick={onToggle}
            title={collapsed ? "Expand navigation" : "Collapse navigation"}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-white/22 transition-colors hover:bg-white/[0.05] hover:text-white/50"
          >
            {collapsed
              ? <ChevronRight className="h-3 w-3" />
              : <ChevronLeft className="h-3 w-3" />
            }
          </button>
        )}
      </div>

      {/* ── Grouped nav items ─────────────────────────────────────────── */}
      <div className="min-h-0 flex-1 overflow-y-auto py-2">
        {groups.map(({ group, items: groupList }) => {
          const isOpen = openGroups[group] ?? true;
          return (
            <div key={group} className="mb-1">
              {/* Group header — hidden when collapsed */}
              {!collapsed && (
                <button
                  type="button"
                  onClick={() => toggleGroup(group)}
                  className="flex w-full items-center gap-1.5 px-4 py-1.5 text-left"
                >
                  <ChevronDown
                    className={`h-2.5 w-2.5 shrink-0 text-white/18 transition-transform ${
                      isOpen ? "" : "-rotate-90"
                    }`}
                  />
                  <span className="truncate text-[9px] font-bold uppercase tracking-widest text-white/18">
                    {group}
                  </span>
                </button>
              )}

              {/* Items — collapsed: always show; expanded: show if group open */}
              {(collapsed || isOpen) && (
                <ul className={`space-y-px ${collapsed ? "px-2" : "px-2.5"}`}>
                  {groupList.map((item) => (
                    <li key={item.key}>
                      <Link
                        href={item.href}
                        title={collapsed ? item.label : undefined}
                        className={`group relative flex items-center gap-2.5 rounded py-1.5 text-[11px] font-medium leading-none transition-colors ${
                          collapsed ? "justify-center px-2" : "pl-3 pr-3"
                        } ${
                          item.active
                            ? "bg-indigo-600/[0.18] text-white"
                            : "text-white/38 hover:bg-white/[0.04] hover:text-white/65"
                        }`}
                      >
                        {/* Active left bar */}
                        {item.active && (
                          <span className="absolute left-0 top-1/2 h-3.5 w-0.5 -translate-y-1/2 rounded-r-full bg-indigo-400/70" />
                        )}

                        {/* Initials badge */}
                        <span
                          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded text-[8px] font-bold uppercase tracking-wider transition-colors ${
                            item.active
                              ? "bg-indigo-500/25 text-indigo-200"
                              : "bg-white/[0.04] text-white/30 group-hover:bg-white/[0.07] group-hover:text-white/50"
                          }`}
                        >
                          {initials(item.label)}
                        </span>

                        {/* Label */}
                        {!collapsed && (
                          <span className="truncate tracking-tight">{item.label}</span>
                        )}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Footer: Settings + Help ───────────────────────────────────── */}
      <div className={`shrink-0 space-y-px border-t border-white/[0.05] py-3 ${collapsed ? "px-2" : "px-2.5"}`}>
        <Link
          href="/settings"
          title={collapsed ? "Settings" : undefined}
          className={`flex items-center gap-2.5 rounded text-[11px] font-medium text-white/28 transition-colors hover:bg-white/[0.04] hover:text-white/55 ${
            collapsed ? "justify-center px-2 py-1.5" : "px-3 py-1.5"
          }`}
        >
          <Settings className="h-3.5 w-3.5 shrink-0 text-white/25" />
          {!collapsed && <span className="truncate">Settings</span>}
        </Link>
        <Link
          href="/help"
          title={collapsed ? "Help" : undefined}
          className={`flex items-center gap-2.5 rounded text-[11px] font-medium text-white/28 transition-colors hover:bg-white/[0.04] hover:text-white/55 ${
            collapsed ? "justify-center px-2 py-1.5" : "px-3 py-1.5"
          }`}
        >
          <HelpCircle className="h-3.5 w-3.5 shrink-0 text-white/25" />
          {!collapsed && <span className="truncate">Help</span>}
        </Link>
      </div>
    </nav>
  );
}
