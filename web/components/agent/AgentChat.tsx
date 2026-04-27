"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Bot, Loader2, Send, Paperclip, AlertTriangle, Wrench } from "lucide-react";
import {
  agentChat,
  getReceipt,
  uploadAgentFile,
  type AgentChatResponse,
  type AgentPersona,
  type AgentReceipt,
  type AgentToolCall,
} from "@/lib/agent/client";
import { agentStream, type StreamFinalPayload } from "@/lib/agent/stream";
import ReceiptCard from "./ReceiptCard";

interface Preset {
  label: string;
  text:  string;
}

interface Props {
  companyId: number;
  persona:   AgentPersona;
  /** Optional section-aware quick prompts. */
  presets?:  Preset[];
  /** Initial system-rendered greeting (i18n string). */
  greeting?: string;
  /** Hide the upload button for personas without the scope. */
  allowUpload?: boolean;
  /** Density — "rail" fits the old 72-wide aside; "page" is full-width. */
  variant?: "rail" | "page";
  /** Fires each time the user confirms a destructive tool receipt. */
  onToolConfirmed?: (tool: string) => void;
  /** When true, use SSE /agent/stream for incremental responses. */
  streaming?: boolean;
}

type TurnKind = "user" | "assistant" | "tool" | "error";
interface Turn {
  kind:    TurnKind;
  content: string;
  toolCalls?: AgentToolCall[];
  receiptIds?: string[];
}

/**
 * Shared agent chat core: linear transcript, tool-call badges, pending receipts
 * rendered inline as cards. One POST to /agent/chat per user turn; no SSE.
 */
export default function AgentChat({
  companyId,
  persona,
  presets    = [],
  greeting,
  allowUpload = true,
  variant    = "rail",
  onToolConfirmed,
  streaming  = false,
}: Props) {
  const t = useTranslations("agent.chat");
  const [turns,     setTurns]     = useState<Turn[]>(() =>
    greeting ? [{ kind: "assistant", content: greeting }] : [],
  );
  const [input,     setInput]     = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState<string | null>(null);
  const [receipts,  setReceipts]  = useState<Record<string, AgentReceipt>>({});
  const [uploads,   setUploads]   = useState<{ file_id: string; filename: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  useEffect(() => { scrollToBottom(); }, [turns, scrollToBottom]);

  const fetchReceipts = useCallback(async (ids: string[]) => {
    const fetched = await Promise.all(
      ids.map((id) => getReceipt(companyId, id).catch(() => null)),
    );
    setReceipts((prev) => {
      const next = { ...prev };
      fetched.forEach((r) => { if (r) next[r.receipt_id] = r; });
      return next;
    });
  }, [companyId]);

  const updateReceipt = useCallback((r: AgentReceipt) => {
    setReceipts((prev) => ({ ...prev, [r.receipt_id]: r }));
  }, []);

  const runTurn = useCallback(async (text: string) => {
    const msg = text.trim();
    if (!msg || loading) return;
    setError(null);

    const fileHint = uploads.length > 0
      ? `\n\n[${t("attachedFiles")}: ${uploads.map((u) => `${u.filename} (file_id=${u.file_id})`).join(", ")}]`
      : "";

    setTurns((prev) => [...prev, { kind: "user", content: msg }]);
    setInput("");
    setLoading(true);

    try {
      if (streaming) {
        // Append placeholder assistant turn we'll mutate as deltas arrive.
        let assistantIdx = -1;
        const toolCalls: AgentToolCall[] = [];
        setTurns((prev) => {
          assistantIdx = prev.length;
          return [...prev, { kind: "assistant", content: "", toolCalls: [] }];
        });

        let final: StreamFinalPayload | null = null;
        for await (const evt of agentStream(companyId, msg + fileHint, {
          persona,
          sessionId,
        })) {
          if (evt.event === "text_delta") {
            const delta = String(evt.data.delta ?? "");
            setTurns((prev) => prev.map((tn, i) =>
              i === assistantIdx ? { ...tn, content: tn.content + delta } : tn,
            ));
          } else if (evt.event === "tool_call_done") {
            toolCalls.push({
              tool:   String(evt.data.tool ?? ""),
              args:   {},
              result: null,
              error:  null,
              status: (evt.data.status as AgentToolCall["status"]) ?? "ok",
            });
            const snapshot = [...toolCalls];
            setTurns((prev) => prev.map((tn, i) =>
              i === assistantIdx ? { ...tn, toolCalls: snapshot } : tn,
            ));
          } else if (evt.event === "final") {
            final = evt.data as unknown as StreamFinalPayload;
          } else if (evt.event === "cancelled") {
            throw new Error(String(evt.data.reason ?? "cancelled"));
          }
        }

        if (final) {
          if (final.session_id) setSessionId(final.session_id);
          const receiptIds = final.pending?.map((p) => p.receipt_id) ?? [];
          const finalContent = final.content
            || (final.tool_calls?.length ? t("toolOnlyReply") : t("emptyReply"));
          setTurns((prev) => prev.map((tn, i) =>
            i === assistantIdx
              ? { ...tn, content: finalContent, toolCalls: final!.tool_calls, receiptIds }
              : tn,
          ));
          if (receiptIds.length > 0) fetchReceipts(receiptIds);
          if (final.error) setError(final.error);
        }
        setUploads([]);
      } else {
        const res: AgentChatResponse = await agentChat(companyId, msg + fileHint, {
          persona,
          sessionId,
        });
        if (res.session_id) setSessionId(res.session_id);

        const receiptIds = res.pending?.map((p) => p.receipt_id) ?? [];
        setTurns((prev) => [
          ...prev,
          {
            kind:       "assistant",
            content:    res.content || (res.tool_calls?.length ? t("toolOnlyReply") : t("emptyReply")),
            toolCalls:  res.tool_calls,
            receiptIds,
          },
        ]);
        if (receiptIds.length > 0) fetchReceipts(receiptIds);
        setUploads([]);
      }
    } catch (e) {
      const msgStr = e instanceof Error ? e.message : String(e);
      setError(msgStr);
      setTurns((prev) => [...prev, { kind: "error", content: msgStr }]);
    } finally {
      setLoading(false);
    }
  }, [companyId, persona, sessionId, uploads, loading, t, fetchReceipts, streaming]);

  const handleFile = useCallback(async (file: File) => {
    setUploading(true);
    setError(null);
    try {
      const up = await uploadAgentFile(companyId, file, sessionId);
      setUploads((prev) => [...prev, { file_id: up.file_id, filename: up.filename }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }, [companyId, sessionId]);

  const outerCls = variant === "page"
    ? "flex h-full min-h-[600px] flex-col rounded-lg border border-white/[0.07] bg-zinc-950"
    : "flex h-full flex-col";

  return (
    <div className={outerCls}>
      {/* presets */}
      {presets.length > 0 && (
        <div className="flex flex-wrap gap-1 border-b border-white/[0.07] px-2.5 py-2">
          {presets.map((p) => (
            <button
              key={p.label}
              type="button"
              disabled={loading}
              onClick={() => runTurn(p.text)}
              className="rounded border border-white/[0.08] bg-white/[0.03] px-2 py-0.5 text-[10px] font-medium text-white/35 transition-colors hover:border-indigo-500/30 hover:bg-indigo-500/[0.08] hover:text-indigo-300 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {p.label}
            </button>
          ))}
        </div>
      )}

      {/* transcript */}
      <div ref={listRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-2.5">
        {turns.map((turn, i) => (
          <TurnView
            key={i}
            turn={turn}
            companyId={companyId}
            receipts={receipts}
            onReceiptChanged={updateReceipt}
            onToolConfirmed={onToolConfirmed}
          />
        ))}
        {loading && (
          <div className="flex items-end gap-1.5">
            <div className="mb-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-indigo-600/20 ring-1 ring-indigo-500/20">
              <Bot className="h-2.5 w-2.5 text-indigo-300/70" />
            </div>
            <div className="rounded-xl rounded-bl-sm border border-white/[0.08] bg-white/[0.05] px-3 py-2">
              <span className="inline-flex gap-1">
                {[0, 1, 2].map((d) => (
                  <span
                    key={d}
                    className="h-1.5 w-1.5 animate-bounce rounded-full bg-white/30"
                    style={{ animationDelay: `${d * 150}ms` }}
                  />
                ))}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* uploads pending send */}
      {uploads.length > 0 && (
        <div className="flex flex-wrap gap-1 border-t border-white/[0.07] px-2.5 py-1.5">
          {uploads.map((u) => (
            <span key={u.file_id} className="rounded border border-indigo-500/25 bg-indigo-500/10 px-2 py-0.5 text-[10px] font-medium text-indigo-300/80">
              {u.filename}
            </span>
          ))}
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 border-t border-rose-500/20 bg-rose-500/[0.08] px-2.5 py-1.5 text-[10px] text-rose-300/80">
          <AlertTriangle className="h-3 w-3 shrink-0" />
          {error}
        </div>
      )}

      {/* composer */}
      <div className="shrink-0 border-t border-white/[0.07] px-2.5 py-2.5">
        {allowUpload && (
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.tsv,.xls,.xlsx,.pdf,.txt"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
            className="hidden"
          />
        )}
        <div className="flex items-center gap-1.5 rounded-lg border border-white/[0.1] bg-white/[0.03] px-2.5 py-1.5 transition-colors focus-within:border-indigo-500/35 focus-within:bg-indigo-950/10">
          {allowUpload && (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading || loading}
              title={t("upload")}
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-white/20 transition-colors hover:text-white/45 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Paperclip className="h-3.5 w-3.5" />}
            </button>
          )}
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                runTurn(input);
              }
            }}
            placeholder={t("placeholder")}
            rows={2}
            className="min-w-0 flex-1 resize-none bg-transparent text-[11px] text-white/80 placeholder-white/28 outline-none disabled:cursor-not-allowed disabled:opacity-40"
          />
          <button
            type="button"
            onClick={() => runTurn(input)}
            disabled={loading || !input.trim()}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-indigo-600/30 text-indigo-300/80 transition-colors hover:bg-indigo-600/50 hover:text-indigo-200 disabled:cursor-not-allowed disabled:opacity-35"
            aria-label={t("send")}
          >
            {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
          </button>
        </div>
        <p className="mt-1 text-[10px] text-white/18">{t("shortcutHint")}</p>
      </div>
    </div>
  );
}

function TurnView({
  turn, companyId, receipts, onReceiptChanged, onToolConfirmed,
}: {
  turn: Turn;
  companyId: number;
  receipts: Record<string, AgentReceipt>;
  onReceiptChanged: (r: AgentReceipt) => void;
  onToolConfirmed?: (tool: string) => void;
}) {
  const t = useTranslations("agent.chat");

  if (turn.kind === "user") {
    return (
      <div className="flex items-end justify-end gap-1.5">
        <div className="max-w-[84%] rounded-xl rounded-br-sm bg-indigo-600/35 px-3 py-2 text-[11px] leading-relaxed text-white/90">
          {turn.content}
        </div>
      </div>
    );
  }

  if (turn.kind === "error") {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-rose-500/20 bg-rose-500/[0.08] px-3 py-2 text-[10px] text-rose-300/80">
        <AlertTriangle className="h-3 w-3 shrink-0" />
        {turn.content}
      </div>
    );
  }

  // assistant
  return (
    <div className="flex items-end gap-1.5">
      <div className="mb-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-indigo-600/20 ring-1 ring-indigo-500/20">
        <Bot className="h-2.5 w-2.5 text-indigo-300/70" />
      </div>
      <div className="min-w-0 flex-1 space-y-2">
        <div className="max-w-[90%] rounded-xl rounded-bl-sm border border-white/[0.08] bg-white/[0.05] px-3 py-2 text-[11px] leading-relaxed text-white/65">
          {turn.content}
        </div>

        {turn.toolCalls && turn.toolCalls.length > 0 && (
          <div className="flex flex-wrap gap-1 pl-0.5">
            {turn.toolCalls.map((tc, i) => (
              <span
                key={i}
                className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[10px] ${
                  tc.status === "error"
                    ? "border-rose-500/30 bg-rose-500/10 text-rose-300"
                    : tc.status === "pending_confirmation"
                    ? "border-amber-500/30 bg-amber-500/10 text-amber-300"
                    : "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                }`}
                title={tc.error ?? (typeof tc.result === "object" ? t("ranOk") : "")}
              >
                <Wrench className="h-2.5 w-2.5" />
                {tc.tool}
              </span>
            ))}
          </div>
        )}

        {turn.receiptIds && turn.receiptIds.length > 0 && (
          <div className="space-y-2">
            {turn.receiptIds.map((rid) => {
              const r = receipts[rid];
              if (!r) {
                return (
                  <div key={rid} className="rounded-lg border border-white/[0.07] bg-black/20 p-2 text-[10px] text-white/28">
                    <Loader2 className="inline h-3 w-3 animate-spin" /> {t("loadingReceipt")}
                  </div>
                );
              }
              return <ReceiptCard key={rid} companyId={companyId} receipt={r} onChanged={onReceiptChanged} onConfirmed={onToolConfirmed} />;
            })}
          </div>
        )}
      </div>
    </div>
  );
}
