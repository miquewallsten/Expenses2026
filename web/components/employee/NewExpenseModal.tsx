"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { X, Paperclip, AlertTriangle } from "lucide-react";
import { useTranslations } from "next-intl";
import { getAuthHeaders, getStoredSession } from "@/lib/session";

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
  const [dupes, setDupes] = useState<{
    matches: { expense_id: number; confidence: string; reasons: string[] }[];
    blocking: boolean;
  } | null>(null);
  const [dupeOverride, setDupeOverride] = useState(false);
  const descRef = useRef<HTMLInputElement>(null);
  const t = useTranslations("employee.newExpenseModal");
  const tc = useTranslations("common");

  useEffect(() => {
    if (open) {
      setForm(EMPTY);
      setError(null);
      setDupes(null);
      setDupeOverride(false);
      setTimeout(() => descRef.current?.focus(), 50);
    }
  }, [open]);

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
      setDupes(null);
      setDupeOverride(false);
    };
  }

  // Debounced duplicate check (Phase 5.3).
  useEffect(() => {
    if (!open) return;
    const desc = form.description.trim();
    const amt = parseFloat(form.amount);
    if (!desc || !amt || isNaN(amt) || amt <= 0) {
      setDupes(null);
      return;
    }
    let cancelled = false;
    const id = window.setTimeout(async () => {
      try {
        const r = await fetch(`${API}/expenses/duplicates/check`, {
          method: "POST",
          headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
          body: JSON.stringify({ amount: amt, description: desc }),
        });
        if (!r.ok) return;
        const data = (await r.json()) as {
          matches: { expense_id: number; confidence: string; reasons: string[] }[];
          blocking: boolean;
        };
        if (cancelled) return;
        setDupes(data.matches.length > 0 ? data : null);
      } catch {
        // swallow — duplicate check is non-critical
      }
    }, 450);
    return () => {
      cancelled = true;
      window.clearTimeout(id);
    };
  }, [form.description, form.amount, open]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const parsed = parseFloat(form.amount);
    if (!form.description.trim()) {
      setError(t("errorRequired"));
      return;
    }
    if (isNaN(parsed) || parsed <= 0) {
      setError(t("errorAmount"));
      return;
    }
    if (dupes?.blocking && !dupeOverride) {
      setError(t("errorDuplicateBlock"));
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const res = await fetch(`${API}/expenses/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders(),
        },
        body: JSON.stringify({
          company_id: getStoredSession()?.companyId,
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
      setError(err instanceof Error ? err.message : t("errorSave"));
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="animate-fade-in fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
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
          className="animate-scale-in relative w-full max-w-lg overflow-hidden rounded-xl border border-white/[0.09] bg-zinc-900 shadow-[0_32px_80px_rgba(0,0,0,0.7)] ring-1 ring-inset ring-white/[0.04]"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Top accent line */}
          <div className="h-px w-full bg-gradient-to-r from-transparent via-indigo-500/40 to-transparent" />

          {/* Header */}
          <div className="flex items-center justify-between border-b border-white/[0.07] px-5 py-3.5">
            <div>
              <h2
                id="new-expense-title"
                className="text-sm font-semibold text-white"
              >
                {t("title")}
              </h2>
              <p className="mt-0.5 text-[10px] text-white/40">
                {t("subtitle")}
              </p>
            </div>
            <button
              onClick={onClose}
              className="ml-4 shrink-0 rounded-md p-1.5 text-white/35 transition-colors hover:bg-white/[0.07] hover:text-white/65"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} noValidate>
            <div className="space-y-0 divide-y divide-white/[0.05] px-5 py-4">

              <FieldRow label={t("fieldDescription")} required>
                <input
                  ref={descRef}
                  type="text"
                  value={form.description}
                  onChange={set("description")}
                  placeholder={t("descriptionPlaceholder")}
                  className={inputCls}
                />
              </FieldRow>

              <FieldRow label={t("fieldAmount")} required>
                <div className="relative">
                  <span className="pointer-events-none absolute inset-y-0 left-2.5 flex items-center text-xs text-white/35">
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

              {/* Project / Client / Cost Center */}
              <div className="grid grid-cols-3 gap-3 py-3">
                <div>
                  <label className={labelCls}>{t("fieldProject")}</label>
                  <input
                    type="text"
                    value={form.project}
                    onChange={set("project")}
                    placeholder={t("optional")}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>{t("fieldClient")}</label>
                  <input
                    type="text"
                    value={form.client}
                    onChange={set("client")}
                    placeholder={t("optional")}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>{t("fieldCostCenter")}</label>
                  <input
                    type="text"
                    value={form.cost_center}
                    onChange={set("cost_center")}
                    placeholder={t("optional")}
                    className={inputCls}
                  />
                </div>
              </div>

              <FieldRow label={t("fieldNotes")}>
                <textarea
                  value={form.notes}
                  onChange={set("notes")}
                  rows={2}
                  placeholder={t("notesPlaceholder")}
                  className={`${inputCls} resize-none`}
                />
              </FieldRow>

              {/* Attachment */}
              <div className="py-3">
                <p className={labelCls}>{t("fieldAttachment")}</p>
                <div className="mt-1 flex items-center gap-2">
                  <button
                    type="button"
                    className="flex items-center gap-1.5 rounded-md border border-white/[0.1] bg-white/[0.04] px-3 py-1.5 text-[11px] font-medium text-white/50 transition-colors hover:border-white/[0.18] hover:bg-white/[0.08] hover:text-white/75"
                  >
                    <Paperclip className="h-3.5 w-3.5" />
                    {t("uploadFile")}
                  </button>
                  <p className="text-[10px] text-white/25">
                    {t("uploadHint")}
                  </p>
                </div>
              </div>
            </div>

            {/* Duplicate warning (Phase 5.3) */}
            {dupes && dupes.matches.length > 0 && (
              <div
                className={`mx-5 mb-3 rounded-lg border px-3 py-2 text-[11px] ${
                  dupes.blocking
                    ? "border-red-500/25 bg-red-500/[0.07] text-red-200/85"
                    : "border-amber-500/25 bg-amber-500/[0.07] text-amber-200/85"
                }`}
              >
                <div className="flex items-start gap-1.5">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">
                      {dupes.blocking
                        ? t("duplicateBlockingTitle")
                        : t("duplicateWarningTitle", { count: dupes.matches.length })}
                    </p>
                    <ul className="mt-1 space-y-0.5">
                      {dupes.matches.slice(0, 3).map((m) => (
                        <li key={m.expense_id} className="font-mono text-[10px] opacity-75">
                          #{m.expense_id} · {m.reasons.join(", ")}
                        </li>
                      ))}
                    </ul>
                    {dupes.blocking && (
                      <label className="mt-1.5 flex cursor-pointer items-center gap-1.5 text-[10px]">
                        <input
                          type="checkbox"
                          checked={dupeOverride}
                          onChange={(e) => setDupeOverride(e.target.checked)}
                          className="h-3 w-3 cursor-pointer accent-red-500"
                        />
                        {t("duplicateOverride")}
                      </label>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="mx-5 mb-3 rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-xs text-red-400/90">
                {error}
              </div>
            )}

            {/* Footer */}
            <div className="flex items-center justify-end gap-2 border-t border-white/[0.07] px-5 py-3">
              {/* Tertiary */}
              <button
                type="button"
                onClick={onClose}
                className="rounded-md px-4 py-1.5 text-xs font-medium text-white/40 transition-colors hover:bg-white/[0.06] hover:text-white/65"
              >
                {tc("cancel")}
              </button>
              {/* Primary */}
              <button
                type="submit"
                disabled={saving}
                className="rounded-md bg-indigo-600 px-4 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-indigo-500 active:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? t("saving") : t("saveExpense")}
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
  "w-full rounded-md border border-white/[0.1] bg-white/[0.04] px-2.5 py-1.5 text-xs text-white placeholder-white/25 outline-none transition-all focus:border-indigo-500/50 focus:bg-indigo-950/20 focus:ring-1 focus:ring-indigo-500/15";

const labelCls =
  "mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-white/40";

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
        {required && <span className="ml-0.5 text-indigo-400/80">*</span>}
      </label>
      {children}
    </div>
  );
}
