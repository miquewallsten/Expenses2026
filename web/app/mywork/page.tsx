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

const SIDEBAR_W = 200;
const SIDEBAR_COL_W = 56;

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
      className={`flex shrink-0 flex-col ${height === "full" ? "h-[100dvh]" : "overflow-hidden"} border-r border-subtle bg-surface-1 transition-[width] duration-200`}
      style={{ width: collapsed ? SIDEBAR_COL_W : SIDEBAR_W }}
    >
      {/* Header row */}
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-subtle px-2">
        <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-accent-muted">
          <LayoutGrid className="h-3 w-3 text-accent" />
        </div>
        {!collapsed && (
          <span className="flex-1 truncate text-[10px] font-bold uppercase tracking-widest text-secondary">
            {tn("myWork")}
          </span>
        )}
        <button
          type="button"
          onClick={onToggle}
          title={collapsed ? ts("expandSidebar") : ts("collapseSidebar")}
          className="ml-auto flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted transition-colors hover:bg-surface-2 hover:text-secondary"
        >
          {collapsed
            ? <ChevronRight className="h-3.5 w-3.5" />
            : <ChevronLeft className="h-3.5 w-3.5" />}
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto h-full">
        {/* Module nav */}
        <div className="py-1.5">
          {!collapsed && (
            <p className="px-3 pb-0.5 pt-1 text-[9px] font-bold uppercase tracking-widest text-muted">
              {tn("modules")}
            </p>
          )}
          <ul className={`space-y-0.5 ${collapsed ? "px-2" : "px-2.5"}`}>
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
                    className={`group relative flex w-full items-center gap-2.5 rounded py-1.5 text-xs font-medium leading-none transition-colors ${
                      collapsed ? "justify-center px-2" : "px-2.5"
                    } ${
                      isActive
                        ? "bg-accent-muted text-primary"
                        : "text-secondary hover:bg-surface-2 hover:text-primary"
                    }`}
                  >
                    {isActive && (
                      <span className="absolute left-0 top-1/2 h-3.5 w-0.5 -translate-y-1/2 rounded-r bg-accent" />
                    )}
                    {Icon ? (
                      <Icon
                        className={`h-3.5 w-3.5 shrink-0 ${
                          isActive ? "text-accent" : "text-muted group-hover:text-secondary"
                        }`}
                        aria-hidden="true"
                      />
                    ) : (
                      <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded text-[9px] font-bold uppercase tracking-wider ${
                        isActive ? "bg-accent-muted text-accent" : "bg-surface-2 text-muted"
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
          <div className="mt-1 border-t border-subtle py-1.5">
            {!collapsed && (
              <p className="px-3 pb-0.5 pt-1 text-[9px] font-bold uppercase tracking-widest text-muted">
                {tn("portals")}
              </p>
            )}
            <ul className={`space-y-0.5 ${collapsed ? "px-2" : "px-2.5"}`}>
              {globalNavItems.map((item) => (
                <li key={item.key}>
                  <Link
                    href={item.href}
                    title={collapsed ? item.label : undefined}
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
                    <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded text-[9px] font-bold uppercase tracking-wider ${
                      item.active ? "bg-accent-muted text-accent" : "bg-surface-2 text-muted"
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

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [navDrawerOpen, setNavDrawerOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

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

  const workspace = (
    <div className="min-h-0 flex-1 overflow-hidden">
      <MyWorkWorkspace />
    </div>
  );

  const topRightToolbar = (
    <div className="pointer-events-none absolute right-2 top-2 z-20 flex items-center gap-1">
      <button
        type="button"
        onClick={() => setSettingsOpen(true)}
        title={tnShell("settings")}
        aria-label={tnShell("settings")}
        className="pointer-events-auto flex h-7 w-7 items-center justify-center rounded border border-subtle bg-surface-2 text-secondary shadow-sm transition-colors hover:border-default hover:bg-surface-3 hover:text-primary"
      >
        <Settings className="h-3.5 w-3.5" />
      </button>
    </div>
  );

  // ── Mobile ─────────────────────────────────────────────────────────────────
  if (isMobile) {
    return (
      <div
        className="flex h-[100dvh] flex-col overflow-hidden bg-surface-0 text-primary"
        style={{ paddingTop: "var(--sai-t)", paddingBottom: "var(--sai-b)" }}
      >
        <header className="flex h-10 shrink-0 items-center border-b border-subtle bg-surface-1 px-3">
          <button
            type="button"
            onClick={() => setNavDrawerOpen(true)}
            aria-label={tsShell("openNavigation")}
            className="flex h-7 w-7 items-center justify-center rounded text-secondary transition-colors hover:bg-surface-2 hover:text-primary"
          >
            <Menu className="h-4 w-4" />
          </button>
          <span className="flex-1 px-2 text-[11px] font-semibold uppercase tracking-wide text-primary truncate">
            {activeModule?.label ?? tnShell("myWork")}
          </span>
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            aria-label={tnShell("settings")}
            className="flex h-7 w-7 items-center justify-center rounded text-muted transition-colors hover:bg-surface-2 hover:text-primary"
          >
            <Settings className="h-4 w-4" />
          </button>
        </header>

        <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {workspace}
        </main>

        {navDrawerOpen && (
          <>
            <div
              className="fixed inset-0 z-40 bg-black/50 backdrop-blur-[1px]"
              onClick={() => setNavDrawerOpen(false)}
              aria-hidden="true"
            />
            <div
              className="animate-slide-in-right fixed inset-y-0 left-0 z-50 flex w-[min(280px,85vw)] flex-col overflow-hidden bg-surface-1 shadow-xl"
              style={{ paddingTop: "var(--sai-t)", paddingBottom: "var(--sai-b)" }}
            >
              <div className="flex h-10 shrink-0 items-center justify-between border-b border-subtle px-3">
                <span className="text-[10px] font-bold uppercase tracking-widest text-secondary">{tnShell("myWork")}</span>
                <button
                  type="button"
                  onClick={() => setNavDrawerOpen(false)}
                  aria-label={tsShell("closeNavigation")}
                  className="flex h-7 w-7 items-center justify-center rounded text-muted hover:bg-surface-2 hover:text-primary"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto">
                <MyWorkSidebar onSelect={() => setNavDrawerOpen(false)} />
                {globalNavItems.length > 0 && (
                  <div className="mt-1 border-t border-subtle py-1.5">
                    <p className="px-3 pb-0.5 pt-1 text-[9px] font-bold uppercase tracking-widest text-muted">
                      {tnShell("portals")}
                    </p>
                    <ul className="space-y-0.5 px-2.5">
                      {globalNavItems.map((item) => (
                        <li key={item.key}>
                          <Link
                            href={item.href}
                            onClick={() => setNavDrawerOpen(false)}
                            className="flex items-center gap-2.5 rounded px-2.5 py-1.5 text-xs font-medium text-secondary transition-colors hover:bg-surface-2 hover:text-primary"
                          >
                            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-surface-2 text-[9px] font-bold uppercase tracking-wider text-muted">
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
        className="relative flex h-[100dvh] overflow-hidden bg-surface-0 text-primary"
        style={{ paddingTop: "var(--sai-t)", paddingBottom: "var(--sai-b)" }}
      >
        <UnifiedSidebar
          globalNavItems={globalNavItems}
          collapsed={true}
          onToggle={() => {}}
        />

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
    <div className="relative flex h-[100dvh] overflow-hidden bg-surface-0 text-primary">

      <UnifiedSidebar
        globalNavItems={globalNavItems}
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed((v) => !v)}
        height="full"
      />

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {workspace}
      </div>

      {topRightToolbar}
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}

// ── Page component ─────────────────────────────────────────────────────────────

function MyWorkPageInner() {
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
      <div className="flex h-[100dvh] items-center justify-center bg-surface-0">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-subtle border-t-accent" />
      </div>
    }>
      <MyWorkPageInner />
    </Suspense>
  );
}