"use client";

import Link from "next/link";
import { Activity, Brain, Database, ShieldAlert } from "lucide-react";

type Tile = {
  href: string;
  title: string;
  subtitle: string;
  icon: React.ReactNode;
};

const GROUPS: { label: string; tiles: Tile[] }[] = [
  {
    label: "AI Governance",
    tiles: [
      {
        href: "/super-admin/ai-policy",
        title: "AI Engine Policy",
        subtitle: "Model allow-list · token budget · PII redaction",
        icon: <Brain className="h-3.5 w-3.5" />,
      },
      {
        href: "/super-admin/category-memory",
        title: "Category Memory",
        subtitle: "kNN feedback store · per-company corrections",
        icon: <Database className="h-3.5 w-3.5" />,
      },
    ],
  },
  {
    label: "Cross-tenant Operations",
    tiles: [
      {
        href: "/super-admin/agent-usage",
        title: "Agent Usage",
        subtitle: "Cost · latency · tool mix across tenants",
        icon: <Activity className="h-3.5 w-3.5" />,
      },
      {
        href: "/super-admin/agent-management",
        title: "Agent Management",
        subtitle: "Team coordination · performance · configuration",
        icon: <Activity className="h-3.5 w-3.5" />,
      },
      {
        href: "/super-admin/insights",
        title: "Daily Insights Digest",
        subtitle: "Cross-tenant scanner · digest dispatch",
        icon: <ShieldAlert className="h-3.5 w-3.5" />,
      },
    ],
  },
];

export default function SuperAdminLanding() {
  return (
    <div className="mx-auto max-w-2xl px-5 py-5">
      <header className="mb-4">
        <h1 className="text-[13px] font-bold tracking-[-0.01em] text-white/85">Platform operations</h1>
        <p className="mt-0.5 text-[10.5px] text-white/40">
          Cross-tenant surfaces. Customer admins do not see this tree.
        </p>
      </header>

      {GROUPS.map((g) => (
        <section key={g.label} className="mb-4 last:mb-0">
          <div className="mb-1 px-1 text-[8.5px] font-bold uppercase tracking-[0.12em] text-white/22">
            {g.label}
          </div>
          <div className="overflow-hidden rounded border border-white/[0.06] bg-white/[0.015]">
            {g.tiles.map((t, i) => (
              <Link
                key={t.href}
                href={t.href}
                className={`group flex items-center gap-2.5 px-3 py-2 transition-colors hover:bg-rose-500/[0.05] ${
                  i > 0 ? "border-t border-white/[0.05]" : ""
                }`}
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded border border-white/[0.06] bg-white/[0.02] text-rose-300/65 group-hover:border-rose-500/30 group-hover:text-rose-200">
                  {t.icon}
                </span>
                <span className="min-w-0 flex-1">
                  <div className="truncate text-[11.5px] font-semibold text-white/78 group-hover:text-white/95">
                    {t.title}
                  </div>
                  <div className="truncate text-[9.5px] text-white/35">{t.subtitle}</div>
                </span>
                <span className="text-[10px] text-white/22 group-hover:text-rose-300/55">→</span>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
