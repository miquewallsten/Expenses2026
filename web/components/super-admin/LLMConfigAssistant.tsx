"use client";

import { useState, useRef, useEffect } from "react";
import { Send, Bot, X, Loader2 } from "lucide-react";
import { apiPost } from "@/lib/api/client";
import { renderContent } from "@/lib/chat/renderContent";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface LLMConfigAssistantProps {
  currentProvider?: string;
  currentModel?: string;
}

export default function LLMConfigAssistant({ currentProvider, currentModel }: LLMConfigAssistantProps) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content:
        "Hi! I'm your LLM configuration assistant. Ask me anything about choosing providers, models, or setup.",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  async function handleSend() {
    if (!input.trim() || loading) return;
    const userMsg = input.trim();
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: userMsg }]);
    setLoading(true);

    try {
      const data = await apiPost<{ content?: string }>(`/ai/llm-config-assistant`, {
        prompt: userMsg,
        current_provider: currentProvider,
        current_model: currentModel,
        history: messages.map((m) => ({ role: m.role, content: m.content })),
      });
      const reply = data.content || "Sorry, I couldn't process that.";
      setMessages((prev) => [...prev, { role: "assistant", content: reply }]);
    } catch (_err) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Error: could not reach the assistant." },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed bottom-4 right-4 z-40 flex flex-col items-end gap-2">
      {open && (
        <div className="flex w-80 flex-col rounded border border-default bg-surface-1 shadow-2xl">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-subtle px-3 py-2">
            <div className="flex items-center gap-1.5">
              <Bot className="h-3.5 w-3.5 text-accent" />
              <span className="text-[11px] font-semibold text-secondary">Model Advisor</span>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="text-muted hover:text-secondary"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="h-72 overflow-y-auto px-3 py-2 space-y-2">
            {messages.map((m, i) => (
              <div
                key={i}
                className={`text-[11px] leading-relaxed ${
                  m.role === "user"
                    ? "ml-4 rounded-xl bg-blue-500/15 px-3 py-2 text-indigo-100/90 ring-1 ring-inset ring-blue-500/20"
                    : "mr-4 rounded-xl bg-surface-1 px-3 py-2 text-secondary ring-1 ring-inset ring-white/[0.05]"
                }`}
              >
                {m.role === "assistant" ? renderContent(m.content) : m.content}
              </div>
            ))}
            {loading && (
              <div className="mr-4 flex items-center gap-2 rounded-xl bg-surface-1 px-3 py-2 ring-1 ring-inset ring-white/[0.05]">
                <span className="inline-flex gap-1">
                  {[0, 1, 2].map((d) => (
                    <span
                      key={d}
                      className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent/60"
                      style={{ animationDelay: `${d * 150}ms` }}
                    />
                  ))}
                </span>
                <span className="text-[10px] text-tertiary">Thinking...</span>
              </div>
            )}
          </div>

          {/* Input */}
          <div className="flex items-center gap-1.5 border-t border-subtle px-2 py-1.5">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="Ask about models..."
              className="flex-1 rounded bg-surface-1 px-2 py-1 text-[11px] text-secondary placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-blue-500/30"
            />
            <button
              onClick={handleSend}
              disabled={loading || !input.trim()}
              className="flex h-6 w-6 items-center justify-center rounded bg-blue-500/15 text-accent hover:bg-accent-hover/25 disabled:opacity-30"
            >
              <Send className="h-3 w-3" />
            </button>
          </div>
        </div>
      )}

      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="flex h-9 w-9 items-center justify-center rounded-full border bg-accent-muted bg-blue-500/15 text-accent shadow-lg hover:bg-accent-hover/25"
        >
          <Bot className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
