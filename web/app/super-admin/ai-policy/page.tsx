"use client";

export const dynamic = "force-dynamic";

import { useCallback, useEffect, useState } from "react";
import { Shield, Loader2, Check, AlertTriangle } from "lucide-react";
import { useTranslations } from "next-intl";
import { PremiumHeader, SectionPanel, Row, inputClasses, Toggle } from "@/components/admin/shared/AdminPatterns";
import { superAdminApiCall, superAdminPatch } from "@/lib/api/super-admin-client";

interface PolicyShape {
  id: number;
  ai_enabled: boolean;
  allowed_models: string;
  pii_redaction_level: "strict" | "standard" | "off";
  max_tokens_per_call: number;
  monthly_token_budget: number;
  notes?: string | null;
}

const PII_LEVELS = ["strict", "standard", "off"] as const;

export default function AiPolicyPage() {
  const t = useTranslations("superAdmin.aiPolicy");
  const [policy, setPolicy] = useState<PolicyShape | null>(null);
  const [draft, setDraft] = useState<Partial<PolicyShape>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const body = await superAdminApiCall<PolicyShape>("/super-admin/ai-policy");
      setPolicy(body);
      setDraft({});
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const merged: PolicyShape | null = policy
    ? { ...policy, ...draft } as PolicyShape
    : null;
  const dirty = Object.keys(draft).length > 0;

  const onSave = useCallback(async () => {
    if (!dirty) return;
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const body = await superAdminPatch<PolicyShape>("/super-admin/ai-policy", draft);
      setPolicy(body);
      setDraft({});
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }, [dirty, draft]);

  return (
    <div className="mx-auto max-w-3xl px-5 py-5 space-y-5">
      <PremiumHeader
        icon={<Shield className="h-4 w-4" />}
        title={t("pageTitle")}
        section="modules"
        action={
          <div className="flex items-center gap-2">
            {saved && (
              <span className="inline-flex items-center gap-1 rounded border border-success/25 bg-success-muted px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest text-success">
                <Check className="h-2.5 w-2.5" />
                {t("saved")}
              </span>
            )}
            <button
              type="button"
              onClick={onSave}
              disabled={!dirty || saving || loading}
              className="bg-accent text-white py-1.5 px-3 shadow-sm hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40 rounded text-[11px] font-semibold"
            >
              {saving ? <Loader2 className="h-3 w-3 animate-spin inline mr-1" /> : null}
              {t("save")}
            </button>
          </div>
        }
      />

      {error && (
        <div className="flex items-center gap-2 rounded border border-error/20 bg-error/5 px-3 py-2 text-[11px] text-error">
          <AlertTriangle className="h-3 w-3 shrink-0" />
          {error}
        </div>
      )}

      {loading || !merged ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted" />
        </div>
      ) : (
        <SectionPanel title={t("pageTitle")}>
          <div className="space-y-4">
            <Row label={t("aiEnabled")} description={t("aiEnabledHint")}>
              <Toggle
                value={merged.ai_enabled}
                onChange={(v) => setDraft((d) => ({ ...d, ai_enabled: v }))}
              />
            </Row>

            <Row label={t("piiLevel")} description={t("piiLevelHint")}>
              <select
                value={merged.pii_redaction_level}
                onChange={(e) => setDraft((d) => ({
                  ...d,
                  pii_redaction_level: e.target.value as PolicyShape["pii_redaction_level"],
                }))}
                className={inputClasses.select}
              >
                {PII_LEVELS.map((lvl) => (
                  <option key={lvl} value={lvl} className="bg-surface-1">
                    {t(`piiLevels.${lvl}`)}
                  </option>
                ))}
              </select>
            </Row>

            <Row label={t("allowedModels")} description={t("allowedModelsHint")}>
              <input
                type="text"
                value={merged.allowed_models}
                onChange={(e) => setDraft((d) => ({ ...d, allowed_models: e.target.value }))}
                placeholder="*"
                className={inputClasses.mono}
              />
            </Row>

            <Row label={t("maxTokens")} description={t("maxTokensHint")}>
              <input
                type="number"
                min={0}
                value={merged.max_tokens_per_call}
                onChange={(e) => setDraft((d) => ({
                  ...d,
                  max_tokens_per_call: Math.max(0, Number.parseInt(e.target.value, 10) || 0),
                }))}
                className={inputClasses.base}
              />
            </Row>

            <Row label={t("monthlyBudget")} description={t("monthlyBudgetHint")}>
              <input
                type="number"
                min={0}
                value={merged.monthly_token_budget}
                onChange={(e) => setDraft((d) => ({
                  ...d,
                  monthly_token_budget: Math.max(0, Number.parseInt(e.target.value, 10) || 0),
                }))}
                className={inputClasses.base}
              />
            </Row>

            <Row label={t("notes")} description={t("notesHint")}>
              <textarea
                rows={3}
                value={merged.notes ?? ""}
                onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value || null }))}
                className={inputClasses.textarea}
              />
            </Row>
          </div>
        </SectionPanel>
      )}
    </div>
  );
}
