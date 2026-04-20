"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  BedDouble,
  Briefcase,
  CheckCircle2,
  ChevronRight,
  Clock,
  ExternalLink,
  FileText,
  Globe,
  HelpCircle,
  Image,
  Link2,
  Loader2,
  Monitor,
  Package2,
  Paperclip,
  Plane,
  Plus,
  Send,
  Trash2,
  XCircle,
  AlertCircle,
} from "lucide-react";
import { useMyWorkContext } from "@/context/MyWorkContext";
import { useUserContext } from "@/context/UserContext";
import PurchaseRequisitionForm from "./PurchaseRequisitionForm";
import type { Attachment as FormAttachment } from "./PurchaseRequisitionForm";

const API = process.env.NEXT_PUBLIC_API_BASE_URL;

// ── Types ──────────────────────────────────────────────────────────────────────

interface ChatMsg {
  role: "user" | "assistant";
  content: string;
}

// ── Minimal inline markdown → JSX (bold + numbered/bulleted lists) ─────────────

function renderMd(text: string): React.ReactNode {
  // Split into lines to handle list items
  const lines = text.split("\n");
  const nodes: React.ReactNode[] = [];

  for (let li = 0; li < lines.length; li++) {
    const line = lines[li];
    // Detect list item: "1. " / "- " / "* "
    const listMatch = line.match(/^(\d+\.\s+|[-*]\s+)(.*)/);
    const content = listMatch ? listMatch[2] : line;

    // Inline bold: split on **...**
    const parts = content.split(/\*\*(.+?)\*\*/g);
    const inline: React.ReactNode[] = parts.map((p, pi) =>
      pi % 2 === 1 ? <strong key={pi} className="font-semibold text-white/90">{p}</strong> : p
    );

    if (listMatch) {
      nodes.push(
        <div key={li} className="flex gap-1.5">
          <span className="shrink-0 text-white/30">{listMatch[1].trim()}</span>
          <span>{inline}</span>
        </div>
      );
    } else if (line.trim() === "") {
      if (li > 0) nodes.push(<div key={li} className="h-1.5" />);
    } else {
      nodes.push(<div key={li}>{inline}</div>);
    }
  }
  return <>{nodes}</>;
}

interface ResearchResult {
  title: string;
  text: string;
  url: string;
}

interface Attachment {
  id: number;
  request_id: number;
  attachment_type: "file" | "url";
  original_name: string | null;
  file_size: number | null;
  mime_type: string | null;
  url: string | null;
  label: string | null;
  created_at: string;
}

interface PurchaseRequest {
  id: number;
  request_no: string | null;
  request_type: string | null;
  title: string | null;
  status: string;
  priority: string;
  estimated_amount: number | null;
  currency: string | null;
  details: Record<string, unknown> | null;
  conversation: ChatMsg[] | null;
  research: ResearchResult[] | null;
  requester_name: string | null;
  reviewer_notes: string | null;
  rejection_reason: string | null;
  submitted_at: string | null;
  viewed_at: string | null;
  fulfilled_at: string | null;
  created_at: string;
}

// ── Constants ──────────────────────────────────────────────────────────────────

const TYPE_ICONS: Record<string, React.ElementType> = {
  travel: Plane,
  hotel: BedDouble,
  equipment: Package2,
  software: Monitor,
  service: Briefcase,
  other: HelpCircle,
};

const TYPE_LABELS: Record<string, string> = {
  travel: "Travel",
  hotel: "Hotel",
  equipment: "Equipment",
  software: "Software",
  service: "Service",
  other: "Other",
};

const STATUS_CONFIG: Record<string, { label: string; cls: string }> = {
  draft:        { label: "Draft",        cls: "text-white/35 bg-white/[0.06]" },
  submitted:    { label: "Submitted",    cls: "text-blue-300/80 bg-blue-500/[0.10]" },
  under_review: { label: "Under Review", cls: "text-amber-300/80 bg-amber-500/[0.10]" },
  approved:     { label: "Approved",     cls: "text-emerald-300/80 bg-emerald-500/[0.10]" },
  rejected:     { label: "Rejected",     cls: "text-red-300/80 bg-red-500/[0.10]" },
  fulfilled:    { label: "Fulfilled",    cls: "text-purple-300/80 bg-purple-500/[0.10]" },
  cancelled:    { label: "Cancelled",    cls: "text-white/20 bg-white/[0.04]" },
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function TypeIcon({ type, className }: { type: string | null; className?: string }) {
  const Icon = (type && TYPE_ICONS[type]) ? TYPE_ICONS[type] : HelpCircle;
  return <Icon className={className ?? "h-3.5 w-3.5"} />;
}

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.draft;
  return (
    <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${cfg.cls}`}>
      {cfg.label}
    </span>
  );
}

// ── Attachments bar ────────────────────────────────────────────────────────────

function fmtBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function AttachmentIcon({ mime }: { mime: string | null }) {
  if (!mime) return <Paperclip className="h-3 w-3" />;
  if (mime.startsWith("image/")) return <Image className="h-3 w-3" />;
  return <FileText className="h-3 w-3" />;
}

function AttachmentsBar({
  requestId,
  companyId,
  userId,
  editable,
}: {
  requestId: number;
  companyId: string;
  userId: string;
  editable: boolean;
}) {
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [urlInput, setUrlInput] = useState("");
  const [urlLabel, setUrlLabel] = useState("");
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${API}/requests/${companyId}/${requestId}/attachments`);
      if (res.ok) setAttachments(await res.json());
    } finally {
      setLoading(false);
    }
  }, [companyId, requestId]);

  useEffect(() => { load(); }, [load]);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setSaving(true);
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch(
      `${API}/requests/${companyId}/${requestId}/attachments/file?uploader_id=${userId}`,
      { method: "POST", body: fd }
    );
    if (res.ok) await load();
    setSaving(false);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function handleAddUrl() {
    if (!urlInput.trim()) return;
    setSaving(true);
    const res = await fetch(
      `${API}/requests/${companyId}/${requestId}/attachments/url?uploader_id=${userId}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: urlInput.trim(), label: urlLabel.trim() || null }),
      }
    );
    if (res.ok) { setUrlInput(""); setUrlLabel(""); setShowAdd(false); await load(); }
    setSaving(false);
  }

  async function handleDelete(attId: number) {
    const res = await fetch(
      `${API}/requests/${companyId}/${requestId}/attachments/${attId}?requester_id=${userId}`,
      { method: "DELETE" }
    );
    if (res.ok || res.status === 204) await load();
  }

  if (loading) return null;

  return (
    <div className="border-t border-white/[0.05] px-4 py-2.5">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-widest text-white/22">
          <Paperclip className="h-2.5 w-2.5" />
          Attachments{attachments.length > 0 ? ` (${attachments.length})` : ""}
        </span>
        {editable && (
          <div className="flex items-center gap-1">
            <input
              ref={fileRef}
              type="file"
              className="hidden"
              accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.png,.jpg,.jpeg,.gif,.webp"
              onChange={handleFile}
            />
            <button
              type="button"
              title="Upload file"
              onClick={() => fileRef.current?.click()}
              disabled={saving}
              className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] text-white/30 transition-colors hover:bg-white/[0.04] hover:text-white/55 disabled:opacity-40"
            >
              <FileText className="h-2.5 w-2.5" /> File
            </button>
            <button
              type="button"
              title="Add URL"
              onClick={() => setShowAdd((v) => !v)}
              className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] transition-colors hover:bg-white/[0.04] ${showAdd ? "text-indigo-300/60" : "text-white/30 hover:text-white/55"}`}
            >
              <Link2 className="h-2.5 w-2.5" /> URL
            </button>
          </div>
        )}
      </div>

      {/* URL add form */}
      {showAdd && editable && (
        <div className="mb-2 flex items-center gap-1.5">
          <input
            type="text"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            placeholder="https://..."
            className="min-w-0 flex-1 rounded border border-white/[0.09] bg-white/[0.04] px-2 py-1 text-[10px] text-white/70 placeholder-white/18 outline-none focus:border-indigo-500/40"
          />
          <input
            type="text"
            value={urlLabel}
            onChange={(e) => setUrlLabel(e.target.value)}
            placeholder="Label (optional)"
            className="w-24 rounded border border-white/[0.09] bg-white/[0.04] px-2 py-1 text-[10px] text-white/70 placeholder-white/18 outline-none focus:border-indigo-500/40"
          />
          <button
            type="button"
            onClick={handleAddUrl}
            disabled={!urlInput.trim() || saving}
            className="rounded bg-indigo-600/60 px-2 py-1 text-[10px] font-medium text-white/80 transition-colors hover:bg-indigo-600/80 disabled:opacity-40"
          >
            {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : "Add"}
          </button>
        </div>
      )}

      {/* Attachment list */}
      {attachments.length === 0 ? (
        <p className="text-[9px] text-white/18">No attachments yet</p>
      ) : (
        <div className="space-y-0.5">
          {attachments.map((att) => (
            <div
              key={att.id}
              className="group flex items-center gap-2 rounded px-1.5 py-1 hover:bg-white/[0.03]"
            >
              <span className="shrink-0 text-white/28">
                {att.attachment_type === "url"
                  ? <Link2 className="h-3 w-3" />
                  : <AttachmentIcon mime={att.mime_type} />}
              </span>
              <span className="min-w-0 flex-1 truncate text-[10px] text-white/55">
                {att.label ?? att.original_name ?? att.url ?? "Attachment"}
              </span>
              {att.file_size && (
                <span className="shrink-0 text-[9px] text-white/22">{fmtBytes(att.file_size)}</span>
              )}
              {att.attachment_type === "file" ? (
                <a
                  href={`${API}/requests/${companyId}/attachments/${att.id}/download`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 text-white/22 opacity-0 transition-opacity group-hover:opacity-100 hover:text-indigo-300/60"
                >
                  <ExternalLink className="h-3 w-3" />
                </a>
              ) : (
                <a
                  href={att.url ?? "#"}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 text-white/22 opacity-0 transition-opacity group-hover:opacity-100 hover:text-indigo-300/60"
                >
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}
              {editable && (
                <button
                  type="button"
                  onClick={() => handleDelete(att.id)}
                  className="shrink-0 text-white/18 opacity-0 transition-opacity group-hover:opacity-100 hover:text-red-300/60"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Request list item ──────────────────────────────────────────────────────────

function RequestRow({
  req,
  active,
  onClick,
}: {
  req: PurchaseRequest;
  active: boolean;
  onClick: () => void;
}) {
  const label = req.title ?? (req.request_type ? TYPE_LABELS[req.request_type] ?? "Request" : "New Request");
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group relative flex w-full items-center gap-2.5 rounded px-3 py-2 text-left transition-colors ${
        active
          ? "bg-indigo-600/[0.18] text-white"
          : "text-white/50 hover:bg-white/[0.04] hover:text-white/75"
      }`}
    >
      {active && (
        <span className="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-r-full bg-indigo-400/70" />
      )}
      <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded ${
        active ? "bg-indigo-500/20 text-indigo-300" : "bg-white/[0.05] text-white/28"
      }`}>
        <TypeIcon type={req.request_type} className="h-3 w-3" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[11px] font-medium leading-tight">{label}</p>
        <div className="mt-0.5 flex items-center gap-1.5">
          <StatusBadge status={req.status} />
          <span className="text-[9px] text-white/22">{fmtDate(req.created_at)}</span>
        </div>
      </div>
      {req.estimated_amount && (
        <span className="shrink-0 text-[10px] font-medium text-white/35">
          {req.currency ?? ""}{Number(req.estimated_amount).toLocaleString()}
        </span>
      )}
      <ChevronRight className={`h-3 w-3 shrink-0 ${active ? "text-indigo-300/50" : "text-white/15"}`} />
    </button>
  );
}

// ── AI Chat panel ──────────────────────────────────────────────────────────────

function ChatPanel({
  req,
  messages,
  onNewMessage,
  sending,
  readyToSubmit,
  onSubmit,
  submitting,
  researchResults,
  companyId,
  userId,
}: {
  req: PurchaseRequest;
  messages: ChatMsg[];
  onNewMessage: (text: string, research: boolean) => void;
  sending: boolean;
  readyToSubmit: boolean;
  onSubmit: () => void;
  submitting: boolean;
  researchResults: ResearchResult[] | null;
  companyId: string;
  userId: string;
}) {
  const [input, setInput] = useState("");
  const [webSearch, setWebSearch] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function handleSend() {
    const text = input.trim();
    if (!text || sending) return;
    setInput("");
    onNewMessage(text, webSearch);
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  const label = req.title ?? (req.request_type ? TYPE_LABELS[req.request_type] : null) ?? "New Request";

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex h-9 shrink-0 items-center gap-2.5 border-b border-white/[0.06] px-4">
        <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded ${
          req.request_type ? "bg-indigo-500/20 text-indigo-300" : "bg-white/[0.05] text-white/28"
        }`}>
          <TypeIcon type={req.request_type} className="h-3 w-3" />
        </span>
        <span className="text-[11px] font-semibold text-white/70">{label}</span>
        <StatusBadge status={req.status} />
      </div>

      {/* Messages */}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        <div className="space-y-3">
          {messages.map((m, i) => (
            <div
              key={i}
              className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[80%] rounded-lg px-3 py-2 text-[11px] leading-relaxed ${
                  m.role === "user"
                    ? "bg-indigo-600/[0.22] text-white/85"
                    : "bg-white/[0.06] text-white/70"
                }`}
              >
                {renderMd(m.content)}
              </div>
            </div>
          ))}

          {sending && (
            <div className="flex justify-start">
              <div className="flex items-center gap-1.5 rounded-lg bg-white/[0.06] px-3 py-2">
                <Loader2 className="h-3 w-3 animate-spin text-white/30" />
                <span className="text-[10px] text-white/28">Thinking…</span>
              </div>
            </div>
          )}

          {/* Research results */}
          {researchResults && researchResults.length > 0 && (
            <div className="rounded-lg border border-white/[0.07] bg-white/[0.03] p-2.5">
              <p className="mb-1.5 flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-widest text-white/25">
                <Globe className="h-2.5 w-2.5" />
                Web Research
              </p>
              <div className="space-y-1.5">
                {researchResults.map((r, i) => (
                  <div key={i} className="text-[10px] leading-relaxed text-white/40">
                    <span className="font-medium text-white/55">{r.title}: </span>
                    {r.text.slice(0, 120)}
                    {r.url && (
                      <a
                        href={r.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ml-1 text-indigo-400/60 underline-offset-2 hover:underline"
                      >
                        ↗
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* Submit bar (when ready) */}
      {readyToSubmit && (
        <div className="shrink-0 border-t border-emerald-500/20 bg-emerald-900/[0.08] px-4 py-2.5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400/60" />
              <span className="text-[10px] font-medium text-emerald-300/60">
                All details gathered — ready to submit
              </span>
            </div>
            <button
              type="button"
              onClick={onSubmit}
              disabled={submitting}
              className="flex items-center gap-1.5 rounded bg-emerald-600/70 px-3 py-1.5 text-[10px] font-semibold text-white/90 transition-colors hover:bg-emerald-600/90 disabled:opacity-50"
            >
              {submitting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
              Submit Request
            </button>
          </div>
        </div>
      )}

      {/* Attachments */}
      <AttachmentsBar
        requestId={req.id}
        companyId={companyId}
        userId={userId}
        editable={true}
      />

      {/* Input area */}
      <div className="shrink-0 border-t border-white/[0.06] p-3">
        <div className="flex items-end gap-2">
          <div className="relative flex-1">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKey}
              rows={1}
              placeholder="Tell me what you need…"
              disabled={sending}
              className="w-full resize-none rounded-lg border border-white/[0.09] bg-white/[0.04] px-3 py-2 text-[11px] text-white/80 placeholder-white/20 outline-none transition-colors focus:border-indigo-500/40 focus:bg-white/[0.06] disabled:opacity-50"
              style={{ minHeight: 34, maxHeight: 100 }}
            />
          </div>
          <button
            type="button"
            title={webSearch ? "Web search ON — click to disable" : "Enable web search for research"}
            onClick={() => setWebSearch((v) => !v)}
            className={`flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-lg border transition-colors ${
              webSearch
                ? "border-indigo-500/40 bg-indigo-600/[0.18] text-indigo-300"
                : "border-white/[0.07] bg-white/[0.03] text-white/25 hover:text-white/45"
            }`}
          >
            <Globe className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={handleSend}
            disabled={!input.trim() || sending}
            className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-lg bg-indigo-600/70 text-white/90 transition-colors hover:bg-indigo-600/90 disabled:opacity-40"
          >
            <Send className="h-3.5 w-3.5" />
          </button>
        </div>
        {webSearch && (
          <p className="mt-1.5 text-[9px] text-indigo-300/40">
            Web search enabled — AI will look up relevant pricing and options
          </p>
        )}
      </div>
    </div>
  );
}

// ── Request detail panel ────────────────────────────────────────────────────────

function DetailPanel({
  req,
  onCancel,
  cancelling,
  companyId,
  userId,
}: {
  req: PurchaseRequest;
  onCancel: () => void;
  cancelling: boolean;
  companyId: string;
  userId: string;
}) {
  const [showConv, setShowConv] = useState(false);
  const label = req.title ?? (req.request_type ? TYPE_LABELS[req.request_type] : null) ?? "Request";

  const details = req.details ?? {};
  const detailRows = Object.entries(details).filter(
    ([k]) => !["type", "title"].includes(k)
  );

  const canCancel = !["fulfilled", "cancelled", "rejected"].includes(req.status);

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      {/* Header */}
      <div className="flex h-9 shrink-0 items-center gap-2.5 border-b border-white/[0.06] px-4">
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-indigo-500/20 text-indigo-300">
          <TypeIcon type={req.request_type} className="h-3 w-3" />
        </span>
        <span className="flex-1 truncate text-[11px] font-semibold text-white/70">{label}</span>
        <StatusBadge status={req.status} />
      </div>

      <div className="flex-1 space-y-4 px-4 py-4">
        {/* Status message */}
        {req.status === "approved" && (
          <div className="flex items-center gap-2 rounded border border-emerald-500/20 bg-emerald-900/[0.08] px-3 py-2">
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-400/60" />
            <span className="text-[10px] text-emerald-300/60">
              Approved{req.reviewer_notes ? ` — ${req.reviewer_notes}` : ""}
            </span>
          </div>
        )}
        {req.status === "rejected" && (
          <div className="flex items-center gap-2 rounded border border-red-500/20 bg-red-900/[0.08] px-3 py-2">
            <XCircle className="h-3.5 w-3.5 shrink-0 text-red-400/60" />
            <span className="text-[10px] text-red-300/60">
              Rejected{req.rejection_reason ? ` — ${req.rejection_reason}` : ""}
            </span>
          </div>
        )}
        {req.status === "fulfilled" && (
          <div className="flex items-center gap-2 rounded border border-purple-500/20 bg-purple-900/[0.08] px-3 py-2">
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-purple-400/60" />
            <span className="text-[10px] text-purple-300/60">
              Fulfilled {req.fulfilled_at ? `on ${fmtDate(req.fulfilled_at)}` : ""}
              {req.reviewer_notes ? ` — ${req.reviewer_notes}` : ""}
            </span>
          </div>
        )}
        {req.status === "submitted" && (
          <div className="flex items-center gap-2 rounded border border-blue-500/20 bg-blue-900/[0.08] px-3 py-2">
            <Clock className="h-3.5 w-3.5 shrink-0 text-blue-400/60" />
            <span className="text-[10px] text-blue-300/60">
              Submitted {fmtDate(req.submitted_at)} — awaiting review
            </span>
          </div>
        )}

        {/* Structured details */}
        {detailRows.length > 0 && (
          <div>
            <p className="mb-2 text-[9px] font-bold uppercase tracking-widest text-white/22">
              Request Details
            </p>
            <div className="overflow-hidden rounded-lg border border-white/[0.07]">
              {detailRows.map(([key, val], i) => (
                <div
                  key={key}
                  className={`flex items-start justify-between gap-4 px-3 py-2 ${
                    i < detailRows.length - 1 ? "border-b border-white/[0.05]" : ""
                  }`}
                >
                  <span className="text-[10px] capitalize text-white/30">
                    {key.replace(/_/g, " ")}
                  </span>
                  <span className="text-right text-[10px] font-medium text-white/60">
                    {String(val ?? "—")}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Estimated amount */}
        {req.estimated_amount && (
          <div className="flex items-center justify-between rounded-lg border border-white/[0.07] px-3 py-2.5">
            <span className="text-[10px] text-white/30">Estimated Amount</span>
            <span className="text-[13px] font-semibold text-white/70">
              {req.currency ?? ""} {Number(req.estimated_amount).toLocaleString()}
            </span>
          </div>
        )}

        {/* Research results */}
        {req.research && req.research.length > 0 && (
          <div>
            <p className="mb-2 text-[9px] font-bold uppercase tracking-widest text-white/22">
              Research Results
            </p>
            <div className="space-y-2">
              {req.research.map((r, i) => (
                <div key={i} className="rounded border border-white/[0.06] bg-white/[0.02] px-3 py-2">
                  <p className="text-[10px] font-medium text-white/50">{r.title}</p>
                  <p className="mt-0.5 text-[10px] leading-relaxed text-white/32">{r.text.slice(0, 200)}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Conversation history (collapsible) */}
        {req.conversation && req.conversation.length > 0 && (
          <div>
            <button
              type="button"
              onClick={() => setShowConv((v) => !v)}
              className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-widest text-white/22 transition-colors hover:text-white/40"
            >
              <ChevronRight className={`h-2.5 w-2.5 transition-transform ${showConv ? "rotate-90" : ""}`} />
              AI Conversation History ({req.conversation.length} messages)
            </button>
            {showConv && (
              <div className="mt-2 space-y-1.5 rounded-lg border border-white/[0.06] p-2.5">
                {req.conversation.map((m, i) => (
                  <div key={i} className={`text-[10px] leading-relaxed ${
                    m.role === "user" ? "text-white/50" : "text-white/35"
                  }`}>
                    <span className="font-semibold capitalize text-white/28">{m.role}: </span>
                    {renderMd(m.content)}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Attachments */}
      <AttachmentsBar
        requestId={req.id}
        companyId={companyId}
        userId={userId}
        editable={false}
      />

      {/* Footer actions */}
      {canCancel && (
        <div className="shrink-0 border-t border-white/[0.05] px-4 py-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={cancelling}
            className="flex items-center gap-1.5 rounded px-3 py-1.5 text-[10px] font-medium text-white/28 transition-colors hover:bg-red-900/[0.10] hover:text-red-300/60 disabled:opacity-40"
          >
            {cancelling ? <Loader2 className="h-3 w-3 animate-spin" /> : <XCircle className="h-3 w-3" />}
            Cancel Request
          </button>
        </div>
      )}
    </div>
  );
}

// ── Empty right panel ──────────────────────────────────────────────────────────

function EmptyRight({ onNew }: { onNew: () => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
      <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/[0.07] bg-white/[0.03]">
        <Briefcase className="h-5 w-5 text-white/18" />
      </div>
      <div>
        <p className="text-[12px] font-medium text-white/30">No request selected</p>
        <p className="mt-0.5 text-[10px] text-white/18">
          Select from the list or start a new request
        </p>
      </div>
      <button
        type="button"
        onClick={onNew}
        className="mt-1 flex items-center gap-1.5 rounded bg-indigo-600/70 px-3 py-1.5 text-[10px] font-semibold text-white/90 transition-colors hover:bg-indigo-600/90"
      >
        <Plus className="h-3 w-3" />
        New Request
      </button>
    </div>
  );
}

// ── Main module ────────────────────────────────────────────────────────────────

export default function MyRequestsModule() {
  const { effectiveConfig } = useMyWorkContext();
  const { userIdStr, companyId, displayName } = useUserContext();

  const [requests, setRequests]           = useState<PurchaseRequest[]>([]);
  const [selectedId, setSelectedId]       = useState<number | null>(null);
  const [loading, setLoading]             = useState(true);
  const [creatingNew, setCreatingNew]     = useState(false);
  const [chatMessages, setChatMessages]   = useState<ChatMsg[]>([]);
  const [sending, setSending]             = useState(false);
  const [readyToSubmit, setReadyToSubmit] = useState(false);
  const [submitting, setSubmitting]       = useState(false);
  const [cancelling, setCancelling]       = useState(false);
  const [deleting, setDeleting]           = useState(false);
  const [researchResults, setResearchResults] = useState<ResearchResult[] | null>(null);
  const [error, setError]                 = useState<string | null>(null);
  const [attachments, setAttachments]     = useState<FormAttachment[]>([]);

  const selected = requests.find((r) => r.id === selectedId) ?? null;
  const isDraft  = selected?.status === "draft";
  const canDelete = selected !== null && (
    selected.status === "draft" ||
    (selected.status === "submitted" && selected.viewed_at === null)
  );

  // ── Load requests ────────────────────────────────────────────────────────────

  const loadRequests = useCallback(async () => {
    if (!companyId || !userIdStr) return;
    try {
      const res = await fetch(
        `${API}/requests/${companyId}/my?requester_id=${userIdStr}`
      );
      if (res.ok) {
        const data: PurchaseRequest[] = await res.json();
        setRequests(data);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [companyId, userIdStr]);

  useEffect(() => {
    loadRequests();
  }, [loadRequests]);

  // ── Load attachments when selection changes ───────────────────────────────────

  useEffect(() => {
    if (!selectedId || !companyId) { setAttachments([]); return; }
    fetch(`${API}/requests/${companyId}/${selectedId}/attachments`)
      .then((r) => r.ok ? r.json() : [])
      .then(setAttachments)
      .catch(() => setAttachments([]));
  }, [selectedId, companyId]);

  // ── Select a request from the list ───────────────────────────────────────────

  function selectRequest(req: PurchaseRequest) {
    setSelectedId(req.id);
    setReadyToSubmit(false);
    setResearchResults(null);
    setError(null);
    if (req.status === "draft") {
      setChatMessages(req.conversation ?? []);
    }
  }

  // ── Create new request ───────────────────────────────────────────────────────

  async function handleNew() {
    if (!companyId || !userIdStr || creatingNew) return;
    setCreatingNew(true);
    setError(null);
    try {
      const name = encodeURIComponent(displayName ?? "");
      const res = await fetch(
        `${API}/requests/${companyId}/new?requester_id=${userIdStr}&requester_name=${name}`,
        { method: "POST" }
      );
      if (!res.ok) throw new Error("Failed to create request");
      const req: PurchaseRequest = await res.json();
      setRequests((prev) => [req, ...prev]);
      setSelectedId(req.id);
      setChatMessages(req.conversation ?? []);
      setReadyToSubmit(false);
      setResearchResults(null);
    } catch {
      setError("Could not start a new request. Please try again.");
    } finally {
      setCreatingNew(false);
    }
  }

  // ── Chat turn ────────────────────────────────────────────────────────────────

  async function handleSendMessage(text: string, research: boolean) {
    if (!selectedId || !companyId || sending) return;
    setSending(true);
    setError(null);

    // Optimistic user bubble
    const userMsg: ChatMsg = { role: "user", content: text };
    setChatMessages((prev) => [...prev, userMsg]);

    try {
      const res = await fetch(`${API}/requests/${companyId}/${selectedId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, research }),
      });
      if (!res.ok) throw new Error("Chat failed");
      const data = await res.json();

      const aiMsg: ChatMsg = { role: "assistant", content: data.reply };
      setChatMessages((prev) => [...prev, aiMsg]);
      setReadyToSubmit(data.ready_to_submit ?? false);
      if (data.research_results) setResearchResults(data.research_results);

      // Update local request title/type if extracted
      if (data.title || data.request_type) {
        setRequests((prev) =>
          prev.map((r) =>
            r.id === selectedId
              ? {
                  ...r,
                  title: data.title ?? r.title,
                  request_type: data.request_type ?? r.request_type,
                }
              : r
          )
        );
      }
    } catch {
      setChatMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Something went wrong. Please try again." },
      ]);
    } finally {
      setSending(false);
    }
  }

  // ── Submit request ────────────────────────────────────────────────────────────

  async function handleSubmit() {
    if (!selectedId || !companyId || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`${API}/requests/${companyId}/${selectedId}/submit`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("Submit failed");
      const updated: PurchaseRequest = await res.json();
      setRequests((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
      setReadyToSubmit(false);
    } catch {
      setError("Failed to submit. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  // ── Cancel request ────────────────────────────────────────────────────────────

  async function handleCancel() {
    if (!selectedId || !companyId || cancelling) return;
    setCancelling(true);
    try {
      const res = await fetch(`${API}/requests/${companyId}/${selectedId}/cancel`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("Cancel failed");
      const updated: PurchaseRequest = await res.json();
      setRequests((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
    } catch {
      setError("Failed to cancel. Please try again.");
    } finally {
      setCancelling(false);
    }
  }

  // ── Delete request ────────────────────────────────────────────────────────────

  async function handleDelete() {
    if (!selectedId || !companyId || deleting || !canDelete) return;
    setDeleting(true);
    try {
      const res = await fetch(`${API}/requests/${companyId}/${selectedId}`, {
        method: "DELETE",
      });
      if (!res.ok && res.status !== 204) throw new Error("Delete failed");
      setRequests((prev) => prev.filter((r) => r.id !== selectedId));
      setSelectedId(null);
      setChatMessages([]);
    } catch {
      setError("Failed to delete. Please try again.");
    } finally {
      setDeleting(false);
    }
  }

  // ── Debounced manual field edits ─────────────────────────────────────────────

  const patchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleDataChange = useCallback(
    (updatedDetails: Parameters<typeof PurchaseRequisitionForm>[0]["data"]) => {
      if (!selectedId || !companyId) return;
      // Update local state immediately for responsive UI
      setRequests((prev) =>
        prev.map((r) => r.id === selectedId ? { ...r, details: updatedDetails as Record<string, unknown> } : r)
      );
      // Debounce PATCH call
      if (patchTimer.current) clearTimeout(patchTimer.current);
      patchTimer.current = setTimeout(async () => {
        try {
          await fetch(`${API}/requests/${companyId}/${selectedId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ details: updatedDetails }),
          });
        } catch {
          // silent — local state already reflects the change
        }
      }, 800);
    },
    [selectedId, companyId]
  );

  const logoUrl = (effectiveConfig?.company_setup as Record<string, unknown> | undefined)?.logo_url as string | null | undefined;
  const reqNo   = selected ? (selected.request_no ?? `PR-${String(selected.id).padStart(5, "0")}`) : "";

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full overflow-hidden">
      {/* ── Left: request list ─────────────────────────────────────────────── */}
      <div className="flex w-[220px] shrink-0 flex-col overflow-hidden border-r border-white/[0.06] bg-zinc-950">
        {/* List header */}
        <div className="flex h-9 shrink-0 items-center justify-between border-b border-white/[0.06] px-3">
          <span className="text-[10px] font-bold uppercase tracking-widest text-white/40">
            My Requests
          </span>
          <button
            type="button"
            title="New request"
            onClick={handleNew}
            disabled={creatingNew}
            className="flex h-5 w-5 items-center justify-center rounded text-white/30 transition-colors hover:bg-white/[0.07] hover:text-white/60 disabled:opacity-40"
          >
            {creatingNew ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
          </button>
        </div>

        {error && (
          <div className="mx-2 mt-2 flex items-start gap-1.5 rounded border border-red-500/20 bg-red-900/[0.07] px-2 py-1.5">
            <AlertCircle className="mt-0.5 h-3 w-3 shrink-0 text-red-400/60" />
            <span className="text-[9px] text-red-300/50">{error}</span>
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto py-1">
          {loading ? (
            <div className="flex h-full items-center justify-center">
              <Loader2 className="h-4 w-4 animate-spin text-white/20" />
            </div>
          ) : requests.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 px-4 py-8 text-center">
              <Briefcase className="h-5 w-5 text-white/12" />
              <p className="text-[10px] text-white/22">No requests yet</p>
              <button
                type="button"
                onClick={handleNew}
                className="text-[10px] font-medium text-indigo-400/60 hover:text-indigo-300/80"
              >
                + Create your first request
              </button>
            </div>
          ) : (
            <div className="space-y-px px-1.5">
              {requests.map((r) => (
                <RequestRow
                  key={r.id}
                  req={r}
                  active={r.id === selectedId}
                  onClick={() => selectRequest(r)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Right area ────────────────────────────────────────────────────── */}
      {!selected ? (
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-zinc-950">
          <EmptyRight onNew={handleNew} />
        </div>
      ) : isDraft ? (
        /* Draft: split — chat left, form preview right */
        <div className="flex min-w-0 flex-1 overflow-hidden">
          {/* Chat panel — fixed width */}
          <div className="flex w-[340px] shrink-0 flex-col overflow-hidden border-r border-white/[0.06] bg-zinc-950">
            {/* Chat header with delete */}
            <div className="flex h-9 shrink-0 items-center justify-between border-b border-white/[0.06] px-3">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-semibold text-white/50">AI Assistant</span>
              </div>
              <div className="flex items-center gap-1">
                {/* Manual submit always visible */}
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={submitting}
                  title="Submit request"
                  className="flex items-center gap-1 rounded bg-emerald-600/60 px-2 py-1 text-[9px] font-semibold text-white/80 transition-colors hover:bg-emerald-600/80 disabled:opacity-40"
                >
                  {submitting ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <Send className="h-2.5 w-2.5" />}
                  Submit
                </button>
                {canDelete && (
                  <button
                    type="button"
                    onClick={handleDelete}
                    disabled={deleting}
                    title="Delete request"
                    className="flex h-6 w-6 items-center justify-center rounded text-white/22 transition-colors hover:bg-red-900/20 hover:text-red-400/60 disabled:opacity-40"
                  >
                    {deleting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                  </button>
                )}
              </div>
            </div>
            {/* Chat body fills remaining space */}
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <ChatPanel
                req={selected}
                messages={chatMessages}
                onNewMessage={handleSendMessage}
                sending={sending}
                readyToSubmit={readyToSubmit}
                onSubmit={handleSubmit}
                submitting={submitting}
                researchResults={researchResults}
                companyId={companyId ?? ""}
                userId={userIdStr ?? ""}
              />
            </div>
          </div>

          {/* Form preview — fills rest */}
          <div className="min-w-0 flex-1 overflow-hidden">
            <PurchaseRequisitionForm
              requestId={selected.id}
              requestNo={reqNo}
              requestDate={selected.created_at}
              requesterName={displayName ?? selected.requester_name ?? "—"}
              companyId={companyId ?? ""}
              data={(selected.details ?? {}) as Parameters<typeof PurchaseRequisitionForm>[0]["data"]}
              attachments={attachments}
              logoUrl={logoUrl}
              status={selected.status}
              editable={true}
              onDataChange={handleDataChange}
            />
          </div>
        </div>
      ) : (
        /* Submitted / non-draft: form document + actions */
        <div className="flex min-w-0 flex-1 overflow-hidden">
          {/* Action sidebar */}
          <div className="flex w-[220px] shrink-0 flex-col overflow-y-auto border-r border-white/[0.06] bg-zinc-950 px-3 py-3">
            {/* Status */}
            <div className="mb-3">
              <p className="mb-1 text-[8px] font-bold uppercase tracking-widest text-white/25">Status</p>
              <StatusBadge status={selected.status} />
            </div>

            {/* Requester */}
            <div className="mb-3">
              <p className="mb-1 text-[8px] font-bold uppercase tracking-widest text-white/25">Submitted by</p>
              <p className="text-[10px] text-white/55">{selected.requester_name ?? "—"}</p>
              {selected.submitted_at && (
                <p className="text-[9px] text-white/28">{fmtDate(selected.submitted_at)}</p>
              )}
            </div>

            {/* Status messages */}
            {selected.status === "approved" && (
              <div className="mb-3 rounded border border-emerald-500/20 bg-emerald-900/[0.07] px-2 py-1.5">
                <p className="flex items-center gap-1 text-[9px] font-medium text-emerald-300/70">
                  <CheckCircle2 className="h-3 w-3" /> Approved
                </p>
                {selected.reviewer_notes && (
                  <p className="mt-0.5 text-[9px] text-emerald-300/50">{selected.reviewer_notes}</p>
                )}
              </div>
            )}
            {selected.status === "rejected" && (
              <div className="mb-3 rounded border border-red-500/20 bg-red-900/[0.07] px-2 py-1.5">
                <p className="flex items-center gap-1 text-[9px] font-medium text-red-300/70">
                  <XCircle className="h-3 w-3" /> Rejected
                </p>
                {selected.rejection_reason && (
                  <p className="mt-0.5 text-[9px] text-red-300/50">{selected.rejection_reason}</p>
                )}
              </div>
            )}
            {selected.status === "submitted" && (
              <div className="mb-3 rounded border border-blue-500/20 bg-blue-900/[0.07] px-2 py-1.5">
                <p className="flex items-center gap-1 text-[9px] font-medium text-blue-300/70">
                  <Clock className="h-3 w-3" />
                  {selected.viewed_at ? "Under Review" : "Awaiting Review"}
                </p>
              </div>
            )}
            {selected.status === "fulfilled" && (
              <div className="mb-3 rounded border border-purple-500/20 bg-purple-900/[0.07] px-2 py-1.5">
                <p className="flex items-center gap-1 text-[9px] font-medium text-purple-300/70">
                  <CheckCircle2 className="h-3 w-3" /> Fulfilled
                </p>
              </div>
            )}

            <div className="mt-auto flex flex-col gap-1.5 pt-3">
              {canDelete && (
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={deleting}
                  className="flex items-center gap-1.5 rounded px-2 py-1.5 text-[10px] font-medium text-white/28 transition-colors hover:bg-red-900/[0.12] hover:text-red-300/60 disabled:opacity-40"
                >
                  {deleting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                  Delete Request
                </button>
              )}
              {!["fulfilled", "cancelled", "rejected"].includes(selected.status) && (
                <button
                  type="button"
                  onClick={handleCancel}
                  disabled={cancelling}
                  className="flex items-center gap-1.5 rounded px-2 py-1.5 text-[10px] font-medium text-white/28 transition-colors hover:bg-red-900/[0.10] hover:text-red-300/60 disabled:opacity-40"
                >
                  {cancelling ? <Loader2 className="h-3 w-3 animate-spin" /> : <XCircle className="h-3 w-3" />}
                  Cancel Request
                </button>
              )}
            </div>
          </div>

          {/* Form document */}
          <div className="min-w-0 flex-1 overflow-hidden">
            <PurchaseRequisitionForm
              requestId={selected.id}
              requestNo={reqNo}
              requestDate={selected.created_at}
              requesterName={selected.requester_name ?? displayName ?? "—"}
              companyId={companyId ?? ""}
              data={(selected.details ?? {}) as Parameters<typeof PurchaseRequisitionForm>[0]["data"]}
              attachments={attachments}
              logoUrl={logoUrl}
              status={selected.status}
              editable={false}
            />
          </div>
        </div>
      )}
    </div>
  );
}
