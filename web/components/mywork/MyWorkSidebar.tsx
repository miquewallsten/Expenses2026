"use client";

import { useCallback } from "react";
import {
  Receipt,
  CheckCircle,
  Calculator,
  Clock,
  BarChart,
  Settings,
  Shield,
  ChevronLeft,
  ChevronRight,
  LogOut,
  LayoutGrid,
  type LucideIcon,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import type { PermissionManifest } from "@/types/mywork";
import { clearSession } from "@/lib/session";

const ICON_MAP: Record<string, LucideIcon> = {
  Receipt,
  CheckCircle,
  Calculator,
  Clock,
  BarChart,
  Settings,
  Shield,
};

function resolveIcon(name?: string): LucideIcon | null {
  if (!name) return null;
  return ICON_MAP[name] || null;
}

interface MyWorkSidebarProps {
  manifest: PermissionManifest | null;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

export default function MyWorkSidebar({ manifest, collapsed, onToggleCollapse }: MyWorkSidebarProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentModule = searchParams.get("module") || "";

  const user = manifest?.user;
  const modules = manifest?.modules || [];
  const tenant = manifest?.tenant;

  const handleModuleClick = useCallback(
    (moduleId: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("module", moduleId);
      router.push(`?${params.toString()}`);
    },
    [router, searchParams],
  );

  const handleLogout = useCallback(() => {
    clearSession();
    router.push("/login");
  }, [router]);

  return (
    <nav
      className={`flex shrink-0 flex-col h-[100dvh] border-r border-white/[0.06] bg-zinc-900 transition-[width] duration-200`}
      style={{ width: collapsed ? 56 : 220 }}
      aria-label="Main navigation"
      data-testid="mywork-sidebar"
    >
      {/* Header */}
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-white/[0.06] px-2">
        <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-indigo-600/30">
          <LayoutGrid className="h-3 w-3 text-indigo-300/80" />
        </div>
        {!collapsed && (
          <span className="flex-1 truncate text-[10px] font-bold uppercase tracking-widest text-white/50">
            MyWork
          </span>
        )}
        <button
          type="button"
          onClick={onToggleCollapse}
          className="ml-auto flex h-5 w-5 shrink-0 items-center justify-center rounded text-white/22 transition-colors hover:bg-white/[0.05] hover:text-white/50"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronLeft className="h-3 w-3" />}
        </button>
      </div>

      {/* User profile */}
      <div className="shrink-0 border-b border-white/[0.06] px-3 py-2.5">
        <div className={`flex items-center gap-2.5 ${collapsed ? "justify-center" : ""}`}>
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-600/20 text-[10px] font-bold uppercase tracking-wider text-indigo-300/80">
            {user?.fullName?.split(" ").map((w) => w[0]).join("").slice(0, 2) || "U"}
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <p className="truncate text-[11px] font-semibold text-white/70">{user?.fullName || "User"}</p>
              <p className="truncate text-[9px] text-white/35">{tenant?.companyName || tenant?.name || "Company"}</p>
              <span className="mt-0.5 inline-block rounded border border-indigo-500/25 bg-indigo-500/10 px-1.5 py-[1px] text-[9px] font-medium uppercase tracking-wider text-indigo-300/70">
                {user?.role || "employee"}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Module list */}
      <div className="min-h-0 flex-1 overflow-y-auto py-1.5">
        {!collapsed && (
          <p className="px-4 pb-0.5 pt-1 text-[9px] font-bold uppercase tracking-widest text-white/18">
            Modules
          </p>
        )}
        <ul className={`space-y-px ${collapsed ? "px-1.5" : "px-2"}`}>
          {modules.map((mod) => {
            const Icon = resolveIcon(mod.icon);
            const isActive = currentModule === mod.id;
            return (
              <li key={mod.id}>
                <button
                  type="button"
                  onClick={() => handleModuleClick(mod.id)}
                  className={`group relative flex w-full items-center gap-2.5 rounded py-1.5 text-[11px] font-medium leading-none transition-colors ${
                    collapsed ? "justify-center px-2" : "px-3"
                  } ${
                    isActive
                      ? "bg-indigo-600/[0.18] text-white"
                      : "text-white/38 hover:bg-white/[0.04] hover:text-white/65"
                  }`}
                  aria-current={isActive ? "page" : undefined}
                  title={collapsed ? mod.label : undefined}
                >
                  {isActive && (
                    <span className="absolute left-0 top-1/2 h-4 w-[2px] -translate-y-1/2 rounded-r bg-indigo-400/70" />
                  )}
                  {Icon ? (
                    <Icon
                      className={`h-3.5 w-3.5 shrink-0 ${
                        isActive ? "text-indigo-300" : "text-white/30 group-hover:text-white/55"
                      }`}
                      aria-hidden="true"
                    />
                  ) : (
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-[8px] font-bold uppercase tracking-wider bg-white/[0.04] text-white/30">
                      {mod.label?.slice(0, 2).toUpperCase()}
                    </span>
                  )}
                  {!collapsed && <span className="truncate">{mod.label}</span>}
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Logout */}
      <div className="shrink-0 border-t border-white/[0.06] px-2 py-1.5">
        <button
          type="button"
          onClick={handleLogout}
          className={`flex w-full items-center gap-2.5 rounded py-1.5 text-[11px] font-medium text-white/35 transition-colors hover:bg-white/[0.04] hover:text-white/65 ${
            collapsed ? "justify-center px-2" : "px-3"
          }`}
          title={collapsed ? "Logout" : undefined}
        >
          <LogOut className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {!collapsed && <span>Logout</span>}
        </button>
      </div>
    </nav>
  );
}
