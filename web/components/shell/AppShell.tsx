"use client";

import { useState, useEffect, useRef, type ReactNode } from "react";
import { Bot, ChevronLeft, ChevronRight, X } from "lucide-react";
import { useTranslations } from "next-intl";
import TopBar from "@/components/shell/TopBar";
import NavRail, { type NavRailItem } from "@/components/shell/NavRail";
import { useLayoutMode } from "@/hooks/useLayoutMode";

// ── Types ─────────────────────────────────────────────────────────────────────

export type GlobalNavItem = NavRailItem;

export type AppShellProps = {
  title: string;
  globalNavItems: GlobalNavItem[];
  workListTitle: string;
  workList: ReactNode | ((onClose: () => void) => ReactNode);
  detail: ReactNode;
  aiPanel?: ReactNode;
  detailFlush?: boolean;
  navSidebar?: boolean;
  mergedNav?: boolean;
  logoUrl?: string | null;
};

// ── Layout constants ──────────────────────────────────────────────────────────

const WL_MIN = 240;
const WL_MAX = 400;
const WL_DEFAULT = 280;
const DETAIL_MIN = 360;

const NL_MIN = 150;
const NL_MAX = 220;
const NL_DEFAULT = 180;
const WS_MIN = 500;

const AI_MIN = 260;
const AI_MAX = 400;
const AI_DEFAULT = 320;
const AI_COLLAPSED_W = 32;

const ML_MIN = 220;
const ML_MAX = 320;
const ML_DEFAULT = 260;

const TABLET_NAV_W = 160;
const TABLET_WL_W = 200;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function AppShell({
  title,
  globalNavItems,
  workListTitle,
  workList,
  detail,
  aiPanel,
  detailFlush = false,
  navSidebar = false,
  mergedNav = false,
  logoUrl,
}: AppShellProps) {

  const t = useTranslations("shell");
  const { isMobile, isTablet, isDesktop } = useLayoutMode();

  // Column sizing
  const leftMin = mergedNav ? ML_MIN : navSidebar ? NL_MIN : WL_MIN;
  const leftMax = mergedNav ? ML_MAX : navSidebar ? NL_MAX : WL_MAX;
  const leftDefault = mergedNav ? ML_DEFAULT : navSidebar ? NL_DEFAULT : WL_DEFAULT;
  const detailMinW = navSidebar ? WS_MIN : DETAIL_MIN;

  // State
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const [workListWidth, setWorkListWidth] = useState(leftDefault);
  const [aiWidth, setAiWidth] = useState(AI_DEFAULT);
  const [navDrawerOpen, setNavDrawerOpen] = useState(false);
  const [aiSheetOpen, setAiSheetOpen] = useState(false);

  // Close overlays on breakpoint change
  useEffect(() => {
    if (!isMobile) setNavDrawerOpen(false);
    if (isDesktop) setAiSheetOpen(false);
  }, [isMobile, isDesktop]);

  // Drag resize
  const limitsRef = useRef({ leftMin, leftMax });
  limitsRef.current = { leftMin, leftMax };

  const dragRef = useRef<{ type: "wl" | "ai"; startX: number; startWidth: number; latestX: number } | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragRef.current) return;
      dragRef.current.latestX = e.clientX;
      if (rafRef.current !== null) return;
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        const s = dragRef.current;
        if (!s) return;
        const dx = s.latestX - s.startX;
        const { leftMin: lMin, leftMax: lMax } = limitsRef.current;
        if (s.type === "wl") {
          setWorkListWidth(clamp(s.startWidth + dx, lMin, lMax));
        } else {
          setAiWidth(clamp(s.startWidth - dx, AI_MIN, AI_MAX));
        }
      });
    };

    const onUp = () => {
      if (!dragRef.current) return;
      dragRef.current = null;
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
  }, []);

  const startDrag = (type: "wl" | "ai", e: React.MouseEvent, currentWidth: number) => {
    e.preventDefault();
    dragRef.current = { type, startX: e.clientX, startWidth: currentWidth, latestX: e.clientX };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  };

  const resolveWL = (onClose: () => void): ReactNode =>
    typeof workList === "function" ? workList(onClose) : workList;

  const closeDrawer = () => setNavDrawerOpen(false);
  const noop = () => {};

  const detailContent = (
    <div className={detailFlush ? "min-h-0 flex-1 overflow-hidden" : "min-h-0 flex-1 overflow-y-auto px-4 py-3"}>
      {detail}
    </div>
  );

  // ── Mobile layout ─────────────────────────────────────────────────────────

  if (isMobile) {
    return (
      <div
        className="flex h-[100dvh] flex-col overflow-hidden bg-surface-0 text-primary"
        style={{ paddingTop: "var(--sai-t)", paddingBottom: "var(--sai-b)" }}
      >
        <TopBar
          title={title}
          onMenuOpen={() => setNavDrawerOpen(true)}
          onAiOpen={aiPanel ? () => setAiSheetOpen((v) => !v) : undefined}
        />

        <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {detailContent}
        </main>

        {/* Nav drawer */}
        {navDrawerOpen && (
          <>
            <div
              className="fixed inset-0 z-40 bg-black/50 backdrop-blur-[1px]"
              onClick={() => setNavDrawerOpen(false)}
              aria-hidden="true"
            />
            <div
              className="animate-slide-in-right fixed inset-y-0 left-0 z-50 flex w-[min(280px,85vw)] flex-col overflow-hidden bg-surface-1 shadow-xl"
              style={{ paddingTop: "var(--sai-t)", paddingBottom: "var(--sai-b)" }}
            >
              <div className="flex h-9 shrink-0 items-center justify-between border-b border-subtle px-3">
                <span className="text-[10px] font-bold uppercase tracking-widest text-secondary">
                  {workListTitle}
                </span>
                <button
                  type="button"
                  onClick={() => setNavDrawerOpen(false)}
                  aria-label={t("closeNavigation")}
                  className="flex h-7 w-7 items-center justify-center rounded text-muted transition-colors hover:bg-surface-2 hover:text-secondary"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto">
                {resolveWL(closeDrawer)}
              </div>
            </div>
          </>
        )}

        {/* AI bottom sheet */}
        {aiPanel && aiSheetOpen && (
          <>
            <div
              className="fixed inset-0 z-40 bg-black/50 backdrop-blur-[1px]"
              onClick={() => setAiSheetOpen(false)}
              aria-hidden="true"
            />
            <div
              className="animate-slide-up fixed inset-x-0 bottom-0 z-50 flex max-h-[75dvh] flex-col rounded-t-xl bg-surface-2 shadow-xl ring-1 ring-subtle"
              style={{ paddingBottom: "var(--sai-b)" }}
            >
              <div className="flex justify-center pb-1 pt-3">
                <div className="h-1 w-10 rounded-full bg-subtle" />
              </div>
              <div className="flex h-9 shrink-0 items-center justify-between border-b border-subtle px-3">
                <div className="flex items-center gap-2">
                  <Bot className="h-3.5 w-3.5 text-accent" />
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted">
                    {t("aiAssistant")}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setAiSheetOpen(false)}
                  aria-label={t("closeAI")}
                  className="flex h-7 w-7 items-center justify-center rounded text-muted transition-colors hover:bg-surface-2 hover:text-secondary"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto">
                {aiPanel}
              </div>
            </div>
          </>
        )}
      </div>
    );
  }

  // ── Tablet layout ─────────────────────────────────────────────────────────

  if (isTablet) {
    const tabletLeftW = navSidebar ? TABLET_NAV_W : TABLET_WL_W;

    return (
      <div
        className="flex h-[100dvh] flex-col overflow-hidden bg-surface-0 text-primary"
        style={{ paddingTop: "var(--sai-t)", paddingBottom: "var(--sai-b)" }}
      >
        <TopBar
          title={title}
          onAiOpen={aiPanel ? () => setAiSheetOpen((v) => !v) : undefined}
        />

        <div className="flex min-h-0 flex-1 overflow-hidden">
          <NavRail
            collapsed={true}
            onToggle={() => {}}
            items={globalNavItems}
            hideToggle
            logoUrl={logoUrl}
          />

          <div
            style={{ width: tabletLeftW }}
            className="flex shrink-0 flex-col overflow-hidden border-r border-subtle bg-surface-1"
          >
            <div className="flex h-9 shrink-0 items-center border-b border-subtle px-3">
              <span className="text-[10px] font-bold uppercase tracking-widest text-muted">
                {workListTitle}
              </span>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {resolveWL(noop)}
            </div>
          </div>

          <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-surface-0">
            {detailContent}
          </div>

          {aiPanel && (
            <div
              style={{ width: AI_COLLAPSED_W }}
              className="flex shrink-0 flex-col items-center border-l border-subtle bg-surface-1 pt-2"
            >
              <button
                type="button"
                title={t("openAIAssistant")}
                aria-label={t("openAIAssistant")}
                onClick={() => setAiSheetOpen((v) => !v)}
                className="flex h-7 w-7 items-center justify-center rounded text-muted transition-colors hover:bg-surface-2 hover:text-accent"
              >
                <Bot className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>

        {/* AI side panel */}
        {aiPanel && aiSheetOpen && (
          <>
            <div
              className="fixed inset-0 z-40 bg-black/50 backdrop-blur-[1px]"
              onClick={() => setAiSheetOpen(false)}
              aria-hidden="true"
            />
            <div className="animate-slide-in-right fixed inset-y-0 right-0 z-50 flex w-80 flex-col overflow-hidden bg-surface-2 shadow-xl ring-1 ring-subtle">
              <div className="flex h-9 shrink-0 items-center justify-between border-b border-subtle px-3">
                <div className="flex items-center gap-2">
                  <Bot className="h-3.5 w-3.5 text-accent" />
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted">
                    {t("aiAssistant")}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setAiSheetOpen(false)}
                  aria-label={t("closeAI")}
                  className="flex h-7 w-7 items-center justify-center rounded text-muted transition-colors hover:bg-surface-2 hover:text-secondary"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto">
                {aiPanel}
              </div>
            </div>
          </>
        )}
      </div>
    );
  }

  // ── Desktop layout ────────────────────────────────────────────────────────

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-surface-0 text-primary">
      <TopBar title={title} />

      <div className="flex flex-1 overflow-hidden">
        {mergedNav ? (
          <div
            style={{ width: workListWidth, minWidth: leftMin, maxWidth: leftMax, willChange: "width" }}
            className="flex shrink-0 flex-col overflow-hidden border-r border-subtle bg-surface-1"
          >
            <NavRail
              collapsed={false}
              onToggle={() => {}}
              items={globalNavItems}
              hideToggle
              footerSlot={resolveWL(noop)}
              fullWidth
              logoUrl={logoUrl}
            />
          </div>
        ) : (
          <>
            <NavRail
              collapsed={leftCollapsed}
              onToggle={() => setLeftCollapsed((v) => !v)}
              items={globalNavItems}
              logoUrl={logoUrl}
            />

            <div
              style={{ width: workListWidth, minWidth: leftMin, maxWidth: leftMax, willChange: "width" }}
              className="flex shrink-0 flex-col overflow-hidden border-r border-subtle bg-surface-1"
            >
              <div className="flex h-9 shrink-0 items-center border-b border-subtle px-3">
                <span className="text-[10px] font-bold uppercase tracking-widest text-muted">
                  {workListTitle}
                </span>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto">
                {resolveWL(noop)}
              </div>
            </div>
          </>
        )}

        {/* Resizer */}
        <div
          role="separator"
          aria-orientation="vertical"
          className="group relative z-10 flex w-1.5 shrink-0 cursor-col-resize items-stretch"
          onMouseDown={(e) => startDrag("wl", e, workListWidth)}
        >
          <div className="mx-auto w-px flex-1 bg-subtle transition-colors group-hover:bg-accent group-active:bg-accent-hover" />
        </div>

        {/* Detail */}
        <div
          style={{ minWidth: detailMinW }}
          className="flex flex-1 flex-col overflow-hidden bg-surface-0"
        >
          {detailContent}
        </div>

        {/* AI resizer */}
        {aiPanel && !rightCollapsed && (
          <div
            role="separator"
            aria-orientation="vertical"
            className="group relative z-10 flex w-1.5 shrink-0 cursor-col-resize items-stretch"
            onMouseDown={(e) => startDrag("ai", e, aiWidth)}
          >
            <div className="mx-auto w-px flex-1 bg-subtle transition-colors group-hover:bg-accent group-active:bg-accent-hover" />
          </div>
        )}

        {/* AI rail */}
        {aiPanel && (
          rightCollapsed ? (
            <div
              style={{ width: AI_COLLAPSED_W }}
              className="flex shrink-0 flex-col items-center border-l border-subtle bg-surface-1 pt-2"
            >
              <button
                type="button"
                title="Expand AI panel"
                onClick={() => setRightCollapsed(false)}
                className="flex h-7 w-7 items-center justify-center rounded text-muted transition-colors hover:bg-surface-2 hover:text-secondary"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <div
              style={{ width: aiWidth, minWidth: AI_MIN, maxWidth: AI_MAX, willChange: "width" }}
              className="relative flex shrink-0 flex-col overflow-hidden border-l border-subtle bg-surface-1"
            >
              <div className="absolute right-1.5 top-1.5 z-20">
                <button
                  type="button"
                  title="Collapse AI panel"
                  onClick={() => setRightCollapsed(true)}
                  className="flex h-6 w-6 items-center justify-center rounded text-muted transition-colors hover:bg-surface-2 hover:text-secondary"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto">
                {aiPanel}
              </div>
            </div>
          )
        )}
      </div>
    </div>
  );
}