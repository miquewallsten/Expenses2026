"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  BedDouble,
  Briefcase,
  CheckCircle2,
  ChevronRight,
  Clock,
  ExternalLink,
  FileText,
  HelpCircle,
  Image,
  Link2,
  Loader2,
  Monitor,
  Package2,
  Paperclip,
  Plane,
  XCircle,
} from "lucide-react";
import { UserProvider, useUserContext } from "@/context/UserContext";
import PurchaseRequisitionForm from "@/modules/my-requests/PurchaseRequisitionForm";
import type { Attachment as FormAttachment } from "@/modules/my-requests/PurchaseRequisitionForm";

const API = process.env.NEXT_PUBLIC_API_BASE_URL;

// ── Types ──────────────────────────────────────────────────────────────────────

interface ChatMsg { role: string; content: string }
interface ResearchResult { title: string; text: string; url: string }

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
  company_id: number;
  requester_id: number;
  requester_name: string | null;
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
  reviewer_notes: string | null;
  rejection_reason: string | null;
  submitted_at: string | null;
  viewed_at: string | null;
  reviewed_at: string | null;
  fulfilled_at: string | null;
  created_at: string;
}

// ── Attachment viewer (read-only) ─────────────────────────────────────────────

function fmtBytes(b: number) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

function AttachmentsSection({ requestId, companyId }: { requestId: number; companyId: string }) {
  const tp = useTranslations("purchases");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch(`${API}/requests/${companyId}/${requestId}/attachments`)
      .then((r) => r.json())
      .then((data) => { setAttachments(data); setLoaded(true); })
      .catch(() => setLoaded(true));
  }, [companyId, requestId]);

  if (!loaded || attachments.length === 0) return null;

  return (
    <div>
      <p className="mb-1.5 flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-widest text-white/22">
        <Paperclip className="h-2.5 w-2.5" />
        {tp("attachments", { count: attachments.length })}
      </p>
      <div className="space-y-0.5 rounded-lg border border-white/[0.07] px-2 py-1.5">
        {attachments.map((att) => (
          <div key={att.id} className="group flex items-center gap-2 rounded px-1 py-1 hover:bg-white/[0.03]">
            <span className="shrink-0 text-white/28">
              {att.attachment_type === "url"
                ? <Link2 className="h-3 w-3" />
                : att.mime_type?.startsWith("image/")
                  ? <Image className="h-3 w-3" />
                  : <FileText className="h-3 w-3" />}
            </span>
            <span className="min-w-0 flex-1 truncate text-[10px] text-white/55">
              {att.label ?? att.original_name ?? att.url ?? tp("attachment")}
            </span>
            {att.file_size && (
              <span className="shrink-0 text-[9px] text-white/22">{fmtBytes(att.file_size)}</span>
            )}
            <a
              href={att.attachment_type === "file"
                ? `${API}/requests/${companyId}/attachments/${att.id}/download`
                : (att.url ?? "#")}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 text-white/22 opacity-0 transition-opacity group-hover:opacity-100 hover:text-indigo-300/60"
            >
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Constants ──────────────────────────────────────────────────────────────────

const TYPE_ICONS: Record<string, React.ElementType> = {
  travel: Plane, hotel: BedDouble, equipment: Package2,
  software: Monitor, service: Briefcase, other: HelpCircle,
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function TypeIcon({ type, cls }: { type: string | null; cls?: string }) {
  const Icon = (type && TYPE_ICONS[type]) ? TYPE_ICONS[type] : HelpCircle;
  return <Icon className={cls ?? "h-3.5 w-3.5"} />;
}

function StatusBadge({ status }: { status: string }) {
  const tp = useTranslations("purchases");
  const STATUS_LABELS: Record<string, string> = {
    submitted:    tp("statusSubmitted"),
    under_review: tp("statusUnderReview"),
    approved:     tp("statusApproved"),
    rejected:     tp("statusRejected"),
    fulfilled:    tp("statusFulfilled"),
  };
  const STATUS_CLS: Record<string, string> = {
    submitted:    "text-blue-300/80 bg-blue-500/[0.10]",
    under_review: "text-amber-300/80 bg-amber-500/[0.10]",
    approved:     "text-emerald-300/80 bg-emerald-500/[0.10]",
    rejected:     "text-red-300/80 bg-red-500/[0.10]",
    fulfilled:    "text-purple-300/80 bg-purple-500/[0.10]",
  };
  const label = STATUS_LABELS[status] ?? status;
  const cls   = STATUS_CLS[status]   ?? "text-white/30 bg-white/[0.06]";
  return (
    <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${cls}`}>
      {label}
    </span>
  );
}

// ── Request row ────────────────────────────────────────────────────────────────

function RequestRow({
  req, active, onClick,
}: { req: PurchaseRequest; active: boolean; onClick: () => void }) {
  const tp = useTranslations("purchases");
  const TYPE_LABELS_T: Record<string, string> = {
    travel:    tp("typeTravel"),
    hotel:     tp("typeHotel"),
    equipment: tp("typeEquipment"),
    software:  tp("typeSoftware"),
    service:   tp("typeService"),
    other:     tp("typeOther"),
  };
  const label = req.title ?? (req.request_type ? (TYPE_LABELS_T[req.request_type] ?? req.request_type) : tp("typeOther"));
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group relative flex w-full items-center gap-2.5 rounded px-3 py-2 text-left transition-colors ${
        active ? "bg-indigo-600/[0.18] text-white" : "text-white/50 hover:bg-white/[0.04] hover:text-white/75"
      }`}
    >
      {active && <span className="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-r-full bg-indigo-400/70" />}
      <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded ${
        active ? "bg-indigo-500/20 text-indigo-300" : "bg-white/[0.05] text-white/28"
      }`}>
        <TypeIcon type={req.request_type} cls="h-3 w-3" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="truncate text-[11px] font-medium leading-tight">{label}</p>
        </div>
        <div className="mt-0.5 flex items-center gap-1.5">
          <StatusBadge status={req.status} />
          <span className="text-[9px] text-white/22">
            {req.requester_name ?? `User ${req.requester_id}`}
          </span>
          <span className="text-[9px] text-white/18">·</span>
          <span className="text-[9px] text-white/22">{fmtDate(req.submitted_at)}</span>
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

// ── Detail / action panel ─────────────────────────────────────────────────────

function IncomingDetail({
  req,
  companyId,
  onAction,
  acting,
}: {
  req: PurchaseRequest;
  companyId: string;
  onAction: (action: "approve" | "reject" | "fulfill", notes?: string, reason?: string) => void;
  acting: boolean;
}) {
  const [notesInput, setNotesInput]   = useState("");
  const [rejectInput, setRejectInput] = useState("");
  const tp = useTranslations("purchases");

  const canApprove  = ["submitted", "under_review"].includes(req.status);
  const canReject   = ["submitted", "under_review"].includes(req.status);
  const canFulfill  = req.status === "approved";

  // Suppress unused-import warning for companyId (available for future use)
  void companyId;

  return (
    <div className="flex flex-col gap-3">
      {/* Requester */}
      <div>
        <p className="mb-1 text-[8px] font-bold uppercase tracking-widest text-white/25">{tp("labelSubmittedBy")}</p>
        <p className="text-[10px] font-medium text-white/60">{req.requester_name ?? `User ${req.requester_id}`}</p>
        <p className="text-[9px] text-white/28">{fmtDate(req.submitted_at)}</p>
      </div>

      {/* Status */}
      <div>
        <p className="mb-1 text-[8px] font-bold uppercase tracking-widest text-white/25">{tp("labelStatus")}</p>
        <StatusBadge status={req.status} />
        {req.viewed_at && req.status === "submitted" && (
          <p className="mt-0.5 text-[9px] text-white/28">{tp("labelOpenedDate", { date: fmtDate(req.viewed_at) })}</p>
        )}
      </div>

      {/* Status banners */}
      {req.status === "approved" && (
        <div className="rounded border border-emerald-500/20 bg-emerald-900/[0.08] px-2 py-1.5">
          <p className="flex items-center gap-1 text-[9px] font-medium text-emerald-300/60">
            <CheckCircle2 className="h-3 w-3" /> {tp("labelApproved")}
          </p>
          {req.reviewer_notes && <p className="mt-0.5 text-[9px] text-emerald-300/40">{req.reviewer_notes}</p>}
        </div>
      )}
      {req.status === "fulfilled" && (
        <div className="rounded border border-purple-500/20 bg-purple-900/[0.08] px-2 py-1.5">
          <p className="flex items-center gap-1 text-[9px] font-medium text-purple-300/60">
            <CheckCircle2 className="h-3 w-3" /> {tp("labelFulfilled")}
          </p>
          {req.reviewer_notes && <p className="mt-0.5 text-[9px] text-purple-300/40">{req.reviewer_notes}</p>}
        </div>
      )}
      {req.status === "rejected" && (
        <div className="rounded border border-red-500/20 bg-red-900/[0.08] px-2 py-1.5">
          <p className="flex items-center gap-1 text-[9px] font-medium text-red-300/60">
            <XCircle className="h-3 w-3" /> {tp("labelRejected")}
          </p>
          {req.rejection_reason && <p className="mt-0.5 text-[9px] text-red-300/40">{req.rejection_reason}</p>}
        </div>
      )}

      {/* Priority badge */}
      {req.priority !== "normal" && (
        <div>
          <p className="mb-1 text-[8px] font-bold uppercase tracking-widest text-white/25">{tp("labelPriority")}</p>
          <span className={`rounded px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider ${
            req.priority === "urgent" ? "bg-red-500/[0.12] text-red-300/70"
            : "bg-amber-500/[0.12] text-amber-300/70"
          }`}>
            {req.priority}
          </span>
        </div>
      )}

      {/* Amount */}
      {req.estimated_amount && (
        <div>
          <p className="mb-1 text-[8px] font-bold uppercase tracking-widest text-white/25">{tp("labelAmount")}</p>
          <p className="text-[11px] font-semibold text-white/65">
            {req.currency ?? ""} {Number(req.estimated_amount).toLocaleString()}
          </p>
        </div>
      )}

      {/* Action area */}
      {(canApprove || canReject || canFulfill) && (
        <div className="mt-auto flex flex-col gap-2 border-t border-white/[0.06] pt-3">
          {(canApprove || canFulfill) && (
            <textarea
              value={notesInput}
              onChange={(e) => setNotesInput(e.target.value)}
              rows={2}
              placeholder={canFulfill ? tp("placeholderFulfillmentNotes") : tp("placeholderApprovalNotes")}
              className="w-full resize-none rounded border border-white/[0.07] bg-white/[0.03] px-2 py-1.5 text-[10px] text-white/65 placeholder-white/18 outline-none focus:border-white/[0.12]"
            />
          )}
          {canReject && !canFulfill && (
            <textarea
              value={rejectInput}
              onChange={(e) => setRejectInput(e.target.value)}
              rows={2}
              placeholder={tp("placeholderRejectionReason")}
              className="w-full resize-none rounded border border-white/[0.07] bg-white/[0.03] px-2 py-1.5 text-[10px] text-white/65 placeholder-white/18 outline-none focus:border-white/[0.12]"
            />
          )}
          <div className="flex flex-col gap-1">
            {canApprove && (
              <button
                type="button"
                disabled={acting}
                onClick={() => onAction("approve", notesInput || undefined)}
                className="flex items-center gap-1.5 rounded bg-emerald-600/70 px-2 py-1.5 text-[10px] font-semibold text-white/90 transition-colors hover:bg-emerald-600/90 disabled:opacity-50"
              >
                {acting ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
                {tp("actionApprove")}
              </button>
            )}
            {canFulfill && (
              <button
                type="button"
                disabled={acting}
                onClick={() => onAction("fulfill", notesInput || undefined)}
                className="flex items-center gap-1.5 rounded bg-purple-600/70 px-2 py-1.5 text-[10px] font-semibold text-white/90 transition-colors hover:bg-purple-600/90 disabled:opacity-50"
              >
                {acting ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
                {tp("actionFulfill")}
              </button>
            )}
            {canReject && (
              <button
                type="button"
                disabled={acting}
                onClick={() => onAction("reject", undefined, rejectInput || undefined)}
                className="flex items-center gap-1.5 rounded border border-red-500/20 px-2 py-1.5 text-[10px] font-medium text-red-300/60 transition-colors hover:bg-red-900/[0.12] disabled:opacity-50"
              >
                {acting ? <Loader2 className="h-3 w-3 animate-spin" /> : <XCircle className="h-3 w-3" />}
                {tp("actionReject")}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

function PurchasesInbox() {
  const { companyId } = useUserContext();
  const tp = useTranslations("purchases");
  const [requests, setRequests] = useState<PurchaseRequest[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [attachments, setAttachments] = useState<FormAttachment[]>([]);

  const selected = requests.find((r) => r.id === selectedId) ?? null;

  // Mark viewed + load attachments when reviewer opens a request
  useEffect(() => {
    if (!selectedId || !companyId) { setAttachments([]); return; }
    fetch(`${API}/requests/${companyId}/${selectedId}/view`, { method: "POST" })
      .then((r) => r.ok ? r.json() : null)
      .then((updated: PurchaseRequest | null) => {
        if (updated) setRequests((prev) => prev.map((r) => r.id === updated.id ? updated : r));
      })
      .catch(() => {});
    fetch(`${API}/requests/${companyId}/${selectedId}/attachments`)
      .then((r) => r.ok ? r.json() : [])
      .then(setAttachments)
      .catch(() => setAttachments([]));
  }, [selectedId, companyId]);

  const loadRequests = useCallback(async () => {
    if (!companyId) return;
    try {
      const res = await fetch(`${API}/requests/${companyId}/incoming`);
      if (res.ok) setRequests(await res.json());
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => { loadRequests(); }, [loadRequests]);

  async function handleAction(
    action: "approve" | "reject" | "fulfill",
    notes?: string,
    reason?: string,
  ) {
    if (!selectedId || !companyId || acting) return;
    setActing(true);
    try {
      const body = action === "reject"
        ? { rejection_reason: reason ?? null, notes: null }
        : { notes: notes ?? null };
      const res = await fetch(`${API}/requests/${companyId}/${selectedId}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const updated: PurchaseRequest = await res.json();
        setRequests((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
      }
    } finally {
      setActing(false);
    }
  }

  // Filter tabs
  const [tab, setTab] = useState<"pending" | "done">("pending");
  const pending = requests.filter((r) => ["submitted", "under_review", "approved"].includes(r.status));
  const done    = requests.filter((r) => ["fulfilled", "rejected"].includes(r.status));
  const visible = tab === "pending" ? pending : done;

  return (
    <div className="flex h-[100dvh] overflow-hidden bg-zinc-950 text-white">
      {/* Left: list */}
      <div className="flex w-[280px] shrink-0 flex-col overflow-hidden border-r border-white/[0.06]">
        {/* Header */}
        <div className="flex h-9 shrink-0 items-center border-b border-white/[0.06] px-3">
          <span className="text-[10px] font-bold uppercase tracking-widest text-white/40">
            {tp("pageTitle")}
          </span>
        </div>

        {/* Tabs */}
        <div className="flex shrink-0 border-b border-white/[0.06]">
          {(["pending", "done"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`flex-1 py-1.5 text-[9px] font-bold uppercase tracking-widest transition-colors ${
                tab === t ? "text-white/60 border-b border-indigo-500/50" : "text-white/22 hover:text-white/40"
              }`}
            >
              {t === "pending" ? tp("tabPending", { count: pending.length }) : tp("tabDone", { count: done.length })}
            </button>
          ))}
        </div>

        {/* List */}
        <div className="min-h-0 flex-1 overflow-y-auto py-1">
          {loading ? (
            <div className="flex h-full items-center justify-center">
              <Loader2 className="h-4 w-4 animate-spin text-white/20" />
            </div>
          ) : visible.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 px-4 py-10 text-center">
              <Clock className="h-5 w-5 text-white/12" />
              <p className="text-[10px] text-white/22">
                {tab === "pending" ? tp("emptyPending") : tp("emptyDone")}
              </p>
            </div>
          ) : (
            <div className="space-y-px px-1.5">
              {visible.map((r) => (
                <RequestRow
                  key={r.id}
                  req={r}
                  active={r.id === selectedId}
                  onClick={() => setSelectedId(r.id)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Right: detail */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {!selected ? (
          <div className="flex h-full items-center justify-center">
            <div className="text-center">
              <Briefcase className="mx-auto mb-2 h-6 w-6 text-white/12" />
              <p className="text-[11px] text-white/22">{tp("selectRequest")}</p>
            </div>
          </div>
        ) : (
          <div className="flex min-h-0 h-full overflow-hidden">
            {/* Form document */}
            <div className="min-w-0 flex-1 overflow-hidden">
              <PurchaseRequisitionForm
                requestId={selected.id}
                requestNo={selected.request_no ?? `PR-${String(selected.id).padStart(5, "0")}`}
                requestDate={selected.created_at}
                requesterName={selected.requester_name ?? "—"}
                companyId={String(companyId ?? "")}
                data={(selected.details ?? {}) as Parameters<typeof PurchaseRequisitionForm>[0]["data"]}
                attachments={attachments}
                status={selected.status}
              />
            </div>
            {/* Action sidebar */}
            <div className="flex w-[220px] shrink-0 flex-col overflow-y-auto border-l border-white/[0.06] bg-zinc-950 px-3 py-3">
              <IncomingDetail req={selected} companyId={String(companyId ?? "")} onAction={handleAction} acting={acting} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function PurchasesPage() {
  return (
    <UserProvider>
      <PurchasesInbox />
    </UserProvider>
  );
}
