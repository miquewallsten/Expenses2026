"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { apiCall, apiPost } from "@/lib/api/client";

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
  dismissNotification: (id: string) => void;
}

interface ContextResponse {
  module: string;
  copilot_suggestions: CopilotSuggestion[];
}

interface PushCheckResponse {
  ok: boolean;
  notifications: Array<{
    id: string;
    type: CopilotNotification["type"];
    title: string;
    message: string;
    action?: { label?: string; route?: string };
  }>;
}

const POLL_INTERVAL_MS = 30_000;

export function useCopilot(module?: string): UseCopilotResult {
  const [suggestions, setSuggestions] = useState<CopilotSuggestion[]>([]);
  const [notifications, setNotifications] = useState<CopilotNotification[]>([]);
  const [loading, setLoading] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  const pollContext = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiCall<ContextResponse>("/mywork/context", {
        method: "POST",
        json: { module: module || "default", context_data: {} },
      });
      setSuggestions(res.copilot_suggestions || []);
    } catch {
      // Silently fail — polling is best-effort.
    } finally {
      setLoading(false);
    }
  }, [module]);

  const pollPush = useCallback(async () => {
    try {
      const res = await apiPost<PushCheckResponse>("/agent/push/check", {
        context: {
          pending_approvals: 0,
          unsubmitted_expenses: 0,
          policy_violations: 0,
        },
      });
      const incoming = (res.notifications || []).map((n) => ({
        id: n.id,
        type: n.type,
        title: n.title,
        message: n.message,
        actionLabel: n.action?.label,
        actionId: n.action?.route,
      }));
      if (incoming.length > 0) {
        setNotifications((prev) => {
          const existing = new Set(prev.map((p) => p.id));
          const newItems = incoming.filter((n) => !existing.has(n.id));
          return [...prev, ...newItems];
        });
      }
    } catch {
      // Silently fail — polling is best-effort.
    }
  }, []);

  // Polling fallback
  useEffect(() => {
    const id = setInterval(() => {
      pollContext();
      pollPush();
    }, POLL_INTERVAL_MS);
    // Defer initial poll to avoid synchronous setState in effect body.
    const timeoutId = setTimeout(() => {
      pollContext();
      pollPush();
    }, 0);
    return () => {
      clearInterval(id);
      clearTimeout(timeoutId);
    };
  }, [pollContext, pollPush]);

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

  const dismissNotification = useCallback(async (id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
    try {
      await apiPost("/agent/push/dismiss", { notification_id: id });
    } catch {
      // Best-effort dismiss
    }
  }, []);

  return { suggestions, notifications, loading, dismissNotification };
}
