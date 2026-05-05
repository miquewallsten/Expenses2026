"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  Building, FileText, GitBranch, Users, Calculator, Plug, Settings,
  Menu, X, ScrollText, XOctagon, Sparkles, KeyRound, Download,
  Bell, Megaphone, ChevronDown, ChevronRight,
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
    { id: "onboarding", labelKey: "onboarding", icon: <Sparkles className="h-3.5 w-3.5" /> },
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
          className={`group relative flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-medium leading-none transition-all ${
            isActive
              ? "bg-accent-muted text-accent"
              : isOnboarding
                ? "text-success hover:bg-success-muted hover:text-success"
                : "text-secondary hover:bg-surface-2 hover:text-primary"
          }`}
        >
          {isActive && (
            <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-r bg-gradient-to-b from-accent to-accent-hover" />
          )}
          <span
            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md transition-all ${
              isActive
                ? "bg-accent text-white shadow-sm shadow-accent-glow"
                : isOnboarding
                  ? "bg-success-muted text-success group-hover:bg-success/20"
                  : "bg-surface-2 text-muted group-hover:bg-surface-3 group-hover:text-secondary"
            }`}
          >
            {section.icon}
          </span>
          <span className="truncate">{t(section.labelKey)}</span>
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
        {/* Header */}
        <div className="flex h-12 shrink-0 items-center gap-2 border-b border-subtle px-4 relative">
          <div className="absolute inset-0 bg-gradient-to-r from-accent-muted/30 via-transparent to-transparent opacity-50" />
          <div className="relative flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-accent to-accent-hover shadow-sm shadow-accent-glow">
            <Settings className="h-3.5 w-3.5 text-white" />
          </div>
          <span className="relative text-xs font-semibold text-primary">{t("title")}</span>
        </div>

        {/* Settings Section */}
        <div className="border-b border-subtle">
          <button
            type="button"
            onClick={() => setSettingsOpen((v) => !v)}
            className="flex w-full items-center justify-between px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-muted hover:text-secondary transition-colors"
          >
            <span>{t("sectionSettings")}</span>
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
            className="flex w-full items-center justify-between px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-muted hover:text-secondary transition-colors"
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

        {/* Quick Actions Footer */}
        <div className="mt-auto border-t border-subtle p-3">
          <div className="rounded-xl bg-gradient-to-r from-accent-muted/50 to-surface-2 p-3">
            <div className="flex items-center gap-2 mb-2">
              <Megaphone className="h-4 w-4 text-accent" />
              <span className="text-[10px] font-semibold text-primary">{t("quickActions")}</span>
            </div>
            <p className="text-[9px] text-tertiary">{t("quickActionsDesc")}</p>
          </div>
        </div>
      </nav>
    </>
  );
}