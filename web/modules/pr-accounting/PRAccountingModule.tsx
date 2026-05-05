"use client";

import { useCallback, useEffect, useState } from "react";
import {
  BedDouble,
  Briefcase,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Clock,
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
  fulfilled_at: string | null;
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
  submitted:    "bg-accent-muted text-accent",
  under_review: "bg-amber-500/15 text-warning",
  approved:     "bg-emerald-500/15 text-emerald-300",
  rejected:     "bg-error-muted text-error",
  fulfilled:    "bg-purple-500/15 text-purple-300",
  cancelled:    "bg-surface-2 text-secondary",
};

const STATUS_LABELS: Record<string, string> = {
  submitted:    "Submitted",
  under_review: "Under Review",
  approved:     "Approved",
  rejected:     "Rejected",
  fulfilled:    "Fulfilled",
  cancelled:    "Cancelled",
};

function fmt(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-MX", { day: "2-digit", month: "short", year: "numeric" });
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function PRAccountingModule() {
  const [requests, setRequests] = useState<PurchaseRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<PurchaseRequest | null>(null);
  const [attachments, setAttachments] = useState<FormAttachment[]>([]);
  const [actionLoading, setActionLoading] = useState<"fulfill" | "reject" | null>(null);
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

  const visible = requests.filter((r) =>
    filter === "pending"
      ? ["submitted", "under_review", "approved"].includes(r.status)
      : ["fulfilled", "rejected", "cancelled"].includes(r.status),
  );

  async function handleFulfill() {
    if (!selected) return;
    setActionLoading("fulfill");
    try {
      const res = await fetch(`${API}/requests/${COMPANY_ID}/${selected.id}/fulfill`, { method: "POST" });
      if (res.ok) {
        const updated = await res.json();
        setRequests((prev) => prev.map((r) => r.id === updated.id ? updated : r));
        setSelected(updated);
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
      <div className="flex w-64 shrink-0 flex-col border-r border-subtle">
        {/* Header */}
        <div className="flex items-center gap-2 border-b border-subtle px-3 py-2.5">
          <ClipboardList className="h-3.5 w-3.5 text-tertiary" />
          <span className="text-[11px] font-semibold text-secondary">Requerimientos de Compra</span>
        </div>

        {/* Filter tabs */}
        <div className="flex border-b border-subtle">
          {(["pending", "done"] as const).map((f) => (
            <button
              key={f}
              onClick={() => { setFilter(f); setSelected(null); }}
              className={`flex-1 py-1.5 text-[10px] font-medium transition-colors ${
                filter === f ? "border-b border-sky-400 text-accent" : "text-muted hover:text-tertiary"
              }`}
            >
              {f === "pending" ? "Pendiente" : "Historial"}
            </button>
          ))}
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex justify-center pt-8"><Loader2 className="h-4 w-4 animate-spin text-muted" /></div>
          ) : visible.length === 0 ? (
            <p className="px-3 pt-6 text-center text-[10px] text-muted">Sin requerimientos</p>
          ) : visible.map((req) => {
            const Icon = TYPE_ICONS[req.request_type ?? ""] ?? HelpCircle;
            const active = selected?.id === req.id;
            return (
              <button
                key={req.id}
                onClick={() => { setSelected(req); setShowRejectBox(false); setNotes(""); }}
                className={`w-full border-b border-subtle px-3 py-2.5 text-left transition-colors ${
                  active ? "bg-surface-2" : "hover:bg-surface-1"
                }`}
              >
                <div className="flex items-start justify-between gap-1">
                  <div className="flex min-w-0 items-start gap-1.5">
                    <Icon className="mt-0.5 h-3 w-3 shrink-0 text-muted" />
                    <div className="min-w-0">
                      <p className="truncate text-[11px] font-medium text-secondary">{req.title ?? "Sin título"}</p>
                      <p className="text-[10px] text-muted">{req.requester_name ?? "—"}</p>
                    </div>
                  </div>
                  <ChevronRight className="mt-0.5 h-3 w-3 shrink-0 text-muted" />
                </div>
                <div className="mt-1.5 flex items-center justify-between gap-2">
                  <span className={`rounded px-1.5 py-0.5 text-[9px] font-semibold ${STATUS_STYLES[req.status] ?? ""}`}>
                    {STATUS_LABELS[req.status] ?? req.status}
                  </span>
                  <span className="text-[10px] text-muted">{fmt(req.submitted_at)}</span>
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
            <p className="text-[11px] text-muted">Selecciona un requerimiento</p>
          </div>
        ) : (
          <div className="flex flex-col gap-4 p-4">
            {/* Status bar */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-bold text-secondary">{reqNo}</span>
                <span className={`rounded px-2 py-0.5 text-[10px] font-semibold ${STATUS_STYLES[selected.status] ?? ""}`}>
                  {STATUS_LABELS[selected.status] ?? selected.status}
                </span>
              </div>
              <span className="text-[10px] text-muted">Enviado {fmt(selected.submitted_at)}</span>
            </div>

            {/* Form (read-only) */}
            <PurchaseRequisitionForm
              requestId={selected.id}
              requestNo={reqNo}
              requestDate={selected.submitted_at ?? ""}
              requesterName={selected.requester_name ?? "—"}
              companyId={String(COMPANY_ID)}
              data={(selected.details ?? {}) as Parameters<typeof PurchaseRequisitionForm>[0]["data"]}
              attachments={attachments}
              status={selected.status}
              editable={false}
            />

            {/* Actions */}
            {["submitted", "under_review", "approved"].includes(selected.status) && (
              <div className="flex flex-col gap-2 rounded-lg border border-default bg-surface-1 p-3">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-muted">Acciones</p>
                <div className="flex gap-2">
                  <button
                    onClick={handleFulfill}
                    disabled={!!actionLoading}
                    className="flex items-center gap-1.5 rounded bg-emerald-600 px-3 py-1.5 text-[11px] font-medium text-primary hover:bg-emerald-500 disabled:opacity-50"
                  >
                    {actionLoading === "fulfill"
                      ? <Loader2 className="h-3 w-3 animate-spin" />
                      : <CheckCircle2 className="h-3 w-3" />}
                    Marcar como Cumplido
                  </button>
                  <button
                    onClick={() => setShowRejectBox((v) => !v)}
                    disabled={!!actionLoading}
                    className="flex items-center gap-1.5 rounded border border-error px-3 py-1.5 text-[11px] font-medium text-error hover:bg-red-500/10 disabled:opacity-50"
                  >
                    <XCircle className="h-3 w-3" />
                    Rechazar
                  </button>
                </div>

                {showRejectBox && (
                  <div className="flex flex-col gap-2">
                    <textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Motivo del rechazo..."
                      rows={2}
                      className="w-full rounded border border-default bg-surface-2 px-2 py-1.5 text-[11px] text-secondary placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-red-500/50"
                    />
                    <button
                      onClick={handleReject}
                      disabled={!!actionLoading || !notes.trim()}
                      className="self-start rounded bg-error px-3 py-1.5 text-[11px] font-medium text-primary hover:bg-red-600 disabled:opacity-40"
                    >
                      {actionLoading === "reject" ? <Loader2 className="h-3 w-3 animate-spin" /> : "Confirmar Rechazo"}
                    </button>
                  </div>
                )}

                {selected.reviewer_notes && (
                  <p className="text-[10px] text-tertiary">Notas: {selected.reviewer_notes}</p>
                )}
              </div>
            )}

            {selected.status === "fulfilled" && (
              <div className="flex items-center gap-1.5 text-[11px] text-success">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Cumplido el {fmt(selected.fulfilled_at)}
              </div>
            )}
            {selected.status === "rejected" && selected.rejection_reason && (
              <div className="flex items-center gap-1.5 text-[11px] text-error">
                <XCircle className="h-3.5 w-3.5" />
                Rechazado: {selected.rejection_reason}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
