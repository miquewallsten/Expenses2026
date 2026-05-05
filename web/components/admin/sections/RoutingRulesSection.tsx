"use client";

/**
 * Approval routing rules admin section (Phase 5.5 frontend).
 *
 * Wraps the admin CRUD at /admin/routing-rules/{cid}. List on the
 * left rail, JSON-mode editor on the right. Same dense Salesforce-style
 * shell as audit-log / platform-api / category-memory pages.
 *
 * Rule shape (matches engine contract):
 *   rule_key       — stable string, surfaces in audit logs
 *   priority       — int, higher wins on tie
 *   when_json      — predicate tree { all|any: [...] } | { field, op, value }
 *   approvers_json — array of { role } | { user_id }
 *   sla_hours      — optional int (escalation horizon)
 *   escalation_role — optional role name
 *   is_enabled     — toggle
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import {
  AlertTriangle,
  GitBranch,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  Sparkles,
  Trash2,
} from "lucide-react";
import { getCurrentCompanyId, getAuthHeaders } from "@/lib/session";

const API = process.env.NEXT_PUBLIC_API_BASE_URL;

interface Rule {
  id: number;
  company_id: number;
  rule_key: string;
  name: string;
  priority: number;
  when_json: Record<string, unknown>;
  approvers_json: Array<Record<string, unknown>>;
  sla_hours: number | null;
  escalation_role: string | null;
  is_enabled: boolean;
}

const NEW_RULE_TEMPLATE = {
  rule_key: "high-value-travel",
  name: "High-value travel → CFO",
  priority: 10,
  when_json: {
    all: [
      { field: "amount", op: "gte", value: 5000 },
      { field: "category_code", op: "eq", value: "travel" },
    ],
  },
  approvers_json: [{ role: "cfo" }],
  sla_hours: 48,
  escalation_role: "cfo",
  is_enabled: true,
};

export default function RoutingRulesSection() {
  const t = useTranslations("admin.routingRules");
  const [companyId, setCompanyId] = useState<number | null>(null);
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<number | "new" | null>(null);
  const [draft, setDraft] = useState<string>("");
  const [draftError, setDraftError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // ── Preview probe ──────────────────────────────────────────────────────
  const [probeContext, setProbeContext] = useState<string>(
    JSON.stringify({ amount: 7000, category_code: "travel" }, null, 2),
  );
  const [probeResult, setProbeResult] = useState<{
    matched_rule_id: string | null;
    approver_user_ids: number[];
    approver_roles: string[];
    sla_hours: number | null;
    escalation_role: string | null;
    rules_evaluated: number;
  } | null>(null);
  const [probeError, setProbeError] = useState<string | null>(null);
  const [probing, setProbing] = useState(false);

  useEffect(() => {
    const cid = getCurrentCompanyId();
    if (cid) setCompanyId(Number(cid));
  }, []);

  const load = useCallback(async (cid: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API}/admin/routing-rules/${cid}`, {
        headers: { ...getAuthHeaders() },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const items: Rule[] = await res.json();
      setRules(items);
    } catch (e) {
      setError(e instanceof Error ? e.message : "load_failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (companyId != null) void load(companyId);
  }, [companyId, load]);

  const selected = useMemo(() => {
    if (selectedId === "new" || selectedId == null) return null;
    return rules.find((r) => r.id === selectedId) ?? null;
  }, [rules, selectedId]);

  // Sync draft JSON whenever selection changes.
  useEffect(() => {
    if (selectedId === "new") {
      setDraft(JSON.stringify(NEW_RULE_TEMPLATE, null, 2));
      setDraftError(null);
    } else if (selected) {
      const editable = {
        rule_key: selected.rule_key,
        name: selected.name,
        priority: selected.priority,
        when_json: selected.when_json,
        approvers_json: selected.approvers_json,
        sla_hours: selected.sla_hours,
        escalation_role: selected.escalation_role,
        is_enabled: selected.is_enabled,
      };
      setDraft(JSON.stringify(editable, null, 2));
      setDraftError(null);
    } else {
      setDraft("");
      setDraftError(null);
    }
  }, [selected, selectedId]);

  const handleSave = async () => {
    if (companyId == null || selectedId == null) return;
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(draft);
    } catch (e) {
      setDraftError(e instanceof Error ? e.message : "invalid_json");
      return;
    }
    setDraftError(null);
    setSaving(true);
    try {
      const isCreate = selectedId === "new";
      const url = isCreate
        ? `${API}/admin/routing-rules/${companyId}`
        : `${API}/admin/routing-rules/${companyId}/${selectedId}`;
      const res = await fetch(url, {
        method: isCreate ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify(parsed),
      });
      if (!res.ok) {
        const detail = await res.json().catch(() => ({}));
        throw new Error(detail?.detail ?? `HTTP ${res.status}`);
      }
      const saved: Rule = await res.json();
      await load(companyId);
      setSelectedId(saved.id);
    } catch (e) {
      setDraftError(e instanceof Error ? e.message : "save_failed");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (companyId == null || typeof selectedId !== "number") return;
    if (!window.confirm(t("confirmDelete"))) return;
    setSaving(true);
    try {
      const res = await fetch(
        `${API}/admin/routing-rules/${companyId}/${selectedId}`,
        { method: "DELETE", headers: { ...getAuthHeaders() } },
      );
      if (!res.ok && res.status !== 204) {
        throw new Error(`HTTP ${res.status}`);
      }
      setSelectedId(null);
      await load(companyId);
    } catch (e) {
      setDraftError(e instanceof Error ? e.message : "delete_failed");
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (rule: Rule) => {
    if (companyId == null) return;
    try {
      const res = await fetch(
        `${API}/admin/routing-rules/${companyId}/${rule.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json", ...getAuthHeaders() },
          body: JSON.stringify({ is_enabled: !rule.is_enabled }),
        },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await load(companyId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "toggle_failed");
    }
  };

  const handleProbe = async () => {
    if (companyId == null) return;
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(probeContext);
    } catch (e) {
      setProbeError(e instanceof Error ? e.message : "invalid_json");
      setProbeResult(null);
      return;
    }
    setProbeError(null);
    setProbing(true);
    try {
      const res = await fetch(
        `${API}/admin/routing-rules/${companyId}/preview`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", ...getAuthHeaders() },
          body: JSON.stringify({ context: parsed }),
        },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setProbeResult(await res.json());
    } catch (e) {
      setProbeError(e instanceof Error ? e.message : "probe_failed");
      setProbeResult(null);
    } finally {
      setProbing(false);
    }
  };

  if (companyId == null) {
    return (
      <div className="min-h-screen bg-surface-0 p-6 text-secondary">
        <p className="text-[12px]">{t("noCompany")}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface-0 text-primary">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-subtle bg-surface-0/95 backdrop-blur">
        <div className="flex items-center justify-between px-4 py-2.5">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <GitBranch className="h-4 w-4 text-warning/70" />
              <h1 className="text-[13px] font-semibold tracking-tight text-primary">
                {t("title")}
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void load(companyId)}
              className="flex items-center gap-1 rounded border border-default bg-surface-1 px-2 py-1 text-[11px] text-secondary transition-colors hover:border-strong hover:text-primary"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              {t("refresh")}
            </button>
            <button
              type="button"
              onClick={() => setSelectedId("new")}
              className="flex items-center gap-1 rounded border border-amber-500/30 bg-amber-500/[0.08] px-2 py-1 text-[11px] text-warning transition-colors hover:border-warning hover:bg-amber-500/[0.14]"
            >
              <Plus className="h-3.5 w-3.5" />
              {t("newRule")}
            </button>
          </div>
        </div>
      </header>

      {error && (
        <div className="m-4 flex items-start gap-2 rounded border border-error bg-rose-500/[0.06] p-3 text-[11.5px] text-rose-200">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="grid gap-3 p-4 lg:grid-cols-[340px_1fr]">
        {/* List rail */}
        <aside className="rounded border border-subtle bg-surface-1">
          <div className="border-b border-subtle px-3 py-2 text-[10.5px] font-semibold uppercase tracking-wider text-tertiary">
            {t("rules")} · {rules.length}
          </div>
          {loading ? (
            <div className="flex items-center gap-2 px-3 py-6 text-[11px] text-tertiary">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {t("loading")}
            </div>
          ) : rules.length === 0 ? (
            <div className="px-3 py-6 text-[11px] text-tertiary">
              {t("empty")}
            </div>
          ) : (
            <ul className="divide-y divide-white/[0.04]">
              {rules.map((r) => {
                const active = r.id === selectedId;
                return (
                  <li key={r.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(r.id)}
                      className={`flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left transition-colors ${
                        active
                          ? "bg-amber-500/[0.08]"
                          : "hover:bg-surface-1"
                      }`}
                    >
                      <div className="flex w-full items-center gap-2">
                        <span
                          className={`inline-flex h-1.5 w-1.5 rounded-full ${
                            r.is_enabled ? "bg-emerald-400/80" : "bg-surface-2"
                          }`}
                        />
                        <span className="flex-1 truncate text-[12px] font-medium text-primary">
                          {r.name}
                        </span>
                        <span className="rounded bg-surface-2 px-1 py-px text-[9.5px] font-mono tabular-nums text-tertiary">
                          P{r.priority}
                        </span>
                      </div>
                      <div className="flex w-full items-center gap-2 text-[10px] text-tertiary">
                        <span className="truncate font-mono">{r.rule_key}</span>
                        {r.sla_hours != null && (
                          <span className="ml-auto rounded bg-accent/[0.10] px-1 py-px text-accent/80">
                            SLA {r.sla_hours}h
                          </span>
                        )}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </aside>

        {/* Editor pane */}
        <section className="rounded border border-subtle bg-surface-1">
          {selectedId == null ? (
            <div className="flex h-full min-h-[300px] items-center justify-center px-6 py-12 text-center text-[11.5px] text-tertiary">
              {t("selectPrompt")}
            </div>
          ) : (
            <div className="flex flex-col">
              <div className="flex items-center justify-between border-b border-subtle px-3 py-2">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-semibold text-primary">
                    {selectedId === "new"
                      ? t("createTitle")
                      : selected?.name ?? ""}
                  </span>
                  {selected && (
                    <button
                      type="button"
                      onClick={() => void handleToggle(selected)}
                      className={`rounded border px-1.5 py-0.5 text-[9.5px] font-medium transition-colors ${
                        selected.is_enabled
                          ? "border-emerald-500/30 bg-emerald-500/[0.08] text-emerald-300"
                          : "border-subtle bg-surface-2 text-tertiary"
                      }`}
                    >
                      {selected.is_enabled ? t("enabled") : t("disabled")}
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {typeof selectedId === "number" && (
                    <button
                      type="button"
                      onClick={() => void handleDelete()}
                      disabled={saving}
                      className="flex items-center gap-1 rounded border border-rose-500/25 bg-rose-500/[0.05] px-2 py-1 text-[10.5px] text-rose-300 transition-colors hover:border-rose-500/45 hover:bg-rose-500/[0.10] disabled:opacity-50"
                    >
                      <Trash2 className="h-3 w-3" />
                      {t("delete")}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => void handleSave()}
                    disabled={saving}
                    className="flex items-center gap-1 rounded border border-amber-500/30 bg-amber-500/[0.10] px-2 py-1 text-[10.5px] font-medium text-warning transition-colors hover:border-warning hover:bg-amber-500/[0.16] disabled:opacity-50"
                  >
                    {saving ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Save className="h-3 w-3" />
                    )}
                    {t("save")}
                  </button>
                </div>
              </div>

              <div className="px-3 pt-2 text-[10.5px] text-tertiary">
                {t("editorHint")}
              </div>
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                spellCheck={false}
                className="m-3 min-h-[420px] flex-1 resize-y rounded border border-default bg-surface-0 p-3 font-mono text-[11.5px] leading-[1.55] text-primary outline-none focus:border-amber-500/40"
              />
              {draftError && (
                <div className="mx-3 mb-3 flex items-start gap-2 rounded border border-error bg-rose-500/[0.06] p-2 text-[11px] text-rose-200">
                  <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                  <span className="font-mono">{draftError}</span>
                </div>
              )}
            </div>
          )}
        </section>
      </div>

      {/* Probe panel — preview which rule fires for a hypothetical context */}
      <div className="px-4 pb-6">
        <section className="rounded border border-violet-500/15 bg-violet-500/[0.02]">
          <div className="flex items-center justify-between border-b border-subtle px-3 py-2">
            <div className="flex items-center gap-2">
              <Sparkles className="h-3.5 w-3.5 text-violet-300/70" />
              <span className="text-[11px] font-semibold text-primary">
                {t("probeTitle")}
              </span>
              <span className="text-[10px] text-tertiary">
                · {t("probeHint")}
              </span>
            </div>
            <button
              type="button"
              onClick={() => void handleProbe()}
              disabled={probing}
              className="flex items-center gap-1 rounded border border-violet-500/30 bg-violet-500/[0.10] px-2 py-1 text-[10.5px] font-medium text-violet-200 transition-colors hover:border-violet-500/50 hover:bg-violet-500/[0.16] disabled:opacity-50"
            >
              {probing ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Sparkles className="h-3 w-3" />
              )}
              {t("probeRun")}
            </button>
          </div>
          <div className="grid gap-3 p-3 lg:grid-cols-2">
            <div className="flex flex-col gap-1">
              <label className="text-[10px] uppercase tracking-wider text-tertiary">
                {t("probeContext")}
              </label>
              <textarea
                value={probeContext}
                onChange={(e) => setProbeContext(e.target.value)}
                spellCheck={false}
                className="min-h-[140px] resize-y rounded border border-default bg-surface-0 p-2.5 font-mono text-[11px] leading-[1.5] text-primary outline-none focus:border-violet-500/40"
              />
              {probeError && (
                <div className="flex items-start gap-1.5 rounded border border-error bg-rose-500/[0.06] p-1.5 text-[10.5px] text-rose-200">
                  <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                  <span className="font-mono">{probeError}</span>
                </div>
              )}
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] uppercase tracking-wider text-tertiary">
                {t("probeResult")}
              </label>
              {probeResult == null ? (
                <div className="rounded border border-subtle bg-surface-1 p-3 text-[11px] text-tertiary">
                  {t("probeEmpty")}
                </div>
              ) : (
                <div className="rounded border border-subtle bg-surface-1 p-3 text-[11px]">
                  {probeResult.matched_rule_id ? (
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2">
                        <span className="text-tertiary">{t("matched")}:</span>
                        <span className="rounded bg-emerald-500/[0.12] px-1.5 py-px font-mono text-[10.5px] text-emerald-300">
                          {probeResult.matched_rule_id}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-tertiary">{t("roles")}:</span>
                        {probeResult.approver_roles.length === 0 ? (
                          <span className="text-muted">—</span>
                        ) : (
                          probeResult.approver_roles.map((role) => (
                            <span
                              key={role}
                              className="rounded bg-accent/[0.10] px-1.5 py-px text-accent"
                            >
                              {role}
                            </span>
                          ))
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-tertiary">{t("userIds")}:</span>
                        {probeResult.approver_user_ids.length === 0 ? (
                          <span className="text-muted">—</span>
                        ) : (
                          probeResult.approver_user_ids.map((uid) => (
                            <span
                              key={uid}
                              className="rounded bg-surface-2 px-1.5 py-px font-mono tabular-nums text-secondary"
                            >
                              #{uid}
                            </span>
                          ))
                        )}
                      </div>
                      {probeResult.sla_hours != null && (
                        <div className="text-tertiary">
                          <span className="text-tertiary">SLA:</span>{" "}
                          <span className="font-mono tabular-nums text-warning">
                            {probeResult.sla_hours}h
                          </span>
                          {probeResult.escalation_role && (
                            <>
                              {" · "}
                              <span className="text-tertiary">
                                {t("escalates")}:
                              </span>{" "}
                              <span className="text-warning">
                                {probeResult.escalation_role}
                              </span>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-tertiary">{t("noMatch")}</div>
                  )}
                  <div className="mt-2 border-t border-subtle pt-2 text-[10px] text-tertiary">
                    {t("evaluated", { count: probeResult.rules_evaluated })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
