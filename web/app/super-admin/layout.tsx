"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { getSuperAdminSession, clearSuperAdminSession } from "@/lib/super-admin-session";
import {
  LayoutDashboard, Building2, Users, Cpu, Activity,
  Shield, Lightbulb, LogOut, ChevronRight
} from "lucide-react";

const NAV_ITEMS = [
  { href: "/super-admin/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/super-admin/tenants", label: "Tenants", icon: Building2 },
  { href: "/super-admin/users", label: "Users", icon: Users },
  { href: "/super-admin/llm-config", label: "LLM Config", icon: Cpu },
  { href: "/super-admin/agents", label: "Agent Definitions", icon: Activity },
  { href: "/super-admin/ai-policy", label: "AI Policies", icon: Shield },
  { href: "/super-admin/insights", label: "Insights", icon: Lightbulb },
];

/**
 * Super Admin layout — guards every /super-admin/* route.
 *
 * Uses independent authentication stored in superAdminSession.
 * Redirects to /super-admin/login if not authenticated.
 *
 * Cross-tenant scope: AI engine governance, kNN category memory,
 * cross-tenant agent usage rollups, daily insight digest.
 */
export default function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [ok, setOk] = useState<boolean | null>(null);

  useEffect(() => {
    // Don't redirect on the login page itself
    if (pathname === "/super-admin/login") {
      setOk(true);
      return;
    }

    const session = getSuperAdminSession();
    if (!session?.token) {
      router.replace("/super-admin/login");
      return;
    }
    setOk(true);
  }, [router, pathname]);

  const handleLogout = () => {
    clearSuperAdminSession();
    router.replace("/super-admin/login");
  };

  if (ok !== true) {
    return (
      <div className="flex h-screen items-center justify-center bg-surface-0 text-[11px] text-tertiary">
        Verifying access…
      </div>
    );
  }

  const isLoginPage = pathname === "/super-admin/login";

  return (
    <div className="flex h-screen flex-col bg-surface-0">
      {!isLoginPage && (
        <>
          {/* Top bar */}
          <div className="flex h-8 shrink-0 items-center justify-between border-b border-rose-500/25 bg-rose-950/30 px-3">
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-rose-300/80">
              <span className="font-bold">Super Admin</span>
              <span className="text-error/40">·</span>
              <span className="text-rose-300/55">Cross-tenant</span>
            </div>
            <button
              onClick={handleLogout}
              className="flex items-center gap-1 rounded px-2 py-1 text-[10px] text-rose-300/70 hover:bg-rose-500/10 hover:text-rose-200"
            >
              <LogOut className="h-3 w-3" />
              Logout
            </button>
          </div>

          {/* Navigation */}
          <nav className="flex h-9 shrink-0 items-center gap-1 border-b border-subtle bg-surface-1 px-3">
            {NAV_ITEMS.map((item) => {
              const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-1.5 rounded px-2 py-1.5 text-[10px] font-medium transition-colors ${
                    isActive
                      ? "bg-accent-muted text-accent"
                      : "text-muted hover:bg-surface-2 hover:text-secondary"
                  }`}
                >
                  <Icon className="h-3 w-3" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
    </div>
  );
}
