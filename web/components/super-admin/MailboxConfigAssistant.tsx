"use client";

import { useState, useRef, useEffect } from "react";
import { Send, Bot, X, Loader2 } from "lucide-react";
import { superAdminApiCall, superAdminPost } from "@/lib/api/super-admin-client";
import { renderContent } from "@/lib/chat/renderContent";

interface Message {
  role: "user" | "assistant";
  content: string;
}

export default function MailboxConfigAssistant() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content:
        "Hola! Soy tu asistente de configuración de correo. Puedo ayudarte a configurar el SMTP/IMAP corporativo, probar la conexión y monitorear el estado del Mail Agent.",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
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
      // In super-admin, we use a specialized persona for platform configuration
      const data = await superAdminPost<{ content?: string; session_id?: string }>(`/super-admin/agent/chat`, {
        message: userMsg,
        persona: "admin", // Using admin persona with platform tools
        session_id: sessionId,
      });
      
      if (data.session_id) setSessionId(data.session_id);
      
      const reply = data.content || "Entendido. ¿Hay algo más en lo que pueda ayudarte con la configuración?";
      setMessages((prev) => [...prev, { role: "assistant", content: reply }]);
    } catch (_err) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Error: No se pudo contactar al asistente de plataforma." },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed bottom-4 right-4 z-40 flex flex-col items-end gap-2">
      {open && (
        <div className="flex w-[320px] flex-col rounded-xl border border-rose-500/20 bg-surface-1 shadow-2xl overflow-hidden ring-1 ring-rose-500/10">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-subtle bg-rose-950/20 px-4 py-2.5">
            <div className="flex items-center gap-2">
              <div className="rounded bg-rose-500/20 p-1 text-rose-400">
                <Bot className="h-3.5 w-3.5" />
              </div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-primary">Lola Platform Ops</span>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="text-muted hover:text-primary transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="h-[350px] overflow-y-auto px-4 py-4 space-y-4 bg-surface-ground/30">
            {messages.map((m, i) => (
              <div
                key={i}
                className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-[11.5px] leading-relaxed shadow-sm ${
                    m.role === "user"
                      ? "bg-rose-600 text-white rounded-tr-none"
                      : "bg-surface-1 text-secondary border border-subtle rounded-tl-none"
                  }`}
                >
                  {m.role === "assistant" ? renderContent(m.content) : m.content}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-surface-1 border border-subtle rounded-2xl rounded-tl-none px-3.5 py-2.5">
                  <div className="flex gap-1">
                    {[0, 1, 2].map((d) => (
                      <span
                        key={d}
                        className="h-1.5 w-1.5 animate-bounce rounded-full bg-rose-400"
                        style={{ animationDelay: `${d * 150}ms` }}
                      />
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Input */}
          <div className="p-3 bg-surface-1 border-t border-subtle">
            <div className="flex items-center gap-2 rounded-lg bg-surface-2 px-3 py-2 border border-subtle focus-within:border-rose-500/40 transition-all shadow-inner">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder="Escribe un mensaje..."
                className="flex-1 bg-transparent text-[11.5px] text-primary placeholder:text-muted focus:outline-none"
              />
              <button
                onClick={handleSend}
                disabled={loading || !input.trim()}
                className="text-rose-500 hover:text-rose-400 disabled:opacity-30 transition-colors"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="group relative flex h-12 w-12 items-center justify-center rounded-full bg-rose-600 text-white shadow-xl shadow-rose-900/40 hover:bg-rose-500 transition-all hover:scale-105 active:scale-95"
        >
          <Bot className="h-6 w-6" />
          <div className="absolute -top-1 -right-1 h-3.5 w-3.5 rounded-full bg-success border-2 border-surface-0" />
        </button>
      )}
    </div>
  );
}