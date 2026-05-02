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
      <div className="flex h-9 shrink-0 items-center border-b border-white/[0.06] bg-zinc-950 px-2 md:hidden">
        <button
          type="button"
          onClick={() => setMobileOpen((v) => !v)}
          className="flex h-6 w-6 items-center justify-center rounded text-white/40 transition-colors hover:bg-white/[0.05] hover:text-white/65"
        >
          {mobileOpen ? <X className="h-3.5 w-3.5" /> : <Menu className="h-3.5 w-3.5" />}
        </button>
        <span className="ml-2 text-[10px] font-bold uppercase tracking-widest text-white/45">
          {SECTIONS.find((s) => s.id === activeSection)?.label ?? "Admin"}
        </span>
      </div>

      {/* Nav panel */}
      <nav
        className={`shrink-0 flex-col border-r border-white/[0.06] bg-zinc-950 transition-all ${
          mobileOpen ? "flex" : "hidden md:flex"
        }`}
        style={{ width: "220px" }}
        data-testid="admin-navigation"
      >
        <div className="flex h-9 shrink-0 items-center border-b border-white/[0.06] px-3">
          <span className="text-[10px] font-bold uppercase tracking-widest text-white/30">
            Administration
          </span>
        </div>
        <ul className="space-y-px py-1.5 px-2">
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
                  className={`group relative flex w-full items-center gap-2.5 rounded px-3 py-1.5 text-[11px] font-medium leading-none transition-colors ${
                    isActive
                      ? "bg-indigo-600/[0.18] text-white"
                      : "text-white/38 hover:bg-white/[0.04] hover:text-white/65"
                  }`}
                >
                  {isActive && (
                    <span className="absolute left-0 top-1/2 h-3.5 w-0.5 -translate-y-1/2 rounded-r-full bg-indigo-400/70" />
                  )}
                  <span
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded ${
                      isActive
                        ? "bg-indigo-500/25 text-indigo-300/80"
                        : "bg-white/[0.04] text-white/30 group-hover:text-white/55"
                    }`}
                  >
                    {section.icon}
                  </span>
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
