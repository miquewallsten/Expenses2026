"use client";

export const dynamic = "force-dynamic";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ChevronLeft, Sparkles, Loader2, Check, AlertTriangle } from "lucide-react";
import { getCurrentCompanyId } from "@/lib/session";
import { apiCall, apiPatch } from "@/lib/api/client";

interface PolicyShape {
  company_id: number;
  ai_enabled: boolean;
  allowed_models: string;
  pii_redaction_level: "strict" | "standard" | "off";
  max_tokens_per_call: number;
  monthly_token_budget: number;
  notes?: string | null;
}

const PII_LEVELS = ["strict", "standard", "off"] as const;

export default function AiPolicyPage() {
  const t = useTranslations("copilot.aiPolicy");
  const [companyId] = useState<number | null>(() => {
    const cid = getCurrentCompanyId();
    return cid ? Number(cid) : null;
  });
  const [policy, setPolicy] = useState<PolicyShape | null>(null);
  const [draft, setDraft] = useState<Partial<PolicyShape>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (companyId == null) return;
    setLoading(true);
    setError(null);
    try {
      const body = await apiCall<PolicyShape>(`/admin/ai-policy/${companyId}`);
      setPolicy(body);
      setDraft({});
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => { void load(); }, [load]);

  const merged: PolicyShape | null = policy
    ? { ...policy, ...draft } as PolicyShape
    : null;
  const dirty = Object.keys(draft).length > 0;

  const onSave = useCallback(async () => {
    if (companyId == null || !dirty) return;
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const body = await apiPatch<PolicyShape>(`/admin/ai-policy/${companyId}`, draft);
      setPolicy(body);
      setDraft({});
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }, [companyId, dirty, draft]);

  return (
    <div className="flex h-screen flex-col bg-zinc-950">
      <header className="flex h-11 shrink-0 items-center gap-3 border-b border-white/[0.07] px-5">
        <Link
          href="/admin"
          className="flex items-center gap-1.5 text-[10px] text-white/35 transition-colors hover:text-white/55"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Admin
        </Link>
        <span className="text-white/15">/</span>
        <div className="flex items-center gap-1.5">
          <Sparkles className="h-3.5 w-3.5 text-indigo-400/70" />
          <span className="text-[11px] font-semibold text-white/55">{t("pageTitle")}</span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {saved && (
            <span className="inline-flex items-center gap-1 rounded border border-emerald-500/25 bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest text-emerald-300/80">
              <Check className="h-2.5 w-2.5" />
              {t("saved")}
            </span>
          )}
          <button
            type="button"
            onClick={onSave}
            disabled={!dirty || saving || loading}
            className="inline-flex items-center gap-1.5 rounded-md bg-indigo-600/30 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-widest text-indigo-200 transition-colors hover:bg-indigo-600/50 disabled:cursor-not-allowed disabled:opacity-30"
          >
            {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
            {t("save")}
          </button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-6">
        <div className="mx-auto max-w-2xl space-y-5">
          <p className="text-[11px] leading-relaxed text-white/45">{t("description")}</p>

          {error && (
            <div className="flex items-center gap-2 rounded border border-rose-500/20 bg-rose-500/[0.08] px-3 py-2 text-[11px] text-rose-300/80">
              <AlertTriangle className="h-3 w-3 shrink-0" />
              {error}
            </div>
          )}

          {loading || !merged ? (
            <div className="flex items-center gap-2 text-[11px] text-white/35">
              <Loader2 className="h-3 w-3 animate-spin" />
              {t("loading")}
            </div>
          ) : (
            <div className="space-y-4 rounded-lg border border-white/[0.07] bg-zinc-900 p-5">
              <Field label={t("aiEnabled")} hint={t("aiEnabledHint")}>
                <Toggle
                  checked={merged.ai_enabled}
                  onChange={(v) => setDraft((d) => ({ ...d, ai_enabled: v }))}
                />
              </Field>

              <Field label={t("piiLevel")} hint={t("piiLevelHint")}>
                <select
                  value={merged.pii_redaction_level}
                  onChange={(e) => setDraft((d) => ({
                    ...d,
                    pii_redaction_level: e.target.value as PolicyShape["pii_redaction_level"],
                  }))}
                  className="w-full rounded border border-white/[0.08] bg-white/[0.03] px-2.5 py-1.5 text-[11px] text-white/80 outline-none focus:border-indigo-500/35"
                >
                  {PII_LEVELS.map((lvl) => (
                    <option key={lvl} value={lvl} className="bg-zinc-900">
                      {t(`piiLevels.${lvl}`)}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label={t("allowedModels")} hint={t("allowedModelsHint")}>
                <input
                  type="text"
                  value={merged.allowed_models}
                  onChange={(e) => setDraft((d) => ({ ...d, allowed_models: e.target.value }))}
                  placeholder="*"
                  className="w-full rounded border border-white/[0.08] bg-white/[0.03] px-2.5 py-1.5 font-mono text-[11px] text-white/80 outline-none focus:border-indigo-500/35"
                />
              </Field>

              <Field label={t("maxTokens")} hint={t("maxTokensHint")}>
                <input
                  type="number"
                  min={0}
                  value={merged.max_tokens_per_call}
                  onChange={(e) => setDraft((d) => ({
                    ...d,
                    max_tokens_per_call: Math.max(0, Number.parseInt(e.target.value, 10) || 0),
                  }))}
                  className="w-full rounded border border-white/[0.08] bg-white/[0.03] px-2.5 py-1.5 text-[11px] text-white/80 outline-none focus:border-indigo-500/35"
                />
              </Field>

              <Field label={t("monthlyBudget")} hint={t("monthlyBudgetHint")}>
                <input
                  type="number"
                  min={0}
                  value={merged.monthly_token_budget}
                  onChange={(e) => setDraft((d) => ({
                    ...d,
                    monthly_token_budget: Math.max(0, Number.parseInt(e.target.value, 10) || 0),
                  }))}
                  className="w-full rounded border border-white/[0.08] bg-white/[0.03] px-2.5 py-1.5 text-[11px] text-white/80 outline-none focus:border-indigo-500/35"
                />
              </Field>

              <Field label={t("notes")} hint={t("notesHint")}>
                <textarea
                  rows={3}
                  value={merged.notes ?? ""}
                  onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value || null }))}
                  className="w-full resize-none rounded border border-white/[0.08] bg-white/[0.03] px-2.5 py-1.5 text-[11px] text-white/80 outline-none focus:border-indigo-500/35"
                />
              </Field>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, hint, children }: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <div className="mb-1 text-[9px] font-bold uppercase tracking-widest text-white/45">{label}</div>
      {children}
      {hint && <p className="mt-1 text-[10px] text-white/28">{hint}</p>}
    </label>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={[
        "relative inline-flex h-5 w-9 items-center rounded-full transition-colors",
        checked ? "bg-indigo-600/60" : "bg-white/[0.08]",
      ].join(" ")}
    >
      <span
        className={[
          "inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform",
          checked ? "translate-x-[18px]" : "translate-x-[2px]",
        ].join(" ")}
      />
    </button>
  );
}
