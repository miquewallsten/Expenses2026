"use client";

import { useEffect, useState } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

/** Raw detected viewport breakpoint. */
export type Breakpoint = "mobile" | "tablet" | "desktop";

/**
 * Semantic layout mode — describes the overall shell structure rather than
 * raw pixel widths.  Use this for all structural rendering decisions.
 *
 * - `desktop_three_pane`  NavRail + draggable left pane + workspace + AI rail
 * - `tablet_two_pane`     Icon-only NavRail + fixed left pane + workspace; AI as overlay
 * - `mobile_single_pane`  One pane visible at a time; nav and AI in overlays
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
  /**
   * Id of the currently active module.  Reserved for future per-module layout
   * overrides (e.g. a wide-workspace module that always wants a wider pane).
   * Has no effect on current layout decisions.
   */
  activeModuleId?: string | null;

  /**
   * Whether the workspace currently has a detail item selected.
   *
   * On `mobile_single_pane` this controls which pane fills the screen:
   * `"detail"` when true (an item is selected), `"list"` when false.
   * On tablet / desktop both panes are always visible so this is ignored.
   */
  hasDetail?: boolean;
}

// ── Return value ──────────────────────────────────────────────────────────────

export interface LayoutModeResult {
  // ── Core ──────────────────────────────────────────────────────────────────

  /** High-level layout mode — use this for structural rendering decisions. */
  mode: LayoutMode;

  /** Raw breakpoint — prefer `mode` for structure; use this for fine-tuning. */
  breakpoint: Breakpoint;

  // ── Shell-level decisions ─────────────────────────────────────────────────

  /**
   * Whether the left nav / worklist sidebar is always visible (`"pinned"`) or
   * opens as a slide-in overlay (`"drawer"`).
   */
  sidebarStyle: SidebarStyle;

  /**
   * How the AI assistant is surfaced: persistent column, side panel, or
   * bottom sheet.
   */
  assistantStyle: AssistantStyle;

  // ── Workspace-level decisions ─────────────────────────────────────────────

  /**
   * Whether the list and detail areas sit side-by-side (`"split"`) or only
   * one is shown at a time (`"stacked"`).
   */
  listDetailLayout: ListDetailLayout;

  /**
   * On `mobile_single_pane`: which pane should fill the viewport.
   * - `"list"`   — no item selected; show the list
   * - `"detail"` — an item is selected; show the detail view
   *
   * On tablet / desktop both panes are always visible so this is always
   * `"detail"` (the value is safe to use in conditional rendering on any
   * breakpoint because non-mobile never hides the detail pane).
   */
  activeMobilePane: "list" | "detail";

  // ── Convenience booleans ──────────────────────────────────────────────────

  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;

  /**
   * True when the module's own internal list + detail split should collapse
   * to a single-pane view.  Modules use this to toggle between their split
   * and stacked rendering.  Currently equivalent to `isMobile`.
   */
  moduleIsNarrow: boolean;
}

// ── Breakpoint thresholds ─────────────────────────────────────────────────────

/** Below this width: mobile */
const BP_TABLET  = 768;
/** Below this width: tablet; at or above: desktop */
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
 * `useLayoutMode` — centralised layout decision hub for the My Work portal.
 *
 * Derives a `LayoutMode` and a set of layout decisions from the current
 * viewport width, optionally refined by the active module and whether a
 * detail item is selected.
 *
 * All breakpoint listeners are set up once per mount; multiple consumers on
 * the same page each own their own listener (React state batches the updates).
 *
 * ### Shell-level usage (no module context needed)
 * ```ts
 * const { isMobile, sidebarStyle, assistantStyle } = useLayoutMode();
 * ```
 *
 * ### Module-level usage (with detail selection context)
 * ```ts
 * const { moduleIsNarrow, activeMobilePane } = useLayoutMode({
 *   activeModuleId: activeModule?.id,
 *   hasDetail: selected !== null,
 * });
 * // Show list when activeMobilePane === "list", detail otherwise.
 * ```
 */
export function useLayoutMode(options: UseLayoutModeOptions = {}): LayoutModeResult {
  const { activeModuleId: _activeModuleId, hasDetail = false } = options;

  // Initialise to "desktop" so server-rendered HTML matches the most likely
  // first-load state and avoids a layout shift on hydration.
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

  // On mobile: show list unless a detail item is selected.
  // On tablet / desktop both panes are always visible.
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
