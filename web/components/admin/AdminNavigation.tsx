"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  Building, FileText, GitBranch, Users, Calculator, Plug, Settings,
  Menu, X, ScrollText, XOctagon, Sparkles, KeyRound, Download,
  Bell, Zap, ChevronDown, ChevronRight,
} from "lucide-react";

export type AdminSection =
  | "onboarding"
  | "company-setup"
  | "expense-policy"
  | "approval-workflow"
  | "users-roles"
  | "accounting-setup"
  | "integrations"
  | "platform-api"
  | "export"
  | "audit-log"
  | "cfdi-watcher"
  | "notifications";

interface SectionDef {
  id: AdminSection;
  labelKey: string;
  icon: React.ReactNode;
  badge?: "new" | "alert";
}

interface Props {
  activeSection: AdminSection;
  onSelect: (section: AdminSection) => void;
  onboardingCompleted?: boolean;
}

export default function AdminNavigation({ activeSection, onSelect, onboardingCompleted }: Props) {
  const t = useTranslations("admin");
  const [settingsOpen, setSettingsOpen] = useState(true);
  const [operationsOpen, setOperationsOpen] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Settings sections (configuration)
  const SETTINGS_SECTIONS: SectionDef[] = [
    { id: "onboarding", labelKey: "onboarding", icon: <Sparkles className="h-3.5 w-3.5" />, badge: "new" },
    { id: "company-setup", labelKey: "companySetup", icon: <Building className="h-3.5 w-3.5" /> },
    { id: "expense-policy", labelKey: "expensePolicy", icon: <FileText className="h-3.5 w-3.5" /> },
    { id: "approval-workflow", labelKey: "workflow", icon: <GitBranch className="h-3.5 w-3.5" /> },
    { id: "users-roles", labelKey: "usersRoles", icon: <Users className="h-3.5 w-3.5" /> },
    { id: "accounting-setup", labelKey: "accountingSetup", icon: <Calculator className="h-3.5 w-3.5" /> },
    { id: "integrations", labelKey: "integrations", icon: <Plug className="h-3.5 w-3.5" /> },
    { id: "platform-api", labelKey: "platformApi", icon: <KeyRound className="h-3.5 w-3.5" /> },
    { id: "export", labelKey: "export", icon: <Download className="h-3.5 w-3.5" /> },
  ];

  // Operations sections (day-to-day management)
  const OPERATIONS_SECTIONS: SectionDef[] = [
    { id: "audit-log", labelKey: "auditLog", icon: <ScrollText className="h-3.5 w-3.5" /> },
    { id: "cfdi-watcher", labelKey: "cfdiWatcher", icon: <XOctagon className="h-3.5 w-3.5" /> },
    { id: "notifications", labelKey: "notifications", icon: <Bell className="h-3.5 w-3.5" /> },
  ];

  // Filter out onboarding if completed
  const visibleSettings = onboardingCompleted
    ? SETTINGS_SECTIONS.filter((s) => s.id !== "onboarding")
    : SETTINGS_SECTIONS;

  const renderSection = (section: SectionDef) => {
    const isActive = activeSection === section.id;
    const isOnboarding = section.id === "onboarding";

    return (
      <li key={section.id}>
        <button
          type="button"
          onClick={() => {
            onSelect(section.id);
            setMobileOpen(false);
          }}
          className={`group relative flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-medium leading-none transition-all duration-200 ${
            isActive
              ? "bg-accent/10 text-accent"
              : isOnboarding
                ? "text-success/70 hover:bg-success/5 hover:text-success"
                : "text-secondary hover:bg-surface-2 hover:text-primary"
          }`}
        >
          {/* Active indicator bar */}
          {isActive && (
            <span className="absolute left-0 top-1/2 h-6 w-0.5 -translate-y-1/2 rounded-r-full bg-gradient-to-b from-accent via-accent to-accent-hover/50" />
          )}

          {/* Icon container with glow effect on active */}
          <span
            className={`relative flex h-6 w-6 shrink-0 items-center justify-center rounded-md transition-all duration-200 ${
              isActive
                ? "bg-accent text-white shadow-sm shadow-accent/30"
                : isOnboarding
                  ? "bg-success/10 text-success/70 group-hover:bg-success/15 group-hover:text-success"
                  : "bg-surface-2 text-muted group-hover:bg-surface-3 group-hover:text-secondary"
            }`}
          >
            {section.icon}
            {isActive && (
              <span className="absolute inset-0 rounded-md bg-accent/20 animate-pulse" style={{ animationDuration: "2s" }} />
            )}
          </span>

          <span className="truncate flex-1">{t(section.labelKey)}</span>

          {/* Badge for special sections */}
          {section.badge === "new" && !isActive && (
            <span className="shrink-0 rounded-full bg-success/15 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-widest text-success">
              New
            </span>
          )}
          {section.badge === "alert" && !isActive && (
            <span className="shrink-0 h-1.5 w-1.5 rounded-full bg-warning animate-pulse" />
          )}
        </button>
      </li>
    );
  };

  return (
    <>
      {/* Mobile toggle */}
      <div className="flex h-12 shrink-0 items-center border-b border-subtle bg-surface-1 px-4 md:hidden">
        <button
          type="button"
          onClick={() => setMobileOpen((v) => !v)}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-subtle bg-surface-2 text-secondary transition-colors hover:bg-surface-3 hover:text-primary"
        >
          {mobileOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
        </button>
        <span className="ml-3 text-xs font-semibold text-primary">
          {t("title")}
        </span>
      </div>

      {/* Nav panel */}
      <nav
        className={`shrink-0 flex-col border-r border-subtle bg-surface-1 transition-all ${
          mobileOpen ? "flex" : "hidden md:flex"
        }`}
        style={{ width: "220px" }}
        data-testid="admin-navigation"
      >
        {/* Header with gradient and AI accent */}
        <div className="relative flex h-14 shrink-0 items-center gap-2.5 border-b border-subtle px-4 overflow-hidden">
          {/* Gradient background */}
          <div className="absolute inset-0 bg-gradient-to-br from-surface-2 via-surface-1 to-accent/5" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--color-ai)/8),_transparent_50%)]" />

          {/* Logo container with subtle glow */}
          <div className="relative flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-accent via-accent-hover to-accent shadow-sm shadow-accent/25">
            <Settings className="h-4 w-4 text-white" />
            {/* Subtle glow ring */}
            <div className="absolute inset-0 rounded-lg ring-1 ring-white/10" />
          </div>
          <div className="relative flex flex-col">
            <span className="text-xs font-semibold text-primary">{t("title")}</span>
            <span className="text-[9px] text-muted tracking-wide">Configuration</span>
          </div>
        </div>

        {/* Settings Section */}
        <div className="border-b border-subtle">
          <button
            type="button"
            onClick={() => setSettingsOpen((v) => !v)}
            className="group flex w-full items-center justify-between px-3 py-2.5 text-[10px] font-bold uppercase tracking-widest text-muted/70 hover:text-secondary transition-colors"
          >
            <span className="flex items-center gap-1.5">
              <Zap className="h-3 w-3 text-ai/50" />
              {t("sectionSettings")}
            </span>
            {settingsOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          </button>
          {settingsOpen && (
            <ul className="space-y-0.5 py-1 px-2">
              {visibleSettings.map(renderSection)}
            </ul>
          )}
        </div>

        {/* Operations Section */}
        <div className="border-b border-subtle">
          <button
            type="button"
            onClick={() => setOperationsOpen((v) => !v)}
            className="group flex w-full items-center justify-between px-3 py-2.5 text-[10px] font-bold uppercase tracking-widest text-muted/70 hover:text-secondary transition-colors"
          >
            <span>{t("sectionOperations")}</span>
            {operationsOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          </button>
          {operationsOpen && (
            <ul className="space-y-0.5 py-1 px-2">
              {OPERATIONS_SECTIONS.map(renderSection)}
            </ul>
          )}
        </div>

        {/* AI Assistant Footer - Premium command center feel */}
        <div className="mt-auto border-t border-subtle p-3">
          <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-surface-2 via-surface-1 to-ai/5 p-3">
            {/* Subtle grid pattern */}
            <div className="absolute inset-0 opacity-[0.02]" style={{
              backgroundImage: "linear-gradient(var(--color-ai) 1px, transparent 1px), linear-gradient(90deg, var(--color-ai) 1px, transparent 1px)",
              backgroundSize: "12px 12px"
            }} />

            <div className="relative flex items-center gap-2 mb-1.5">
              <div className="flex h-5 w-5 items-center justify-center rounded bg-ai/20">
                <Zap className="h-3 w-3 text-ai" />
              </div>
              <span className="text-[10px] font-semibold text-primary">{t("quickActions")}</span>
            </div>
            <p className="relative text-[9px] text-muted leading-relaxed">{t("quickActionsDesc")}</p>
          </div>
        </div>
      </nav>
    </>
  );
}