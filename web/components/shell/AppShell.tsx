"use client";

import { useState, useEffect, useRef, type ReactNode } from "react";
import { Bot, ChevronLeft, ChevronRight, X } from "lucide-react";
import TopBar from "@/components/shell/TopBar";
import NavRail, { type NavRailItem } from "@/components/shell/NavRail";
import { useLayoutMode } from "@/hooks/useLayoutMode";

// ── Types ─────────────────────────────────────────────────────────────────────

export type GlobalNavItem = NavRailItem;

export type AppShellProps = {
  title: string;
  globalNavItems: GlobalNavItem[];
  workListTitle: string;
  /**
   * The content rendered in the left pane.
   *
   * Accepts either:
   * - A plain `ReactNode` (all existing callers — no behaviour change).
   * - A factory `(onClose: () => void) => ReactNode` — AppShell passes a
   *   function that closes the mobile nav drawer so the list item can call it
   *   after selection.  On tablet/desktop the callback is a no-op.
   */
  workList: ReactNode | ((onClose: () => void) => ReactNode);
  detail: ReactNode;
  aiPanel?: ReactNode;
  /**
   * When true, the detail column renders with no padding and `overflow-hidden`
   * instead of the default `overflow-y-auto px-5 py-4`.  Use this when a
   * module manages its own internal layout and scrolling.
   */
  detailFlush?: boolean;
  /**
   * Switch the left column to "module navigation" mode (My Work portal).
   *
   * Queue mode (default)  →  left 240–460 px (def 300),  center min 360 px
   * Nav mode              →  left 150–240 px (def 180),  center min 560 px
   */
  navSidebar?: boolean;
};

// ── Layout constants ──────────────────────────────────────────────────────────

// Queue mode
const WL_MIN = 240;
const WL_MAX = 460;
const WL_DEFAULT = 300;
const DETAIL_MIN = 360;

// Nav (My Work) mode
const NL_MIN = 150;
const NL_MAX = 240;
const NL_DEFAULT = 180;
const WS_MIN = 560;

// AI rail (desktop only)
const AI_MIN = 240;
const AI_MAX = 440;
const AI_DEFAULT = 280;
const AI_COLLAPSED_W = 28;

// Tablet fixed widths
const TABLET_NAV_W = 160;  // navSidebar mode
const TABLET_WL_W  = 220;  // queue mode

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
}: AppShellProps) {

  // ── Breakpoint / layout mode ──────────────────────────────────────────────
  //
  // Centralised via useLayoutMode.  AppShell only needs the three booleans;
  // module components call the hook independently with their own hasDetail
  // context to derive activeMobilePane.

  const { isMobile, isTablet, isDesktop } = useLayoutMode();

  // ── Desktop column sizing ─────────────────────────────────────────────────

  const leftMin     = navSidebar ? NL_MIN     : WL_MIN;
  const leftMax     = navSidebar ? NL_MAX     : WL_MAX;
  const leftDefault = navSidebar ? NL_DEFAULT : WL_DEFAULT;
  const detailMinW  = navSidebar ? WS_MIN     : DETAIL_MIN;

  // ── State ─────────────────────────────────────────────────────────────────

  const [leftCollapsed,  setLeftCollapsed]  = useState(false); // desktop NavRail
  const [rightCollapsed, setRightCollapsed] = useState(false); // desktop AI rail
  const [workListWidth,  setWorkListWidth]  = useState(leftDefault);
  const [aiWidth,        setAiWidth]        = useState(AI_DEFAULT);

  // Overlay open states (mobile / tablet)
  const [navDrawerOpen, setNavDrawerOpen] = useState(false);
  const [aiSheetOpen,   setAiSheetOpen]   = useState(false);

  // Close overlays on breakpoint change
  useEffect(() => {
    if (!isMobile)  setNavDrawerOpen(false);
    if (isDesktop)  setAiSheetOpen(false);
  }, [isMobile, isDesktop]);

  // ── Drag resize (desktop only) ────────────────────────────────────────────

  const limitsRef = useRef({ leftMin, leftMax });
  limitsRef.current = { leftMin, leftMax };

  const dragRef = useRef<{
    type: "wl" | "ai";
    startX: number;
    startWidth: number;
    latestX: number;
  } | null>(null);

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

  const startDrag = (
    type: "wl" | "ai",
    e: React.MouseEvent,
    currentWidth: number,
  ) => {
    e.preventDefault();
    dragRef.current = { type, startX: e.clientX, startWidth: currentWidth, latestX: e.clientX };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  };

  // ── Work-list resolver ──────────────────────────────────────────────────
  //
  // Supports two shapes for `workList`:
  //   1. ReactNode       — used by all non-nav-sidebar pages; render as-is.
  //   2. (fn) => ReactNode — used by nav-sidebar (My Work) pages; called with
  //      `closeDrawer` on mobile so selecting a module auto-closes the drawer.

  const resolveWL = (onClose: () => void): ReactNode =>
    typeof workList === "function" ? workList(onClose) : workList;

  const closeDrawer = () => setNavDrawerOpen(false);
  const noop        = () => {};

  // ── Shared detail content ─────────────────────────────────────────────────

  const detailContent = (
    <div className={detailFlush
      ? "min-h-0 flex-1 overflow-hidden"
      : "min-h-0 flex-1 overflow-y-auto px-5 py-4"
    }>
      {detail}
    </div>
  );

  // ── Mobile layout ─────────────────────────────────────────────────────────
  //
  // Single-column workspace.  Navigation and AI panel live in overlay layers.

  if (isMobile) {
    return (
      /*
       * pt / pb absorb env(safe-area-inset-*) so the shell never renders content
       * behind the iOS status bar or home indicator.  bg-zinc-950 fills those
       * dead zones so the UI looks intentional rather than clipped.
       */
      <div
        className="flex h-[100dvh] flex-col overflow-hidden bg-zinc-950 text-white"
        style={{ paddingTop: "var(--sai-t)", paddingBottom: "var(--sai-b)" }}
      >

        <TopBar
          title={title}
          onMenuOpen={() => setNavDrawerOpen(true)}
          onAiOpen={aiPanel ? () => setAiSheetOpen((v) => !v) : undefined}
        />

        {/* Full-width workspace */}
        <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {detailContent}
        </main>

            {/* Nav drawer ─ worklist / module nav */}
        {navDrawerOpen && (
          <>
            <div
              className="fixed inset-0 z-40 bg-black/60 backdrop-blur-[1px]"
              onClick={() => setNavDrawerOpen(false)}
              aria-hidden="true"
            />
            {/*
             * pt-[var(--sai-t)] — drawer header clears the status bar on iOS.
             * pb-[var(--sai-b)] — scrollable content clears the home indicator.
             */}
            <div
              className="fixed inset-y-0 left-0 z-50 flex w-[min(280px,85vw)] flex-col overflow-hidden bg-zinc-950 shadow-2xl"
              style={{ paddingTop: "var(--sai-t)", paddingBottom: "var(--sai-b)" }}
            >
              <div className="flex h-11 shrink-0 items-center justify-between border-b border-white/[0.07] px-4">
                <span className="text-[10px] font-bold uppercase tracking-widest text-white/45">
                  {workListTitle}
                </span>
                <button
                  type="button"
                  onClick={() => setNavDrawerOpen(false)}
                  aria-label="Close navigation"
                  className="flex h-8 w-8 items-center justify-center rounded text-white/30 transition-colors hover:bg-white/[0.06] hover:text-white/65"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className={`min-h-0 flex-1 ${navSidebar ? "overflow-hidden" : "overflow-y-auto"}`}>
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
            {/*
             * pb-[var(--sai-b)] — ensures the sheet's bottom content (chat input)
             * is never hidden under the iOS home indicator.
             */}
            <div
              className="fixed inset-x-0 bottom-0 z-50 flex max-h-[75dvh] flex-col rounded-t-2xl bg-zinc-900 shadow-2xl ring-1 ring-white/[0.08]"
              style={{ paddingBottom: "var(--sai-b)" }}
            >
              {/* Drag-handle pill */}
              <div className="flex justify-center pb-1 pt-2.5">
                <div className="h-1 w-10 rounded-full bg-white/[0.12]" />
              </div>
              <div className="flex h-9 shrink-0 items-center justify-between px-4">
                <div className="flex items-center gap-2">
                  <Bot className="h-3 w-3 text-indigo-300/60" />
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-white/40">
                    AI Assistant
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setAiSheetOpen(false)}
                  aria-label="Close AI assistant"
                  className="flex h-7 w-7 items-center justify-center rounded text-white/30 transition-colors hover:bg-white/[0.06] hover:text-white/60"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto border-t border-white/[0.07]">
                {aiPanel}
              </div>
            </div>
          </>
        )}

      </div>
    );
  }

  // ── Tablet layout ─────────────────────────────────────────────────────────
  //
  // NavRail pinned to icon-only (72 px).  Left pane fixed-width (no drag).
  // AI panel collapses to a 28 px strip; the TopBar AI button opens a slide-in
  // side panel overlay.

  if (isTablet) {
    const tabletLeftW = navSidebar ? TABLET_NAV_W : TABLET_WL_W;

    return (
      <div
        className="flex h-[100dvh] flex-col overflow-hidden bg-zinc-950 text-white"
        style={{ paddingTop: "var(--sai-t)", paddingBottom: "var(--sai-b)" }}
      >

        <TopBar
          title={title}
          onAiOpen={aiPanel ? () => setAiSheetOpen((v) => !v) : undefined}
        />

        <div className="flex min-h-0 flex-1 overflow-hidden">

          {/* NavRail — icon-only, no toggle button on tablet */}
          <NavRail
            collapsed={true}
            onToggle={() => {}}
            items={globalNavItems}
            hideToggle
          />

          {/* Left pane — fixed width, no drag handle */}
          <div
            style={{ width: tabletLeftW }}
            className="flex shrink-0 flex-col overflow-hidden border-r border-white/[0.07] bg-zinc-950"
          >
            <div className="flex h-9 shrink-0 items-center border-b border-white/[0.07] px-3">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-white/40">
                {workListTitle}
              </span>
            </div>
            <div className={navSidebar ? "min-h-0 flex-1 overflow-hidden" : "min-h-0 flex-1 overflow-y-auto"}>
              {resolveWL(noop)}
            </div>
          </div>

          {/* Detail / workspace */}
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-zinc-950">
            {detailContent}
          </div>

          {/* AI toggle strip (collapsed icon; TopBar button also opens panel) */}
          {aiPanel && (
            <div
              style={{ width: AI_COLLAPSED_W }}
              className="flex shrink-0 flex-col items-center border-l border-white/[0.07] bg-zinc-950 pt-2"
            >
              <button
                type="button"
                title="Open AI assistant"
                aria-label="Open AI assistant"
                onClick={() => setAiSheetOpen((v) => !v)}
                className="flex h-7 w-7 items-center justify-center rounded text-white/20 transition-colors hover:bg-white/[0.06] hover:text-indigo-300/70"
              >
                <Bot className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

        </div>

        {/* AI side-panel overlay */}
        {aiPanel && aiSheetOpen && (
          <>
            <div
              className="fixed inset-0 z-40 bg-black/50 backdrop-blur-[1px]"
              onClick={() => setAiSheetOpen(false)}
              aria-hidden="true"
            />
            <div className="fixed inset-y-0 right-0 z-50 flex w-80 flex-col overflow-hidden bg-zinc-900 shadow-2xl ring-1 ring-white/[0.08]">
              <div className="flex h-9 shrink-0 items-center justify-between border-b border-white/[0.07] px-4">
                <div className="flex items-center gap-2">
                  <Bot className="h-3 w-3 text-indigo-300/60" />
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-white/40">
                    AI Assistant
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setAiSheetOpen(false)}
                  aria-label="Close AI assistant"
                  className="flex h-7 w-7 items-center justify-center rounded text-white/30 transition-colors hover:bg-white/[0.06] hover:text-white/60"
                >
                  <X className="h-3.5 w-3.5" />
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
  //
  // Exact existing behaviour: NavRail + draggable left pane + workspace + AI rail.
  // h-[100dvh] instead of h-screen for consistent behaviour across all breakpoints.

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-zinc-950 text-white">

      <TopBar title={title} />

      <div className="flex flex-1 overflow-hidden">

        {/* ── Global nav rail ───────────────────────────────────────── */}
        <NavRail
          collapsed={leftCollapsed}
          onToggle={() => setLeftCollapsed((v) => !v)}
          items={globalNavItems}
        />

        {/* ── Left pane (worklist in queue mode; module nav in nav mode) ── */}
        <div
          style={{ width: workListWidth, minWidth: leftMin, maxWidth: leftMax, willChange: "width" }}
          className="flex shrink-0 flex-col overflow-hidden border-r border-white/[0.07] bg-zinc-950"
        >
          <div className="flex h-9 shrink-0 items-center border-b border-white/[0.07] px-3">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-white/40">
              {workListTitle}
            </span>
          </div>
          <div className={navSidebar ? "min-h-0 flex-1 overflow-hidden" : "min-h-0 flex-1 overflow-y-auto"}>
            {resolveWL(noop)}
          </div>
        </div>

        {/* ── Resizer: worklist / detail ────────────────────────────── */}
        <div
          role="separator"
          aria-orientation="vertical"
          className="group relative z-10 flex w-2 shrink-0 cursor-col-resize items-stretch"
          onMouseDown={(e) => startDrag("wl", e, workListWidth)}
        >
          <div className="mx-auto w-px flex-1 bg-white/[0.07] transition-colors duration-100 group-hover:bg-indigo-500/60 group-active:bg-indigo-500/80" />
        </div>

        {/* ── Detail / workspace pane ───────────────────────────────── */}
        <div
          style={{ minWidth: detailMinW }}
          className="flex flex-1 flex-col overflow-hidden bg-zinc-950"
        >
          {detailContent}
        </div>

        {/* ── Resizer: detail / AI rail ─────────────────────────────── */}
        {aiPanel && !rightCollapsed && (
          <div
            role="separator"
            aria-orientation="vertical"
            className="group relative z-10 flex w-2 shrink-0 cursor-col-resize items-stretch"
            onMouseDown={(e) => startDrag("ai", e, aiWidth)}
          >
            <div className="mx-auto w-px flex-1 bg-white/[0.07] transition-colors duration-100 group-hover:bg-indigo-500/60 group-active:bg-indigo-500/80" />
          </div>
        )}

        {/* ── AI copilot rail ───────────────────────────────────────── */}
        {aiPanel && (
          rightCollapsed ? (
            /* Collapsed strip */
            <div
              style={{ width: AI_COLLAPSED_W }}
              className="flex shrink-0 flex-col items-center border-l border-white/[0.07] bg-zinc-950 pt-2"
            >
              <button
                type="button"
                title="Expand AI panel"
                onClick={() => setRightCollapsed(false)}
                className="flex h-6 w-6 items-center justify-center rounded text-white/25 transition-colors hover:bg-white/[0.06] hover:text-white/50"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            /* Expanded rail */
            <div
              style={{ width: aiWidth, minWidth: AI_MIN, maxWidth: AI_MAX, willChange: "width" }}
              className="relative flex shrink-0 flex-col overflow-hidden border-l border-white/[0.07] bg-zinc-950"
            >
              {/* Collapse toggle */}
              <div className="absolute right-1.5 top-1.5 z-20">
                <button
                  type="button"
                  title="Collapse AI panel"
                  onClick={() => setRightCollapsed(true)}
                  className="flex h-5 w-5 items-center justify-center rounded text-white/20 transition-colors hover:bg-white/[0.06] hover:text-white/40"
                >
                  <ChevronRight className="h-3 w-3" />
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

