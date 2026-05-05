"use client";

export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Receipt, CheckSquare, Calculator, Clock, Archive, Download, BarChart2, ShoppingCart,
  ClipboardList, BadgeCheck, CreditCard, Sparkles,
  ChevronLeft, ChevronRight, LayoutGrid, Bot, MessageSquare,
  Menu, Settings, X, TrendingUp, Bell,
  Building, FileText, GitBranch, Users, Plug, KeyRound, ScrollText, XOctagon,
  type LucideIcon,
} from "lucide-react";
import { Suspense } from "react";
import { useTranslations } from "next-intl";
import { UserProvider } from "@/context/UserContext";
import { MyWorkProvider, useMyWorkContext } from "@/context/MyWorkContext";
import { useUserContext } from "@/context/UserContext";
import { AdminProvider, useAdminContext, type AdminSection } from "@/context/AdminContext";
import MyWorkSidebar from "@/components/my-work/MyWorkSidebar";
import MyWorkWorkspace from "@/components/my-work/MyWorkWorkspace";
import { buildGlobalNav } from "@/lib/navigation";
import { useLayoutMode } from "@/hooks/useLayoutMode";
import { useAuthGuard } from "@/hooks/useAuthGuard";
import SettingsModal from "@/components/shell/SettingsModal";
import type { NavRailItem } from "@/components/shell/NavRail";

// ── Constants ─────────────────────────────────────────────────────────────────

const SIDEBAR_W = 240;
const SIDEBAR_COL_W = 64;

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

// ── AI Assistant Dock ───────────────────────────────────────────────────────────

function AIAssistantDock({ collapsed, onExpand }: { collapsed: boolean; onExpand: () => void }) {
  const t = useTranslations("myWork.ai");

  if (collapsed) {
    return (
      <button
        onClick={onExpand}
        className="group flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-ai to-accent shadow-lg shadow-ai-glow transition-all hover:scale-105"
        title={t("openAssistant")}
      >
        <Bot className="h-5 w-5 text-white" />
        <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-success animate-pulse" />
      </button>
    );
  }

  return (
    <div className="flex items-center gap-3 rounded-xl bg-gradient-to-r from-ai-muted to-accent-muted p-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-ai to-accent shadow-md shadow-ai-glow">
        <Bot className="h-4 w-4 text-white" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-ai">
          {t("assistant")}
        </p>
        <p className="truncate text-[9px] text-tertiary">
          {t("ready")}
        </p>
      </div>
      <button
        onClick={onExpand}
        className="flex h-7 w-7 items-center justify-center rounded-md bg-surface-2 text-muted transition-colors hover:bg-surface-3 hover:text-secondary"
      >
        <MessageSquare className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

// ── Hero Header ────────────────────────────────────────────────────────────────

function HeroHeader({ userName }: { userName: string }) {
  const t = useTranslations("myWork.hero");
  const date = new Date();
  const hour = date.getHours();
  const greeting = hour < 12 ? t("morning") : hour < 18 ? t("afternoon") : t("evening");

  return (
    <header className="hero overflow-hidden rounded-2xl p-6">
      <div className="hero-glow hero-glow-accent" />
      <div className="hero-glow hero-glow-ai" />
      <div className="hero-content relative z-10">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-medium text-secondary mb-1">
              {greeting}, <span className="text-gradient">{userName}</span>
            </p>
            <h1 className="text-2xl font-semibold text-primary tracking-tight">
              {t("title")}
            </h1>
            <p className="text-xs text-tertiary mt-1">
              {t("subtitle")}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 rounded-lg bg-surface-2/50 px-3 py-1.5 backdrop-blur-sm border border-subtle">
              <TrendingUp className="h-3.5 w-3.5 text-success" />
              <span className="text-[10px] font-medium text-secondary">
                {t("onTrack")}
              </span>
            </div>
          </div>
        </div>

        {/* Quick stats */}
        <div className="mt-4 grid grid-cols-3 gap-3">
          <div className="rounded-xl bg-surface-2/40 backdrop-blur-sm border border-subtle p-3">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent-muted">
                <Receipt className="h-3.5 w-3.5 text-accent" />
              </div>
              <div>
                <p className="text-lg font-semibold text-primary">3</p>
                <p className="text-[9px] text-muted uppercase tracking-wide">Pending</p>
              </div>
            </div>
          </div>
          <div className="rounded-xl bg-surface-2/40 backdrop-blur-sm border border-subtle p-3">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-success-muted">
                <CheckSquare className="h-3.5 w-3.5 text-success" />
              </div>
              <div>
                <p className="text-lg font-semibold text-primary">12</p>
                <p className="text-[9px] text-muted uppercase tracking-wide">This Week</p>
              </div>
            </div>
          </div>
          <div className="rounded-xl bg-surface-2/40 backdrop-blur-sm border border-subtle p-3">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-ai-muted animate-glow-ai">
                <Sparkles className="h-3.5 w-3.5 text-ai" />
              </div>
              <div>
                <p className="text-lg font-semibold text-primary">AI</p>
                <p className="text-[9px] text-muted uppercase tracking-wide">Ready</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}

// ── Unified Sidebar ────────────────────────────────────────────────────────────

function UnifiedSidebar({
  globalNavItems,
  collapsed,
  onToggle,
  onSelect,
  height,
  onAIExpand,
  showAdminNav,
}: {
  globalNavItems: NavRailItem[];
  collapsed: boolean;
  onToggle: () => void;
  onSelect?: () => void;
  height?: "full";
  onAIExpand: () => void;
  showAdminNav?: boolean;
}) {
  const { visibleModules, activeModule, setActiveModule } = useMyWorkContext();
  // Always call hook unconditionally, use value when showAdminNav is true
  const adminContext = useAdminContext();
  const tn = useTranslations("nav");
  const ts = useTranslations("shell");
  const ta = useTranslations("admin");

  // Admin navigation sections
  const ADMIN_SETTINGS_SECTIONS: { id: AdminSection; label: string; icon: LucideIcon }[] = [
    { id: "company-setup", label: ta("companySetup.title"), icon: Building },
    { id: "expense-policy", label: ta("expensePolicy"), icon: FileText },
    { id: "approval-workflow", label: ta("workflow"), icon: GitBranch },
    { id: "users-roles", label: ta("usersRoles"), icon: Users },
    { id: "accounting-setup", label: ta("accountingSetup.title"), icon: Calculator },
    { id: "integrations", label: ta("integrationsLabel"), icon: Plug },
    { id: "platform-api", label: ta("platformApiLabel"), icon: KeyRound },
    { id: "export", label: ta("exportLabel"), icon: Download },
  ];
  const ADMIN_OPS_SECTIONS: { id: AdminSection; label: string; icon: LucideIcon }[] = [
    { id: "audit-log", label: ta("auditLog.title"), icon: ScrollText },
    { id: "cfdi-watcher", label: ta("cfdiWatcher.title"), icon: XOctagon },
    { id: "notifications", label: ta("notificationsLabel"), icon: Bell },
  ];

  return (
    <nav
      className={`flex shrink-0 flex-col ${height === "full" ? "h-[100dvh]" : "overflow-hidden"} border-r border-subtle bg-surface-1 transition-[width] duration-300`}
      style={{ width: collapsed ? SIDEBAR_COL_W : SIDEBAR_W }}
    >
      {/* Header row with gradient accent */}
      <div className="relative flex h-12 shrink-0 items-center gap-2 border-b border-subtle px-3 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-accent-muted/30 via-transparent to-ai-muted/20 opacity-50" />
        <div className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-accent to-accent-hover shadow-md shadow-accent-glow">
          {showAdminNav ? (
            <Settings className="h-4 w-4 text-white" />
          ) : (
            <LayoutGrid className="h-4 w-4 text-white" />
          )}
        </div>
        {!collapsed && (
          <div className="relative flex-1 min-w-0">
            <span className="block truncate text-xs font-semibold tracking-tight text-primary">
              {showAdminNav ? tn("admin") : tn("myWork")}
            </span>
            <span className="block text-[9px] text-muted">OpsFlow</span>
          </div>
        )}
        <button
          type="button"
          onClick={onToggle}
          title={collapsed ? ts("expandSidebar") : ts("collapseSidebar")}
          className="relative ml-auto flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted transition-all hover:bg-surface-2 hover:text-secondary"
        >
          {collapsed
            ? <ChevronRight className="h-4 w-4" />
            : <ChevronLeft className="h-4 w-4" />}
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto h-full">
        {showAdminNav ? (
          /* Admin navigation */
          <>
            <div className="py-2 px-2">
              {!collapsed && (
                <p className="px-2 pb-1.5 pt-1 text-[9px] font-bold uppercase tracking-widest text-muted">
                  {ta("sectionSettings")}
                </p>
              )}
              <ul className="space-y-1">
                {ADMIN_SETTINGS_SECTIONS.map((section) => {
                  const isActive = adminContext?.activeSection === section.id;
                  return (
                    <li key={section.id}>
                      <button
                        type="button"
                        title={collapsed ? section.label : undefined}
                        onClick={() => adminContext?.setActiveSection(section.id)}
                        className={`group relative flex w-full items-center gap-2.5 rounded-xl py-2 text-xs font-medium leading-none transition-all ${
                          collapsed ? "justify-center px-2" : "px-3"
                        } ${
                          isActive
                            ? "bg-accent-muted text-accent shadow-sm"
                            : "text-secondary hover:bg-surface-2 hover:text-primary"
                        }`}
                      >
                        {isActive && (
                          <span className="absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r bg-gradient-to-b from-accent to-accent-hover" />
                        )}
                        <section.icon className={`h-4 w-4 shrink-0 transition-transform group-hover:scale-110 ${
                          isActive ? "text-accent" : "text-muted group-hover:text-secondary"
                        }`} />
                        {!collapsed && <span className="truncate">{section.label}</span>}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
            <div className="border-t border-subtle py-2 px-2">
              {!collapsed && (
                <p className="px-2 pb-1.5 pt-1 text-[9px] font-bold uppercase tracking-widest text-muted">
                  {ta("sectionOperations")}
                </p>
              )}
              <ul className="space-y-1">
                {ADMIN_OPS_SECTIONS.map((section) => {
                  const isActive = adminContext?.activeSection === section.id;
                  return (
                    <li key={section.id}>
                      <button
                        type="button"
                        title={collapsed ? section.label : undefined}
                        onClick={() => adminContext?.setActiveSection(section.id)}
                        className={`group relative flex w-full items-center gap-2.5 rounded-xl py-2 text-xs font-medium leading-none transition-all ${
                          collapsed ? "justify-center px-2" : "px-3"
                        } ${
                          isActive
                            ? "bg-accent-muted text-accent shadow-sm"
                            : "text-secondary hover:bg-surface-2 hover:text-primary"
                        }`}
                      >
                        {isActive && (
                          <span className="absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r bg-gradient-to-b from-accent to-accent-hover" />
                        )}
                        <section.icon className={`h-4 w-4 shrink-0 transition-transform group-hover:scale-110 ${
                          isActive ? "text-accent" : "text-muted group-hover:text-secondary"
                        }`} />
                        {!collapsed && <span className="truncate">{section.label}</span>}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          </>
        ) : (
          /* Module nav */
          <div className="py-2 px-2">
            {!collapsed && (
              <p className="px-2 pb-1.5 pt-1 text-[9px] font-bold uppercase tracking-widest text-muted">
                {tn("modules")}
              </p>
            )}
            <ul className="space-y-1">
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
                      className={`group relative flex w-full items-center gap-2.5 rounded-xl py-2 text-xs font-medium leading-none transition-all ${
                        collapsed ? "justify-center px-2" : "px-3"
                      } ${
                        isActive
                          ? "bg-accent-muted text-accent shadow-sm"
                          : "text-secondary hover:bg-surface-2 hover:text-primary"
                      }`}
                    >
                      {isActive && (
                        <span className="absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r bg-gradient-to-b from-accent to-accent-hover" />
                      )}
                      {Icon ? (
                        <Icon
                          className={`h-4 w-4 shrink-0 transition-transform group-hover:scale-110 ${
                            isActive ? "text-accent" : "text-muted group-hover:text-secondary"
                          }`}
                          aria-hidden="true"
                        />
                      ) : (
                        <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-[9px] font-bold uppercase tracking-wider transition-transform group-hover:scale-110 ${
                          isActive ? "bg-accent text-white" : "bg-surface-2 text-muted group-hover:bg-surface-3"
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
        )}

        {/* Cross-portal links - only show when not on admin */}
        {!showAdminNav && globalNavItems.length > 0 && (
          <div className="mt-1 border-t border-subtle py-2 px-2">
            {!collapsed && (
              <p className="px-2 pb-1.5 pt-1 text-[9px] font-bold uppercase tracking-widest text-muted">
                {tn("portals")}
              </p>
            )}
            <ul className="space-y-1">
              {globalNavItems.map((item) => (
                <li key={item.key}>
                  <Link
                    href={item.href}
                    title={collapsed ? item.label : undefined}
                    className={`group relative flex items-center gap-2.5 rounded-xl py-2 text-xs font-medium leading-none transition-all ${
                      collapsed ? "justify-center px-2" : "px-3"
                    } ${
                      item.active
                        ? "bg-accent-muted text-accent"
                        : "text-secondary hover:bg-surface-2 hover:text-primary"
                    }`}
                  >
                    {item.active && (
                      <span className="absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r bg-gradient-to-b from-accent to-accent-hover" />
                    )}
                    <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-[9px] font-bold uppercase tracking-wider transition-transform group-hover:scale-110 ${
                      item.active ? "bg-accent text-white" : "bg-surface-2 text-muted group-hover:bg-surface-3"
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

      {/* AI Assistant Dock at bottom */}
      <div className="shrink-0 border-t border-subtle p-3">
        <AIAssistantDock collapsed={collapsed} onExpand={onAIExpand} />
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
  const [aiPanelOpen, setAiPanelOpen] = useState(false);

  // Defer admin check until after hydration to avoid mismatch
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

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

  // Admin module shows admin navigation in sidebar
  const isAdminModule = mounted && activeModule?.id === "admin";

  const workspace = (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {/* Hero header at top of workspace - hide for Admin (has its own nav) */}
      {!isMobile && !isAdminModule && <div className="px-4 pt-4 pb-2"><HeroHeader userName={user.displayName || "User"} /></div>}
      <div className={`min-h-0 flex-1 overflow-hidden ${isAdminModule ? "" : "px-4 pb-4"}`}>
        <MyWorkWorkspace />
      </div>
    </div>
  );

  const topRightToolbar = (
    <div className="pointer-events-none absolute right-3 top-3 z-20 flex items-center gap-2">
      <button
        type="button"
        onClick={() => setAiPanelOpen(true)}
        title="AI Assistant"
        aria-label="AI Assistant"
        className="pointer-events-auto flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-ai to-accent text-white shadow-lg shadow-ai-glow transition-transform hover:scale-105"
      >
        <Bot className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={() => setSettingsOpen(true)}
        title={tnShell("settings")}
        aria-label={tnShell("settings")}
        className="pointer-events-auto flex h-8 w-8 items-center justify-center rounded-xl border border-subtle bg-surface-2/80 backdrop-blur-sm text-secondary shadow-sm transition-all hover:border-default hover:bg-surface-3 hover:text-primary"
      >
        <Settings className="h-4 w-4" />
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
        <header className="flex h-12 shrink-0 items-center border-b border-subtle bg-surface-1 px-3">
          <button
            type="button"
            onClick={() => setNavDrawerOpen(true)}
            aria-label={tsShell("openNavigation")}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-secondary transition-colors hover:bg-surface-2 hover:text-primary"
          >
            <Menu className="h-4 w-4" />
          </button>
          <div className="flex-1 px-3">
            <span className="block text-[10px] font-semibold uppercase tracking-wide text-secondary">
              {tnShell("myWork")}
            </span>
            <span className="block text-xs font-medium text-primary truncate">
              {activeModule?.label ?? "..."}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setAiPanelOpen(true)}
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-ai to-accent text-white shadow-md shadow-ai-glow"
            >
              <Bot className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              aria-label={tnShell("settings")}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-primary"
            >
              <Settings className="h-4 w-4" />
            </button>
          </div>
        </header>

        <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {workspace}
        </main>

        {navDrawerOpen && (
          <>
            <div
              className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
              onClick={() => setNavDrawerOpen(false)}
              aria-hidden="true"
            />
            <div
              className="animate-slide-in-right fixed inset-y-0 left-0 z-50 flex w-[min(300px,85vw)] flex-col overflow-hidden bg-surface-1 shadow-xl"
              style={{ paddingTop: "var(--sai-t)", paddingBottom: "var(--sai-b)" }}
            >
              <div className="flex h-12 shrink-0 items-center justify-between border-b border-subtle px-4">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-accent to-accent-hover shadow-md shadow-accent-glow">
                    <LayoutGrid className="h-4 w-4 text-white" />
                  </div>
                  <span className="text-xs font-semibold text-primary">{tnShell("myWork")}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setNavDrawerOpen(false)}
                  aria-label={tsShell("closeNavigation")}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-primary"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto">
                <MyWorkSidebar onSelect={() => setNavDrawerOpen(false)} />
                {globalNavItems.length > 0 && (
                  <div className="mt-2 border-t border-subtle py-2 px-3">
                    <p className="px-1 pb-1.5 pt-1 text-[9px] font-bold uppercase tracking-widest text-muted">
                      {tnShell("portals")}
                    </p>
                    <ul className="space-y-1">
                      {globalNavItems.map((item) => (
                        <li key={item.key}>
                          <Link
                            href={item.href}
                            onClick={() => setNavDrawerOpen(false)}
                            className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-medium text-secondary transition-colors hover:bg-surface-2 hover:text-primary"
                          >
                            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-[9px] font-bold uppercase tracking-wider text-muted">
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
              {/* AI dock in mobile drawer */}
              <div className="shrink-0 border-t border-subtle p-3">
                <AIAssistantDock collapsed={false} onExpand={() => { setNavDrawerOpen(false); setAiPanelOpen(true); }} />
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
          onAIExpand={() => setAiPanelOpen(true)}
          showAdminNav={isAdminModule}
        />

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {workspace}
        </div>

        {!isAdminModule && topRightToolbar}
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
        onAIExpand={() => setAiPanelOpen(true)}
        showAdminNav={isAdminModule}
      />

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {workspace}
      </div>

      {!isAdminModule && topRightToolbar}
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
        <AdminProvider>
          <MyWorkShell />
        </AdminProvider>
      </MyWorkProvider>
    </UserProvider>
  );
}

export default function MyWorkPage() {
  return (
    <Suspense fallback={
      <div className="flex h-[100dvh] items-center justify-center bg-surface-0">
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <div className="h-10 w-10 animate-spin rounded-xl border-2 border-accent border-t-transparent" />
            <div className="absolute inset-0 h-10 w-10 animate-pulse rounded-xl bg-accent-muted" />
          </div>
          <p className="text-xs text-tertiary animate-pulse">Loading...</p>
        </div>
      </div>
    }>
      <MyWorkPageInner />
    </Suspense>
  );
}