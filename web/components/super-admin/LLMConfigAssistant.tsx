"use client";

import { useState, useRef, useEffect } from "react";
import { Send, Bot, X, Loader2 } from "lucide-react";
import { getAuthHeaders } from "@/lib/session";

const API = process.env.NEXT_PUBLIC_API_BASE_URL;

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
      const res = await fetch(`${API}/ai/llm-config-assistant`, {
        method: "POST",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: userMsg,
          current_provider: currentProvider,
          current_model: currentModel,
          history: messages.map((m) => ({ role: m.role, content: m.content })),
        }),
      });
      const data = await res.json();
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
        <div className="flex w-80 flex-col rounded border border-white/[0.07] bg-zinc-900 shadow-2xl">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-white/[0.06] px-3 py-2">
            <div className="flex items-center gap-1.5">
              <Bot className="h-3.5 w-3.5 text-indigo-300/80" />
              <span className="text-[11px] font-semibold text-white/75">Model Advisor</span>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="text-white/30 hover:text-white/60"
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
                    ? "ml-4 rounded bg-indigo-500/10 px-2 py-1.5 text-white/80"
                    : "mr-4 text-white/60"
                }`}
              >
                {m.content}
              </div>
            ))}
            {loading && (
              <div className="flex items-center gap-1.5 text-white/40">
                <Loader2 className="h-3 w-3 animate-spin" />
                <span className="text-[10px]">Thinking...</span>
              </div>
            )}
          </div>

          {/* Input */}
          <div className="flex items-center gap-1.5 border-t border-white/[0.06] px-2 py-1.5">
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
              className="flex-1 rounded bg-white/[0.02] px-2 py-1 text-[11px] text-white/80 placeholder:text-white/25 focus:outline-none focus:ring-1 focus:ring-indigo-500/30"
            />
            <button
              onClick={handleSend}
              disabled={loading || !input.trim()}
              className="flex h-6 w-6 items-center justify-center rounded bg-indigo-500/15 text-indigo-300/80 hover:bg-indigo-500/25 disabled:opacity-30"
            >
              <Send className="h-3 w-3" />
            </button>
          </div>
        </div>
      )}

      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="flex h-9 w-9 items-center justify-center rounded-full border border-indigo-500/30 bg-indigo-500/15 text-indigo-300/80 shadow-lg hover:bg-indigo-500/25"
        >
          <Bot className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
