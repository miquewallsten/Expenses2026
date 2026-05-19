"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

const SIDEBAR_KEY = "copilot-sidebar-open";
const WIDTH_KEY = "copilot-sidebar-width";

const MIN_WIDTH = 280;
const MAX_WIDTH = 720;
const DEFAULT_WIDTH = 320;

export { MIN_WIDTH, MAX_WIDTH, DEFAULT_WIDTH };

export interface CopilotSidebarValue {
  open: boolean;
  width: number;
  setOpen: (v: boolean) => void;
  toggle: () => void;
  setWidth: (w: number) => void;
  min: number;
  max: number;
}

const CopilotSidebarContext = createContext<CopilotSidebarValue | null>(null);

export function CopilotSidebarProvider({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  const [open, setOpenRaw] = useState(true);
  const [width, setWidthRaw] = useState(DEFAULT_WIDTH);

  // Restore persisted state
  useEffect(() => {
    setMounted(true);
    const so = localStorage.getItem(SIDEBAR_KEY);
    setOpenRaw(so !== "false");
    const sw = localStorage.getItem(WIDTH_KEY);
    if (sw) {
      const w = parseInt(sw, 10);
      if (w >= MIN_WIDTH && w <= MAX_WIDTH) setWidthRaw(w);
    }
  }, []);

  useEffect(() => {
    if (mounted) localStorage.setItem(SIDEBAR_KEY, String(open));
  }, [open, mounted]);
  useEffect(() => {
    if (mounted) localStorage.setItem(WIDTH_KEY, String(width));
  }, [width, mounted]);

  const setOpen = useCallback((v: boolean) => setOpenRaw(v), []);
  const toggle = useCallback(() => setOpenRaw((v) => !v), []);

  // Cmd/Ctrl+K to toggle, Escape to close
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        toggle();
      } else if (e.key === "Escape" && open) {
        setOpenRaw(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, toggle]);
  const setWidth = useCallback(
    (w: number) => setWidthRaw(Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, w))),
    [],
  );

  const value = useMemo<CopilotSidebarValue>(
    () => ({ open, width, setOpen, toggle, setWidth, min: MIN_WIDTH, max: MAX_WIDTH }),
    [open, width, setOpen, toggle, setWidth],
  );

  return (
    <CopilotSidebarContext.Provider value={value}>{children}</CopilotSidebarContext.Provider>
  );
}

export function useCopilotSidebar(): CopilotSidebarValue {
  const ctx = useContext(CopilotSidebarContext);
  if (!ctx) throw new Error("useCopilotSidebar must be inside <CopilotSidebarProvider>");
  return ctx;
}
