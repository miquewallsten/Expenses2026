"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Lock, Globe, Shield, Plus, Trash2, Save, Loader2, Check, AlertCircle } from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_BASE_URL;

interface AuthSettings {
  company_id: number;
  magic_link_enabled: boolean;
  allowed_email_domains: string[];
  sso_enabled: boolean;
  sso_provider: string | null;
  sso_metadata_url: string | null;
  session_timeout_hours: number;
  require_mfa: boolean;
}

interface Props {
  companyId: number;
}

// ── Domain list editor ────────────────────────────────────────────────────────

function DomainListEditor({
  domains,
  onChange,
}: {
  domains: string[];
  onChange: (d: string[]) => void;
}) {
  const t = useTranslations("admin.auth");
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleAdd = () => {
    const raw = input.trim().toLowerCase().replace(/^@/, "");
    if (!raw) return;
    // Basic domain validation: at least one dot, no spaces
    if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(raw)) {
      setError(t("invalidDomain"));
      return;
    }
    if (domains.includes(raw)) {
      setError(t("domainExists"));
      return;
    }
    onChange([...domains, raw]);
    setInput("");
    setError(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") { e.preventDefault(); handleAdd(); }
  };

  return (
    <div>
      <div className="flex gap-2 mb-2">
        <input
          type="text"
          placeholder={t("domainPlaceholder")}
          value={input}
          onChange={(e) => { setInput(e.target.value); setError(null); }}
          onKeyDown={handleKeyDown}
          className="flex-1 rounded border border-white/[0.08] bg-zinc-900 px-2.5 py-1.5 font-mono text-[11px] text-white/70 placeholder:text-white/20 outline-none focus:border-indigo-500/40"
        />
        <button
          type="button"
          onClick={handleAdd}
          className="inline-flex items-center gap-1 rounded border border-white/[0.09] bg-white/[0.04] px-2.5 py-1 text-[10px] text-white/45 transition-colors hover:border-white/20 hover:text-white/70"
        >
          <Plus className="h-3 w-3" />
          {t("add")}
        </button>
      </div>
      {error && (
        <p className="mb-2 flex items-center gap-1 text-[10px] text-red-400/60">
          <AlertCircle className="h-3 w-3" />
          {error}
        </p>
      )}
      {domains.length === 0 ? (
        <p className="text-[10px] text-white/20 italic">{t("noRestrictions")}</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {domains.map((d) => (
            <span
              key={d}
              className="inline-flex items-center gap-1 rounded border border-white/[0.08] bg-white/[0.03] px-2 py-0.5 font-mono text-[10px] text-white/55"
            >
              {d}
              <button
                type="button"
                onClick={() => onChange(domains.filter((x) => x !== d))}
                className="text-white/25 transition-colors hover:text-red-400/70"
              >
                <Trash2 className="h-2.5 w-2.5" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Toggle row ────────────────────────────────────────────────────────────────

function ToggleRow({
  label,
  description,
  value,
  onChange,
  disabled,
  disabledLabel,
}: {
  label: string;
  description?: string;
  value: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  disabledLabel?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-white/[0.04] py-3 last:border-0">
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-medium text-white/70">{label}</p>
        {description && <p className="mt-0.5 text-[10px] text-white/30">{description}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {disabled && disabledLabel && (
          <span className="rounded border border-white/[0.07] bg-white/[0.03] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-white/25">
            {disabledLabel}
          </span>
        )}
        <button
          type="button"
          role="switch"
          aria-checked={value}
          disabled={disabled}
          onClick={() => !disabled && onChange(!value)}
          className={`relative inline-flex h-4 w-7 shrink-0 items-center rounded-full border transition-colors disabled:opacity-30 ${
            value
              ? "border-indigo-500/40 bg-indigo-600/30"
              : "border-white/[0.1] bg-white/[0.05]"
          }`}
        >
          <span
            className={`inline-block h-2.5 w-2.5 rounded-full transition-transform ${
              value ? "translate-x-3 bg-indigo-300/80" : "translate-x-0.5 bg-white/25"
            }`}
          />
        </button>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function AdminAuthSettingsPanel({ companyId }: Props) {
  const t = useTranslations("admin.auth");
  const [settings, setSettings]   = useState<AuthSettings | null>(null);
  const [loading,  setLoading]    = useState(true);
  const [saving,   setSaving]     = useState(false);
  const [saved,    setSaved]      = useState(false);
  const [error,    setError]      = useState<string | null>(null);

  // Local mutable state
  const [magicLinkEnabled,    setMagicLinkEnabled]    = useState(true);
  const [allowedDomains,      setAllowedDomains]      = useState<string[]>([]);
  const [sessionTimeout,      setSessionTimeout]      = useState(24);

  // Demo mode — localStorage only, not persisted to API
  const [demoMode, setDemoMode] = useState(false);
  useEffect(() => {
    setDemoMode(localStorage.getItem("demo_mode_enabled") === "true");
  }, []);
  const handleDemoToggle = (v: boolean) => {
    setDemoMode(v);
    localStorage.setItem("demo_mode_enabled", String(v));
    // Notify other tabs / DevLoginCheat listener
    window.dispatchEvent(new StorageEvent("storage", { key: "demo_mode_enabled", newValue: String(v) }));
  };

  useEffect(() => {
    setLoading(true);
    fetch(`${API}/admin/auth-settings/${companyId}`)
      .then((r) => r.ok ? r.json() : null)
      .catch(() => null)
      .then((d: AuthSettings | null) => {
        if (d) {
          setSettings(d);
          setMagicLinkEnabled(d.magic_link_enabled);
          setAllowedDomains(d.allowed_email_domains ?? []);
          setSessionTimeout(d.session_timeout_hours ?? 24);
        }
        setLoading(false);
      });
  }, [companyId]);

  const handleSave = async () => {
    setSaving(true); setError(null); setSaved(false);
    try {
      const res = await fetch(`${API}/admin/auth-settings/${companyId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          magic_link_enabled: magicLinkEnabled,
          allowed_email_domains: allowedDomains,
          session_timeout_hours: sessionTimeout,
        }),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e: any) {
      setError(e?.message ?? t("saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-8 text-white/20">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-xs">{t("loading")}</span>
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-5">
      <div className="flex items-center gap-2">
        <Lock className="h-4 w-4 text-white/25" />
        <h2 className="text-sm font-semibold text-white">{t("title")}</h2>
      </div>

      {/* ── Magic Link ─────────────────────────────────────────────────────── */}
      <div className="overflow-hidden rounded-lg border border-white/[0.07]">
        <div className="flex items-center gap-2 border-b border-white/[0.06] bg-white/[0.025] px-4 py-2.5">
          <Globe className="h-3.5 w-3.5 text-indigo-400/50" />
          <p className="text-[10px] font-bold uppercase tracking-widest text-white/35">{t("magicLink")}</p>
          <span className="ml-auto rounded border border-emerald-500/20 bg-emerald-500/[0.07] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-emerald-300/60">
            {t("active")}
          </span>
        </div>

        <div className="px-4">
          <ToggleRow
            label={t("enableMagicLink")}
            description={t("enableMagicLinkDesc")}
            value={magicLinkEnabled}
            onChange={setMagicLinkEnabled}
          />

          <div className="py-3">
            <div className="mb-2 flex items-baseline justify-between">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-white/30">
                {t("allowedDomains")}
              </p>
              <p className="text-[9px] text-white/18">{t("allowedDomainsHelp")}</p>
            </div>
            <DomainListEditor domains={allowedDomains} onChange={setAllowedDomains} />
          </div>

          <div className="border-t border-white/[0.04] py-3">
            <div className="flex items-center gap-4">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-white/30">
                  {t("sessionDuration")}
                </p>
                <p className="text-[10px] text-white/25">{t("sessionDurationDesc")}</p>
              </div>
              <div className="ml-auto flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  max={168}
                  value={sessionTimeout}
                  onChange={(e) => setSessionTimeout(Math.max(1, Math.min(168, Number(e.target.value))))}
                  className="w-16 rounded border border-white/[0.08] bg-zinc-900 px-2 py-1 text-center font-mono text-[11px] text-white/70 outline-none focus:border-indigo-500/40"
                />
                <span className="text-[10px] text-white/30">{t("hoursUnit")}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── SSO ────────────────────────────────────────────────────────────── */}
      <div className="overflow-hidden rounded-lg border border-white/[0.07] opacity-60">
        <div className="flex items-center gap-2 border-b border-white/[0.06] bg-white/[0.025] px-4 py-2.5">
          <Shield className="h-3.5 w-3.5 text-white/25" />
          <p className="text-[10px] font-bold uppercase tracking-widest text-white/35">{t("sso")}</p>
          <span className="ml-auto rounded border border-white/[0.07] bg-white/[0.03] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-white/20">
            {t("enterprise")}
          </span>
        </div>
        <div className="px-4">
          <ToggleRow
            label={t("enableSso")}
            description={t("enableSsoDesc")}
            value={false}
            onChange={() => {}}
            disabled
            disabledLabel={t("comingSoon")}
          />
          <div className="py-3 space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-white/30">{t("idpMetadataUrl")}</p>
            <input
              type="text"
              disabled
              placeholder={t("idpMetadataPlaceholder")}
              className="w-full rounded border border-white/[0.06] bg-zinc-900/50 px-2.5 py-1.5 font-mono text-[11px] text-white/25 outline-none"
            />
          </div>
        </div>
      </div>

      {/* ── User Import ─────────────────────────────────────────────────────── */}
      <div className="overflow-hidden rounded-lg border border-white/[0.07] opacity-60">
        <div className="flex items-center gap-2 border-b border-white/[0.06] bg-white/[0.025] px-4 py-2.5">
          <Globe className="h-3.5 w-3.5 text-white/25" />
          <p className="text-[10px] font-bold uppercase tracking-widest text-white/35">{t("bulkImport")}</p>
          <span className="ml-auto rounded border border-white/[0.07] bg-white/[0.03] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-white/20">
            {t("comingSoon")}
          </span>
        </div>
        <div className="px-4 py-3">
          <p className="text-[11px] text-white/30 leading-relaxed">
            {t("bulkImportDesc")}
          </p>
        </div>
      </div>

      {/* ── Demo Mode ───────────────────────────────────────────────────────── */}
      <div className="overflow-hidden rounded-lg border border-amber-500/20">
        <div className="flex items-center gap-2 border-b border-amber-500/15 bg-amber-500/[0.04] px-4 py-2.5">
          <Shield className="h-3.5 w-3.5 text-amber-400/50" />
          <p className="text-[10px] font-bold uppercase tracking-widest text-amber-400/50">{t("demoMode")}</p>
        </div>
        <div className="px-4">
          <ToggleRow
            label={t("enableDemo")}
            description={t("enableDemoDesc")}
            value={demoMode}
            onChange={handleDemoToggle}
          />
        </div>
      </div>

      {/* ── Save ────────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center gap-1.5 rounded border border-white/10 bg-white/[0.05] px-3 py-1.5 text-[10px] font-semibold text-white/60 transition-colors hover:bg-white/[0.09] disabled:opacity-50"
        >
          {saving ? <><Loader2 className="h-3 w-3 animate-spin" /> {t("saving")}</> : <><Save className="h-3 w-3" /> {t("save")}</>}
        </button>
        {saved  && <span className="flex items-center gap-1 text-[10px] text-emerald-400/60"><Check className="h-3 w-3" /> {t("saved")}</span>}
        {error  && <span className="text-[10px] text-red-400/60">{error}</span>}
      </div>
    </div>
  );
}
