"use client";

import { useState, useRef, useEffect } from "react";
import { Send, Bot } from "lucide-react";
import { renderContent } from "@/lib/chat/renderContent";

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
    <div className="flex h-full flex-col bg-surface-0" data-testid="copilot-chat">
      {/* Messages */}
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto p-4">
        <div className="mx-auto max-w-lg space-y-3">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              {msg.role === "assistant" && (
                <div className="mr-2 mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-accent text-primary shadow-[var(--shadow-glow)]">
                  <Bot className="h-3.5 w-3.5" />
                </div>
              )}
              <div
                className={`chat-message ${msg.role}`}
              >
                {msg.role === "assistant" ? renderContent(msg.content) : msg.content}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Input */}
      <div className="shrink-0 border-t border-subtle bg-surface-1 p-3">
        <div className="mx-auto flex max-w-lg items-center gap-2">
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
            className="chat-input"
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={!input.trim()}
            className="chat-send-btn disabled:opacity-40 disabled:cursor-not-allowed disabled:transform-none disabled:shadow-none"
            aria-label="Send message"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}