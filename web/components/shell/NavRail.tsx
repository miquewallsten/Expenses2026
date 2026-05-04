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
      className={`flex shrink-0 flex-col overflow-hidden bg-surface-1 ${
        fullWidth
          ? "w-full"
          : `border-r border-subtle transition-[width] duration-200 ${collapsed ? "w-14" : "w-52"}`
      }`}
    >
      {/* Header bar — hidden when fullWidth and no portal items */}
      {!(fullWidth && groups.length === 0) && (
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-subtle px-2">
        {!collapsed && (
          logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`${process.env.NEXT_PUBLIC_API_BASE_URL}${logoUrl}`}
              alt=""
              className="h-5 w-5 shrink-0 rounded object-contain"
            />
          ) : (
            <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-accent-muted">
              <LayoutGrid className="h-3 w-3 text-accent" />
            </div>
          )
        )}
        {!collapsed && <span className="flex-1" />}
        {!hideToggle && (
          <button
            type="button"
            onClick={onToggle}
            title={collapsed ? t("expandNav") : t("collapseNav")}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-tertiary transition-colors hover:bg-surface-2 hover:text-secondary"
          >
            {collapsed
              ? <ChevronRight className="h-3.5 w-3.5" />
              : <ChevronLeft className="h-3.5 w-3.5" />
            }
          </button>
        )}
      </div>
      )}

      <div className={footerSlot ? "flex min-h-0 flex-1 flex-col overflow-hidden" : "min-h-0 flex-1 overflow-y-auto py-1.5"}>
        <div className={footerSlot ? "shrink-0 py-1.5" : undefined}>
          {groups.map(({ group, items: groupList }) => {
            const isOpen = openGroups[group] ?? true;
            return (
              <div key={group} className="mb-1">
                {!collapsed && (
                  <button
                    type="button"
                    onClick={() => toggleGroup(group)}
                    className="flex w-full items-center gap-1.5 px-3 py-1.5 text-left"
                  >
                    <ChevronDown
                      className={`h-2.5 w-2.5 shrink-0 text-muted transition-transform ${
                        isOpen ? "" : "-rotate-90"
                      }`}
                    />
                    <span className="truncate text-[9px] font-bold uppercase tracking-widest text-muted">
                      {groupLabel(group)}
                    </span>
                  </button>
                )}

                {(collapsed || isOpen) && (
                  <ul className={`space-y-0.5 ${collapsed ? "px-2" : "px-2.5"}`}>
                    {groupList.map((item) => (
                      <li key={item.key}>
                        <Link
                          href={item.href}
                          title={collapsed ? itemLabel(item) : undefined}
                          className={`group relative flex items-center gap-2.5 rounded py-1.5 text-xs font-medium leading-none transition-colors ${
                            collapsed ? "justify-center px-2" : "px-2.5"
                          } ${
                            item.active
                              ? "bg-accent-muted text-primary"
                              : "text-secondary hover:bg-surface-2 hover:text-primary"
                          }`}
                        >
                          {item.active && (
                            <span className="absolute left-0 top-1/2 h-3.5 w-0.5 -translate-y-1/2 rounded-r bg-accent" />
                          )}
                          <span
                            className={`flex h-5 w-5 shrink-0 items-center justify-center rounded text-[9px] font-bold uppercase tracking-wider transition-colors ${
                              item.active
                                ? "bg-accent-muted text-accent"
                                : "bg-surface-2 text-muted group-hover:bg-surface-3 group-hover:text-secondary"
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
            {groups.length > 0 && <div className="mx-2 shrink-0 border-t border-subtle" />}
            <div className="min-h-0 flex-1 overflow-y-auto">{footerSlot}</div>
          </>
        )}
      </div>

      {/* Help footer — hidden when fullWidth and no portal items */}
      {!(fullWidth && groups.length === 0) && (
      <div className={`shrink-0 border-t border-subtle py-2 ${collapsed ? "px-2" : "px-2.5"}`}>
        <Link
          href="/help"
          title={collapsed ? t("help") : undefined}
          className={`flex items-center gap-2.5 rounded text-xs font-medium text-muted transition-colors hover:bg-surface-2 hover:text-secondary ${
            collapsed ? "justify-center px-2 py-1.5" : "px-2.5 py-1.5"
          }`}
        >
          <HelpCircle className="h-3.5 w-3.5 shrink-0" />
          {!collapsed && <span className="truncate">{t("help")}</span>}
        </Link>
      </div>
      )}
    </nav>
  );
}