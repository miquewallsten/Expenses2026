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
import AgentChat from "@/components/agent/AgentChat";
import { buildGlobalNav } from "@/lib/navigation";
import { useLayoutMode } from "@/hooks/useLayoutMode";
import { useAuthGuard } from "@/hooks/useAuthGuard";
import { apiCall } from "@/lib/api/client";
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

// ── Hero Header ────────────────────────────────────────────────────────────────

function HeroHeader({ userName }: { userName: string }) {
  const t = useTranslations("myWork.hero");
  const date = new Date();
  const hour = date.getHours();
  const greeting = hour < 12 ? t("morning") : hour < 18 ? t("afternoon") : t("evening");

  return (
    <header className="group relative overflow-hidden rounded-2xl border border-white/10 bg-surface-1 p-6 transition-all">
      {/* Subtle background "thing": A soft radial glow that tracks with the brand color */}
      <div className="absolute -right-24 -top-24 h-64 w-64 rounded-full bg-accent/5 blur-3xl transition-opacity group-hover:opacity-80" />
      <div className="absolute -left-12 -bottom-12 h-48 w-48 rounded-full bg-success/5 blur-3xl" />
      
      <div className="relative z-10">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-5">
            <div className="relative">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent/10 ring-1 ring-accent/20 transition-transform group-hover:scale-105">
                <Building className="h-7 w-7 text-accent" />
              </div>
              <div className="absolute -bottom-1 -right-1 h-5 w-5 rounded-lg bg-surface-2 p-1 ring-1 ring-white/10 shadow-lg">
                <Sparkles className="h-full w-full text-ai" />
              </div>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted">
                {greeting}, <span className="text-secondary">{userName}</span>
              </p>
              <h1 className="text-xl font-bold text-primary tracking-tight">
                {t("title")}
              </h1>
              <p className="text-[12px] text-tertiary">
                {t("subtitle")}
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <div className="flex flex-col items-end gap-1">
              <div className="flex items-center gap-1.5 rounded-full bg-success/10 px-3 py-1 border border-success/30">
                <TrendingUp className="h-3 w-3 text-success" />
                <span className="text-[9px] font-bold uppercase tracking-wide text-success">
                  {t("onTrack")}
                </span>
              </div>
              <span className="text-[9px] font-medium text-muted uppercase tracking-tighter">Everything clear</span>
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
    { id: "overview", label: "Overview", icon: LayoutGrid },
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
      {/* Header row */}
      <div className="relative flex h-12 shrink-0 items-center gap-2 border-b border-white/5 px-3 overflow-hidden">
        <div className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent/10 transition-colors">
          {showAdminNav ? (
            <Settings className="h-4 w-4 text-accent" />
          ) : (
            <LayoutGrid className="h-4 w-4 text-accent" />
          )}
        </div>
        {!collapsed && (
          <div className="relative flex-1 min-w-0">
            <span className="block truncate text-xs font-bold tracking-tight text-primary">
              {showAdminNav ? tn("admin") : tn("myWork")}
            </span>
            <span className="block text-[9px] font-bold uppercase tracking-widest text-accent">Lola</span>
          </div>
        )}
        <button
          type="button"
          onClick={onToggle}
          title={collapsed ? ts("expandSidebar") : ts("collapseSidebar")}
          className="relative ml-auto flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted transition-all hover:bg-surface-2 hover:text-secondary focus-visible:ring-1 focus-visible:ring-accent/30"
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
                            ? "bg-accent/10 text-accent"
                            : "text-secondary hover:bg-surface-2 hover:text-primary"
                        }`}
                      >
                        {isActive && (
                          <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-r-full bg-accent" />
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
                            ? "bg-accent/10 text-accent"
                            : "text-secondary hover:bg-surface-2 hover:text-primary"
                        }`}
                      >
                        {isActive && (
                          <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-r-full bg-accent" />
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
                          ? "bg-accent/10 text-accent"
                          : "text-secondary hover:bg-surface-2 hover:text-primary"
                      }`}
                    >
                      {isActive && (
                        <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-r-full bg-accent" />
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
  const t = useTranslations("myWork.ai");

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [navDrawerOpen, setNavDrawerOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [aiPanelOpen, setAiPanelOpen] = useState(false);
  const [aiPanelWidth, setAiPanelWidth] = useState(400);
  const [isResizing, setIsResizing] = useState(false);

  // Handle panel resizing
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      const newWidth = window.innerWidth - e.clientX;
      // Min width 24 (just the rail), max width 800
      setAiPanelWidth(Math.max(24, Math.min(newWidth, 800)));
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    } else {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    }

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizing]);

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

  // Company ID for AI chat
  const companyId = user.companyId;

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
        onClick={() => setAiPanelOpen(v => !v)}
        title="Lola"
        aria-label="Lola"
        className={`pointer-events-auto flex h-8 w-8 items-center justify-center rounded-xl border border-white/5 transition-all shadow-sm ${
          aiPanelOpen ? "bg-accent text-white" : "bg-surface-2/80 backdrop-blur-sm text-secondary hover:bg-surface-3 hover:text-primary"
        }`}
      >
        <Bot className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={() => setSettingsOpen(true)}
        title={tnShell("settings")}
        aria-label={tnShell("settings")}
        className="pointer-events-auto flex h-8 w-8 items-center justify-center rounded-xl border border-white/5 bg-surface-2/80 backdrop-blur-sm text-secondary shadow-sm transition-all hover:border-default hover:bg-surface-3 hover:text-primary"
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
              onClick={() => setAiPanelOpen(v => !v)}
              title="Lola"
              aria-label="Lola"
              className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${
                aiPanelOpen ? "bg-accent text-white" : "text-muted hover:bg-surface-2 hover:text-primary"
              }`}
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

      {/* AI Assistant Panel (Fixed/Resizable on right for Desktop) */}
      {aiPanelOpen && companyId && (
        <>
          {/* Resize handle */}
          <div
            className={`group relative z-50 w-1 cursor-col-resize bg-transparent transition-colors hover:bg-accent/40 ${isResizing ? "bg-accent/60" : ""}`}
            onMouseDown={() => setIsResizing(true)}
          >
            <div className="absolute inset-y-0 -left-1 -right-1" />
          </div>
          
          <aside 
            className={`relative flex flex-col border-l border-white/5 bg-surface-1 shadow-sm transition-opacity duration-300 ${aiPanelWidth < 30 ? "items-center py-4" : ""}`}
            style={{ width: aiPanelWidth }}
          >
            {aiPanelWidth >= 160 ? (
              <>
                <header className="flex h-11 shrink-0 items-center gap-2 border-b border-white/5 px-3">
                  <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-accent/10 transition-colors">
                    <Bot className="h-3.5 w-3.5 text-accent" />
                  </div>
                  <div className="flex flex-col leading-tight">
                    <span className="text-[11px] font-bold tracking-tight text-primary">Lola</span>
                    <span className="text-[9px] font-bold uppercase tracking-widest text-muted">Intelligent Ops</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setAiPanelOpen(false);
                      setAiPanelWidth(400); // Reset for next open
                    }}
                    className="ml-auto flex h-6 w-6 items-center justify-center rounded text-muted transition-colors hover:bg-surface-2 hover:text-secondary"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </header>
                <div className="min-h-0 flex-1 overflow-hidden">
                  <AgentChat
                    companyId={companyId}
                    persona={activeModule?.id === "admin" ? "admin-config" : "employee"}
                    greeting={t("greeting")}
                    allowUpload={false}
                    streaming
                    variant="page"
                  />
                </div>
              </>
            ) : (
              /* Rail state */
              <button
                onClick={() => setAiPanelWidth(400)}
                className="group flex flex-col items-center gap-4"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-accent/10 text-accent transition-all group-hover:bg-accent group-hover:text-white">
                  <Bot className="h-4 w-4" />
                </div>
                <div className="flex items-center gap-1.5 [writing-mode:vertical-lr]">
                  <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted group-hover:text-accent">Expand Lola</span>
                </div>
              </button>
            )}
          </aside>
        </>
      )}

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