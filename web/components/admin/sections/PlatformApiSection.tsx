"use client";

/**
 * Phase 4.2 frontend - platform API admin section.
 *
 * Wraps GET/POST/DELETE /admin/platform-api/{cid}/keys and
 * GET/POST/PATCH/DELETE /admin/platform-api/{cid}/webhooks.
 * Two stacked panels: API Keys (issuance + revoke) and Webhook
 * Subscriptions (create + toggle + delete). Plaintext key + webhook
 * secret are shown exactly once on creation.
 */

import {
  PremiumHeader,
  SectionPanel,
  Row,
  Toggle,
  SectionLabel as PatternSectionLabel,
  inputClasses,
  SECTION_ACCENTS,
} from "@/components/admin/shared/AdminPatterns";
import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  KeyRound,
  Plus,
  Loader2,
  RefreshCw,
  Trash2,
  Webhook,
  Power,
  PowerOff,
  Copy,
  Check,
  AlertTriangle,
} from "lucide-react";
import { getCurrentCompanyId } from "@/lib/session";
import { apiCall, apiPost, apiPatch, apiDelete } from "@/lib/api/client";
import { copyToClipboard } from "@/lib/copy";

const API = process.env.NEXT_PUBLIC_API_BASE_URL;

interface ApiKeyRow {
  id: number;
  name: string;
  key_prefix: string;
  scopes: string[];
  created_at: string | null;
  last_used_at: string | null;
  revoked_at: string | null;
}

interface WebhookRow {
  id: number;
  event_type: string;
  target_url: string;
  is_enabled: boolean;
  description: string | null;
  secret_preview: string;
  created_at: string | null;
}

const SCOPE_PRESETS = [
  "expenses:read",
  "expenses:write",
  "masterdata:read",
  "payments:write",
  "*",
] as const;

const EVENT_PRESETS = [
  "*",
  "expense.approved",
  "expense.returned",
  "poliza.ready",
  "cfdi.cancelled",
] as const;

export default function PlatformApiSection() {
  const t = useTranslations("admin.platformApi");
  const [companyId, setCompanyId] = useState<number | null>(null);

  const [keys, setKeys] = useState<ApiKeyRow[]>([]);
  const [keysLoading, setKeysLoading] = useState(true);
  const [hooks, setHooks] = useState<WebhookRow[]>([]);
  const [hooksLoading, setHooksLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [busyId, setBusyId] = useState<string | null>(null);
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [revealedSecret, setRevealedSecret] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Key form
  const [keyName, setKeyName] = useState("");
  const [keyScopes, setKeyScopes] = useState<string[]>(["expenses:read"]);

  // Webhook form
  const [hookEvent, setHookEvent] = useState<string>("expense.approved");
  const [hookUrl, setHookUrl] = useState("");
  const [hookDesc, setHookDesc] = useState("");

  useEffect(() => {
    const cid = getCurrentCompanyId();
    if (cid) setCompanyId(Number(cid));
  }, []);

  const loadKeys = useCallback(async (cid: number) => {
    setKeysLoading(true);
    try {
      const res: any = await apiCall(`/admin/platform-api/${cid}/keys`);
      setKeys(Array.isArray(res) ? res : res?.keys ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setKeysLoading(false);
    }
  }, []);

  const loadHooks = useCallback(async (cid: number) => {
    setHooksLoading(true);
    try {
      const res: any = await apiCall(`/admin/platform-api/${cid}/webhooks`);
      setHooks(Array.isArray(res) ? res : res?.webhooks ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setHooksLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!companyId) return;
    void loadKeys(companyId);
    void loadHooks(companyId);
  }, [companyId, loadKeys, loadHooks]);

  const toggleScope = (s: string) =>
    setKeyScopes((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s],
    );

  const createKey = useCallback(async () => {
    if (!companyId || !keyName.trim() || keyScopes.length === 0) return;
    setBusyId("new-key");
    setError(null);
    try {
      const body: any = await apiPost(`/admin/platform-api/${companyId}/keys`, {
        name: keyName.trim(),
        scopes: keyScopes,
      });
      setKeys((prev) => [body?.row ?? body, ...prev]);
      setRevealedKey(body?.plaintext ?? body?.key ?? "");
      setKeyName("");
      setKeyScopes(["expenses:read"]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setBusyId(null);
    }
  }, [companyId, keyName, keyScopes]);

  const revokeKey = useCallback(
    async (row: ApiKeyRow) => {
      if (!companyId) return;
      if (!window.confirm(t("keys.confirmRevoke"))) return;
      setBusyId(`key-${row.id}`);
      setError(null);
      try {
        await apiDelete(`/admin/platform-api/${companyId}/keys/${row.id}`);
        setKeys((prev) =>
          prev.map((k) =>
            k.id === row.id ? { ...k, revoked_at: new Date().toISOString() } : k,
          ),
        );
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error");
      } finally {
        setBusyId(null);
      }
    },
    [companyId, t],
  );

  const createHook = useCallback(async () => {
    if (!companyId || !hookEvent.trim() || !hookUrl.trim()) return;
    setBusyId("new-hook");
    setError(null);
    try {
      const body = await apiPost<{ row: WebhookRow; secret: string }>(`/admin/platform-api/${companyId}/webhooks`, {
        event_type: hookEvent.trim(),
        target_url: hookUrl.trim(),
        description: hookDesc.trim() || null,
      });
      setHooks((prev) => [body.row, ...prev]);
      setRevealedSecret(body.secret);
      setHookUrl("");
      setHookDesc("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setBusyId(null);
    }
  }, [companyId, hookEvent, hookUrl, hookDesc]);

  const toggleHook = useCallback(
    async (row: WebhookRow) => {
      if (!companyId) return;
      setBusyId(`hook-${row.id}`);
      setError(null);
      try {
        const updated = await apiPatch<WebhookRow>(`/admin/platform-api/${companyId}/webhooks/${row.id}`, {
        is_enabled: !row.is_enabled,
      });
        setHooks((prev) => prev.map((h) => (h.id === row.id ? updated : h)));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error");
      } finally {
        setBusyId(null);
      }
    },
    [companyId],
  );

  const deleteHook = useCallback(
    async (row: WebhookRow) => {
      if (!companyId) return;
      if (!window.confirm(t("webhooks.confirmDelete"))) return;
      setBusyId(`hook-${row.id}`);
      setError(null);
      try {
        await apiDelete(`/admin/platform-api/${companyId}/webhooks/${row.id}`);
        setHooks((prev) => prev.filter((h) => h.id !== row.id));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error");
      } finally {
        setBusyId(null);
      }
    },
    [companyId, t],
  );

  const copy = useCallback(async (val: string) => {
    try {
      await copyToClipboard(val);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  }, []);

  if (!companyId) {
    return (
      <div className="rounded-lg border border-amber-500/20 bg-amber-500/[0.05] p-4 text-[12px] text-warning/80">
        {t("noCompany")}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <PremiumHeader
        section="platform-api"
        icon={<KeyRound className="h-4 w-4" />}
        title={t("title")}
        subtitle={t("subtitle")}
      />

      {error && (
        <div className="rounded-lg border border-error bg-rose-500/[0.06] px-3 py-2 text-[10.5px] text-rose-200/85">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 inline mr-2" />
          <span className="break-all">{error}</span>
        </div>
      )}

      {/* Reveal banners */}
      {(revealedKey || revealedSecret) && (
        <div className="rounded-xl border border-cyan-500/30 bg-accent/[0.06] p-4 shadow-sm animate-in fade-in zoom-in-95">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-bold uppercase tracking-widest text-cyan-400">
              {revealedKey ? t("keys.revealHeader") : t("webhooks.revealHeader")}
            </span>
            <button
              onClick={() => { setRevealedKey(null); setRevealedSecret(null); }}
              className="text-cyan-400/50 hover:text-cyan-400 transition-colors"
            >
              ×
            </button>
          </div>
          <p className="text-[10.5px] text-cyan-100/70 mb-3 leading-relaxed">
            {revealedKey ? t("keys.revealBody") : t("webhooks.revealBody")}
          </p>
          <div className="flex items-center gap-3 rounded-lg border border-cyan-500/20 section-subtle px-3 py-2">
            <code className="flex-1 break-all font-mono text-[11px] text-cyan-100">
              {revealedKey || revealedSecret}
            </code>
            <button
              type="button"
              onClick={() => copy((revealedKey || revealedSecret)!)}
              className="flex items-center gap-2 rounded-md border border-default bg-surface-2 px-2.5 py-1.5 text-[10px] font-semibold text-secondary transition-all hover:bg-surface-2"
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? t("copied") : t("copy")}
            </button>
          </div>
        </div>
      )}

      {/* API Keys */}
      <div className="space-y-4">
        <div className="flex items-center justify-between px-1">
          <div className="space-y-0.5">
            <h2 className="text-[11px] font-bold uppercase tracking-[0.2em] text-secondary">{t("keys.title")}</h2>
            <p className="text-[9px] text-muted font-medium">Issue and revoke authentication tokens</p>
          </div>
          <button
            type="button"
            onClick={() => companyId && void loadKeys(companyId)}
            disabled={keysLoading}
            className="flex items-center gap-1.5 rounded-lg border border-default bg-surface-1 px-2.5 py-1 text-[10px] font-bold text-tertiary transition hover:border-strong hover:text-secondary disabled:opacity-50"
          >
            <RefreshCw className={`h-3 w-3 ${keysLoading ? 'animate-spin' : ''}`} />
            {t("refresh")}
          </button>
        </div>

        <SectionPanel>
           <div className="p-4 space-y-4">
             <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="flex flex-col gap-1.5">
                   <PatternSectionLabel>{t("keys.name")}</PatternSectionLabel>
                   <input
                    type="text"
                    value={keyName}
                    onChange={(e) => setKeyName(e.target.value)}
                    placeholder="e.g. ERP Connection"
                    className={inputClasses.base}
                   />
                </div>
                <div className="md:col-span-2 flex flex-col gap-1.5">
                   <PatternSectionLabel>{t("keys.scopes")}</PatternSectionLabel>
                   <div className="flex flex-wrap gap-1.5">
                      {SCOPE_PRESETS.map((s) => {
                        const on = keyScopes.includes(s);
                        return (
                          <button
                            key={s}
                            type="button"
                            onClick={() => toggleScope(s)}
                            className={`rounded-md border px-2 py-1 font-mono text-[9.5px] font-semibold transition-all ${
                              on
                                ? "border-cyan-500/40 bg-accent/10 text-cyan-300"
                                : "border-subtle bg-surface-1 hover:border-default text-muted"
                            }`}
                          >
                            {s}
                          </button>
                        );
                      })}
                   </div>
                </div>
             </div>
             <div className="flex justify-end pt-2">
               <button
                  type="button"
                  onClick={createKey}
                  disabled={busyId === "new-key" || !keyName.trim() || keyScopes.length === 0}
                  className="flex items-center gap-2 rounded-lg border border-accent/40 bg-accent/10 px-4 py-1.5 text-[10.5px] font-bold text-accent transition-all hover:bg-accent/20 disabled:opacity-40"
                >
                  <Plus className="h-3.5 w-3.5" />
                  {t("keys.create")}
                </button>
             </div>
           </div>

           <div className="border-t border-subtle bg-surface-2/20">
              {keysLoading ? (
                <div className="p-10 text-center text-muted"><Loader2 className="h-4 w-4 animate-spin mx-auto mb-2" />{t("loading")}</div>
              ) : keys.length === 0 ? (
                <div className="p-8 text-center text-[10.5px] text-muted italic">{t("keys.empty")}</div>
              ) : (
                <table className="w-full text-left text-[10.5px]">
                   <thead>
                     <tr className="border-b border-subtle text-[9px] uppercase tracking-widest text-muted">
                        <th className="p-3 font-semibold">{t("keys.th.name")}</th>
                        <th className="p-3 font-semibold">{t("keys.th.scopes")}</th>
                        <th className="p-3 font-semibold text-right">{t("keys.th.status")}</th>
                        <th className="p-3 w-10" />
                     </tr>
                   </thead>
                   <tbody>
                      {keys.map(k => (
                        <tr key={k.id} className="border-b border-subtle last:border-0 group">
                           <td className="p-3">
                              <div className="font-semibold text-primary">{k.name}</div>
                              <div className="font-mono text-[9px] text-muted">{k.key_prefix}…</div>
                           </td>
                           <td className="p-3">
                              <div className="flex flex-wrap gap-1">
                                {k.scopes.map(s => <span key={s} className="px-1.5 py-0.5 rounded bg-surface-2 border border-subtle font-mono text-[9px] text-tertiary">{s}</span>)}
                              </div>
                           </td>
                           <td className="p-3 text-right">
                              {k.revoked_at ? (
                                <span className="text-[9px] font-bold uppercase text-rose-400/70 border border-rose-400/20 bg-rose-400/5 px-1.5 py-0.5 rounded">{t("keys.statusRevoked")}</span>
                              ) : (
                                <span className="text-[9px] font-bold uppercase text-emerald-400/70 border border-success/20 bg-success/5 px-1.5 py-0.5 rounded">{t("keys.statusActive")}</span>
                              )}
                           </td>
                           <td className="p-3 text-right">
                              {!k.revoked_at && (
                                <button
                                  onClick={() => revokeKey(k)}
                                  className="p-1.5 rounded-md hover:bg-error/10 text-muted hover:text-error transition-colors opacity-0 group-hover:opacity-100"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              )}
                           </td>
                        </tr>
                      ))}
                   </tbody>
                </table>
              )}
           </div>
        </SectionPanel>
      </div>

      {/* Webhooks */}
      <div className="space-y-4 mt-10">
        <div className="flex items-center gap-2 px-1">
          <Webhook className="h-4 w-4 text-accent" />
          <h2 className="text-[11px] font-bold uppercase tracking-[0.2em] text-secondary">{t("webhooks.title")}</h2>
        </div>

        <SectionPanel>
          <div className="p-4 space-y-4">
             <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                   <PatternSectionLabel>{t("webhooks.event")}</PatternSectionLabel>
                   <select value={hookEvent} onChange={e => setHookEvent(e.target.value)} className={inputClasses.select}>
                      {EVENT_PRESETS.map(e => <option key={e} value={e}>{e}</option>)}
                   </select>
                </div>
                <div className="flex flex-col gap-1.5">
                   <PatternSectionLabel>{t("webhooks.targetUrl")}</PatternSectionLabel>
                   <input
                    type="url"
                    value={hookUrl}
                    onChange={e => setHookUrl(e.target.value)}
                    placeholder="https://your-api.com/hooks"
                    className={inputClasses.base}
                   />
                </div>
                <div className="md:col-span-2 flex flex-col gap-1.5">
                   <PatternSectionLabel>{t("webhooks.description")}</PatternSectionLabel>
                   <input
                    type="text"
                    value={hookDesc}
                    onChange={e => setHookDesc(e.target.value)}
                    className={inputClasses.base}
                   />
                </div>
             </div>
             <div className="flex justify-end pt-2">
               <button
                  type="button"
                  onClick={createHook}
                  disabled={busyId === "new-hook" || !hookUrl.trim()}
                  className="flex items-center gap-2 rounded-lg border border-accent/40 bg-accent/10 px-4 py-1.5 text-[10.5px] font-bold text-accent transition-all hover:bg-accent/20 disabled:opacity-40"
                >
                  <Plus className="h-3.5 w-3.5" />
                  {t("webhooks.create")}
                </button>
             </div>
          </div>

          <div className="border-t border-subtle bg-surface-2/20">
              {hooksLoading ? (
                <div className="p-10 text-center text-muted"><Loader2 className="h-4 w-4 animate-spin mx-auto mb-2" />{t("loading")}</div>
              ) : hooks.length === 0 ? (
                <div className="p-8 text-center text-[10.5px] text-muted italic">{t("webhooks.empty")}</div>
              ) : (
                <table className="w-full text-left text-[10.5px]">
                   <thead>
                     <tr className="border-b border-subtle text-[9px] uppercase tracking-widest text-muted">
                        <th className="p-3 font-semibold">{t("webhooks.th.event")}</th>
                        <th className="p-3 font-semibold">{t("webhooks.th.target")}</th>
                        <th className="p-3 font-semibold text-right">{t("webhooks.th.status")}</th>
                        <th className="p-3 w-16" />
                     </tr>
                   </thead>
                   <tbody>
                      {hooks.map(h => (
                        <tr key={h.id} className="border-b border-subtle last:border-0 group">
                           <td className="p-3">
                              <div className="font-semibold text-primary">{h.event_type}</div>
                              <div className="text-[9px] text-muted">{h.description || "No description"}</div>
                           </td>
                           <td className="p-3 font-mono text-[9px] text-tertiary break-all">
                              {h.target_url}
                           </td>
                           <td className="p-3 text-right">
                              {h.is_enabled ? (
                                <span className="text-[8px] font-bold uppercase text-success border border-success/20 bg-success/5 px-1.5 py-0.5 rounded">{t("webhooks.statusEnabled")}</span>
                              ) : (
                                <span className="text-[8px] font-bold uppercase text-muted border border-default bg-surface-2 px-1.5 py-0.5 rounded">{t("webhooks.statusDisabled")}</span>
                              )}
                           </td>
                           <td className="p-3 text-right">
                              <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button
                                  onClick={() => toggleHook(h)}
                                  className="p-1.5 rounded-md hover:bg-surface-2 text-muted transition-colors"
                                >
                                  {h.is_enabled ? <PowerOff className="h-3 w-3" /> : <Power className="h-3 w-3" />}
                                </button>
                                <button
                                  onClick={() => deleteHook(h)}
                                  className="p-1.5 rounded-md hover:bg-error/10 text-muted hover:text-error transition-colors"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              </div>
                           </td>
                        </tr>
                      ))}
                   </tbody>
                </table>
              )}
           </div>
        </SectionPanel>
      </div>
    </div>
  );
}
