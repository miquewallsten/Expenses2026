"use client";

import type { AgentMessage as AgentMessageType } from "@/context/AgentContext";

interface AgentMessageProps {
  message: AgentMessageType;
  onAction?: (action: string, data?: unknown) => void;
}

/**
 * AgentMessage — renders a single message in the agent conversation.
 *
 * Distinguishes between user and assistant messages with different styling.
 * Uses Apple Design System colors throughout.
 */
export function AgentMessage({ message, onAction }: AgentMessageProps) {
  const isUser = message.role === "user";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} mb-3`}>
      <div
        className={`max-w-[80%] rounded-lg px-4 py-3 ${
          isUser
            ? "bg-indigo-600/30 text-white"
            : "bg-zinc-800 text-white/90"
        }`}
      >
        <p className="text-sm whitespace-pre-wrap">{message.content}</p>
        <span className="text-[10px] text-white/40 mt-1 block">
          {new Date(message.timestamp).toLocaleTimeString()}
        </span>
      </div>
    </div>
  );
}