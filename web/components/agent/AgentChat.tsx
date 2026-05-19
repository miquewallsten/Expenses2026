"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Bot, Loader2, Send, Paperclip, AlertTriangle, Wrench,
  FileText, FileSpreadsheet, FileImage, FileArchive, X,
  type LucideIcon,
} from "lucide-react";
import { renderContent } from "@/lib/chat/renderContent";
import { toolLabel, isHiddenTool } from "@/lib/agent/tool-labels";
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
import SlashCommandPalette from "./SlashCommandPalette";
import { filterSlashCommands, type SlashCommand } from "./slashCommands";

// ── File-type icon mapping ──
function fileIconFor(filename: string): LucideIcon {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  if (["xls", "xlsx", "csv", "tsv", "ods"].includes(ext)) return FileSpreadsheet;
  if (["jpg", "jpeg", "png", "gif", "webp", "bmp", "tiff", "tif"].includes(ext)) return FileImage;
  if (["zip"].includes(ext)) return FileArchive;
  return FileText;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ── Types ──
interface AttachedFile {
  file_id: string;
  filename: string;
  size_bytes?: number;
}

interface Preset {
  label: string;
  text:  string;
}

interface Props {
  companyId: number;
  persona:   AgentPersona;
  presets?:  Preset[];
  greeting?: string;
  allowUpload?: boolean;
  variant?: "rail" | "page";
  onToolConfirmed?: (tool: string) => void;
  streaming?: boolean;
}

type TurnKind = "user" | "assistant" | "tool" | "error";
interface Turn {
  kind:    TurnKind;
  content: string;
  toolCalls?: AgentToolCall[];
  receiptIds?: string[];
  /** Files attached to this user turn. */
  attachments?: AttachedFile[];
}

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
  const [uploads,   setUploads]   = useState<AttachedFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [slashIndex, setSlashIndex] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const slashOpen = input.startsWith("/");
  const slashMatches: SlashCommand[] = slashOpen
    ? filterSlashCommands(input.slice(1), persona)
    : [];

  useEffect(() => {
    if (slashIndex >= slashMatches.length) setSlashIndex(0);
  }, [slashMatches.length, slashIndex]);

  const applySlash = useCallback((cmd: SlashCommand) => {
    if (cmd.needsArg) {
      setInput(cmd.prompt);
      setTimeout(() => {
        const el = inputRef.current;
        if (el) { el.focus(); el.setSelectionRange(cmd.prompt.length, cmd.prompt.length); }
      }, 0);
      return;
    }
    setInput("");
    runTurnRef.current(cmd.prompt);
  }, []);

  const runTurnRef = useRef<(text: string) => void>(() => undefined);

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

  // ── File upload ──
  const handleFiles = useCallback(async (files: FileList | File[]) => {
    const arr = Array.from(files);
    if (arr.length === 0) return;
    setUploading(true);
    setError(null);
    let uploaded = 0;
    for (const file of arr) {
      try {
        const up = await uploadAgentFile(companyId, file, sessionId);
        setUploads((prev) => [...prev, { file_id: up.file_id, filename: up.filename, size_bytes: up.size_bytes }]);
        uploaded++;
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    }
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
    if (uploaded > 0) {
      inputRef.current?.focus();
    }
  }, [companyId, sessionId]);

  const removeUpload = useCallback((fileId: string) => {
    setUploads((prev) => prev.filter((u) => u.file_id !== fileId));
  }, []);

  const runTurn = useCallback(async (text: string) => {
    const msg = text.trim();
    if (!msg || loading) return;
    setError(null);

    const fileHint = uploads.length > 0
      ? `\n\n[${t("attachedFiles")}: ${uploads.map((u) => `${u.filename} (file_id=${u.file_id})`).join(", ")}]`
      : "";

    setTurns((prev) => [...prev, { kind: "user", content: msg, attachments: uploads.length > 0 ? [...uploads] : undefined }]);
    setInput("");
    setUploads([]);
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
      } else {
        const res: AgentChatResponse = await agentChat(companyId, msg + fileHint, { persona, sessionId });
        const sid = res.session_id ?? null;
        if (sid && sid !== sessionId) setSessionId(sid);

        const toolCalls = res.tool_calls ?? [];
        const receiptIds = res.pending?.map((p) => p.receipt_id) ?? [];

        setTurns((prev) => [
          ...prev,
          { kind: "assistant", content: res.content, toolCalls, receiptIds },
        ]);

        if (receiptIds.length > 0) fetchReceipts(receiptIds);
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setTurns((prev) => [...prev, { kind: "error", content: message }]);
    } finally {
      setLoading(false);
      scrollToBottom();
    }
  }, [companyId, persona, sessionId, uploads, loading, t, fetchReceipts, streaming, scrollToBottom]);

  // eslint-disable-next-line react-hooks/immutability
  useEffect(() => { runTurnRef.current = runTurn; }, [runTurn]);


  

  const outerCls = variant === "page"
    ? "flex h-full min-h-[600px] flex-col rounded-lg border border-default bg-surface-0"
    : "flex h-full flex-col";

  return (
    <div className={outerCls}>
      {/* Presets */}
      {presets.length > 0 && (
        <div className="flex flex-wrap gap-1 border-b border-default px-2.5 py-2">
          {presets.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => runTurn(p.text)}
              className="rounded-lg border border-default bg-surface-1 px-2 py-0.5 text-[10px] text-secondary transition-colors hover:bg-surface-2 hover:text-primary"
            >
              {p.label}
            </button>
          ))}
        </div>
      )}

      {/* Transcript */}
      <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto px-2.5 py-3 space-y-3">
        {turns.map((turn, i) => (
          <TurnView
            key={i}
            turn={turn}
            companyId={companyId}
            receipts={receipts}
            onReceiptChanged={updateReceipt}
            onToolConfirmed={onToolConfirmed}
            isStreaming={streaming && i === turns.length - 1 && turn.kind === "assistant" && !turn.content}
          />
        ))}
        {loading && !streaming && (
          <div className="flex items-end gap-1.5">
            <div className="mb-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent-muted ring-1 ring-blue-500/20">
              <Bot className="h-2.5 w-2.5 text-accent/70" />
            </div>
            <div className="rounded-xl rounded-bl-sm border border-default bg-surface-2 px-3 py-2">
              <span className="text-[11px] text-muted animate-pulse">{t("thinking")}</span>
            </div>
          </div>
        )}
      </div>

      {/* Pending file attachments (above composer) */}
      {uploads.length > 0 && (
        <div className="shrink-0 border-t border-default px-3 pt-2 pb-1">
          <div className="flex flex-wrap gap-2">
            {uploads.map((u) => {
              const Icon = fileIconFor(u.filename);
              return (
                <div
                  key={u.file_id}
                  className="group/att flex items-center gap-1.5 rounded-lg border border-default bg-surface-1 px-2 py-1.5 transition-colors hover:border-accent/30"
                >
                  <Icon className="h-4 w-4 shrink-0 text-muted" />
                  <div className="min-w-0 flex flex-col leading-tight">
                    <span className="max-w-[120px] truncate text-[10px] font-medium text-secondary">{u.filename}</span>
                    {u.size_bytes != null && (
                      <span className="text-[8px] text-muted">{formatBytes(u.size_bytes)}</span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => removeUpload(u.file_id)}
                    className="ml-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded text-muted transition-colors hover:bg-surface-2 hover:text-error"
                    aria-label={t("removeAttachment")}
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                </div>
              );
            })}
          </div>
          {uploading && (
            <div className="mt-1 flex items-center gap-1.5 text-[9px] text-muted">
              <Loader2 className="h-3 w-3 animate-spin" />
              {t("uploading")}
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 border-t border-rose-500/20 bg-rose-500/[0.08] px-2.5 py-1.5 text-[10px] text-rose-300/80">
          <AlertTriangle className="h-3 w-3 shrink-0" />
          <span className="flex-1">{error}</span>
          <button type="button" onClick={() => setError(null)} className="text-rose-300/60 hover:text-rose-300">
            <X className="h-3 w-3" />
          </button>
        </div>
      )}

      {/* Composer */}
      <div className="relative shrink-0 border-t border-default px-3 py-3">
        {slashOpen && (
          <SlashCommandPalette
            commands={slashMatches}
            activeIndex={slashIndex}
            onHover={setSlashIndex}
            onSelect={applySlash}
          />
        )}
        {allowUpload && (
          <input
            ref={fileRef}
            type="file"
            multiple
            accept=".csv,.tsv,.xls,.xlsx,.ods,.pdf,.txt,.doc,.docx,.xml,.zip,.jpeg,.jpg,.png,.gif,.webp,.bmp,.tiff,.tif"
            onChange={(e) => { if (e.target.files && e.target.files.length > 0) handleFiles(e.target.files); }}
            className="hidden"
          />
        )}
        <div className="flex items-end gap-2 rounded-xl border border-default bg-surface-1 px-3 py-2 transition-all focus-within:border-accent/40 focus-within:bg-surface-2 focus-within:shadow-sm">
          {allowUpload && (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              title={t("upload")}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-secondary disabled:cursor-not-allowed disabled:opacity-40"
            >
              {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Paperclip className="h-3.5 w-3.5" />}
            </button>
          )}
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              e.target.style.height = "auto";
              e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`;
            }}
            onKeyDown={(e) => {
              if (slashOpen && slashMatches.length > 0) {
                if (e.key === "ArrowDown") { e.preventDefault(); setSlashIndex((i) => (i + 1) % slashMatches.length); return; }
                if (e.key === "ArrowUp") { e.preventDefault(); setSlashIndex((i) => (i - 1 + slashMatches.length) % slashMatches.length); return; }
                if (e.key === "Tab" || (e.key === "Enter" && !e.shiftKey)) { e.preventDefault(); applySlash(slashMatches[slashIndex]); return; }
                if (e.key === "Escape") { e.preventDefault(); setInput(""); return; }
              }
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                runTurn(input);
              }
            }}
            placeholder={t("placeholderExpanded")}
            rows={1}
            className="min-w-0 flex-1 resize-none bg-transparent text-[12px] leading-relaxed text-primary placeholder-tertiary outline-none disabled:cursor-not-allowed disabled:opacity-40"
            style={{ minHeight: "24px", maxHeight: "160px" }}
          />
          <button
            type="button"
            onClick={() => runTurn(input)}
            disabled={loading || !input.trim()}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent text-white shadow-sm transition-all hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-30"
            aria-label={t("send")}
          >
            {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
          </button>
        </div>
        <p className="mt-1.5 text-[10px] text-tertiary">{t("composerHint")}</p>
      </div>
    </div>
  );
}

// ── Attachment thumbnail (shown in chat transcript) ──
function AttachmentBadge({ file }: { file: AttachedFile }) {
  const iconName = file.filename.split(".").pop()?.toLowerCase() ?? "";
  return (
    <div className="inline-flex items-center gap-1.5 rounded-lg border border-default bg-surface-1 px-2 py-1">
      {(["xls", "xlsx", "csv", "tsv", "ods"].includes(iconName) && <FileSpreadsheet className="h-3.5 w-3.5 text-muted" />) ||
       (["jpg", "jpeg", "png", "gif", "webp", "bmp", "tiff", "tif"].includes(iconName) && <FileImage className="h-3.5 w-3.5 text-muted" />) ||
       (["zip"].includes(iconName) && <FileArchive className="h-3.5 w-3.5 text-muted" />) ||
       <FileText className="h-3.5 w-3.5 text-muted" />}
      <span className="max-w-[100px] truncate text-[10px] font-medium text-secondary">{file.filename}</span>
      {file.size_bytes != null && (
        <span className="text-[8px] text-muted">{formatBytes(file.size_bytes)}</span>
      )}
    </div>
  );
}

function TurnView({
  turn, companyId, receipts, onReceiptChanged, onToolConfirmed, isStreaming,
}: {
  turn: Turn;
  companyId: number;
  receipts: Record<string, AgentReceipt>;
  onReceiptChanged: (r: AgentReceipt) => void;
  onToolConfirmed?: (tool: string) => void;
  isStreaming?: boolean;
}) {
  const t = useTranslations("agent.chat");

  if (turn.kind === "user") {
    return (
      <div className="flex flex-col items-end gap-1">
        {/* Attachment thumbnails above the message bubble */}
        {turn.attachments && turn.attachments.length > 0 && (
          <div className="flex flex-wrap gap-1 justify-end">
            {turn.attachments.map((a) => (
              <AttachmentBadge key={a.file_id} file={a} />
            ))}
          </div>
        )}
        <div className="max-w-[84%] rounded-xl rounded-br-sm bg-blue-600/35 px-3 py-2 text-[11px] leading-relaxed text-primary">
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

  return (
    <div className="flex items-end gap-1.5">
      <div className="mb-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent-muted ring-1 ring-blue-500/20">
        <Bot className="h-2.5 w-2.5 text-accent/70" />
      </div>
      <div className="min-w-0 flex-1 space-y-2">
        <div className="max-w-[90%] rounded-xl rounded-bl-sm border border-default bg-surface-2 px-3 py-2 text-[11px] leading-relaxed text-secondary">
          {isStreaming && !turn.content ? (
            <span className="animate-pulse text-muted">{t("thinking")}</span>
          ) : (
            renderContent(turn.content, {
              textClassName: "mb-2 last:mb-0 text-secondary leading-relaxed",
              boldClassName: "font-semibold text-secondary",
              bulletClassName: "text-secondary text-[11px] leading-relaxed",
            })
          )}
        </div>

        {turn.toolCalls && turn.toolCalls.length > 0 && (
          <div className="flex flex-wrap gap-1 pl-0.5">
            {turn.toolCalls
              .filter((tc) => !isHiddenTool(tc.tool) && (tc.status === "pending_confirmation" || tc.status === "error"))
              .map((tc, i) => {
                const label = toolLabel(tc.tool);
                return (
                  <span
                    key={i}
                    className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] ${
                      tc.status === "error"
                        ? "border-error bg-error-muted text-rose-300 font-mono"
                        : "border-amber-500/30 bg-warning-muted text-warning"
                    }`}
                    title={tc.error ?? (typeof tc.result === "object" ? t("ranOk") : "")}
                  >
                    <Wrench className="h-2.5 w-2.5" />
                    {label}
                  </span>
                );
              })}
          </div>
        )}

        {turn.receiptIds && turn.receiptIds.length > 0 && (
          <div className="space-y-2">
            {turn.receiptIds.map((rid) => {
              const r = receipts[rid];
              if (!r) {
                return (
                  <div key={rid} className="rounded-lg border border-default section-subtle p-2 text-[10px] text-muted">
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
