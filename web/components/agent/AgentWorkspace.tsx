"use client";

import { useCallback, useRef, useEffect, useState } from "react";
import { X, Bot, Sparkles } from "lucide-react";
import { useAgentContext, type AgentMessage } from "@/context/AgentContext";
import { AgentMessage as AgentMessageComponent } from "./AgentMessage";
import { AgentInput } from "./AgentInput";
import { AgentStatus } from "./AgentStatus";

interface AgentWorkspaceProps {
  /** Agent key for session management */
  agentKey?: string;
  /** Display name for the agent */
  agentName?: string;
  /** Agent icon */
  agentIcon?: React.ReactNode;
  /** Optional welcome message shown when no messages exist */
  welcomeMessage?: string;
  /** Optional suggestions for quick prompts */
  suggestions?: Array<{ id: string; label: string; description?: string }>;
  /** Callback when workspace closes */
  onClose?: () => void;
  /** Whether to show the close button */
  showCloseButton?: boolean;
}

/**
 * AgentWorkspace — full-screen workspace for complex agent tasks.
 *
 * Combines:
 * - Header with title and close button
 * - AgentStatus bar
 * - Messages area with welcome state
 * - AgentInput at bottom
 *
 * Uses AgentContext for state management.
 */
export function AgentWorkspace({
  agentKey = "default",
  agentName = "Assistant",
  agentIcon,
  welcomeMessage = "How can I help you today?",
  suggestions = [],
  onClose,
  showCloseButton = true,
}: AgentWorkspaceProps) {
  const { state, sendMessage, getSession, setActiveSession, clearSession } = useAgentContext();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Initialize session on mount
  useEffect(() => {
    setActiveSession(agentKey);
  }, [agentKey, setActiveSession]);

  // Get current session
  const session = getSession(agentKey);
  const isTyping = session?.isTyping ?? false;
  const messages = session?.messages ?? [];

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  // Handle sending messages
  const handleSend = useCallback(
    async (message: string) => {
      setStatusMessage(null);
      await sendMessage(agentKey, message);
    },
    [agentKey, sendMessage]
  );

  // Handle suggestion selection
  const handleSuggestionSelect = useCallback(
    (suggestion: { id: string; label: string; description?: string }) => {
      handleSend(suggestion.label);
    },
    [handleSend]
  );

  // Handle clear chat
  const handleClear = useCallback(() => {
    clearSession(agentKey);
    setStatusMessage(null);
  }, [agentKey, clearSession]);

  // Handle close
  const handleClose = useCallback(() => {
    if (onClose) {
      onClose();
    }
  }, [onClose]);

  return (
    <div className="flex h-full flex-col bg-zinc-950">
      {/* Header */}
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-white/[0.07] bg-zinc-900 px-4">
        {/* Agent icon */}
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-600/30 ring-1 ring-indigo-500/25">
          {agentIcon ?? <Sparkles className="h-4 w-4 text-indigo-300/80" />}
        </div>

        {/* Agent info */}
        <div className="flex flex-col leading-tight">
          <span className="text-sm font-semibold text-white/60">{agentName}</span>
          <span className="text-[10px] uppercase tracking-widest text-white/28">AI Agent</span>
        </div>

        {/* Actions */}
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={handleClear}
            disabled={messages.length === 0}
            className="rounded px-2 py-1 text-[11px] text-white/35 transition-colors hover:bg-white/[0.04] hover:text-white/65 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Clear
          </button>
          {showCloseButton && (
            <button
              type="button"
              onClick={handleClose}
              className="flex h-8 w-8 items-center justify-center rounded text-white/35 transition-colors hover:bg-white/[0.04] hover:text-white/65"
              aria-label="Close workspace"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </header>

      {/* Status bar */}
      {isTyping && <AgentStatus isTyping={isTyping} agentName={agentName} />}

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {/* Welcome state */}
        {messages.length === 0 && !isTyping && (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-indigo-600/20 ring-1 ring-indigo-500/25">
              {agentIcon ?? <Bot className="h-8 w-8 text-indigo-300/80" />}
            </div>
            <h2 className="text-lg font-semibold text-white/60 mb-2">{welcomeMessage}</h2>
            <p className="text-sm text-white/40 max-w-sm">
              I can help you with various tasks. Ask me a question or choose a suggestion below.
            </p>

            {/* Suggestion buttons */}
            {suggestions.length > 0 && (
              <div className="mt-6 flex flex-wrap justify-center gap-2">
                {suggestions.slice(0, 3).map((suggestion) => (
                  <button
                    key={suggestion.id}
                    type="button"
                    onClick={() => handleSuggestionSelect(suggestion)}
                    className="rounded-lg border border-white/[0.07] bg-zinc-900 px-3 py-2 text-sm text-white/60 transition-colors hover:border-indigo-500/30 hover:bg-indigo-600/10 hover:text-white/80"
                  >
                    {suggestion.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Message list */}
        {messages.length > 0 && (
          <div className="space-y-1">
            {messages.map((message: AgentMessage) => (
              <AgentMessageComponent key={message.id} message={message} />
            ))}
          </div>
        )}

        {/* Typing indicator */}
        {isTyping && messages.length > 0 && (
          <div className="flex justify-start mb-3">
            <div className="rounded-lg bg-zinc-800 px-4 py-3">
              <div className="flex gap-1.5">
                <span className="h-2 w-2 animate-bounce rounded-full bg-white/40 [animation-delay:0ms]" />
                <span className="h-2 w-2 animate-bounce rounded-full bg-white/40 [animation-delay:150ms]" />
                <span className="h-2 w-2 animate-bounce rounded-full bg-white/40 [animation-delay:300ms]" />
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div className="shrink-0 border-t border-white/[0.07] bg-zinc-900/50 p-4">
        <AgentInput
          onSend={handleSend}
          disabled={isTyping}
          placeholder={`Message ${agentName}...`}
          suggestions={suggestions}
          onSuggestionSelect={handleSuggestionSelect}
        />
        <p className="mt-2 text-center text-[10px] text-white/28">
          Press Enter to send, Shift+Enter for new line
        </p>
      </div>
    </div>
  );
}