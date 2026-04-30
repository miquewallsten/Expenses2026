"use client";

import { useState, useEffect } from "react";
import MyWorkSidebar from "@/components/mywork/MyWorkSidebar";
import ModuleRegistry from "@/components/mywork/ModuleRegistry";
import CopilotRail from "@/components/mywork/CopilotRail";
import { useManifest } from "@/hooks/useManifest";

export default function MyWorkShell() {
  const { manifest, loading, error } = useManifest();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [copilotCollapsed, setCopilotCollapsed] = useState(false);

  // Responsive: auto-collapse copilot on small screens
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(max-width: 1023px)");
    const handleChange = (e: MediaQueryListEvent | MediaQueryList) => {
      if (e.matches) {
        setCopilotCollapsed(true);
      }
    };
    handleChange(mq);
    mq.addEventListener("change", handleChange);
    return () => mq.removeEventListener("change", handleChange);
  }, []);

  if (loading) {
    return (
      <div
        className="flex h-[100dvh] items-center justify-center bg-zinc-950"
        suppressHydrationWarning
      >
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-white/10 border-t-indigo-400/80" />
      </div>
    );
  }

  if (error) {
    return (
      <div
        className="flex h-[100dvh] items-center justify-center bg-zinc-950 px-8"
        suppressHydrationWarning
      >
        <div className="max-w-sm text-center">
          <p className="text-[12px] font-semibold text-rose-400/80">
            Failed to load platform
          </p>
          <p className="mt-1 text-[11px] text-white/35">
            {error.message}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex h-[100dvh] overflow-hidden bg-zinc-950"
      suppressHydrationWarning
      data-testid="mywork-shell"
    >
      <MyWorkSidebar
        manifest={manifest}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed((v) => !v)}
      />

      <main className="min-h-0 flex-1 overflow-hidden">
        <ModuleRegistry />
      </main>

      {!copilotCollapsed && <CopilotRail manifest={manifest} />}
    </div>
  );
}
