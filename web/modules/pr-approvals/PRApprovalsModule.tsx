"use client";

import { useCallback, useEffect, useState } from "react";
import {
  BadgeCheck,
  BedDouble,
  Briefcase,
  CheckCircle2,
  ChevronRight,
  HelpCircle,
  Loader2,
  Monitor,
  Package2,
  Plane,
  XCircle,
} from "lucide-react";
import PurchaseRequisitionForm from "@/modules/my-requests/PurchaseRequisitionForm";
import type { Attachment as FormAttachment } from "@/modules/my-requests/PurchaseRequisitionForm";

const API = process.env.NEXT_PUBLIC_API_BASE_URL;
const COMPANY_ID = 1;

// ── Types ──────────────────────────────────────────────────────────────────────

interface PurchaseRequest {
  id: number;
  request_no: string | null;
  requester_name: string | null;
  request_type: string | null;
  title: string | null;
  status: string;
  priority: string;
  estimated_amount: number | null;
  currency: string | null;
  details: Record<string, unknown> | null;
  submitted_at: string | null;
  reviewed_at: string | null;
  reviewer_notes: string | null;
  rejection_reason: string | null;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const TYPE_ICONS: Record<string, React.ElementType> = {
  travel: Plane,
  hotel: BedDouble,
  equipment: Package2,
  software: Monitor,
  service: Briefcase,
  other: HelpCircle,
};

const STATUS_STYLES: Record<string, string> = {
  submitted:    "bg-sky-500/15 text-sky-300",
  under_review: "bg-amber-500/15 text-amber-300",
  approved:     "bg-emerald-500/15 text-emerald-300",
  rejected:     "bg-red-500/15 text-red-300",
  fulfilled:    "bg-purple-500/15 text-purple-300",
  cancelled:    "bg-zinc-500/15 text-zinc-400",
};

const STATUS_LABELS: Record<string, string> = {
  submitted:    "Submitted",
  under_review: "Under Review",
  approved:     "Approved",
  rejected:     "Rejected",
  fulfilled:    "Fulfilled",
  cancelled:    "Cancelled",
};

const PRIORITY_STYLES: Record<string, string> = {
  low:    "text-zinc-400",
  normal: "text-white/40",
  high:   "text-amber-400",
  urgent: "text-red-400",
};

function fmt(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-MX", { day: "2-digit", month: "short", year: "numeric" });
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function PRApprovalsModule() {
  const [requests, setRequests] = useState<PurchaseRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<PurchaseRequest | null>(null);
  const [attachments, setAttachments] = useState<FormAttachment[]>([]);
  const [actionLoading, setActionLoading] = useState<"approve" | "reject" | null>(null);
  const [notes, setNotes] = useState("");
  const [showRejectBox, setShowRejectBox] = useState(false);
  const [filter, setFilter] = useState<"pending" | "done">("pending");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/requests/${COMPANY_ID}/incoming`);
      if (res.ok) setRequests(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!selected) { setAttachments([]); return; }
    fetch(`${API}/requests/${COMPANY_ID}/${selected.id}/attachments`)
      .then((r) => r.ok ? r.json() : [])
      .then(setAttachments)
      .catch(() => setAttachments([]));
  }, [selected]);

  // Managers see "pending" = submitted/under_review, "done" = approved/rejected
  const visible = requests.filter((r) =>
    filter === "pending"
      ? ["submitted", "under_review"].includes(r.status)
      : ["approved", "rejected", "fulfilled", "cancelled"].includes(r.status),
  );

  async function handleApprove() {
    if (!selected) return;
    setActionLoading("approve");
    try {
      const res = await fetch(`${API}/requests/${COMPANY_ID}/${selected.id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: notes.trim() || null }),
      });
      if (res.ok) {
        const updated = await res.json();
        setRequests((prev) => prev.map((r) => r.id === updated.id ? updated : r));
        setSelected(updated);
        setNotes("");
        setShowRejectBox(false);
      }
    } finally { setActionLoading(null); }
  }

  async function handleReject() {
    if (!selected) return;
    setActionLoading("reject");
    try {
      const res = await fetch(`${API}/requests/${COMPANY_ID}/${selected.id}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: notes }),
      });
      if (res.ok) {
        const updated = await res.json();
        setRequests((prev) => prev.map((r) => r.id === updated.id ? updated : r));
        setSelected(updated);
        setShowRejectBox(false);
        setNotes("");
      }
    } finally { setActionLoading(null); }
  }

  const reqNo = selected ? (selected.request_no ?? `#${selected.id}`) : "";

  return (
    <div className="flex h-full min-h-0 overflow-hidden">
      {/* ── List pane ── */}
      <div className="flex w-64 shrink-0 flex-col border-r border-white/[0.06]">
        {/* Header */}
        <div className="flex items-center gap-2 border-b border-white/[0.06] px-3 py-2.5">
          <BadgeCheck className="h-3.5 w-3.5 text-white/40" />
          <span className="text-[11px] font-semibold text-white/70">Approve PO</span>
        </div>

        {/* Filter tabs */}
        <div className="flex border-b border-white/[0.05]">
          {(["pending", "done"] as const).map((f) => (
            <button
              key={f}
              onClick={() => { setFilter(f); setSelected(null); }}
              className={`flex-1 py-1.5 text-[10px] font-medium transition-colors ${
                filter === f ? "border-b border-sky-400 text-sky-300" : "text-white/35 hover:text-white/55"
              }`}
            >
              {f === "pending" ? "Pendiente" : "Resuelto"}
            </button>
          ))}
        </div>

        {/* Pending count badge */}
        {filter === "pending" && visible.length > 0 && (
          <div className="border-b border-white/[0.04] bg-amber-500/10 px-3 py-1.5">
            <span className="text-[10px] font-medium text-amber-300">{visible.length} pendiente{visible.length !== 1 ? "s" : ""} de aprobación</span>
          </div>
        )}

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex justify-center pt-8"><Loader2 className="h-4 w-4 animate-spin text-white/30" /></div>
          ) : visible.length === 0 ? (
            <p className="px-3 pt-6 text-center text-[10px] text-white/25">
              {filter === "pending" ? "Sin solicitudes pendientes" : "Sin historial"}
            </p>
          ) : visible.map((req) => {
            const Icon = TYPE_ICONS[req.request_type ?? ""] ?? HelpCircle;
            const active = selected?.id === req.id;
            return (
              <button
                key={req.id}
                onClick={() => { setSelected(req); setShowRejectBox(false); setNotes(""); }}
                className={`w-full border-b border-white/[0.04] px-3 py-2.5 text-left transition-colors ${
                  active ? "bg-white/[0.06]" : "hover:bg-white/[0.03]"
                }`}
              >
                <div className="flex items-start justify-between gap-1">
                  <div className="flex min-w-0 items-start gap-1.5">
                    <Icon className="mt-0.5 h-3 w-3 shrink-0 text-white/30" />
                    <div className="min-w-0">
                      <p className="truncate text-[11px] font-medium text-white/80">{req.title ?? "Sin título"}</p>
                      <p className="text-[10px] text-white/35">{req.requester_name ?? "—"}</p>
                    </div>
                  </div>
                  <ChevronRight className="mt-0.5 h-3 w-3 shrink-0 text-white/20" />
                </div>
                <div className="mt-1.5 flex items-center justify-between gap-2">
                  <span className={`rounded px-1.5 py-0.5 text-[9px] font-semibold ${STATUS_STYLES[req.status] ?? ""}`}>
                    {STATUS_LABELS[req.status] ?? req.status}
                  </span>
                  <span className={`text-[10px] font-medium ${PRIORITY_STYLES[req.priority] ?? "text-white/30"}`}>
                    {req.priority}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Detail pane ── */}
      <div className="flex min-w-0 flex-1 flex-col overflow-y-auto">
        {!selected ? (
          <div className="flex h-full items-center justify-center">
            <p className="text-[11px] text-white/20">Selecciona una solicitud</p>
          </div>
        ) : (
          <div className="flex flex-col gap-4 p-4">
            {/* Status bar */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-bold text-white/60">{reqNo}</span>
                <span className={`rounded px-2 py-0.5 text-[10px] font-semibold ${STATUS_STYLES[selected.status] ?? ""}`}>
                  {STATUS_LABELS[selected.status] ?? selected.status}
                </span>
                {selected.estimated_amount != null && (
                  <span className="text-[11px] font-semibold text-white/70">
                    {selected.currency ?? ""} {Number(selected.estimated_amount).toLocaleString("en-MX", { minimumFractionDigits: 2 })}
                  </span>
                )}
              </div>
              <span className="text-[10px] text-white/30">Enviado {fmt(selected.submitted_at)}</span>
            </div>

            {/* Form (read-only) */}
            <PurchaseRequisitionForm
              data={selected as any}
              attachments={attachments}
              requestNo={reqNo}
              editable={false}
            />

            {/* Approve / Reject actions */}
            {["submitted", "under_review"].includes(selected.status) && (
              <div className="flex flex-col gap-2 rounded-lg border border-white/[0.07] bg-white/[0.03] p-3">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-white/25">Decisión</p>

                {/* Notes field (shown always for approve comment) */}
                {!showRejectBox && (
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Comentarios opcionales para la aprobación..."
                    rows={2}
                    className="w-full rounded border border-white/[0.08] bg-white/[0.04] px-2 py-1.5 text-[11px] text-white/70 placeholder:text-white/25 focus:outline-none focus:ring-1 focus:ring-sky-500/40"
                  />
                )}

                <div className="flex gap-2">
                  {!showRejectBox && (
                    <button
                      onClick={handleApprove}
                      disabled={!!actionLoading}
                      className="flex items-center gap-1.5 rounded bg-emerald-600 px-3 py-1.5 text-[11px] font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
                    >
                      {actionLoading === "approve"
                        ? <Loader2 className="h-3 w-3 animate-spin" />
                        : <CheckCircle2 className="h-3 w-3" />}
                      Aprobar
                    </button>
                  )}
                  <button
                    onClick={() => { setShowRejectBox((v) => !v); setNotes(""); }}
                    disabled={!!actionLoading}
                    className="flex items-center gap-1.5 rounded border border-red-500/40 px-3 py-1.5 text-[11px] font-medium text-red-400 hover:bg-red-500/10 disabled:opacity-50"
                  >
                    <XCircle className="h-3 w-3" />
                    {showRejectBox ? "Cancelar" : "Rechazar"}
                  </button>
                </div>

                {showRejectBox && (
                  <div className="flex flex-col gap-2">
                    <textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Motivo del rechazo (requerido)..."
                      rows={2}
                      className="w-full rounded border border-red-500/30 bg-white/[0.04] px-2 py-1.5 text-[11px] text-white/70 placeholder:text-white/25 focus:outline-none focus:ring-1 focus:ring-red-500/50"
                    />
                    <button
                      onClick={handleReject}
                      disabled={!!actionLoading || !notes.trim()}
                      className="self-start rounded bg-red-600/80 px-3 py-1.5 text-[11px] font-medium text-white hover:bg-red-600 disabled:opacity-40"
                    >
                      {actionLoading === "reject" ? <Loader2 className="h-3 w-3 animate-spin" /> : "Confirmar Rechazo"}
                    </button>
                  </div>
                )}
              </div>
            )}

            {selected.status === "approved" && (
              <div className="flex items-center gap-1.5 text-[11px] text-emerald-400">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Aprobado el {fmt(selected.reviewed_at)}
                {selected.reviewer_notes && <span className="text-white/40"> — {selected.reviewer_notes}</span>}
              </div>
            )}
            {selected.status === "rejected" && (
              <div className="flex items-center gap-1.5 text-[11px] text-red-400">
                <XCircle className="h-3.5 w-3.5" />
                Rechazado: {selected.rejection_reason ?? "Sin motivo"}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
