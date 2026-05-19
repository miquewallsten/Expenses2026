"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import {
  ChevronRight, ChevronLeft, CheckCircle2, Loader2, Sparkles,
  Settings, BookOpen, Layers, Building2, Users,
} from "lucide-react";
import { apiCall, apiPatch, apiPost } from "@/lib/api/client";

interface Props {
  companyId: number;
  onComplete?: () => void;
}

type Step = "review-mode" | "chart-of-accounts" | "dimensions" | "categories" | "finalize";

const STEPS: { key: Step; icon: any; labelKey: string }[] = [
  { key: "review-mode", icon: Settings, labelKey: "stepReviewMode" },
  { key: "chart-of-accounts", icon: BookOpen, labelKey: "stepCoa" },
  { key: "dimensions", icon: Layers, labelKey: "stepDimensions" },
  { key: "categories", icon: Building2, labelKey: "stepCategories" },
  { key: "finalize", icon: CheckCircle2, labelKey: "stepFinalize" },
];

export default function AdminSetupWizard({ companyId, onComplete }: Props) {
  const t = useTranslations("admin.accountingWizard");
  const [currentStep, setCurrentStep] = useState<Step>("review-mode");
  const [loading, setLoading] = useState(false);
  const [accountingSetup, setAccountingSetup] = useState<any>(null);
  const [saving, setSaving] = useState(false);

  // Review mode state
  const [reviewMode, setReviewMode] = useState("all");
  const [polizaRequired, setPolizaRequired] = useState(true);
  const [aiAssist, setAiAssist] = useState(true);

  const stepIndex = STEPS.findIndex((s) => s.key === currentStep);

  useEffect(() => {
    apiCall(`/admin/accounting-setup/${companyId}`).then(setAccountingSetup).catch(() => {});
  }, [companyId]);

  useEffect(() => {
    if (accountingSetup) {
      setReviewMode(accountingSetup.accounting_review_mode || "all");
      setPolizaRequired(accountingSetup.poliza_required ?? true);
      setAiAssist(accountingSetup.ai_accounting_assist_enabled ?? true);
    }
  }, [accountingSetup]);

  const saveSetup = async () => {
    setSaving(true);
    try {
      const result = await apiPatch(`/admin/accounting-setup/${companyId}`, {
        accounting_review_mode: reviewMode,
        poliza_required: polizaRequired,
        ai_accounting_assist_enabled: aiAssist,
      });
      setAccountingSetup(result);
    } catch (e: any) {
      console.error("save failed", e);
    } finally {
      setSaving(false);
    }
  };

  const applyPreset = async () => {
    setLoading(true);
    try {
      await apiPost(`/admin/coa/${companyId}/apply-preset`, { preset: "plan_basico" });
    } catch (e: any) {
      console.error("preset failed", e);
    } finally {
      setLoading(false);
    }
  };

  const next = () => {
    const i = stepIndex + 1;
    if (i < STEPS.length) setCurrentStep(STEPS[i].key);
    else onComplete?.();
  };

  const prev = () => {
    const i = stepIndex - 1;
    if (i >= 0) setCurrentStep(STEPS[i].key);
  };

  const Toggle = ({ value, onChange, label }: { value: boolean; onChange: (v: boolean) => void; label: string }) => (
    <div className="flex items-center justify-between py-2">
      <span className="text-[11px] text-secondary">{label}</span>
      <button
        type="button"
        onClick={() => onChange(!value)}
        className={`relative h-5 w-9 rounded-full transition-colors ${value ? "bg-accent" : "bg-surface-1 border border-default"}`}
      >
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${value ? "left-[18px]" : "left-0.5"}`} />
      </button>
    </div>
  );

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-secondary">{t("title")}</h2>
        <p className="mt-0.5 text-[11px] text-muted">{t("subtitle")}</p>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-1">
        {STEPS.map((s, i) => {
          const Icon = s.icon;
          const active = i === stepIndex;
          const done = i < stepIndex;
          return (
            <button
              key={s.key}
              type="button"
              onClick={() => setCurrentStep(s.key)}
              className={`flex items-center gap-1 rounded px-2 py-1 text-[9px] font-medium transition-colors ${
                active ? "bg-accent-muted text-accent" : done ? "text-emerald-400" : "text-muted"
              }`}
            >
              <Icon className="h-3 w-3" />
              {t(s.labelKey)}
            </button>
          );
        })}
      </div>

      {/* Step content */}
      <div className="rounded-lg border border-default bg-surface-1 p-4">
        {currentStep === "review-mode" && (
          <div className="space-y-3">
            <h3 className="text-[11px] font-semibold text-secondary">{t("reviewModeTitle")}</h3>
            <div className="space-y-1">
              {[
                { value: "all", label: t("modeAll"), desc: t("modeAllDesc") },
                { value: "exceptions_only", label: t("modeExceptionsOnly"), desc: t("modeExceptionsOnlyDesc") },
                { value: "none", label: t("modeNone"), desc: t("modeNoneDesc") },
              ].map((opt) => (
                <label key={opt.value} className={`flex items-start gap-2 rounded border p-2 cursor-pointer transition-colors ${reviewMode === opt.value ? "border-accent/40 bg-accent-muted/20" : "border-default hover:border-default"}`}>
                  <input
                    type="radio"
                    name="reviewMode"
                    value={opt.value}
                    checked={reviewMode === opt.value}
                    onChange={() => setReviewMode(opt.value)}
                    className="mt-0.5"
                  />
                  <div>
                    <p className="text-[11px] font-medium text-secondary">{opt.label}</p>
                    <p className="text-[9px] text-muted">{opt.desc}</p>
                  </div>
                </label>
              ))}
            </div>
            <Toggle value={polizaRequired} onChange={setPolizaRequired} label={t("polizaRequired")} />
            <Toggle value={aiAssist} onChange={setAiAssist} label={t("aiAssist")} />
          </div>
        )}

        {currentStep === "chart-of-accounts" && (
          <div className="space-y-3">
            <h3 className="text-[11px] font-semibold text-secondary">{t("coaTitle")}</h3>
            <p className="text-[10px] text-muted">{t("coaDesc")}</p>
            <button
              type="button"
              onClick={applyPreset}
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded border bg-accent-muted px-3 py-1 text-[10px] font-semibold text-accent disabled:opacity-40"
            >
              {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
              {t("applyPreset")}
            </button>
            <p className="text-[9px] text-muted">{t("coaHint")}</p>
          </div>
        )}

        {currentStep === "dimensions" && (
          <div className="space-y-3">
            <h3 className="text-[11px] font-semibold text-secondary">{t("dimensionsTitle")}</h3>
            <p className="text-[10px] text-muted">{t("dimensionsDesc")}</p>
            <p className="text-[9px] text-muted">{t("dimensionsHint")}</p>
          </div>
        )}

        {currentStep === "categories" && (
          <div className="space-y-3">
            <h3 className="text-[11px] font-semibold text-secondary">{t("categoriesTitle")}</h3>
            <p className="text-[10px] text-muted">{t("categoriesDesc")}</p>
            <p className="text-[9px] text-muted">{t("categoriesHint")}</p>
          </div>
        )}

        {currentStep === "finalize" && (
          <div className="space-y-3">
            <h3 className="text-[11px] font-semibold text-secondary">{t("finalizeTitle")}</h3>
            <p className="text-[10px] text-muted">{t("finalizeDesc")}</p>
            <button
              type="button"
              onClick={async () => { await saveSetup(); onComplete?.(); }}
              disabled={saving}
              className="inline-flex items-center gap-1.5 rounded border border-emerald-500/20 bg-emerald-950/20 px-4 py-1.5 text-[10px] font-semibold text-emerald-400 disabled:opacity-40"
            >
              {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
              {t("completeSetup")}
            </button>
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={prev}
          disabled={stepIndex === 0}
          className="inline-flex items-center gap-1 rounded border border-default px-3 py-1 text-[10px] text-tertiary hover:text-secondary disabled:opacity-40"
        >
          <ChevronLeft className="h-3 w-3" /> {t("back")}
        </button>
        {currentStep !== "finalize" && (
          <button
            type="button"
            onClick={() => { saveSetup(); next(); }}
            className="inline-flex items-center gap-1 rounded border bg-accent-muted px-3 py-1 text-[10px] font-semibold text-accent"
          >
            {t("next")} <ChevronRight className="h-3 w-3" />
          </button>
        )}
      </div>
    </div>
  );
}
