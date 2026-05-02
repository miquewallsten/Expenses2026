"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bot, LogOut, Menu, Search, Settings, Shield } from "lucide-react";
import { clearSession, getCurrentRole, getStoredSession } from "@/lib/session";
import { useTranslations } from "next-intl";
import SettingsModal from "./SettingsModal";

interface TopBarProps {
  title: string;
  portal?: string;
  onMenuOpen?: () => void;
  onAiOpen?: () => void;
}

export default function TopBar({ title, portal, onMenuOpen, onAiOpen }: TopBarProps) {
  const router = useRouter();
  const [role, setRole] = useState<string | null>(null);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const t = useTranslations("shell");
  const tc = useTranslations("common");
  const tn = useTranslations("nav");

  useEffect(() => {
    setRole(getCurrentRole());
    const s = getStoredSession();
    setIsSuperAdmin(Boolean(s?.isSuperAdmin));
  }, []);

  const handleLogout = () => {
    clearSession();
    router.push("/login");
  };

  return (
    <header className="relative flex h-11 shrink-0 items-stretch border-b border-[var(--border-subtle)] bg-[var(--surface-1)] md:h-9">

      {onMenuOpen && (
        <button
          type="button"
          onClick={onMenuOpen}
          title={t("openNavigation")}
          aria-label={t("openNavigation")}
          className="flex w-11 items-center justify-center border-r border-[var(--border-hairline)] text-white/40 transition-colors hover:bg-white/[0.05] hover:text-white/65 md:hidden"
        >
          <Menu className="h-4 w-4" />
        </button>
      )}

      <div className="hidden w-48 shrink-0 flex-col justify-center border-r border-[var(--border-hairline)] px-3.5 md:flex">
        <span className="truncate text-[10px] font-bold uppercase tracking-widest text-white/60">
          {title}
        </span>
        {portal && (
          <span className="truncate text-[9px] font-medium tracking-wide text-white/25">
            {portal}
          </span>
        )}
      </div>

      {!onMenuOpen && (
        <div className="flex items-center pl-4 md:hidden">
          <span className="truncate text-[10px] font-bold uppercase tracking-widest text-white/55">
            {title}
          </span>
        </div>
      )}

      <div className="hidden flex-1 items-center justify-center px-4 md:flex">
        <div className="relative w-full max-w-md">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-white/20" />
          <input
            type="search"
            placeholder={tc("search")}
            className="h-[30px] w-full rounded border border-[var(--border-standard)] bg-[var(--surface-2)] pl-7 pr-3 text-[11px] text-white/70 placeholder-white/28 outline-none transition-all focus:border-indigo-500/40 focus:bg-indigo-950/15 focus:ring-1 focus:ring-indigo-500/15"
          />
        </div>
      </div>

      <div className="flex-1 md:hidden" />

      <div className="flex items-stretch border-l border-[var(--border-hairline)]">

        {onAiOpen && (
          <button
            type="button"
            onClick={onAiOpen}
            title={t("openAI")}
            aria-label={t("openAI")}
            className="flex w-10 items-center justify-center border-r border-[var(--border-hairline)] text-white/28 transition-colors hover:bg-white/[0.04] hover:text-indigo-300/70 lg:hidden"
          >
            <Bot className="h-3.5 w-3.5" />
          </button>
        )}

        <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          title={tn("settings")}
          aria-label={tn("settings")}
          className="hidden w-8 items-center justify-center border-r border-[var(--border-hairline)] text-white/28 transition-colors hover:bg-white/[0.04] hover:text-white/55 md:flex"
        >
          <Settings className="h-3.5 w-3.5" />
        </button>
        <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />

        <button
          type="button"
          onClick={handleLogout}
          title={t("logOut")}
          aria-label={t("logOut")}
          className="flex w-10 items-center justify-center border-r border-[var(--border-hairline)] text-white/28 transition-colors hover:bg-white/[0.04] hover:text-white/55 md:w-8"
        >
          <LogOut className="h-3.5 w-3.5" />
        </button>

        {isSuperAdmin && (
          <Link
            href="/super-admin"
            title="Super Admin"
            aria-label="Super Admin"
            className="hidden items-center gap-1.5 border-r border-[var(--border-hairline)] px-3 text-rose-300/70 [html.light_&]:text-rose-600/80 transition-colors hover:bg-rose-500/[0.08] [html.light_&]:hover:bg-rose-500/[0.12] hover:text-rose-200 [html.light_&]:hover:text-rose-700 md:flex"
          >
            <Shield className="h-3.5 w-3.5" />
            <span className="text-[9px] font-bold uppercase tracking-widest">Super</span>
          </Link>
        )}

        {role && (
          <div className="hidden items-center px-3 md:flex">
            <span className="rounded border border-indigo-500/25 bg-indigo-500/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest text-indigo-300/65 [html.light_&]:text-indigo-700/80 [html.light_&]:bg-indigo-100 [html.light_&]:border-indigo-300/50">
              {role}
            </span>
          </div>
        )}
      </div>
    </header>
  );
}
