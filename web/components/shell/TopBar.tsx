"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Bot, LogOut, Menu, Search, Settings } from "lucide-react";
import { clearSession, getCurrentRole } from "@/lib/session";
import { useTranslations } from "next-intl";
import SettingsModal from "./SettingsModal";
import ConnectivityChip from "./ConnectivityChip";

interface TopBarProps {
  title: string;
  portal?: string;
  onMenuOpen?: () => void;
  onAiOpen?: () => void;
}

export default function TopBar({ title, portal, onMenuOpen, onAiOpen }: TopBarProps) {
  const router = useRouter();
  const [role, setRole] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const t = useTranslations("shell");
  const tc = useTranslations("common");
  const tn = useTranslations("nav");

  useEffect(() => {
    setRole(getCurrentRole());
  }, []);

  // ⌘K / Ctrl+K focuses the search input
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        const el = document.getElementById("topbar-search");
        el?.focus();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  const handleLogout = () => {
    clearSession();
    router.push("/login");
  };

  return (
    <header className="relative flex h-11 shrink-0 items-stretch border-b border-white/[0.07] bg-gradient-to-b from-zinc-900 to-zinc-950 md:h-9">

      {onMenuOpen && (
        <button
          type="button"
          onClick={onMenuOpen}
          title={t("openNavigation")}
          aria-label={t("openNavigation")}
          className="flex w-11 items-center justify-center border-r border-white/[0.05] text-white/45 transition-colors hover:bg-white/[0.06] hover:text-white/75 md:hidden"
        >
          <Menu className="h-4 w-4" />
        </button>
      )}

      <div className="hidden w-48 shrink-0 flex-col justify-center border-r border-white/[0.05] px-3.5 md:flex">
        <span className="truncate text-[10px] font-bold uppercase tracking-widest text-white/65">
          {title}
        </span>
        <span className="truncate text-[9px] font-medium tracking-wide text-white/35">
          {portal ?? (role ? tn(role) : "")}
        </span>
      </div>

      {!onMenuOpen && (
        <div className="flex items-center pl-4 md:hidden">
          <span className="truncate text-[10px] font-bold uppercase tracking-widest text-white/60">
            {title}
          </span>
        </div>
      )}

      <div className="hidden flex-1 items-center justify-center px-4 md:flex">
        <div className="relative w-full max-w-md">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-white/28" />
          <input
            id="topbar-search"
            type="search"
            placeholder={tc("search")}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            className="h-[26px] w-full rounded-md border border-white/[0.09] bg-white/[0.04] pl-7 pr-14 text-[11px] text-white/75 placeholder-white/28 outline-none transition-all focus:border-indigo-500/40 focus:bg-indigo-950/15 focus:ring-1 focus:ring-indigo-500/15"
          />
          {/* ⌘K hint — fades out when focused */}
          <div
            className={`pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-0.5 transition-opacity duration-150 ${
              searchFocused ? "opacity-0" : "opacity-100"
            }`}
          >
            <kbd className="flex h-4 items-center rounded border border-white/[0.1] bg-white/[0.04] px-1 font-sans text-[9px] text-white/28">
              ⌘K
            </kbd>
          </div>
        </div>
      </div>

      <div className="flex-1 md:hidden" />

      <div className="flex items-stretch border-l border-white/[0.05]">

        <div className="hidden items-center pr-2 md:flex">
          <ConnectivityChip />
        </div>

        {onAiOpen && (
          <button
            type="button"
            onClick={onAiOpen}
            title={t("openAI")}
            aria-label={t("openAI")}
            className="flex w-10 items-center justify-center border-r border-white/[0.05] text-white/35 transition-colors hover:bg-white/[0.06] hover:text-indigo-300/80 lg:hidden"
          >
            <Bot className="h-3.5 w-3.5" />
          </button>
        )}

        <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          title={tn("settings")}
          aria-label={tn("settings")}
          className="hidden w-8 items-center justify-center border-r border-white/[0.05] text-white/35 transition-colors hover:bg-white/[0.06] hover:text-white/65 md:flex"
        >
          <Settings className="h-3.5 w-3.5" />
        </button>
        <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />

        <button
          type="button"
          onClick={handleLogout}
          title={t("logOut")}
          aria-label={t("logOut")}
          className="flex w-10 items-center justify-center border-r border-white/[0.05] text-white/35 transition-colors hover:bg-white/[0.06] hover:text-white/65 md:w-8"
        >
          <LogOut className="h-3.5 w-3.5" />
        </button>

        {role && (
          <div className="hidden items-center px-3 md:flex">
            <span className="rounded-full border border-indigo-500/25 bg-indigo-500/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest text-indigo-300/70">
              {tn(role)}
            </span>
          </div>
        )}
      </div>
    </header>
  );
}
