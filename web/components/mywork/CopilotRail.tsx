"use client";

import { useState, useCallback } from "react";
import { Bot, ChevronRight, ChevronLeft, Zap } from "lucide-react";
import type { PermissionManifest } from "@/types/mywork";
import CopilotChat from "@/components/agent/CopilotChat";
import ProactiveNotification from "@/components/agent/ProactiveNotification";
import { useCopilot, type CopilotNotification } from "@/hooks/useCopilot";

interface CopilotRailProps {
  manifest: PermissionManifest | null;
}

export default function CopilotRail({ manifest }: CopilotRailProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [notifications, setNotifications] = useState<CopilotNotification[]>([]);
  const userName = manifest?.user?.fullName;
  const allowedTools = manifest?.copilot?.allowedTools || [];

  const { suggestions, loading } = useCopilot();

  const handleDismiss = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  if (collapsed) {
    return (
      <div className="flex w-12 shrink-0 flex-col items-center border-l border-white/[0.06] bg-zinc-900 py-2" data-testid="copilot-rail-collapsed">
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-600/20 text-indigo-300/80 transition-colors hover:bg-indigo-600/40"
          aria-label="Expand copilot"
        >
          <Bot className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <aside
      className="flex w-[320px] shrink-0 flex-col overflow-hidden border-l border-white/[0.06] bg-zinc-900"
      data-testid="copilot-rail"
    >
      {/* Header */}
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-white/[0.06] px-3">
        <div className="flex items-center gap-2">
          <Bot className="h-3.5 w-3.5 text-indigo-300/80" />
          <span className="text-[10px] font-bold uppercase tracking-widest text-white/50">
            Copilot
          </span>
        </div>
        <button
          type="button"
          onClick={() => setCollapsed(true)}
          className="flex h-5 w-5 items-center justify-center rounded text-white/22 transition-colors hover:bg-white/[0.05] hover:text-white/50"
          aria-label="Collapse copilot"
        >
          <ChevronRight className="h-3 w-3" />
        </button>
      </div>

      {/* Quick Actions */}
      {allowedTools.length > 0 && (
        <div className="shrink-0 border-b border-white/[0.06] px-3 py-2">
          <p className="mb-1.5 text-[9px] font-bold uppercase tracking-widest text-white/18">
            Quick Actions
          </p>
          <div className="flex flex-wrap gap-1.5">
            {allowedTools.map((tool) => (
              <button
                key={tool}
                type="button"
                className="inline-flex items-center gap-1 rounded border border-white/[0.07] bg-zinc-950 px-2 py-1 text-[9px] font-medium text-white/45 transition-colors hover:bg-white/[0.04] hover:text-white/70"
              >
                <Zap className="h-2.5 w-2.5" />
                {tool}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Notifications */}
      {notifications.length > 0 && (
        <div className="shrink-0 space-y-1.5 border-b border-white/[0.06] px-3 py-2">
          {notifications.map((n) => (
            <ProactiveNotification
              key={n.id}
              id={n.id}
              type={n.type}
              title={n.title}
              message={n.message}
              actionLabel={n.actionLabel}
              onDismiss={handleDismiss}
            />
          ))}
        </div>
      )}

      {/* Suggestions */}
      {suggestions.length > 0 && (
        <div className="shrink-0 space-y-1.5 border-b border-white/[0.06] px-3 py-2">
          {suggestions.map((s, idx) => (
            <ProactiveNotification
              key={`sugg-${idx}`}
              id={`sugg-${idx}`}
              type={s.type === "action" ? "suggestion" : "announcement"}
              title={s.label}
              message={s.label}
              onDismiss={handleDismiss}
            />
          ))}
        </div>
      )}

      {/* Chat */}
      <CopilotChat userName={userName} />
    </aside>
  );
}
