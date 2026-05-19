"use client";

export const dynamic = "force-dynamic";

import { useCallback, useEffect, useState } from "react";
import { Settings2, Loader2, Check, AlertTriangle, TestTube2, MessageSquare } from "lucide-react";
import { useTranslations } from "next-intl";
import { PremiumHeader, SectionPanel, Row, inputClasses, Toggle } from "@/components/admin/shared/AdminPatterns";
import { superAdminApiCall, superAdminPatch, superAdminPost } from "@/lib/api/super-admin-client";

interface PlatformSettings {
  id: number;
  smtp_host: string | null;
  smtp_port: number | null;
  smtp_user: string | null;
  smtp_password: string | null;
  smtp_from_name: string | null;
  smtp_from_email: string | null;
  imap_host: string | null;
  imap_port: number | null;
  imap_user: string | null;
  imap_password: string | null;
  imap_enabled: boolean | null;
  whatsapp_business_id: string | null;
  whatsapp_phone_number_id: string | null;
  whatsapp_access_token: string | null;
  whatsapp_webhook_verify_token: string | null;
  whatsapp_webhook_secret: string | null;
  whatsapp_enabled: boolean | null;
  whatsapp_default_language: string | null;
  whatsapp_instructions: string | null;
}

export default function SuperAdminSettingsPage() {
  const t = useTranslations("superAdmin.settings");
  const [settings, setSettings] = useState<PlatformSettings | null>(null);
  const [draft, setDraft] = useState<Partial<PlatformSettings>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [testing, setTesting] = useState<"smtp" | "imap" | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const body = await superAdminApiCall<PlatformSettings>("/super-admin/platform-settings");
      setSettings(body);
      setDraft({});
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const merged: PlatformSettings | null = settings ? { ...settings, ...draft } as PlatformSettings : null;
  const dirty = Object.keys(draft).length > 0;

  const onSave = useCallback(async () => {
    if (!dirty) return;
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const body = await superAdminPatch<PlatformSettings>("/super-admin/platform-settings", draft);
      setSettings(body);
      setDraft({});
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }, [dirty, draft]);

  const handleTestConnection = async (type: "smtp" | "imap") => {
    setTesting(type);
    setTestResult(null);
    try {
      const result = await superAdminPost<{ ok: boolean; detail?: string }>("/super-admin/platform-settings/test-connection", {
        type,
        config: {
          smtp_host: merged?.smtp_host,
          smtp_port: merged?.smtp_port,
          smtp_user: merged?.smtp_user,
          smtp_password: merged?.smtp_password,
          smtp_from_name: merged?.smtp_from_name,
          smtp_from_email: merged?.smtp_from_email,
          imap_host: merged?.imap_host,
          imap_port: merged?.imap_port,
          imap_user: merged?.imap_user,
          imap_password: merged?.imap_password,
        },
      });
      setTestResult({ ok: result.ok, message: result.detail || (result.ok ? t("connectionOk") : t("connectionFailed")) });
    } catch (e) {
      setTestResult({ ok: false, message: e instanceof Error ? e.message : String(e) });
    } finally {
      setTesting(null);
    }
  };

  if (loading || !merged) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-5 py-5 space-y-5">
      <PremiumHeader
        icon={<Settings2 className="h-4 w-4" />}
        title={t("title")}
        subtitle={t("subtitle")}
        section="settings"
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

      {testResult && (
        <div className={`flex items-center gap-2 rounded border px-3 py-2 text-[11px] ${testResult.ok ? "border-success/20 bg-success/5 text-success" : "border-error/20 bg-error/5 text-error"}`}>
          {testResult.ok ? <Check className="h-3 w-3 shrink-0" /> : <AlertTriangle className="h-3 w-3 shrink-0" />}
          {testResult.message}
        </div>
      )}

      {/* SMTP / Outgoing Email */}
      <SectionPanel title={t("smtpTitle")}>
        <div className="space-y-4">
          <Row label={t("smtpHost")} description={t("smtpHostHint")}>
            <input type="text" value={merged.smtp_host ?? ""} onChange={(e) => setDraft((d) => ({ ...d, smtp_host: e.target.value }))} placeholder="smtp.example.com" className={inputClasses.mono} />
          </Row>
          <Row label={t("smtpPort")} description={t("smtpPortHint")}>
            <input type="number" value={merged.smtp_port ?? 587} onChange={(e) => setDraft((d) => ({ ...d, smtp_port: Number(e.target.value) || 587 }))} className={inputClasses.base} />
          </Row>
          <Row label={t("smtpUser")} description={t("smtpUserHint")}>
            <input type="text" value={merged.smtp_user ?? ""} onChange={(e) => setDraft((d) => ({ ...d, smtp_user: e.target.value }))} placeholder="noreply@example.com" className={inputClasses.base} />
          </Row>
          <Row label={t("smtpPassword")} description={t("smtpPasswordHint")}>
            <input type="password" value={merged.smtp_password ?? ""} onChange={(e) => setDraft((d) => ({ ...d, smtp_password: e.target.value }))} placeholder="••••••••" className={inputClasses.base} />
          </Row>
          <Row label={t("smtpFromName")} description={t("smtpFromNameHint")}>
            <input type="text" value={merged.smtp_from_name ?? ""} onChange={(e) => setDraft((d) => ({ ...d, smtp_from_name: e.target.value }))} placeholder="Financial Ops" className={inputClasses.base} />
          </Row>
          <Row label={t("smtpFromEmail")} description={t("smtpFromEmailHint")}>
            <input type="email" value={merged.smtp_from_email ?? ""} onChange={(e) => setDraft((d) => ({ ...d, smtp_from_email: e.target.value }))} placeholder="noreply@example.com" className={inputClasses.mono} />
          </Row>
          <div className="flex justify-end">
            <button type="button" onClick={() => handleTestConnection("smtp")} disabled={testing === "smtp"} className="flex items-center gap-1.5 rounded border border-default bg-surface-1 px-3 py-1.5 text-[11px] text-secondary hover:bg-surface-2 disabled:opacity-50">
              <TestTube2 className="h-3 w-3" />
              {testing === "smtp" ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
              {t("testSmtp")}
            </button>
          </div>
        </div>
      </SectionPanel>

      {/* IMAP / Incoming Email */}
      <SectionPanel title={t("imapTitle")}>
        <div className="space-y-4">
          <Row label={t("imapEnabled")} description={t("imapEnabledHint")}>
            <Toggle value={merged.imap_enabled ?? false} onChange={(v) => setDraft((d) => ({ ...d, imap_enabled: v }))} />
          </Row>
          <Row label={t("imapHost")} description={t("imapHostHint")}>
            <input type="text" value={merged.imap_host ?? ""} onChange={(e) => setDraft((d) => ({ ...d, imap_host: e.target.value }))} placeholder="imap.example.com" className={inputClasses.mono} disabled={!merged.imap_enabled} />
          </Row>
          <Row label={t("imapPort")} description={t("imapPortHint")}>
            <input type="number" value={merged.imap_port ?? 993} onChange={(e) => setDraft((d) => ({ ...d, imap_port: Number(e.target.value) || 993 }))} className={inputClasses.base} disabled={!merged.imap_enabled} />
          </Row>
          <Row label={t("imapUser")} description={t("imapUserHint")}>
            <input type="text" value={merged.imap_user ?? ""} onChange={(e) => setDraft((d) => ({ ...d, imap_user: e.target.value }))} placeholder="inbox@example.com" className={inputClasses.base} disabled={!merged.imap_enabled} />
          </Row>
          <Row label={t("imapPassword")} description={t("imapPasswordHint")}>
            <input type="password" value={merged.imap_password ?? ""} onChange={(e) => setDraft((d) => ({ ...d, imap_password: e.target.value }))} placeholder="••••••••" className={inputClasses.base} disabled={!merged.imap_enabled} />
          </Row>
          <div className="flex justify-end">
            <button type="button" onClick={() => handleTestConnection("imap")} disabled={testing === "imap" || !merged.imap_enabled} className="flex items-center gap-1.5 rounded border border-default bg-surface-1 px-3 py-1.5 text-[11px] text-secondary hover:bg-surface-2 disabled:opacity-50">
              <TestTube2 className="h-3 w-3" />
              {testing === "imap" ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
              {t("testImap")}
            </button>
          </div>
        </div>
      </SectionPanel>

      {/* WhatsApp Business API */}
      <SectionPanel title={t("whatsappTitle")}>
        <div className="space-y-4">
          <Row label={t("whatsappEnabled")} description={t("whatsappEnabledHint")}>
            <Toggle value={merged.whatsapp_enabled ?? false} onChange={(v) => setDraft((d) => ({ ...d, whatsapp_enabled: v }))} />
          </Row>
          <Row label={t("whatsappBusinessId")} description={t("whatsappBusinessIdHint")}>
            <input type="text" value={merged.whatsapp_business_id ?? ""} onChange={(e) => setDraft((d) => ({ ...d, whatsapp_business_id: e.target.value }))} placeholder="1234567890" className={inputClasses.mono} disabled={!merged.whatsapp_enabled} />
          </Row>
          <Row label={t("whatsappPhoneId")} description={t("whatsappPhoneIdHint")}>
            <input type="text" value={merged.whatsapp_phone_number_id ?? ""} onChange={(e) => setDraft((d) => ({ ...d, whatsapp_phone_number_id: e.target.value }))} placeholder="9876543210" className={inputClasses.mono} disabled={!merged.whatsapp_enabled} />
          </Row>
          <Row label={t("whatsappAccessToken")} description={t("whatsappAccessTokenHint")}>
            <input type="password" value={merged.whatsapp_access_token ?? ""} onChange={(e) => setDraft((d) => ({ ...d, whatsapp_access_token: e.target.value }))} placeholder="EAAx..." className={inputClasses.base} disabled={!merged.whatsapp_enabled} />
          </Row>
          <Row label={t("whatsappVerifyToken")} description={t("whatsappVerifyTokenHint")}>
            <input type="text" value={merged.whatsapp_webhook_verify_token ?? ""} onChange={(e) => setDraft((d) => ({ ...d, whatsapp_webhook_verify_token: e.target.value }))} placeholder="my-verify-token" className={inputClasses.mono} disabled={!merged.whatsapp_enabled} />
          </Row>
          <Row label={t("whatsappWebhookSecret")} description={t("whatsappWebhookSecretHint")}>
            <input type="password" value={merged.whatsapp_webhook_secret ?? ""} onChange={(e) => setDraft((d) => ({ ...d, whatsapp_webhook_secret: e.target.value }))} placeholder="••••••••" className={inputClasses.base} disabled={!merged.whatsapp_enabled} />
          </Row>
          <Row label={t("whatsappLanguage")} description={t("whatsappLanguageHint")}>
            <input type="text" value={merged.whatsapp_default_language ?? "es"} onChange={(e) => setDraft((d) => ({ ...d, whatsapp_default_language: e.target.value }))} placeholder="es" className={inputClasses.base} disabled={!merged.whatsapp_enabled} />
          </Row>
          <Row label={t("whatsappInstructions")} description={t("whatsappInstructionsHint")}>
            <textarea rows={3} value={merged.whatsapp_instructions ?? ""} onChange={(e) => setDraft((d) => ({ ...d, whatsapp_instructions: e.target.value }))} placeholder="Configuration instructions for users..." className={inputClasses.textarea} disabled={!merged.whatsapp_enabled} />
          </Row>
          {!merged.whatsapp_enabled && (
            <div className="rounded border border-default bg-surface-1 px-3 py-2 text-[11px] text-tertiary">
              Enable WhatsApp to configure the Business API connection. You will need a Meta Business account and a registered WhatsApp Business phone number.
            </div>
          )}
        </div>
      </SectionPanel>
    </div>
  );
}
