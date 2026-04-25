"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Loader2, Pencil, Power, RefreshCw, Send, Trash2, X } from "lucide-react";
import { getAuthHeaders } from "@/lib/session";

const API = process.env.NEXT_PUBLIC_API_BASE_URL;

interface AIPolicyRead {
  id: number;
  company_id: number;
  source_text: string;
  rule_json: Record<string, unknown>;
  summary: string;
  scope: string;
  severity: "block" | "warn";
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

type ChatRole = "user" | "assistant";

interface PendingReceipt {
  receipt_id: string;
  tool: string;
  summary: string;
}

interface UITurn {
  role: ChatRole;
  content: string;
  tool_calls?: { tool: string; summary: string; status: string }[];
  pending?: PendingReceipt[];
}

interface AgentChatResponse {
  ok: boolean;
  session_id: string;
  content: string;
  tool_calls: { tool: string; summary: string; status: string }[];
  pending: PendingReceipt[];
  error?: string | null;
}

export default function AdminAIPoliciesStudio({
  companyId,
  onSettingApplied,
}: {
  companyId: number;
  onSettingApplied?: () => void;
}) {
  const [policies, setPolicies] = useState<AIPolicyRead[]>([]);
  const [loading, setLoading] = useState(true);

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [turns, setTurns] = useState<UITurn[]>([]);
  const [draft, setDraft] = useState("");
  const [thinking, setThinking] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const chatRef = useRef<HTMLDivElement | null>(null);

  async function loadPolicies() {
    setLoading(true);
    try {
      const res = await fetch(`${API}/admin/ai-policies/${companyId}`, {
        headers: { ...getAuthHeaders() },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: AIPolicyRead[] = await res.json();
      setPolicies(data);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadPolicies();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [turns, thinking]);

  function resetChat() {
    setSessionId(null);
    setTurns([]);
    setDraft("");
    setError(null);
  }

  async function send(text?: string) {
    const msg = (text ?? draft).trim();
    if (msg.length < 2 || thinking) return;
    setTurns((t) => [...t, { role: "user", content: msg }]);
    setDraft("");
    setThinking(true);
    setError(null);
    try {
      const res = await fetch(`${API}/agent/chat/${companyId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ message: msg, session_id: sessionId, persona: "admin" }),
      });
      const json = (await res.json()) as AgentChatResponse & { detail?: string };
      if (!res.ok) throw new Error(json?.detail || `HTTP ${res.status}`);
      setSessionId(json.session_id);
      setTurns((t) => [
        ...t,
        {
          role: "assistant",
          content: json.content || "",
          tool_calls: json.tool_calls || [],
          pending: json.pending || [],
        },
      ]);
      // If the agent listed or mutated policies via confirmed tools, refresh list.
      void loadPolicies();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setThinking(false);
    }
  }

  async function confirmReceipt(receiptId: string) {
    setConfirming(receiptId);
    setError(null);
    try {
      const res = await fetch(`${API}/agent/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ receipt_id: receiptId, company_id: companyId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.detail || `HTTP ${res.status}`);
      setTurns((ts) =>
        ts.map((t) =>
          t.pending
            ? { ...t, pending: t.pending.filter((p) => p.receipt_id !== receiptId) }
            : t,
        ),
      );
      setTurns((t) => [...t, { role: "assistant", content: "Aplicado." }]);
      await loadPolicies();
      onSettingApplied?.();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setConfirming(null);
    }
  }

  async function rejectReceipt(receiptId: string) {
    setError(null);
    try {
      await fetch(`${API}/agent/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ receipt_id: receiptId, company_id: companyId }),
      });
      setTurns((ts) =>
        ts.map((t) =>
          t.pending
            ? { ...t, pending: t.pending.filter((p) => p.receipt_id !== receiptId) }
            : t,
        ),
      );
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function toggle(p: AIPolicyRead) {
    const res = await fetch(`${API}/admin/ai-policies/${companyId}/${p.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...getAuthHeaders() },
      body: JSON.stringify({ enabled: !p.enabled }),
    });
    if (res.ok) {
      const updated: AIPolicyRead = await res.json();
      setPolicies((all) => all.map((x) => (x.id === updated.id ? updated : x)));
    }
  }

  async function reExtract(p: AIPolicyRead) {
    const res = await fetch(`${API}/admin/ai-policies/${companyId}/${p.id}/re-extract`, {
      method: "POST",
      headers: { ...getAuthHeaders() },
    });
    if (res.ok) {
      const updated: AIPolicyRead = await res.json();
      setPolicies((all) => all.map((x) => (x.id === updated.id ? updated : x)));
    }
  }

  async function remove(p: AIPolicyRead) {
    if (!confirm(`¿Eliminar la política "${p.summary}"?`)) return;
    const res = await fetch(`${API}/admin/ai-policies/${companyId}/${p.id}`, {
      method: "DELETE",
      headers: { ...getAuthHeaders() },
    });
    if (res.ok) setPolicies((all) => all.filter((x) => x.id !== p.id));
  }

  function seedEditInChat(p: AIPolicyRead) {
    const seed =
      `Quiero revisar la política #${p.id}: "${p.source_text}". ` +
      `Resumen actual: "${p.summary}", severidad ${p.severity}. ` +
      `Propón una mejora o confírmala.`;
    resetChat();
    setDraft(seed);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <div className="space-y-4">
      <header className="space-y-1">
        <h2 className="text-sm font-semibold text-white">Políticas de IA</h2>
        <p className="text-[12px] text-white/50">
          Conversa con el agente. Puede leer la configuración actual, listar políticas
          existentes y proponer nuevas. Toda creación/edición pasa por confirmación.
        </p>
      </header>

      <div className="rounded border border-white/[0.08] bg-white/[0.02] p-3">
        <div
          ref={chatRef}
          className="mb-2 max-h-[360px] min-h-[140px] space-y-2 overflow-y-auto rounded border border-white/[0.06] bg-black/30 p-3"
        >
          {turns.length === 0 && !thinking && (
            <p className="text-[11px] text-white/40">
              Ej.: “Quiero advertir cuando el UsoCFDI no sea P01”, o
              “Revisa mis políticas y dime si hay redundancias con los ajustes actuales”.
            </p>
          )}
          {turns.map((t, i) => (
            <div key={i} className="space-y-1">
              <div
                className={
                  t.role === "user"
                    ? "ml-8 whitespace-pre-wrap rounded border border-white/[0.08] bg-white/[0.04] px-2.5 py-1.5 text-[12px] text-white"
                    : "mr-8 whitespace-pre-wrap rounded border border-blue-400/20 bg-blue-500/[0.06] px-2.5 py-1.5 text-[12px] text-blue-50"
                }
              >
                {t.content || (t.role === "assistant" ? "…" : "")}
              </div>
              {t.tool_calls && t.tool_calls.length > 0 && (
                <ul className="mr-8 space-y-0.5 pl-2 text-[10.5px] text-white/40">
                  {t.tool_calls.map((c, j) => (
                    <li key={j}>
                      <span className="text-white/30">→</span>{" "}
                      <span className="font-mono">{c.tool}</span> — {c.summary}
                    </li>
                  ))}
                </ul>
              )}
              {t.pending && t.pending.length > 0 && (
                <div className="mr-8 space-y-1">
                  {t.pending.map((p) => (
                    <div
                      key={p.receipt_id}
                      className="flex items-center justify-between rounded border border-amber-500/30 bg-amber-500/[0.06] px-2.5 py-1.5"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[11px] font-medium text-amber-100">
                          {p.summary}
                        </p>
                        <p className="text-[10.5px] text-amber-200/60">{p.tool}</p>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          disabled={confirming === p.receipt_id}
                          onClick={() => confirmReceipt(p.receipt_id)}
                          className="inline-flex items-center gap-1 rounded border border-emerald-400/40 bg-emerald-500/[0.12] px-2 py-1 text-[11px] font-medium text-emerald-100 hover:bg-emerald-500/[0.22] disabled:opacity-40"
                        >
                          {confirming === p.receipt_id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Check className="h-3 w-3" />
                          )}
                          Confirmar
                        </button>
                        <button
                          onClick={() => rejectReceipt(p.receipt_id)}
                          className="inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] text-white/50 hover:text-white"
                        >
                          <X className="h-3 w-3" />
                          Descartar
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
          {thinking && (
            <div className="mr-8 inline-flex items-center gap-1.5 rounded border border-blue-400/20 bg-blue-500/[0.06] px-2.5 py-1.5 text-[11px] text-blue-100/70">
              <Loader2 className="h-3 w-3 animate-spin" /> Pensando…
            </div>
          )}
        </div>

        <div className="flex items-end gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            rows={2}
            disabled={thinking}
            placeholder="Describe la regla o haz una pregunta al agente…"
            className="flex-1 resize-y rounded border border-white/[0.08] bg-black/40 px-3 py-2 text-[12px] text-white placeholder:text-white/30 focus:border-white/20 focus:outline-none disabled:opacity-60"
          />
          <button
            disabled={thinking || draft.trim().length < 2}
            onClick={() => send()}
            className="inline-flex items-center gap-1.5 self-stretch rounded border border-white/[0.10] bg-white/[0.06] px-3 text-[11px] font-medium text-white hover:bg-white/[0.10] disabled:opacity-40"
          >
            {thinking ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
            Enviar
          </button>
        </div>
        <div className="mt-1 flex items-center justify-between">
          <span className="text-[11px] text-white/40">
            Enter envía · Shift+Enter salto de línea · las acciones destructivas requieren confirmación.
          </span>
          {turns.length > 0 && (
            <button
              disabled={thinking}
              onClick={resetChat}
              className="text-[11px] text-white/40 hover:text-white"
            >
              Nueva conversación
            </button>
          )}
        </div>

        {error && <p className="mt-2 text-[11px] text-red-400">{error}</p>}
      </div>

      <section>
        <h3 className="mb-2 text-[11px] uppercase tracking-wider text-white/40">
          Políticas activas ({policies.filter((p) => p.enabled).length} / {policies.length})
        </h3>
        {loading ? (
          <div className="text-[12px] text-white/40">Cargando…</div>
        ) : policies.length === 0 ? (
          <div className="rounded border border-dashed border-white/[0.08] p-6 text-center text-[12px] text-white/40">
            No hay políticas configuradas todavía.
          </div>
        ) : (
          <ul className="divide-y divide-white/[0.06] rounded border border-white/[0.08]">
            {policies.map((p) => (
              <li
                key={p.id}
                className={`flex items-start gap-3 p-3 ${p.enabled ? "" : "opacity-50"}`}
              >
                <span
                  className={`mt-0.5 inline-block h-1.5 w-1.5 rounded-full ${
                    p.severity === "block" ? "bg-red-400" : "bg-amber-400"
                  }`}
                  title={p.severity === "block" ? "Bloqueante" : "Advertencia"}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12px] font-medium text-white">{p.summary}</p>
                  <p className="mt-0.5 line-clamp-2 text-[11px] text-white/50">{p.source_text}</p>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => toggle(p)}
                    title={p.enabled ? "Desactivar" : "Activar"}
                    className="rounded p-1 text-white/40 hover:bg-white/[0.06] hover:text-white"
                  >
                    <Power className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => seedEditInChat(p)}
                    title="Conversar sobre esta política"
                    className="rounded p-1 text-white/40 hover:bg-white/[0.06] hover:text-white"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => reExtract(p)}
                    title="Volver a extraer con IA (mismo texto)"
                    className="rounded p-1 text-white/40 hover:bg-white/[0.06] hover:text-white"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => remove(p)}
                    title="Eliminar"
                    className="rounded p-1 text-white/40 hover:bg-red-500/10 hover:text-red-400"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
