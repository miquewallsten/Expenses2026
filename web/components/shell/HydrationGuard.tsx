"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

/**
 * HydrationGuard - eliminates hydration mismatches across the entire app.
 *
 * Renders `fallback` (a dark spinner) during SSR and the first client render,
 * then switches to real children once all browser APIs are available.
 *
 * Wrap the app tree in this at the layout level so every context provider
 * (ThemeProvider, LocaleProvider, UserProvider, etc.) resolves its state
 * before the UI tree is painted, preventing flashes and mismatches.
 *
 * Expose the `mounted` flag via context so descendants can skip their own
 * per-component mounted guards.
 */
const HydrationContext = createContext(false);

export function useHydrationMounted(): boolean {
  return useContext(HydrationContext);
}

const FALLBACK = (
  <div className="flex h-[100dvh] items-center justify-center bg-surface-0">
    <div className="flex flex-col items-center gap-4">
      <div className="relative">
        <div className="h-10 w-10 animate-spin rounded-xl border-2 border-accent border-t-transparent" />
      </div>
    </div>
  </div>
);

export default function HydrationGuard({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <HydrationContext.Provider value={false}>
        {FALLBACK}
      </HydrationContext.Provider>
    );
  }

  return (
    <HydrationContext.Provider value={true}>
      {children}
    </HydrationContext.Provider>
  );
}
