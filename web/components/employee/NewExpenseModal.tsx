"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { X, Paperclip } from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_BASE_URL;

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated?: () => void;
}

interface FormState {
  description: string;
  amount: string;
  project: string;
  client: string;
  cost_center: string;
  notes: string;
}

const EMPTY: FormState = {
  description: "",
  amount: "",
  project: "",
  client: "",
  cost_center: "",
  notes: "",
};

export default function NewExpenseModal({ open, onClose, onCreated }: Props) {
  const [form, setForm] = useState<FormState>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const descRef = useRef<HTMLInputElement>(null);

  // Focus first field on open; reset on close
  useEffect(() => {
    if (open) {
      setForm(EMPTY);
      setError(null);
      setTimeout(() => descRef.current?.focus(), 50);
    }
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  function set(field: keyof FormState) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setForm((prev) => ({ ...prev, [field]: e.target.value }));
    };
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const parsed = parseFloat(form.amount);
    if (!form.description.trim()) {
      setError("Description is required.");
      return;
    }
    if (isNaN(parsed) || parsed <= 0) {
      setError("Enter a valid positive amount.");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const res = await fetch(`${API}/expenses/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-User-Id": "1",
        },
        body: JSON.stringify({
          company_id: 1,
          amount: parsed,
          description: form.description.trim(),
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.detail ?? `Server error ${res.status}`);
      }
      onCreated?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save expense.");
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-expense-title"
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
      >
        <div
          className="relative w-full max-w-lg overflow-hidden rounded-xl border border-white/[0.09] bg-zinc-900 shadow-[0_24px_80px_rgba(0,0,0,0.7)] ring-1 ring-inset ring-white/[0.04]"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-white/[0.07] px-5 py-3.5">
            <div>
              <h2
                id="new-expense-title"
                className="text-sm font-semibold text-white"
              >
                New Expense
              </h2>
              <p className="mt-0.5 text-[10px] text-white/35">
                Create a draft expense. Attach a document to extract CFDI data automatically.
              </p>
            </div>
            <button
              onClick={onClose}
              className="ml-4 shrink-0 rounded-md p-1.5 text-white/30 transition-colors hover:bg-white/[0.06] hover:text-white/60"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} noValidate>
            <div className="space-y-0 divide-y divide-white/[0.05] px-5 py-4">

              {/* Description */}
              <FieldRow label="Description" required>
                <input
                  ref={descRef}
                  type="text"
                  value={form.description}
                  onChange={set("description")}
                  placeholder="e.g. Business lunch with Acme Corp"
                  className={inputCls}
                />
              </FieldRow>

              {/* Amount */}
              <FieldRow label="Amount" required>
                <div className="relative">
                  <span className="pointer-events-none absolute inset-y-0 left-2.5 flex items-center text-xs text-white/30">
                    $
                  </span>
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={form.amount}
                    onChange={set("amount")}
                    placeholder="0.00"
                    className={`${inputCls} pl-6`}
                  />
                </div>
              </FieldRow>

              {/* Project / Client / Cost Center — 3-up */}
              <div className="grid grid-cols-3 gap-3 py-3">
                <div>
                  <label className={labelCls}>Project</label>
                  <input
                    type="text"
                    value={form.project}
                    onChange={set("project")}
                    placeholder="Optional"
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>Client</label>
                  <input
                    type="text"
                    value={form.client}
                    onChange={set("client")}
                    placeholder="Optional"
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>Cost Center</label>
                  <input
                    type="text"
                    value={form.cost_center}
                    onChange={set("cost_center")}
                    placeholder="Optional"
                    className={inputCls}
                  />
                </div>
              </div>

              {/* Notes */}
              <FieldRow label="Notes">
                <textarea
                  value={form.notes}
                  onChange={set("notes")}
                  rows={2}
                  placeholder="Any additional context…"
                  className={`${inputCls} resize-none`}
                />
              </FieldRow>

              {/* Attachment */}
              <div className="py-3">
                <p className={labelCls}>Attachment</p>
                <div className="mt-1 flex items-center gap-2">
                  <button
                    type="button"
                    className="flex items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[11px] font-medium text-white/50 transition-colors hover:border-white/20 hover:bg-white/[0.07] hover:text-white/70"
                  >
                    <Paperclip className="h-3.5 w-3.5" />
                    Upload file
                  </button>
                <p className="mt-1 text-[10px] text-white/20">
                  Upload a CFDI XML to auto-fill amount and tax fields.
                </p>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="mx-5 mb-3 rounded-md border border-red-500/25 bg-red-500/10 px-3 py-2 text-xs text-red-400">
                {error}
              </div>
            )}

            {/* Footer */}
            <div className="flex items-center justify-end gap-2 border-t border-white/[0.07] px-5 py-3">
              <button
                type="button"
                onClick={onClose}
                className="rounded-md px-4 py-1.5 text-xs font-medium text-white/40 transition-colors hover:bg-white/[0.05] hover:text-white/60"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="rounded-md bg-indigo-600 px-4 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-indigo-500 active:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? "Saving…" : "Save Expense"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}

// ── Shared micro-styles ──────────────────────────────────────────────────────

const inputCls =
  "w-full rounded-md border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-xs text-white placeholder-white/20 outline-none transition-colors focus:border-indigo-500/50 focus:bg-indigo-950/20";

const labelCls =
  "mb-1 block text-[11px] text-white/40";

function FieldRow({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="py-3">
      <label className={labelCls}>
        {label}
        {required && <span className="ml-0.5 text-indigo-400">*</span>}
      </label>
      {children}
    </div>
  );
}
