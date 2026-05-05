"use client";

import { useEffect, useRef, useState } from "react";
import { Bot, ChevronRight, Send, Sparkles } from "lucide-react";
import { useAgentContext } from "@/context/AgentContext";

const COLLAPSED_WIDTH = 48;
const EXPANDED_WIDTH = 320;

interface AgentRailProps {
  /** Agent key for session management */
  agentKey?: string;
  /** Display name for the agent */
  agentName?: string;
}

/**
 * AgentRail — collapsible sidebar for agent chat.
 *
 * Provides a rail-style interface that can collapse to an icon-only state
 * (48px) or expand to show the full chat interface (320px). Uses AgentContext
 * for state management.
 */
export default function AgentRail({
  agentKey = "default",
  agentName = "Assistant",
}: AgentRailProps) {
  const { state, sendMessage, toggleExpanded, getSession, setActiveSession } = useAgentContext();
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Initialize session on mount
  useEffect(() => {
    setActiveSession(agentKey);
  }, [agentKey, setActiveSession]);

  // Get current session
  const session = getSession(agentKey);
  const isExpanded = state.isExpanded;
  const isTyping = session?.isTyping ?? false;
  const messages = session?.messages ?? [];

  // Auto-scroll to bottom when new message is added
  const lastMessageId = messages[messages.length - 1]?.id;
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [lastMessageId]);

  // Focus input when expanded
  useEffect(() => {
    if (isExpanded && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isExpanded]);

  // Handle message send
  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed || isTyping) return;

    setInput("");
    await sendMessage(agentKey, trimmed);
  };

  // Handle key press
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Collapsed state — just the icon
  if (!isExpanded) {
    return (
      <div
        className="flex h-full flex-col items-center border-r border-default bg-surface-0 py-2"
        style={{ width: COLLAPSED_WIDTH }}
      >
        <button
          type="button"
          onClick={toggleExpanded}
          className="flex h-8 w-8 items-center justify-center rounded transition-colors hover:bg-surface-2"
          aria-label="Expand agent rail"
          title="Open assistant"
        >
          <Bot className="h-4 w-4 text-secondary" />
        </button>
      </div>
    );
  }

  // Expanded state — full chat interface
  return (
    <div
      className="flex h-full flex-col border-r border-default bg-surface-0"
      style={{ width: EXPANDED_WIDTH }}
    >
      {/* Header */}
      <header className="flex h-11 shrink-0 items-center gap-2 border-b border-default px-3">
        <div className="flex h-6 w-6 items-center justify-center rounded bg-accent-muted ring-1 ring-blue-500/25">
          <Sparkles className="h-3 w-3 text-accent" />
        </div>
        <div className="flex flex-col leading-tight">
          <span className="text-[11px] font-semibold text-secondary">{agentName}</span>
          <span className="text-[9px] uppercase tracking-widest text-muted">AI Agent</span>
        </div>
        <button
          type="button"
          onClick={toggleExpanded}
          className="ml-auto flex h-6 w-6 items-center justify-center rounded text-muted transition-colors hover:bg-surface-2 hover:text-secondary"
          aria-label="Collapse agent rail"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-2">
        {messages.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-accent-muted">
              <Bot className="h-5 w-5 text-accent" />
            </div>
            <p className="text-[11px] text-tertiary">
              Start a conversation with {agentName}
            </p>
          </div>
        )}

        {messages.map((message) => (
          <div
            key={message.id}
            className={`mb-2 flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[85%] rounded-lg px-2.5 py-1.5 text-[11px] ${
                message.role === "user"
                  ? "bg-accent-muted text-secondary"
                  : "bg-surface-2 text-secondary"
              }`}
            >
              {message.content}
            </div>
          </div>
        ))}

        {/* Typing indicator */}
        {isTyping && (
          <div className="mb-2 flex justify-start">
            <div className="rounded-lg bg-surface-2 px-2.5 py-1.5 text-[11px] text-tertiary">
              <div className="flex gap-1">
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-surface-3 [animation-delay:0ms]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-surface-3 [animation-delay:150ms]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-surface-3 [animation-delay:300ms]" />
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Quick actions */}
      {messages.length === 0 && (
        <div className="shrink-0 border-t border-subtle px-3 py-2">
          <div className="text-[9px] uppercase tracking-widest text-muted mb-1.5">Quick actions</div>
          <div className="flex flex-wrap gap-1.5">
            {["Help me with...", "Explain this", "What can you do?"].map((action) => (
              <button
                key={action}
                type="button"
                onClick={() => {
                  setInput(action);
                  inputRef.current?.focus();
                }}
                className="rounded border border-default bg-surface-1 px-2 py-1 text-[10px] text-tertiary transition-colors hover:bg-surface-2 hover:text-secondary"
              >
                {action}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input */}
      <div className="shrink-0 border-t border-default p-2">
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message..."
            disabled={isTyping}
            className="flex-1 rounded border border-default bg-surface-1 px-2.5 py-1.5 text-[11px] text-secondary placeholder:text-muted focus:bg-accent-muted focus:outline-none focus:ring-1 focus:ring-blue-500/20 disabled:opacity-50"
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={!input.trim() || isTyping}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-accent-muted text-accent transition-colors hover:bg-accent-hover disabled:opacity-50 disabled:hover:bg-accent-muted"
            aria-label="Send message"
          >
            <Send className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}