"use client";

import Link from "next/link";
import { Brain, Zap, Building2, Activity, BarChart3 } from "lucide-react";
import { getStoredSession } from "@/lib/session";

interface Tile {
  href: string;
  title: string;
  subtitle: string;
  icon: React.ReactNode;
}

const TILES: Tile[] = [
  {
    href: "/super-admin/agents",
    title: "Agent Builder",
    subtitle: "Create and configure AI agents, personas, and tools",
    icon: <Brain className="h-3.5 w-3.5" />,
  },
  {
    href: "/super-admin/llm-config",
    title: "LLM Configuration",
    subtitle: "Global provider, models, and per-tenant overrides",
    icon: <Zap className="h-3.5 w-3.5" />,
  },
  {
    href: "/super-admin/agent-usage",
    title: "Usage Analytics",
    subtitle: "Cost, latency, and tool mix across tenants",
    icon: <BarChart3 className="h-3.5 w-3.5" />,
  },
  {
    href: "/super-admin/insights",
    title: "System Health",
    subtitle: "Cross-tenant scanner and daily digest dispatch",
    icon: <Activity className="h-3.5 w-3.5" />,
  },
  {
    href: "/super-admin/ai-policy",
    title: "Tenant Management",
    subtitle: "AI engine policy, category memory, and governance",
    icon: <Building2 className="h-3.5 w-3.5" />,
  },
];

export default function SuperAdminModule() {
  const session = getStoredSession();
  const isSuperAdmin = Boolean(session?.isSuperAdmin);

  if (!isSuperAdmin) {
    return (
      <div className="flex h-full items-center justify-center" data-testid="super-admin-module">
        <p className="text-[11px] text-tertiary">Super admin access required.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-5 py-5" data-testid="super-admin-module">
      <header className="mb-4">
        <h1 className="text-[13px] font-bold tracking-[-0.01em] text-primary">Platform Operations</h1>
        <p className="mt-0.5 text-[10.5px] text-tertiary">
          Cross-tenant surfaces. Customer admins do not see this tree.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {TILES.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            className="group flex items-center gap-2.5 rounded border border-subtle bg-surface-1 px-3 py-2 transition-colors hover:bg-rose-500/[0.05]"
          >
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded border border-subtle bg-surface-1 text-rose-300/65 group-hover:border-error group-hover:text-rose-200">
              {t.icon}
            </span>
            <span className="min-w-0 flex-1">
              <div className="truncate text-[11.5px] font-semibold text-secondary group-hover:text-primary">
                {t.title}
              </div>
              <div className="truncate text-[9.5px] text-muted">{t.subtitle}</div>
            </span>
            <span className="text-[10px] text-muted group-hover:text-rose-300/55">→</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
