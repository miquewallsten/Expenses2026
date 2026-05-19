"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { getSuperAdminSession, clearSuperAdminSession } from "@/lib/super-admin-session";
import { useTranslations } from "next-intl";
import {
  LayoutDashboard, Network, Building2, Users, Settings2,
  LogOut, KeyRound, Shield, LayoutGrid,
} from "lucide-react";
import NavRail, { type NavRailItem } from "@/components/shell/NavRail";
import ThemeToggle from "@/components/shell/ThemeToggle";

const NAV_ITEMS: { href: string; key: string; group: string }[] = [
  { href: "/super-admin/dashboard", key: "dashboard", group: "Operations" },
  { href: "/super-admin/agent-center", key: "agentCenter", group: "Operations" },
  { href: "/super-admin/llm-config", key: "llmConfig", group: "Operations" },
  { href: "/super-admin/tenants", key: "tenants", group: "Administration" },
  { href: "/super-admin/users", key: "users", group: "Administration" },
  { href: "/super-admin/ai-policy", key: "aiPolicy", group: "Administration" },
  { href: "/super-admin/settings", key: "settings", group: "Administration" },
];

const ICON_MAP: Record<string, typeof LayoutDashboard> = {
  dashboard: LayoutDashboard,
  agentCenter: Network,
  llmConfig: KeyRound,
  tenants: Building2,
  users: Users,
  aiPolicy: Shield,
  settings: Settings2,
};

export default function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const t = useTranslations("superAdmin");
  const tn = useTranslations("nav");
  const [ok, setOk] = useState<boolean | null>(null);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
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
      <div className="flex h-screen items-center justify-center bg-surface-0">
        <div className="flex items-center gap-3 text-[11px] text-secondary">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-strong border-t-accent" />
          {t("verifyingAccess")}
        </div>
      </div>
    );
  }

  const isLoginPage = pathname === "/super-admin/login";

  const navItems: NavRailItem[] = NAV_ITEMS.map((item) => {
    const label = tn(item.key) || item.key;
    return {
      key: item.key,
      label,
      href: item.href,
      active: pathname === item.href || pathname.startsWith(item.href + "/"),
      group: item.group,
    };
  });

  const footerSlot = (
    <div className="space-y-1 px-2 pb-2">
      <button
        onClick={handleLogout}
        className="flex w-full items-center gap-2.5 rounded px-2.5 py-1.5 text-xs font-medium text-muted transition-colors hover:bg-surface-2 hover:text-secondary"
      >
        <LogOut className="h-3.5 w-3.5 shrink-0" />
        {!collapsed && <span>{t("logout")}</span>}
      </button>
    </div>
  );

  return (
    <div className="flex h-screen bg-surface-0">
      {!isLoginPage && (
        <NavRail
          collapsed={collapsed}
          onToggle={() => setCollapsed((c) => !c)}
          items={navItems}
          footerSlot={footerSlot}
          logoUrl={null}
        />
      )}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {!isLoginPage && (
          <header className="flex h-10 shrink-0 items-center gap-2 border-b border-subtle bg-surface-1 px-3">
            <div className="flex items-center gap-2">
              <div className="flex h-6 w-6 items-center justify-center rounded bg-accent/15">
                <LayoutGrid className="h-3.5 w-3.5 text-accent" />
              </div>
              <span className="text-[11px] font-semibold text-primary">{tn("superAdmin")}</span>
            </div>
            <div className="h-3 w-px bg-surface-2" />
            <span className="text-[9px] font-medium uppercase tracking-[0.06em] text-tertiary">
              {t("platformAdmin")}
            </span>
            <div className="flex-1" />
            <ThemeToggle />
          </header>
        )}
        <main className="flex-1 overflow-auto bg-surface-0">
          {children}
        </main>
      </div>
    </div>
  );
}
