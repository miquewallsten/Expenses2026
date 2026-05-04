"use client";

/**
 * useAgent — hook for interacting with a specific agent session.
 *
 * Takes an agentKey and returns the session's messages, typing state,
 * and a chat function to send new messages.
 *
 * Usage:
 *   const { messages, isTyping, chat, sessionId } = useAgent("admin-copilot");
 */

import { useCallback, useMemo } from "react";
import { useAgentContext, type AgentMessage } from "@/context/AgentContext";

export interface UseAgentResult {
  /** All messages in the current session */
  messages: AgentMessage[];

  /** Whether the agent is currently typing (processing a message) */
  isTyping: boolean;

  /** Send a message to the agent */
  chat: (message: string) => Promise<void>;

  /** Unique session identifier */
  sessionId: string | null;

  /** Clear all messages in the session */
  clear: () => void;
}

/**
 * Hook for interacting with a specific agent session.
 *
 * @param agentKey - The unique key for the agent (e.g. "admin-copilot")
 * @returns UseAgentResult with messages, isTyping, chat, sessionId, and clear
 */
export function useAgent(agentKey: string): UseAgentResult {
  const { state, sendMessage, setActiveSession, clearSession, getSession } =
    useAgentContext();

  // Get or create the session
  const session = useMemo(() => getSession(agentKey), [getSession, agentKey]);

  // Activate this session when the hook is used
  const activateIfNeeded = useCallback(() => {
    if (state.activeSessionId !== agentKey) {
      setActiveSession(agentKey);
    }
  }, [state.activeSessionId, agentKey, setActiveSession]);

  // Chat function
  const chat = useCallback(
    async (message: string): Promise<void> => {
      activateIfNeeded();
      await sendMessage(agentKey, message);
    },
    [agentKey, sendMessage, activateIfNeeded],
  );

  // Clear function
  const clear = useCallback((): void => {
    clearSession(agentKey);
  }, [agentKey, clearSession]);

  return {
    messages: session?.messages ?? [],
    isTyping: session?.isTyping ?? false,
    chat,
    sessionId: session?.id ?? null,
    clear,
  };
}