"use client";

export const dynamic = "force-dynamic";

import React, { useEffect, useMemo, useState, useCallback } from "react";
import {
  Receipt, CheckSquare, Calculator, Clock, Archive, BarChart2, ShoppingCart,
  ClipboardList, BadgeCheck, CreditCard,
  ChevronLeft, ChevronRight, LayoutGrid,
  Settings, X, Sparkles,
  Building2, FileText, GitBranch, Users, Plug, Puzzle, ScrollText, Bell,
  type LucideIcon,
} from "lucide-react";
import { Suspense } from "react";
import { useTranslations } from "next-intl";
import { UserProvider } from "@/context/UserContext";
import { MyWorkProvider, useMyWorkContext } from "@/context/MyWorkContext";
import { PortalConfigProvider } from "@/context/PortalConfigContext";
import { useUserContext } from "@/context/UserContext";
import { AdminProvider } from "@/context/AdminContext";
import MyWorkSidebar from "@/components/my-work/MyWorkSidebar";
import MyWorkWorkspace from "@/components/my-work/MyWorkWorkspace";
import CopilotLauncher from "@/components/agent/CopilotLauncher";
import { CopilotSidebarProvider, useCopilotSidebar } from "@/context/CopilotSidebarContext";
import { NavCustomizationProvider } from "@/context/NavCustomizationContext";
import { useLayoutMode } from "@/hooks/useLayoutMode";
import { useAuthGuard } from "@/hooks/useAuthGuard";
import { useActivityTimeout } from "@/hooks/useActivityTimeout";
import SettingsModal from "@/components/shell/SettingsModal";
import ThemeToggle from "@/components/shell/ThemeToggle";

// ── Constants ─────────────────────────────────────────────────────────────────

const SIDEBAR_EXPANDED_W = 240;
const SIDEBAR_COLLAPSED_W = 48;

// ── Module icon map ───────────────────────────────────────────────────────────

const MOD_ICONS: Record<string, LucideIcon> = {
  Receipt, CheckSquare, Calculator, Clock, Archive, BarChart2, ShoppingCart,
  ClipboardList, BadgeCheck, CreditCard, Settings,
  Building2, FileText, GitBranch, Users, Plug, Puzzle, ScrollText, Bell,
};

function resolveIcon(name?: string): LucideIcon | null {
  return name ? (MOD_ICONS[name] ?? null) : null;
}

// ── Loading Spinner ──────────────────────────────────────────────────────────

function LoadingSpinner() {
  return (
    <div className="flex h-[100dvh] items-center justify-center bg-surface-0">
      <div className="flex flex-col items-center gap-4">
        <div className="relative">
          <div className="h-10 w-10 animate-spin rounded-xl border-2 border-accent border-t-transparent" />
          <div className="absolute inset-0 h-10 w-10 animate-pulse rounded-xl bg-accent-muted" />
        </div>
        <p className="text-xs text-tertiary animate-pulse">Cargando...</p>
      </div>
    </div>
  );
}

// ── Auth Guard ────────────────────────────────────────────────────────────────

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { loading, authenticated } = useAuthGuard();
  useActivityTimeout();
  if (loading || !authenticated) {
    return <LoadingSpinner />;
  }
  return <>{children}</>;
}

// ── Sidebar ───────────────────────────────────────────────────────────────────
// Clean, Linear-inspired. Collapsible 48px ↔ 240px.
// Module nav in body. Theme toggle + settings in footer.

function Sidebar({
  collapsed,
  onToggle,
  onOpenSettings,
}: {
  collapsed: boolean;
  onToggle: () => void;
  onOpenSettings: () => void;
}) {
  const { visibleModules, activeModule, setActiveModule } = useMyWorkContext();
  const tn = useTranslations("nav");

  return (
    <nav
      aria-label="Module navigation"
      className="flex h-full shrink-0 flex-col border-r border-subtle bg-surface-1 transition-[width] duration-200"
      style={{ width: collapsed ? SIDEBAR_COLLAPSED_W : SIDEBAR_EXPANDED_W }}
    >
      {/* Header: brand + toggle */}
      <div className={`flex h-10 shrink-0 items-center border-b border-subtle ${collapsed ? "justify-center" : "gap-2 px-3"}`}>
        {!collapsed && (
          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-accent/10">
            <LayoutGrid className="h-3.5 w-3.5 text-accent" />
          </div>
        )}
        {!collapsed && (
          <span className="truncate text-[11px] font-semibold uppercase tracking-wide text-secondary">
            {tn("myWork")}
          </span>
        )}
        <button
          type="button"
          onClick={onToggle}
          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted transition-colors hover:bg-surface-2 hover:text-secondary ${collapsed ? "" : "ml-auto"}`}
          aria-label={collapsed ? tn("expandNav") : tn("collapseNav")}
          title={collapsed ? tn("expandNav") : tn("collapseNav")}
        >
          {collapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
        </button>
      </div>

      {/* Module list */}
      <div className="min-h-0 flex-1 overflow-y-auto py-1">
        {collapsed ? <CollapsedModuleList /> : <MyWorkSidebar />}
      </div>

      {/* Footer: theme toggle + settings */}
      <div className={`shrink-0 border-t border-subtle ${collapsed ? "flex flex-col items-center gap-1 py-2" : "flex items-center gap-2 px-3 py-2"}`}>
        <ThemeToggle />
        <button
          type="button"
          onClick={onOpenSettings}
          className="flex h-7 w-7 items-center justify-center rounded text-secondary transition-colors hover:bg-surface-2 hover:text-primary"
          aria-label={tn("settings")}
          title={tn("settings")}
        >
          <Settings className="h-3.5 w-3.5" />
        </button>
      </div>
    </nav>
  );
}

// ── Collapsed module list (icons only) ────────────────────────────────────────

function CollapsedModuleList() {
  const { visibleModules, activeModule, setActiveModule } = useMyWorkContext();
  const t = useTranslations();
  return (
    <div className="flex flex-col items-center gap-0.5 px-1.5 py-0.5">
      {visibleModules.slice(0, 8).map((mod) => {
        const Icon = resolveIcon(mod.icon);
        const isActive = activeModule?.id === mod.id;
        const label = t(mod.label as any) || mod.label;
        return (
          <button
            key={mod.id}
            type="button"
            onClick={() => setActiveModule(mod.id)}
            aria-current={isActive ? "page" : undefined}
            title={label}
            className={`group relative flex h-8 w-8 items-center justify-center rounded-md text-muted transition-colors ${
              isActive ? "bg-accent/10 text-accent" : "hover:bg-surface-2 hover:text-secondary"
            }`}
          >
            {Icon ? <Icon className="h-3.5 w-3.5" /> : <span className="text-[9px] font-bold">{mod.label.charAt(0)}</span>}
            {isActive && <span className="absolute -left-1.5 top-1/2 h-3 w-0.5 -translate-y-1/2 rounded-r bg-accent" />}
          </button>
        );
      })}
    </div>
  );
}

// ── Mobile Bottom Bar ─────────────────────────────────────────────────────────
// Shows only the most-used module icons. Full nav in drawer.

function MobileBottomBar({
  onOpenNav,
}: {
  onOpenNav: () => void;
}) {
  const { visibleModules, activeModule, setActiveModule } = useMyWorkContext();
  const { open: copilotOpen, setOpen: setCopilotOpen } = useCopilotSidebar();
  const tn = useTranslations("nav");
  const t = useTranslations();

  const topModules = visibleModules.slice(0, 4);

  return (
    <nav
      aria-label="Quick navigation"
      className="flex shrink-0 items-center border-t border-subtle bg-surface-1 px-1"
      style={{ height: 52, paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      {topModules.map((mod) => {
        const Icon = resolveIcon(mod.icon);
        const isActive = activeModule?.id === mod.id;
        const label = t(mod.label as any) || mod.label;
        return (
          <button
            key={mod.id}
            type="button"
            onClick={() => setActiveModule(mod.id)}
            className={`flex flex-1 flex-col items-center justify-center gap-0.5 py-1 ${
              isActive ? "text-accent" : "text-muted"
            }`}
          >
            {Icon ? <Icon className="h-4 w-4" /> : <span className="text-[10px] font-bold">{label.charAt(0)}</span>}
            <span className="truncate text-[9px] font-medium leading-none">{label.length > 8 ? label.slice(0, 7) + "\u2026" : label}</span>
          </button>
        );
      })}

      {/* More modules */}
      <button
        type="button"
        onClick={onOpenNav}
        className="flex flex-1 flex-col items-center justify-center gap-0.5 py-1 text-muted"
      >
        <LayoutGrid className="h-4 w-4" />
        <span className="text-[9px] font-medium leading-none">{tn("myWork")}</span>
      </button>

      {/* Copilot toggle */}
      <button
        type="button"
        onClick={() => setCopilotOpen(!copilotOpen)}
        className={`flex flex-1 flex-col items-center justify-center gap-0.5 py-1 ${
          copilotOpen ? "text-accent" : "text-muted"
        }`}
      >
        <Sparkles className="h-4 w-4" />
        <span className="text-[9px] font-medium leading-none">AI</span>
      </button>
    </nav>
  );
}

// ── Mobile Nav Drawer ─────────────────────────────────────────────────────────

function MobileNavDrawer({
  open,
  onClose,
  onOpenSettings,
}: {
  open: boolean;
  onClose: () => void;
  onOpenSettings: () => void;
}) {
  const tn = useTranslations("nav");
  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 z-40 overlay-backdrop" onClick={onClose} />
      <div className="fixed inset-y-0 left-0 z-50 flex w-64 flex-col bg-surface-1 shadow-xl">
        <div className="flex h-10 shrink-0 items-center gap-2 border-b border-subtle px-3">
          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-accent/10">
            <LayoutGrid className="h-3.5 w-3.5 text-accent" />
          </div>
          <span className="text-[11px] font-semibold uppercase tracking-wide text-secondary">{tn("myWork")}</span>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto flex h-7 w-7 items-center justify-center rounded text-muted hover:bg-surface-2 hover:text-primary"
            aria-label={tn("collapseNav")}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <MyWorkSidebar onSelect={onClose} />
        </div>
        <div className="shrink-0 border-t border-subtle px-3 py-2">
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <button
              type="button"
              onClick={() => { onClose(); onOpenSettings(); }}
              className="flex h-7 w-7 items-center justify-center rounded text-secondary transition-colors hover:bg-surface-2 hover:text-primary"
              aria-label={tn("settings")}
            >
              <Settings className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

// ── Shell ─────────────────────────────────────────────────────────────────────

function MyWorkShell() {
  const user = useUserContext();
  const { isMobile, isTablet } = useLayoutMode();
  const copilot = useCopilotSidebar();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [navDrawerOpen, setNavDrawerOpen] = useState(false);

  const handleOpenSettings = useCallback(() => setSettingsOpen(true), []);

  const workspace = (
    <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <MyWorkWorkspace />
    </main>
  );

  // ── Mobile ──────────────────────────────────────────────────────────────────
  if (isMobile) {
    return (
      <div
        className="relative flex h-[100dvh] flex-col overflow-hidden bg-surface-0 text-primary"
        style={{ paddingTop: "var(--sai-t, 0px)", paddingBottom: "var(--sai-b, 0px)" }}
      >
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {workspace}
        </div>
        <MobileBottomBar onOpenNav={() => setNavDrawerOpen(true)} />
        <MobileNavDrawer
          open={navDrawerOpen}
          onClose={() => setNavDrawerOpen(false)}
          onOpenSettings={handleOpenSettings}
        />
        <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
        {copilot.open && <CopilotLauncher mode="sheet" />}
      </div>
    );
  }

  // ── Tablet ──────────────────────────────────────────────────────────────────
  if (isTablet) {
    return (
      <div
        className="relative flex h-[100dvh] overflow-hidden bg-surface-0 text-primary"
        style={{ paddingTop: "var(--sai-t, 0px)", paddingBottom: "var(--sai-b, 0px)" }}
      >
        <Sidebar collapsed={true} onToggle={() => {}} onOpenSettings={handleOpenSettings} />
        {workspace}
        <CopilotLauncher mode="column" />
        <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      </div>
    );
  }

  // ── Desktop ─────────────────────────────────────────────────────────────────
  return (
    <div className="relative flex h-[100dvh] overflow-hidden bg-surface-0 text-primary">
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed((v) => !v)}
        onOpenSettings={handleOpenSettings}
      />
      {workspace}
      <CopilotLauncher mode="column" />
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}

// ── Page component ────────────────────────────────────────────────────────────

function MyWorkPageInner() {
  const [initialModuleId, setInitialModuleId] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setInitialModuleId(params.get("module"));
  }, []);

  return (
    <UserProvider>
      <PortalConfigProvider>
        <MyWorkProvider initialModuleId={initialModuleId}>
          <AdminProvider>
            <CopilotSidebarProvider>
              <NavCustomizationProvider>
                <AuthGuard><MyWorkShell /></AuthGuard>
              </NavCustomizationProvider>
            </CopilotSidebarProvider>
          </AdminProvider>
        </MyWorkProvider>
      </PortalConfigProvider>
    </UserProvider>
  );
}

export default function MyWorkPage() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <MyWorkPageInner />
    </Suspense>
  );
}
