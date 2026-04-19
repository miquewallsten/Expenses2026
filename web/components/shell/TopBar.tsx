"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Bot, LogOut, Menu, Search, Settings } from "lucide-react";
import { clearSession, getCurrentRole } from "@/lib/session";

interface TopBarProps {
  /** App / product name shown in the branding block. */
  title: string;
  /** Optional current portal/module label shown as a dim subtitle below the title. */
  portal?: string;
  /**
   * When provided, a hamburger button is rendered on the far-left of the bar
   * (visible only below the `md` breakpoint).  AppShell passes this on mobile
   * to open the nav/worklist drawer.
   */
  onMenuOpen?: () => void;
  /**
   * When provided, an AI assistant icon button is rendered in the right utility
   * strip (visible only below the `lg` breakpoint — on desktop the AI panel is
   * already an inline rail).  AppShell passes this on mobile and tablet.
   */
  onAiOpen?: () => void;
}

export default function TopBar({ title, portal, onMenuOpen, onAiOpen }: TopBarProps) {
  const router = useRouter();
  const [role, setRole] = useState<string | null>(null);

  useEffect(() => {
    setRole(getCurrentRole());
  }, []);

  const handleLogout = () => {
    clearSession();
    router.push("/login");
  };

  return (
    /* h-11 (44 px) on mobile for comfortable tap targets; h-9 (36 px) on md+ */
    <header className="relative flex h-11 shrink-0 items-stretch border-b border-white/[0.07] bg-gradient-to-b from-zinc-900 to-zinc-950 md:h-9">

      {/* ── Mobile hamburger — hidden md+ ── */}
      {onMenuOpen && (
        <button
          type="button"
          onClick={onMenuOpen}
          title="Open navigation"
          aria-label="Open navigation"
          className="flex w-11 items-center justify-center border-r border-white/[0.05] text-white/40 transition-colors hover:bg-white/[0.05] hover:text-white/65 md:hidden"
        >
          <Menu className="h-4 w-4" />
        </button>
      )}

      {/* ── Desktop brand block — hidden below md ── */}
      <div className="hidden w-48 shrink-0 flex-col justify-center border-r border-white/[0.05] px-3.5 md:flex">
        <span className="truncate text-[10px] font-bold uppercase tracking-widest text-white/60">
          {title}
        </span>
        {portal && (
          <span className="truncate text-[9px] font-medium tracking-wide text-white/25">
            {portal}
          </span>
        )}
      </div>

      {/* ── Mobile title — visible below md when no hamburger ── */}
      {!onMenuOpen && (
        <div className="flex items-center pl-4 md:hidden">
          <span className="truncate text-[10px] font-bold uppercase tracking-widest text-white/55">
            {title}
          </span>
        </div>
      )}

      {/* ── Search — hidden on mobile, visible md+ ── */}
      <div className="hidden flex-1 items-center justify-center px-4 md:flex">
        <div className="relative w-full max-w-md">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-white/20" />
          <input
            type="search"
            placeholder="Search…"
            className="h-[26px] w-full rounded border border-white/[0.09] bg-white/[0.04] pl-7 pr-3 text-[11px] text-white/70 placeholder-white/22 outline-none transition-all focus:border-indigo-500/40 focus:bg-indigo-950/15 focus:ring-1 focus:ring-indigo-500/15"
          />
        </div>
      </div>

      {/* Flex spacer: pushes right strip to far right on mobile */}
      <div className="flex-1 md:hidden" />

      {/* ── Right utility strip ── */}
      <div className="flex items-stretch border-l border-white/[0.05]">

        {/* AI toggle — visible below lg (mobile + tablet); desktop uses inline rail */}
        {onAiOpen && (
          <button
            type="button"
            onClick={onAiOpen}
            title="AI assistant"
            aria-label="AI assistant"
            className="flex w-10 items-center justify-center border-r border-white/[0.05] text-white/28 transition-colors hover:bg-white/[0.04] hover:text-indigo-300/70 lg:hidden"
          >
            <Bot className="h-3.5 w-3.5" />
          </button>
        )}

        <Link
          href="/settings"
          title="Settings"
          aria-label="Settings"
          className="hidden w-8 items-center justify-center border-r border-white/[0.05] text-white/28 transition-colors hover:bg-white/[0.04] hover:text-white/55 md:flex"
        >
          <Settings className="h-3.5 w-3.5" />
        </Link>

        <button
          type="button"
          onClick={handleLogout}
          title="Log out"
          aria-label="Log out"
          className="flex w-10 items-center justify-center border-r border-white/[0.05] text-white/28 transition-colors hover:bg-white/[0.04] hover:text-white/55 md:w-8"
        >
          <LogOut className="h-3.5 w-3.5" />
        </button>

        {role && (
          <div className="hidden items-center px-3 md:flex">
            <span className="rounded border border-indigo-500/25 bg-indigo-500/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest text-indigo-300/65">
              {role}
            </span>
          </div>
        )}
      </div>
    </header>
  );
}
