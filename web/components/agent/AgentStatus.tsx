"use client";

import { Bot } from "lucide-react";

interface AgentStatusProps {
  /** Whether the agent is typing/processing */
  isTyping?: boolean;
  /** Optional progress percentage (0-100) */
  progress?: number;
  /** Status message to display */
  statusMessage?: string;
  /** Agent name for display */
  agentName?: string;
}

/**
 * AgentStatus — typing indicator with animated dots and progress display.
 *
 * Shows:
 * - Animated typing dots when isTyping is true
 * - Progress bar when progress is provided
 * - Status message when provided
 */
export function AgentStatus({
  isTyping = false,
  progress,
  statusMessage,
  agentName = "Assistant",
}: AgentStatusProps) {
  if (!isTyping && !statusMessage && progress === undefined) {
    return null;
  }

  return (
    <div className="flex items-center gap-3 border-b border-white/[0.07] bg-zinc-900/50 px-4 py-3">
      {/* Agent icon */}
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-600/30 ring-1 ring-indigo-500/25">
        <Bot className="h-4 w-4 text-indigo-300/80" />
      </div>

      <div className="min-w-0 flex-1">
        {/* Agent name */}
        <div className="text-[11px] font-medium text-white/60">{agentName}</div>

        {/* Status message or typing indicator */}
        <div className="mt-0.5">
          {isTyping ? (
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-white/45">Thinking</span>
              <div className="flex gap-0.5">
                <span className="h-1 w-1 animate-bounce rounded-full bg-white/40 [animation-delay:0ms]" />
                <span className="h-1 w-1 animate-bounce rounded-full bg-white/40 [animation-delay:150ms]" />
                <span className="h-1 w-1 animate-bounce rounded-full bg-white/40 [animation-delay:300ms]" />
              </div>
            </div>
          ) : statusMessage ? (
            <span className="text-[11px] text-white/45">{statusMessage}</span>
          ) : null}
        </div>

        {/* Progress bar */}
        {progress !== undefined && (
          <div className="mt-1.5">
            <div className="h-1 w-full overflow-hidden rounded-full bg-zinc-800">
              <div
                className="h-full rounded-full bg-indigo-500 transition-all duration-300"
                style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
              />
            </div>
            {typeof progress === "number" && (
              <span className="text-[10px] text-white/30 mt-0.5">{Math.round(progress)}%</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}