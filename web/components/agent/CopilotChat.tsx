"use client";

import { useState, useRef, useEffect } from "react";
import { Send, Bot } from "lucide-react";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}

export interface CopilotChatProps {
  userName?: string;
}

export default function CopilotChat({ userName }: CopilotChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "greeting",
      role: "assistant",
      content: `Hi ${userName || "there"}! How can I help you today?`,
    },
  ]);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = () => {
    if (!input.trim()) return;
    const userMsg: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: "user",
      content: input.trim(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");

    // Placeholder assistant response — API integration later
    setTimeout(() => {
      setMessages((prev) => [
        ...prev,
        {
          id: `msg-${Date.now()}-reply`,
          role: "assistant",
          content: "I received your message. Full integration coming soon!",
        },
      ]);
    }, 600);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden" data-testid="copilot-chat">
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-3 py-3 space-y-3">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            {msg.role === "assistant" && (
              <div className="mr-1.5 mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-indigo-600/30">
                <Bot className="h-3 w-3 text-indigo-300/80" />
              </div>
            )}
            <div
              className={`max-w-[85%] rounded-lg px-2.5 py-1.5 text-[11px] leading-relaxed ${
                msg.role === "user"
                  ? "bg-indigo-600/30 text-white/85"
                  : "bg-zinc-800 text-white/60"
              }`}
            >
              {msg.content}
            </div>
          </div>
        ))}
      </div>

      <div className="shrink-0 border-t border-white/[0.06] px-3 py-2">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Ask me anything..."
            className="min-w-0 flex-1 rounded-md border border-white/[0.07] bg-zinc-900 px-2.5 py-1.5 text-[11px] text-white/60 placeholder:text-white/25 outline-none transition-colors focus:border-indigo-500/40 focus:bg-zinc-800"
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={!input.trim()}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-indigo-600/30 text-indigo-300/80 transition-colors hover:bg-indigo-600/50 disabled:opacity-30 disabled:hover:bg-indigo-600/30"
            aria-label="Send message"
          >
            <Send className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
