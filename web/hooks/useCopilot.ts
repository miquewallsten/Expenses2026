"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { apiCall } from "@/lib/api/client";

export interface CopilotSuggestion {
  type: string;
  label: string;
  actionId?: string;
}

export interface CopilotNotification {
  id: string;
  type: "suggestion" | "alert" | "announcement";
  title: string;
  message: string;
  actionLabel?: string;
  actionId?: string;
}

export interface UseCopilotResult {
  suggestions: CopilotSuggestion[];
  notifications: CopilotNotification[];
  loading: boolean;
}

interface ContextResponse {
  module: string;
  copilot_suggestions: CopilotSuggestion[];
}

const POLL_INTERVAL_MS = 30_000;

export function useCopilot(module?: string): UseCopilotResult {
  const [suggestions, setSuggestions] = useState<CopilotSuggestion[]>([]);
  const [notifications, setNotifications] = useState<CopilotNotification[]>([]);
  const [loading, setLoading] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  const poll = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiCall<ContextResponse>("/mywork/context", {
        method: "POST",
        json: { module: module || "default", context_data: {} },
      });
      setSuggestions(res.copilot_suggestions || []);
      // Map suggestions that look like notifications to notifications array
      const notifs: CopilotNotification[] = (res.copilot_suggestions || [])
        .filter((s) => s.type === "tip" || s.type === "alert" || s.type === "announcement")
        .map((s, idx) => ({
          id: `notif-${idx}`,
          type: (s.type === "tip" ? "suggestion" : s.type) as CopilotNotification["type"],
          title: s.label,
          message: s.label,
        }));
      if (notifs.length > 0) {
        setNotifications((prev) => {
          const existing = new Set(prev.map((n) => n.id));
          const newItems = notifs.filter((n) => !existing.has(n.id));
          return [...prev, ...newItems];
        });
      }
    } catch {
      // Silently fail — polling is best-effort.
    } finally {
      setLoading(false);
    }
  }, [module]);

  // Polling fallback
  useEffect(() => {
    poll();
    const id = setInterval(poll, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [poll]);

  // Attempt WebSocket push if available
  useEffect(() => {
    const base =
      process.env.NEXT_PUBLIC_API_BASE_URL ||
      (typeof window !== "undefined"
        ? `${window.location.protocol}//${window.location.hostname}:8000`
        : "http://localhost:8000");

    const wsUrl = base.replace(/^http/, "ws") + "/ws/copilot";
    let ws: WebSocket | null = null;
    try {
      ws = new WebSocket(wsUrl);
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as CopilotNotification;
          if (data.id && data.title) {
            setNotifications((prev) => {
              if (prev.some((n) => n.id === data.id)) return prev;
              return [...prev, data];
            });
          }
        } catch {
          // ignore malformed push
        }
      };
      wsRef.current = ws;
    } catch {
      // WebSocket unavailable — polling already covers it.
    }
    return () => {
      ws?.close();
    };
  }, []);

  return { suggestions, notifications, loading };
}
