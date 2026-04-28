"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import {
  ChevronLeft, ChevronRight, ChevronDown,
  HelpCircle, LayoutGrid,
} from "lucide-react";
import { useTranslations } from "next-intl";

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
  hideToggle?: boolean;
  /** Content rendered below nav items with a divider — used in merged-nav mode. */
  footerSlot?: ReactNode;
  /** When true, fills parent width instead of using fixed 72/260px. Used in merged-nav mode. */
  fullWidth?: boolean;
  /** Company logo URL — displayed in the header bar when expanded. */
  logoUrl?: string | null;
}

const DEFAULT_GROUPS = ["Workspaces", "Operations", "Administration"];

function initials(label: string): string {
  return label
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

function groupItems(items: NavRailItem[]): { group: string; items: NavRailItem[] }[] {
  const seen = new Map<string, NavRailItem[]>();
  for (const g of DEFAULT_GROUPS) seen.set(g, []);
  for (const item of items) {
    const g = item.group ?? DEFAULT_GROUPS[1];
    if (!seen.has(g)) seen.set(g, []);
    seen.get(g)!.push(item);
  }
  return Array.from(seen.entries())
    .filter(([, list]) => list.length > 0)
    .map(([group, list]) => ({ group, items: list }));
}

export default function NavRail({ collapsed, onToggle, items, hideToggle = false, footerSlot, fullWidth = false, logoUrl }: NavRailProps) {
  const t = useTranslations("nav");
  const groups = groupItems(items);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(groups.map(({ group }) => [group, true]))
  );

  const toggleGroup = (g: string) =>
    setOpenGroups((prev) => ({ ...prev, [g]: !prev[g] }));

  const groupLabel = (g: string) => {
    try { return t(`groups.${g}` as Parameters<typeof t>[0]); } catch { return g; }
  };

  const itemLabel = (item: NavRailItem) => {
    try { return t(item.key as Parameters<typeof t>[0]); } catch { return item.label; }
  };

  return (
    <nav
      className={`flex shrink-0 flex-col overflow-hidden bg-zinc-950 ${
        fullWidth
          ? "w-full"
          : `border-r border-white/[0.06] transition-[width] duration-200 ${collapsed ? "w-[72px]" : "w-[260px]"}`
      }`}
    >
      {/* Header bar — hidden when fullWidth and no portal items */}
      {!(fullWidth && groups.length === 0) && (
      <div className="flex h-10 shrink-0 items-center gap-1.5 border-b border-white/[0.06] px-2">
        {!collapsed && (
          logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`${process.env.NEXT_PUBLIC_API_BASE_URL}${logoUrl}`}
              alt=""
              className="h-5 w-5 shrink-0 rounded object-contain"
            />
          ) : (
            <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-indigo-600/30">
              <LayoutGrid className="h-3 w-3 text-indigo-300/80" />
            </div>
          )
        )}
        {!collapsed && <span className="flex-1" />}
        {!hideToggle && (
          <button
            type="button"
            onClick={onToggle}
            title={collapsed ? t("expandNav") : t("collapseNav")}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-white/22 transition-colors hover:bg-white/[0.05] hover:text-white/50"
          >
            {collapsed
              ? <ChevronRight className="h-3 w-3" />
              : <ChevronLeft className="h-3 w-3" />
            }
          </button>
        )}
      </div>
      )}

      <div className={footerSlot ? "flex min-h-0 flex-1 flex-col overflow-hidden" : "min-h-0 flex-1 overflow-y-auto py-2"}>
        <div className={footerSlot ? "shrink-0 py-2" : undefined}>
          {groups.map(({ group, items: groupList }) => {
            const isOpen = openGroups[group] ?? true;
            return (
              <div key={group} className="mb-1">
                {!collapsed && (
                  <button
                    type="button"
                    onClick={() => toggleGroup(group)}
                    className="flex w-full items-center gap-1.5 px-4 py-1.5 text-left"
                  >
                    <ChevronDown
                      className={`h-2.5 w-2.5 shrink-0 text-white/30 transition-transform ${
                        isOpen ? "" : "-rotate-90"
                      }`}
                    />
                    <span className="truncate text-[9px] font-bold uppercase tracking-widest text-white/30">
                      {groupLabel(group)}
                    </span>
                  </button>
                )}

                {(collapsed || isOpen) && (
                  <ul className={`space-y-px ${collapsed ? "px-2" : "px-2.5"}`}>
                    {groupList.map((item) => (
                      <li key={item.key}>
                        <Link
                          href={item.href}
                          title={collapsed ? itemLabel(item) : undefined}
                          className={`group relative flex items-center gap-2.5 rounded py-1.5 text-[11px] font-medium leading-none transition-colors ${
                            collapsed ? "justify-center px-2" : "pl-3 pr-3"
                          } ${
                            item.active
                              ? "bg-indigo-600/[0.18] text-white"
                              : "text-white/45 hover:bg-white/[0.04] hover:text-white/70"
                          }`}
                        >
                          {item.active && (
                            <span className="absolute left-0 top-1/2 h-3.5 w-0.5 -translate-y-1/2 rounded-r-full bg-indigo-400/70" />
                          )}
                          <span
                            className={`flex h-5 w-5 shrink-0 items-center justify-center rounded text-[9px] font-bold uppercase tracking-wider transition-colors ${
                              item.active
                                ? "bg-indigo-500/25 text-indigo-200"
                                : "bg-white/[0.04] text-white/30 group-hover:bg-white/[0.07] group-hover:text-white/50"
                            }`}
                          >
                            {initials(itemLabel(item))}
                          </span>
                          {!collapsed && (
                            <span className="truncate tracking-tight">{itemLabel(item)}</span>
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
        {footerSlot && (
          <>
            {groups.length > 0 && <div className="mx-2 shrink-0 border-t border-white/[0.06]" />}
            <div className="min-h-0 flex-1 overflow-y-auto">{footerSlot}</div>
          </>
        )}
      </div>

      {/* Settings/help footer — hidden when fullWidth and no portal items */}
      {!(fullWidth && groups.length === 0) && (
      <div className={`shrink-0 space-y-px border-t border-white/[0.05] py-3 ${collapsed ? "px-2" : "px-2.5"}`}>
        <Link
          href="/help"
          title={collapsed ? t("help") : undefined}
          className={`flex items-center gap-2.5 rounded text-[11px] font-medium text-white/28 transition-colors hover:bg-white/[0.04] hover:text-white/55 ${
            collapsed ? "justify-center px-2 py-1.5" : "px-3 py-1.5"
          }`}
        >
          <HelpCircle className="h-3.5 w-3.5 shrink-0 text-white/25" />
          {!collapsed && <span className="truncate">{t("help")}</span>}
        </Link>
      </div>
      )}
    </nav>
  );
}
