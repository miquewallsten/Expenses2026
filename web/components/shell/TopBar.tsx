"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bot, LogOut, Menu, Search, Settings, Bell, ChevronDown } from "lucide-react";
import { clearSession, getCurrentRole, getStoredSession } from "@/lib/session";
import { useTranslations } from "next-intl";
import SettingsModal from "./SettingsModal";

interface TopBarProps {
  title?: string;
  portal?: string;
  onMenuOpen?: () => void;
  onAiOpen?: () => void;
}

export default function TopBar({ title, portal, onMenuOpen, onAiOpen }: TopBarProps) {
  const router = useRouter();
  const [role, setRole] = useState<string | null>(null);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
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
    <header className="relative flex h-10 shrink-0 items-center gap-2 border-b border-subtle bg-surface-1 px-3">
      {/* Mobile menu button */}
      {onMenuOpen && (
        <button
          type="button"
          onClick={onMenuOpen}
          title={t("openNavigation")}
          aria-label={t("openNavigation")}
          className="flex h-7 w-7 items-center justify-center rounded text-secondary transition-colors hover:bg-surface-2 hover:text-primary md:hidden"
        >
          <Menu className="h-4 w-4" />
        </button>
      )}

      {/* Title area - mobile only */}
      {title && (
        <div className="flex flex-col justify-center md:hidden">
          <span className="truncate text-[11px] font-semibold uppercase tracking-wide text-primary">
            {title}
          </span>
          {portal && (
            <span className="truncate text-[9px] text-tertiary">
              {portal}
            </span>
          )}
        </div>
      )}

      {/* Spacer for mobile */}
      <div className="flex-1 md:hidden" />

      {/* Global search - desktop only */}
      <div className="hidden flex-1 items-center justify-center md:flex">
        <div className={`relative w-full max-w-sm transition-all ${searchFocused ? "max-w-md" : ""}`}>
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-tertiary" />
          <input
            type="search"
            placeholder={tc("search")}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            className="h-7 w-full rounded border border-default bg-surface-0 pl-8 pr-3 text-sm text-primary placeholder-tertiary outline-none transition-all focus:border-accent focus:bg-surface-2 focus:ring-2 focus:ring-accent-muted"
          />
        </div>
      </div>

      {/* Right actions */}
      <div className="flex items-center gap-1">
        {/* AI Copilot button */}
        {onAiOpen && (
          <button
            type="button"
            onClick={onAiOpen}
            title={t("openAI")}
            aria-label={t("openAI")}
            className="flex h-7 items-center gap-1.5 rounded px-2 text-secondary transition-colors hover:bg-surface-2 hover:text-primary"
          >
            <Bot className="h-3.5 w-3.5" />
            <span className="hidden text-[10px] font-medium uppercase tracking-wide lg:inline">
              Copilot
            </span>
          </button>
        )}

        {/* Notifications */}
        <button
          type="button"
          title={t("notifications")}
          aria-label={t("notifications")}
          className="relative flex h-7 w-7 items-center justify-center rounded text-secondary transition-colors hover:bg-surface-2 hover:text-primary"
        >
          <Bell className="h-3.5 w-3.5" />
          {/* Notification dot */}
          <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-accent" />
        </button>

        {/* Settings */}
        <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          title={tn("settings")}
          aria-label={tn("settings")}
          className="flex h-7 w-7 items-center justify-center rounded text-secondary transition-colors hover:bg-surface-2 hover:text-primary"
        >
          <Settings className="h-3.5 w-3.5" />
        </button>
        <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />

        {/* Divider */}
        <div className="mx-1 h-4 w-px bg-subtle" />

        {/* User menu */}
        <button
          type="button"
          className="flex h-7 items-center gap-1.5 rounded pl-1.5 pr-2 text-secondary transition-colors hover:bg-surface-2 hover:text-primary"
        >
          <div className="flex h-5 w-5 items-center justify-center rounded-full bg-accent-muted text-[10px] font-bold text-accent">
            {role?.charAt(0).toUpperCase() ?? "U"}
          </div>
          <span className="hidden text-xs font-medium lg:inline">{role}</span>
          <ChevronDown className="hidden h-3 w-3 opacity-50 lg:inline" />
        </button>
      </div>
    </header>
  );
}