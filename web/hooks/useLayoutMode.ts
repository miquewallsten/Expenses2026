"use client";

import { useEffect, useState } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

/** Raw detected viewport breakpoint. */
export type Breakpoint = "mobile" | "tablet" | "desktop";

/**
 * Semantic layout mode — describes the overall shell structure rather than
 * raw pixel widths.  Use this for all structural rendering decisions.
 */
export type LayoutMode =
  | "desktop_three_pane"
  | "tablet_two_pane"
  | "mobile_single_pane";

/**
 * How the left navigation / worklist sidebar is surfaced.
 * - `"pinned"`  always-visible fixed-width column
 * - `"drawer"`  hidden off-screen; opened as a full-height overlay
 */
export type SidebarStyle = "pinned" | "drawer";

/**
 * How the AI assistant is surfaced.
 * - `"rail"`   persistent right-side column (desktop)
 * - `"panel"`  slide-in right-side overlay (tablet)
 * - `"sheet"`  bottom-sheet overlay (mobile)
 */
export type AssistantStyle = "rail" | "panel" | "sheet";

/**
 * Relationship between list and detail areas inside the workspace.
 * - `"split"`   both visible as side-by-side columns (tablet / desktop)
 * - `"stacked"` only one visible at a time (mobile single-pane)
 */
export type ListDetailLayout = "split" | "stacked";

// ── Options ───────────────────────────────────────────────────────────────────

export interface UseLayoutModeOptions {
  activeModuleId?: string | null;
  hasDetail?: boolean;
}

// ── Return value ──────────────────────────────────────────────────────────────

export interface LayoutModeResult {
  mode: LayoutMode;
  breakpoint: Breakpoint;
  sidebarStyle: SidebarStyle;
  assistantStyle: AssistantStyle;
  listDetailLayout: ListDetailLayout;
  activeMobilePane: "list" | "detail";
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  moduleIsNarrow: boolean;
}

// ── Breakpoint thresholds ─────────────────────────────────────────────────────

const BP_TABLET  = 768;
const BP_DESKTOP = 1024;

function detectBreakpoint(width: number): Breakpoint {
  if (width < BP_TABLET)  return "mobile";
  if (width < BP_DESKTOP) return "tablet";
  return "desktop";
}

// ── Decision tables ───────────────────────────────────────────────────────────

const LAYOUT_MODE: Record<Breakpoint, LayoutMode> = {
  mobile:  "mobile_single_pane",
  tablet:  "tablet_two_pane",
  desktop: "desktop_three_pane",
};

const SIDEBAR_STYLE: Record<Breakpoint, SidebarStyle> = {
  mobile:  "drawer",
  tablet:  "pinned",
  desktop: "pinned",
};

const ASSISTANT_STYLE: Record<Breakpoint, AssistantStyle> = {
  mobile:  "sheet",
  tablet:  "panel",
  desktop: "rail",
};

const LIST_DETAIL_LAYOUT: Record<Breakpoint, ListDetailLayout> = {
  mobile:  "stacked",
  tablet:  "split",
  desktop: "split",
};

// ── Hook ──────────────────────────────────────────────────────────────────────

/**
 * `useLayoutMode` — centralised layout decision hub.
 *
 * IMPORTANT: Initializes to "desktop" to match the SSR render, avoiding
 * hydration mismatches. On mount, detects the actual viewport width and
 * updates. The first client paint will briefly show desktop layout before
 * correcting, but since HydrationGuard in layout.tsx shows a spinner until
 * mounted, the user never sees this transition.
 */
export function useLayoutMode(options: UseLayoutModeOptions = {}): LayoutModeResult {
  const { activeModuleId: _activeModuleId, hasDetail = false } = options;

  // Start with "desktop" to match SSR output. HydrationGuard ensures
  // the user sees a spinner, not a layout shift.
  const [breakpoint, setBreakpoint] = useState<Breakpoint>("desktop");

  useEffect(() => {
    const update = () => setBreakpoint(detectBreakpoint(window.innerWidth));
    update(); // sync immediately on first client render
    window.addEventListener("resize", update, { passive: true });
    return () => window.removeEventListener("resize", update);
  }, []);

  const isMobile  = breakpoint === "mobile";
  const isTablet  = breakpoint === "tablet";
  const isDesktop = breakpoint === "desktop";

  const activeMobilePane: "list" | "detail" =
    isMobile && !hasDetail ? "list" : "detail";

  return {
    mode:             LAYOUT_MODE[breakpoint],
    breakpoint,
    sidebarStyle:     SIDEBAR_STYLE[breakpoint],
    assistantStyle:   ASSISTANT_STYLE[breakpoint],
    listDetailLayout: LIST_DETAIL_LAYOUT[breakpoint],
    activeMobilePane,
    isMobile,
    isTablet,
    isDesktop,
    moduleIsNarrow: isMobile,
  };
}
