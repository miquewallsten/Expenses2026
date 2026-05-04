"use client";

import { useState } from "react";
import {
  Building,
  FileText,
  GitBranch,
  Users,
  Calculator,
  Plug,
  Settings,
  Menu,
  X,
  Bot,
  ScrollText,
  XOctagon,
  Sparkles,
  KeyRound,
  Route,
  Download,
} from "lucide-react";

export type AdminSection =
  | "company-setup"
  | "expense-policy"
  | "approval-workflow"
  | "users-roles"
  | "accounting-setup"
  | "integrations"
  | "ai-agent"
  | "audit-log"
  | "cfdi-watcher"
  | "onboarding"
  | "platform-api"
  | "routing-rules"
  | "export"
  | "advanced-settings";

interface SectionDef {
  id: AdminSection;
  label: string;
  icon: React.ReactNode;
}

const SECTIONS: SectionDef[] = [
  { id: "company-setup", label: "Company Setup", icon: <Building className="h-3.5 w-3.5" /> },
  { id: "expense-policy", label: "Expense Policy", icon: <FileText className="h-3.5 w-3.5" /> },
  { id: "approval-workflow", label: "Approval Workflow", icon: <GitBranch className="h-3.5 w-3.5" /> },
  { id: "users-roles", label: "Users & Roles", icon: <Users className="h-3.5 w-3.5" /> },
  { id: "accounting-setup", label: "Accounting Setup", icon: <Calculator className="h-3.5 w-3.5" /> },
  { id: "integrations", label: "Integrations", icon: <Plug className="h-3.5 w-3.5" /> },
  { id: "ai-agent", label: "AI Agent", icon: <Bot className="h-3.5 w-3.5" /> },
  { id: "audit-log", label: "Audit Log", icon: <ScrollText className="h-3.5 w-3.5" /> },
  { id: "cfdi-watcher", label: "CFDI Watcher", icon: <XOctagon className="h-3.5 w-3.5" /> },
  { id: "onboarding", label: "Onboarding", icon: <Sparkles className="h-3.5 w-3.5" /> },
  { id: "platform-api", label: "Platform API", icon: <KeyRound className="h-3.5 w-3.5" /> },
  { id: "routing-rules", label: "Routing Rules", icon: <Route className="h-3.5 w-3.5" /> },
  { id: "export", label: "Export Data", icon: <Download className="h-3.5 w-3.5" /> },
  { id: "advanced-settings", label: "Advanced Settings", icon: <Settings className="h-3.5 w-3.5" /> },
];

interface Props {
  activeSection: AdminSection;
  onSelect: (section: AdminSection) => void;
}

export default function AdminNavigation({ activeSection, onSelect }: Props) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      {/* Mobile toggle */}
      <div className="flex h-10 shrink-0 items-center border-b border-subtle bg-surface-1 px-3 md:hidden">
        <button
          type="button"
          onClick={() => setMobileOpen((v) => !v)}
          className="flex h-7 w-7 items-center justify-center rounded-md text-tertiary transition-all hover:bg-surface-3 hover:text-primary active:scale-95"
        >
          {mobileOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
        </button>
        <span className="ml-2 text-[11px] font-semibold text-[var(--text-primary)]">
          {SECTIONS.find((s) => s.id === activeSection)?.label ?? "Admin"}
        </span>
      </div>

      {/* Nav panel */}
      <nav
        className={`shrink-0 flex-col border-r border-subtle bg-surface-1 transition-all ${
          mobileOpen ? "flex" : "hidden md:flex"
        }`}
        style={{ width: "240px" }}
        data-testid="admin-navigation"
      >
        {/* Header */}
        <div className="flex h-10 shrink-0 items-center border-b border-subtle px-4">
          <span className="text-[10px] font-bold uppercase tracking-wider text-tertiary">
            Administration
          </span>
        </div>

        {/* Navigation items */}
        <ul className="space-y-0.5 p-2">
          {SECTIONS.map((section) => {
            const isActive = activeSection === section.id;
            return (
              <li key={section.id}>
                <button
                  type="button"
                  onClick={() => {
                    onSelect(section.id);
                    setMobileOpen(false);
                  }}
                  className={`group relative flex w-full items-center gap-3 rounded-md px-3 py-2 text-[13px] font-medium transition-all ${
                    isActive
                      ? "bg-accent-muted text-accent"
                      : "text-secondary hover:bg-surface-3 hover:text-primary active:scale-[0.99]"
                  }`}
                >
                  {/* Active indicator */}
                  {isActive && (
                    <span className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-accent" />
                  )}

                  {/* Icon */}
                  <span
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md transition-all ${
                      isActive
                        ? "bg-accent text-white shadow-[var(--shadow-glow)]"
                        : "bg-surface-2 text-tertiary group-hover:bg-surface-3 group-hover:text-secondary"
                    }`}
                  >
                    {section.icon}
                  </span>

                  {/* Label */}
                  <span className="truncate">{section.label}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}