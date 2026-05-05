"use client";

import { useCallback, useEffect, useState } from "react";
import { Bot, X } from "lucide-react";
import { useTranslations } from "next-intl";
import AgentChat from "./AgentChat";
import { getCurrentCompanyId, getCurrentRole } from "@/lib/session";

const HIDDEN_PATH_PREFIXES = ["/auth/", "/login"];

/**
 * Global floating Copilot launcher (admin/finance_manager personas).
 *
 * - Renders a fixed bottom-right button on every page where the user is
 *   authenticated as admin.
 * - Click (or Cmd/Ctrl+K) opens a slide-in drawer hosting the streaming
 *   admin AgentChat.
 * - Hidden on auth pages and for non-admin sessions to avoid leaking the
 *   admin persona to roles that aren't allowed to use it.
 */
export default function CopilotLauncher() {
  const t = useTranslations("copilot.launcher");
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [companyId, setCompanyId] = useState<number | null>(null);
  const [role, setRole] = useState<string | null>(null);

  // Avoid hydration mismatch — only render after mount so we can read
  // localStorage-backed session state.
  useEffect(() => {
    setMounted(true);
    const cid = getCurrentCompanyId();
    setCompanyId(cid ? Number(cid) : null);
    setRole(getCurrentRole());
  }, []);

  // Re-check session whenever the route changes so post-login the launcher
  // appears without a full reload. Cheap polling on focus is enough.
  useEffect(() => {
    const refresh = () => {
      const cid = getCurrentCompanyId();
      setCompanyId(cid ? Number(cid) : null);
      setRole(getCurrentRole());
    };
    window.addEventListener("focus", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  // Cmd/Ctrl+K toggle.
  const toggle = useCallback(() => setOpen((v) => !v), []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        toggle();
      } else if (e.key === "Escape" && open) {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, toggle]);

  if (!mounted) return null;

  // Hide on auth pages.
  const path = typeof window !== "undefined" ? window.location.pathname : "";
  if (HIDDEN_PATH_PREFIXES.some((p) => path.startsWith(p))) return null;

  // Admin persona is admin-only on the backend; only show launcher for admins.
  const isAdmin = role === "admin";
  if (!isAdmin || companyId == null) return null;

  return (
    <>
      <button
        type="button"
        onClick={toggle}
        title={t("openTitle")}
        aria-label={t("openTitle")}
        className="fixed bottom-4 right-4 z-40 flex h-10 w-10 items-center justify-center rounded-full border bg-accent-muted bg-accent-muted text-accent shadow-lg shadow-black/40 transition-all hover:scale-105 hover:bg-accent-hover hover:text-primary"
      >
        <Bot className="h-4 w-4" />
      </button>

      {open && (
        <>
          {/* backdrop */}
          <div
            className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          {/* drawer */}
          <aside
            role="dialog"
            aria-label={t("title")}
            className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[440px] flex-col border-l border-default bg-surface-0 shadow-2xl"
          >
            <header className="flex h-11 shrink-0 items-center gap-2 border-b border-default px-3">
              <div className="flex h-5 w-5 items-center justify-center rounded bg-accent-muted ring-1 ring-blue-500/20">
                <Bot className="h-3 w-3 text-accent" />
              </div>
              <div className="flex flex-col leading-tight">
                <span className="text-[11px] font-semibold text-secondary">{t("title")}</span>
                <span className="text-[9px] uppercase tracking-widest text-muted">
                  {t("subtitle")}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="ml-auto flex h-6 w-6 items-center justify-center rounded text-muted transition-colors hover:bg-surface-2 hover:text-secondary"
                aria-label={t("close")}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </header>
            <div className="min-h-0 flex-1">
              <AgentChat
                companyId={companyId}
                persona="admin"
                greeting={t("greeting")}
                allowUpload
                streaming
                variant="page"
              />
            </div>
          </aside>
        </>
      )}
    </>
  );
}
