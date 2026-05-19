"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { GripVertical, MessageSquare, PanelRightClose, Plus, Sparkles, X } from "lucide-react";
import { useTranslations } from "next-intl";
import AgentChat from "./AgentChat";
import { useCopilotSidebar, MIN_WIDTH, MAX_WIDTH } from "@/context/CopilotSidebarContext";
import { useUserContext } from "@/context/UserContext";
import type { AgentPersona } from "@/lib/agent/client";

/**
 * Copilot sidebar — renders as a flex column in the page flow.
 * Uses CopilotSidebarContext for open/width state.
 *
 * Props:
 *   mode: "column" (desktop/tablet — flex child) | "sheet" (mobile — fixed overlay)
 */
export default function CopilotLauncher({ mode = "column" }: { mode?: "column" | "sheet" }) {
  const t = useTranslations("copilot.launcher");
  const { open, width, setOpen, setWidth } = useCopilotSidebar();
  const user = useUserContext();
  const [isDragging, setIsDragging] = useState(false);

  const companyId = user.companyId;
  const role = user.role;

  const HIDDEN_PATH_PREFIXES = ["/auth/", "/login"];
  const path = typeof window !== "undefined" ? window.location.pathname : "";
  if (HIDDEN_PATH_PREFIXES.some((p) => path.startsWith(p))) return null;

  const canUseCopilot = role === "admin" || role === "super_admin" || role === "accounting" || user.hasPermission("agent:chat:admin") || user.hasPermission("agent:chat:accounting");

  const persona: AgentPersona =
    path.includes("accounting") || role === "accounting" ? "accounting" : "admin";

  // ── Drag-to-resize ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const newWidth = window.innerWidth - e.clientX;
      setWidth(newWidth);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging, setWidth]);

  const handleDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  // ── Collapsed rail ──────────────────────────────────────────────────────────
  if (!open) {
    return (
      <div className="flex h-full w-10 shrink-0 flex-col items-center border-l border-default bg-surface-0 py-3 gap-3">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent/10 text-accent transition-all hover:bg-accent/20 hover:shadow-sm"
          aria-label={t("openTitle")}
        >
          <Sparkles className="h-4 w-4" />
        </button>
        <div className="flex flex-col items-center gap-1.5 mt-1">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="writing-mode-vertical text-[9px] font-medium text-muted transition-colors hover:text-secondary"
            style={{ writingMode: "vertical-rl", textOrientation: "mixed" }}
          >
            {t("collapsedLabel")}
          </button>
        </div>
      </div>
    );
  }

  // ── Chat panel ──────────────────────────────────────────────────────────────
  const panelContent = (
    <div className="flex h-full min-w-0 flex-col">
      {/* Header */}
      <header className="flex h-11 shrink-0 items-center gap-2.5 border-b border-default px-3">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-accent/20 to-accent/5 ring-1 ring-accent/20">
          <Sparkles className="h-3.5 w-3.5 text-accent" />
        </div>
        <div className="flex flex-col leading-tight min-w-0">
          <span className="text-[13px] font-semibold text-primary tracking-tight">{t("title")}</span>
          <span className="text-[10px] text-muted truncate">{t("subtitle")}</span>
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="ml-auto flex h-6 w-6 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-2 hover:text-secondary"
          aria-label={t("close")}
        >
          {mode === "sheet" ? <X className="h-3.5 w-3.5" /> : <PanelRightClose className="h-3.5 w-3.5" />}
        </button>
      </header>

      {/* Chat area */}
      <div className="min-h-0 flex-1">
        {canUseCopilot ? (
          <AgentChat
            companyId={companyId ?? 1}
            persona={persona}
            greeting={t("greeting")}
            allowUpload
            streaming
            variant="page"
          />
        ) : (
          <div className="flex flex-col items-center justify-center gap-3 p-6 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent/10">
              <MessageSquare className="h-5 w-5 text-accent/60" />
            </div>
            <div>
              <p className="text-sm font-medium text-secondary">{t("upgradeRequired")}</p>
              <p className="mt-1 text-xs text-muted">{t("upgradeRequiredHint")}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  const resizeHandle = (
    <div
      onMouseDown={handleDragStart}
      className={`absolute left-0 top-0 z-10 h-full w-4 cursor-col-resize group ${isDragging ? "bg-accent/20" : ""}`}
    >
      <div className={`h-full w-px transition-colors ${isDragging ? "bg-accent/60" : "bg-transparent group-hover:bg-accent/30"}`} />
      <div className="absolute left-0 top-1/2 -translate-y-1/2 flex h-10 w-4 items-center justify-center rounded-r opacity-0 group-hover:opacity-100 transition-opacity">
        <GripVertical className="h-4 w-3 text-muted/50" />
      </div>
      <div className="absolute inset-y-0 -left-2 right-0" />
    </div>
  );

  // ── Sheet mode (mobile overlay) ─────────────────────────────────────────────
  if (mode === "sheet") {
    return (
      <>
        <div className="fixed inset-0 z-40 overlay-backdrop" onClick={() => setOpen(false)} />
        <aside
          className="fixed inset-y-0 right-0 z-50 flex flex-col bg-surface-0 shadow-2xl"
          style={{ width: Math.min(width, window.innerWidth - 16) }}
        >
          {resizeHandle}
          {panelContent}
        </aside>
      </>
    );
  }

  // ── Column mode (desktop/tablet flex child) ─────────────────────────────────
  return (
    <aside
      className="relative flex h-full shrink-0 flex-col border-l border-default bg-surface-0"
      style={{ width }}
    >
      {resizeHandle}
      {panelContent}
    </aside>
  );
}
