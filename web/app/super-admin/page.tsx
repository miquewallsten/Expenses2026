"use client";

import Link from "next/link";
import { Activity, Brain, Database, ShieldAlert } from "lucide-react";

const TILES: { href: string; title: string; subtitle: string; icon: React.ReactNode }[] = [
  {
    href: "/super-admin/ai-policy",
    title: "AI Engine Policy",
    subtitle: "Model allow-list · token budget · PII redaction",
    icon: <Brain className="h-4 w-4" />,
  },
  {
    href: "/super-admin/agent-usage",
    title: "Agent Usage",
    subtitle: "Cross-tenant cost · latency · tool mix",
    icon: <Activity className="h-4 w-4" />,
  },
  {
    href: "/super-admin/insights",
    title: "Daily Insights Digest",
    subtitle: "Cross-tenant scanner · digest dispatch",
    icon: <ShieldAlert className="h-4 w-4" />,
  },
  {
    href: "/super-admin/category-memory",
    title: "Category Memory",
    subtitle: "kNN feedback store · per-company corrections",
    icon: <Database className="h-4 w-4" />,
  },
];

export default function SuperAdminLanding() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <h1 className="mb-1 text-sm font-bold text-white/85">Platform operations</h1>
      <p className="mb-6 text-[11px] text-white/40">
        Surfaces that affect more than one company live here. Customer admins do not see this tree.
      </p>
      <div className="grid gap-2">
        {TILES.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            className="group flex items-center gap-3 rounded border border-white/[0.07] bg-white/[0.02] px-3.5 py-2.5 transition-colors hover:border-rose-500/30 hover:bg-rose-500/[0.04]"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded border border-white/[0.06] bg-white/[0.03] text-rose-300/70 group-hover:border-rose-500/30 group-hover:text-rose-200">
              {t.icon}
            </span>
            <span className="flex-1">
              <div className="text-[12px] font-semibold text-white/80 group-hover:text-white/95">{t.title}</div>
              <div className="text-[10px] text-white/35">{t.subtitle}</div>
            </span>
            <span className="text-[10px] text-white/25 group-hover:text-rose-300/60">→</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
