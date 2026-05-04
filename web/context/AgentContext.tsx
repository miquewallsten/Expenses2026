"use client";

/**
 * AgentContext — global state for agent chat sessions.
 *
 * Manages multiple chat sessions keyed by agentKey (e.g. "admin-copilot").
 * Each session tracks its messages and typing state. The context also tracks
 * UI state like isExpanded (rail visibility) and activeSessionId.
 *
 * Provider hierarchy:
 *   <AgentProvider>
 *     <components using useAgentContext or useAgent>
 */

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { sendChatMessage, type Persona } from "@/lib/agent-api";
import { getStoredSession } from "@/lib/session";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AgentMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
}

export interface AgentSession {
  id: string;
  agentKey: string;
  messages: AgentMessage[];
  isTyping: boolean;
}

export interface AgentState {
  sessions: Map<string, AgentSession>;
  activeSessionId: string | null;
  isExpanded: boolean;
  isTyping: boolean;
}

// ── Context value ────────────────────────────────────────────────────────────

export interface AgentContextValue {
  /** Current state of all agent sessions */
  state: AgentState;

  /** Send a message to a specific agent session */
  sendMessage: (agentKey: string, message: string) => Promise<void>;

  /** Toggle the expanded/collapsed state of the agent rail */
  toggleExpanded: () => void;

  /** Set the active session by agentKey */
  setActiveSession: (agentKey: string) => void;

  /** Clear a specific session's messages */
  clearSession: (agentKey: string) => void;

  /** Get a specific session by agentKey */
  getSession: (agentKey: string) => AgentSession | undefined;
}

// ── Context object ────────────────────────────────────────────────────────────

const AgentContext = createContext<AgentContextValue | null>(null);

// ── Helpers ───────────────────────────────────────────────────────────────────

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

function createSession(agentKey: string): AgentSession {
  return {
    id: generateId(),
    agentKey,
    messages: [],
    isTyping: false,
  };
}

// ── Provider ──────────────────────────────────────────────────────────────────

export function AgentProvider({ children }: { children: ReactNode }) {
  const [sessions, setSessions] = useState<Map<string, AgentSession>>(new Map());
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);

  // ── Session management ─────────────────────────────────────────────────────

  const getSession = useCallback(
    (agentKey: string): AgentSession | undefined => {
      return sessions.get(agentKey);
    },
    [sessions],
  );

  const setActiveSession = useCallback(
    (agentKey: string) => {
      setSessions((prev) => {
        // Create session if it doesn't exist
        if (!prev.has(agentKey)) {
          const newMap = new Map(prev);
          newMap.set(agentKey, createSession(agentKey));
          return newMap;
        }
        return prev;
      });
      setActiveSessionId(agentKey);
    },
    [],
  );

  const clearSession = useCallback((agentKey: string) => {
    setSessions((prev) => {
      const newMap = new Map(prev);
      const session = newMap.get(agentKey);
      if (session) {
        // Reset to empty session, keeping the same id
        newMap.set(agentKey, {
          ...session,
          messages: [],
        });
      }
      return newMap;
    });
  }, []);

  // ── Toggle expanded ─────────────────────────────────────────────────────────

  const toggleExpanded = useCallback(() => {
    setIsExpanded((prev) => !prev);
  }, []);

  // ── Send message ───────────────────────────────────────────────────────────

  const sendMessage = useCallback(
    async (agentKey: string, message: string): Promise<void> => {
      // Get company ID from stored session
      const session = getStoredSession();
      if (!session?.companyId) {
        console.error("No company ID in session");
        return;
      }

      // Ensure session exists
      setSessions((prev) => {
        if (!prev.has(agentKey)) {
          const newMap = new Map(prev);
          newMap.set(agentKey, createSession(agentKey));
          return newMap;
        }
        return prev;
      });

      // Add user message
      const userMessage: AgentMessage = {
        id: generateId(),
        role: "user",
        content: message,
        timestamp: Date.now(),
      };

      setSessions((prev) => {
        const newMap = new Map(prev);
        const session = newMap.get(agentKey);
        if (session) {
          newMap.set(agentKey, {
            ...session,
            messages: [...session.messages, userMessage],
            isTyping: true,
          });
        }
        return newMap;
      });

      try {
        // Map agentKey to persona for the backend
        const personaMap: Record<string, Persona> = {
          "admin-copilot": "admin",
          admin: "admin",
          finance_manager: "finance_manager",
          employee: "employee",
          expense: "expense",
          accounting: "accounting",
        };
        const persona = personaMap[agentKey] ?? "admin";

        // Call backend API
        const response = await sendChatMessage(session.companyId, {
          message,
          session_id: sessions.get(agentKey)?.id,
          persona,
        });

        const assistantMessage: AgentMessage = {
          id: generateId(),
          role: "assistant",
          content: response.content || (response.error ? `Error: ${response.error}` : "No response"),
          timestamp: Date.now(),
        };

        setSessions((prev) => {
          const newMap = new Map(prev);
          const session = newMap.get(agentKey);
          if (session) {
            newMap.set(agentKey, {
              ...session,
              id: response.session_id ?? session.id,
              messages: [...session.messages, assistantMessage],
              isTyping: false,
            });
          }
          return newMap;
        });
      } catch (error) {
        console.error("Agent API error:", error);
        const errorMessage: AgentMessage = {
          id: generateId(),
          role: "assistant",
          content: `Failed to reach agent: ${error instanceof Error ? error.message : "Unknown error"}`,
          timestamp: Date.now(),
        };

        setSessions((prev) => {
          const newMap = new Map(prev);
          const session = newMap.get(agentKey);
          if (session) {
            newMap.set(agentKey, {
              ...session,
              messages: [...session.messages, errorMessage],
              isTyping: false,
            });
          }
          return newMap;
        });
      }
    },
    [sessions],
  );

  // ── Assemble value ─────────────────────────────────────────────────────────

  const isTyping = useMemo(() => {
    if (!activeSessionId) return false;
    const session = sessions.get(activeSessionId);
    return session?.isTyping ?? false;
  }, [sessions, activeSessionId]);

  const state: AgentState = useMemo(
    () => ({
      sessions,
      activeSessionId,
      isExpanded,
      isTyping,
    }),
    [sessions, activeSessionId, isExpanded, isTyping],
  );

  const value = useMemo<AgentContextValue>(
    () => ({
      state,
      sendMessage,
      toggleExpanded,
      setActiveSession,
      clearSession,
      getSession,
    }),
    [state, sendMessage, toggleExpanded, setActiveSession, clearSession, getSession],
  );

  return (
    <AgentContext.Provider value={value}>{children}</AgentContext.Provider>
  );
}

// ── Hook ──────────────────────────────────────────────────────────────────────

/**
 * Returns the Agent context.
 * Must be called inside an <AgentProvider> tree.
 */
export function useAgentContext(): AgentContextValue {
  const ctx = useContext(AgentContext);
  if (!ctx) {
    throw new Error(
      "useAgentContext() must be used inside an <AgentProvider>. " +
        "Ensure <AgentProvider> wraps your app layout.",
    );
  }
  return ctx;
}