"use client";

export const dynamic = "force-dynamic";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Receipt, CheckSquare, Calculator, Clock, Archive, Download, BarChart2, ShoppingCart,
  ClipboardList, BadgeCheck, CreditCard,
  ChevronLeft, ChevronRight, LayoutGrid,
  Menu, Settings, X,
  type LucideIcon,
} from "lucide-react";
import { Suspense } from "react";
import { useTranslations } from "next-intl";
import { UserProvider } from "@/context/UserContext";
import { MyWorkProvider, useMyWorkContext } from "@/context/MyWorkContext";
import { useUserContext } from "@/context/UserContext";
import MyWorkSidebar from "@/components/my-work/MyWorkSidebar";
import MyWorkWorkspace from "@/components/my-work/MyWorkWorkspace";
import { buildGlobalNav } from "@/lib/navigation";
import { useLayoutMode } from "@/hooks/useLayoutMode";
import { useAuthGuard } from "@/hooks/useAuthGuard";
import SettingsModal from "@/components/shell/SettingsModal";
import type { NavRailItem } from "@/components/shell/NavRail";

// ── Constants ─────────────────────────────────────────────────────────────────

const SIDEBAR_W     = 192;   // expanded
const SIDEBAR_COL_W = 48;    // collapsed (icon-only)

// ── Module icon map ───────────────────────────────────────────────────────────

const MOD_ICONS: Record<string, LucideIcon> = {
  Receipt, CheckSquare, Calculator, Clock, Archive, Download, BarChart2, ShoppingCart,
  ClipboardList, BadgeCheck, CreditCard, Settings,
};

function resolveIcon(name?: string): LucideIcon | null {
  return name ? (MOD_ICONS[name] ?? null) : null;
}

function initials(label: string): string {
  return label.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("");
}

// ── Unified sidebar ────────────────────────────────────────────────────────────
//
// Combines module navigation (My Expenses, My Approvals, …) and cross-portal
// links (other portals) into a single collapsible column.  Replaces the
// previous NavRail + workList two-column combination.

function UnifiedSidebar({
  globalNavItems,
  collapsed,
  onToggle,
  onSelect,
  height,
}: {
  globalNavItems: NavRailItem[];
  collapsed: boolean;
  onToggle: () => void;
  onSelect?: () => void;
  height?: "full";
}) {
  const { visibleModules, activeModule, setActiveModule } = useMyWorkContext();
  const tn = useTranslations("nav");
  const ts = useTranslations("shell");

  return (
    <nav
      className={`flex shrink-0 flex-col ${height === "full" ? "h-[100dvh]" : "overflow-hidden"} border-r border-white/[0.06] bg-zinc-950 transition-[width] duration-200`}
      style={{ width: collapsed ? SIDEBAR_COL_W : SIDEBAR_W }}
    >
      {/* Header row */}
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-white/[0.06] px-2">
        <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-indigo-600/30">
          <LayoutGrid className="h-3 w-3 text-indigo-300/80" />
        </div>
        {!collapsed && (
          <span className="flex-1 truncate text-[10px] font-bold uppercase tracking-widest text-white/50">
            {tn("myWork")}
          </span>
        )}
        <button
          type="button"
          onClick={onToggle}
          title={collapsed ? ts("expandSidebar") : ts("collapseSidebar")}
          className="ml-auto flex h-5 w-5 shrink-0 items-center justify-center rounded text-white/22 transition-colors hover:bg-white/[0.05] hover:text-white/50"
        >
          {collapsed
            ? <ChevronRight className="h-3 w-3" />
            : <ChevronLeft className="h-3 w-3" />}
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto h-full">
        {/* Module nav */}
        <div className="py-1.5">
          {!collapsed && (
            <p className="px-4 pb-0.5 pt-1 text-[9px] font-bold uppercase tracking-widest text-white/18">
              {tn("modules")}
            </p>
          )}
          <ul className={`space-y-px ${collapsed ? "px-1.5" : "px-2"}`}>
            {visibleModules.map((mod) => {
              const Icon = resolveIcon(mod.icon);
              const isActive = activeModule?.id === mod.id;
              return (
                <li key={mod.id}>
                  <button
                    type="button"
                    title={collapsed ? mod.label : undefined}
                    onClick={() => { setActiveModule(mod.id); onSelect?.(); }}
                    aria-current={isActive ? "page" : undefined}
                    className={`group relative flex w-full items-center gap-2.5 rounded py-1.5 text-[11px] font-medium leading-none transition-colors ${
                      collapsed ? "justify-center px-2" : "px-3"
                    } ${
                      isActive
                        ? "bg-indigo-600/[0.18] text-white"
                        : "text-white/38 hover:bg-white/[0.04] hover:text-white/65"
                    }`}
                  >
                    {isActive && (
                      <span className="absolute left-0 top-1/2 h-3.5 w-0.5 -translate-y-1/2 rounded-r-full bg-indigo-400/70" />
                    )}
                    {Icon ? (
                      <Icon
                        className={`h-3.5 w-3.5 shrink-0 ${
                          isActive ? "text-indigo-300" : "text-white/30 group-hover:text-white/55"
                        }`}
                        aria-hidden="true"
                      />
                    ) : (
                      <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded text-[8px] font-bold uppercase tracking-wider ${
                        isActive ? "bg-indigo-500/25 text-indigo-200" : "bg-white/[0.04] text-white/30"
                      }`}>
                        {initials(mod.label)}
                      </span>
                    )}
                    {!collapsed && <span className="truncate">{mod.label}</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        {/* Cross-portal links */}
        {globalNavItems.length > 0 && (
          <div className="mt-1 border-t border-white/[0.05] py-1.5">
            {!collapsed && (
              <p className="px-4 pb-0.5 pt-1 text-[9px] font-bold uppercase tracking-widest text-white/18">
                {tn("portals")}
              </p>
            )}
            <ul className={`space-y-px ${collapsed ? "px-1.5" : "px-2"}`}>
              {globalNavItems.map((item) => (
                <li key={item.key}>
                  <Link
                    href={item.href}
                    title={collapsed ? item.label : undefined}
                    className={`group relative flex items-center gap-2.5 rounded py-1.5 text-[11px] font-medium leading-none transition-colors ${
                      collapsed ? "justify-center px-2" : "px-3"
                    } ${
                      item.active
                        ? "bg-indigo-600/[0.18] text-white"
                        : "text-white/28 hover:bg-white/[0.04] hover:text-white/50"
                    }`}
                  >
                    {item.active && (
                      <span className="absolute left-0 top-1/2 h-3.5 w-0.5 -translate-y-1/2 rounded-r-full bg-indigo-400/70" />
                    )}
                    <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded text-[8px] font-bold uppercase tracking-wider ${
                      item.active ? "bg-indigo-500/25 text-indigo-200" : "bg-white/[0.04] text-white/25"
                    }`}>
                      {initials(item.label)}
                    </span>
                    {!collapsed && <span className="truncate tracking-tight">{item.label}</span>}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

    </nav>
  );
}

// ── Shell ──────────────────────────────────────────────────────────────────────

function MyWorkShell() {
  useAuthGuard();
  const { effectiveConfig, activeModule } = useMyWorkContext();
  const user = useUserContext();
  const { isMobile, isTablet, isDesktop } = useLayoutMode();
  const tnShell = useTranslations("nav");
  const tsShell = useTranslations("shell");

  // Desktop: sidebar starts expanded
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Mobile overlay
  const [navDrawerOpen, setNavDrawerOpen] = useState(false);

  // Settings modal (gear icon — mirrors other portals' TopBar)
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Close nav drawer when viewport grows past mobile
  useEffect(() => {
    if (!isMobile) setNavDrawerOpen(false);
  }, [isMobile]);

  const globalNavItems = useMemo(() => {
    const enabledModules = effectiveConfig?.derived.enabled_modules ?? [];
    return buildGlobalNav({
      role: user.role,
      enabledModuleKeys: enabledModules,
      permissionKeys: user.permissionKeys,
      currentPortal: "employee",
    }).filter((item) => item.key !== "employee");
  }, [user.role, user.permissionKeys, effectiveConfig]);

  // ── Workspace wrapper (same as AppShell detailFlush) ──────────────────────
  const workspace = (
    <div className="min-h-0 flex-1 overflow-hidden">
      <MyWorkWorkspace />
    </div>
  );

  // ── Floating top-right toolbar (gear — opens shared SettingsModal) ────────
  const topRightToolbar = (
    <div className="pointer-events-none absolute right-2 top-1.5 z-20 flex items-center gap-1">
      <button
        type="button"
        onClick={() => setSettingsOpen(true)}
        title={tnShell("settings")}
        aria-label={tnShell("settings")}
        className="pointer-events-auto flex h-7 w-7 items-center justify-center rounded border border-white/[0.08] bg-zinc-900/70 text-white/40 shadow-sm transition-colors hover:border-white/[0.18] hover:bg-white/[0.06] hover:text-white/75 backdrop-blur-sm"
      >
        <Settings className="h-3.5 w-3.5" />
      </button>
    </div>
  );

  // ── Mobile ─────────────────────────────────────────────────────────────────
  if (isMobile) {
    return (
      <div
        className="flex h-[100dvh] flex-col overflow-hidden bg-zinc-950 text-white"
        style={{ paddingTop: "var(--sai-t)", paddingBottom: "var(--sai-b)" }}
      >
        {/* Top bar */}
        <header className="flex h-11 shrink-0 items-center border-b border-white/[0.07] bg-zinc-950 px-2">
          <button
            type="button"
            onClick={() => setNavDrawerOpen(true)}
            aria-label={tsShell("openNavigation")}
            className="flex h-8 w-8 items-center justify-center rounded text-white/40 transition-colors hover:bg-white/[0.06] hover:text-white/65"
          >
            <Menu className="h-4 w-4" />
          </button>
          <span className="flex-1 px-2 text-[10px] font-bold uppercase tracking-widest text-white/55 truncate">
            {activeModule?.label ?? tnShell("myWork")}
          </span>
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            aria-label={tnShell("settings")}
            className="flex h-8 w-8 items-center justify-center rounded text-white/35 transition-colors hover:bg-white/[0.06] hover:text-white/65"
          >
            <Settings className="h-4 w-4" />
          </button>
        </header>

        {/* Workspace */}
        <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {workspace}
        </main>

        {/* Nav drawer */}
        {navDrawerOpen && (
          <>
            <div
              className="fixed inset-0 z-40 bg-black/60 backdrop-blur-[1px]"
              onClick={() => setNavDrawerOpen(false)}
              aria-hidden="true"
            />
            <div
              className="fixed inset-y-0 left-0 z-50 flex w-[min(280px,85vw)] flex-col overflow-hidden bg-zinc-950 shadow-2xl"
              style={{ paddingTop: "var(--sai-t)", paddingBottom: "var(--sai-b)" }}
            >
              <div className="flex h-11 shrink-0 items-center justify-between border-b border-white/[0.07] px-4">
                <span className="text-[10px] font-bold uppercase tracking-widest text-white/45">{tnShell("myWork")}</span>
                <button
                  type="button"
                  onClick={() => setNavDrawerOpen(false)}
                  aria-label={tsShell("closeNavigation")}
                  className="flex h-8 w-8 items-center justify-center rounded text-white/30 hover:bg-white/[0.06] hover:text-white/65"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto">
                {/* Module nav */}
                <MyWorkSidebar onSelect={() => setNavDrawerOpen(false)} />
                {/* Cross-portal links */}
                {globalNavItems.length > 0 && (
                  <div className="mt-1 border-t border-white/[0.05] py-1.5">
                    <p className="px-4 pb-0.5 pt-1 text-[9px] font-bold uppercase tracking-widest text-white/18">
                      {tnShell("portals")}
                    </p>
                    <ul className="space-y-px px-2">
                      {globalNavItems.map((item) => (
                        <li key={item.key}>
                          <Link
                            href={item.href}
                            onClick={() => setNavDrawerOpen(false)}
                            className="flex items-center gap-3 rounded px-3 py-2 text-sm font-medium text-white/35 transition-colors hover:bg-white/[0.04] hover:text-white/55"
                          >
                            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-white/[0.04] text-[8px] font-bold uppercase tracking-wider text-white/25">
                              {initials(item.label)}
                            </span>
                            {item.label}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
        <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      </div>
    );
  }

  // ── Tablet ──────────────────────────────────────────────────────────────────
  if (isTablet) {
    return (
      <div
        className="relative flex h-[100dvh] overflow-hidden bg-zinc-950 text-white"
        style={{ paddingTop: "var(--sai-t)", paddingBottom: "var(--sai-b)" }}
      >
        {/* Icon-only sidebar */}
        <UnifiedSidebar
          globalNavItems={globalNavItems}
          collapsed={true}
          onToggle={() => {}}
        />

        {/* Workspace */}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {workspace}
        </div>

        {topRightToolbar}
        <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      </div>
    );
  }

  // ── Desktop ─────────────────────────────────────────────────────────────────
  return (
    <div className="relative flex h-[100dvh] overflow-hidden bg-zinc-950 text-white">

      {/* Unified sidebar — collapsible */}
      <UnifiedSidebar
        globalNavItems={globalNavItems}
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed((v) => !v)}
        height="full"
      />

      {/* Workspace */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {workspace}
      </div>

      {topRightToolbar}
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

function MyWorkPageInner() {
  // Avoid useSearchParams — it de-opts SSR and causes hydration mismatches in
  // Next.js App Router when combined with client-side layout branching.
  const [initialModuleId, setInitialModuleId] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setInitialModuleId(params.get("module"));
  }, []);

  return (
    <UserProvider>
      <MyWorkProvider initialModuleId={initialModuleId}>
        <MyWorkShell />
      </MyWorkProvider>
    </UserProvider>
  );
}

export default function MyWorkPage() {
  return (
    <Suspense fallback={
      <div className="flex h-[100dvh] items-center justify-center bg-zinc-950">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-white/10 border-t-indigo-400/80" />
      </div>
    }>
      <MyWorkPageInner />
    </Suspense>
  );
}
