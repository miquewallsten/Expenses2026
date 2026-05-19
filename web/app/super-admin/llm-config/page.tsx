"use client";

import { useState, useEffect } from "react";
import { KeyRound, Loader2, Check, Send, X, MessageSquare, Trash2, Copy, RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";
import { PremiumHeader, SectionPanel, SectionLabel, inputClasses } from "@/components/admin/shared/AdminPatterns";
import {
  listLLMConfigs, upsertLLMConfig, deleteLLMConfig, testLLMConnection, testLLMChat, LLMConfig,
} from "@/lib/api/llm-config";
import LLMConfigAssistant from "@/components/super-admin/LLMConfigAssistant";
import { copyToClipboard } from "@/lib/copy";

const PROVIDERS = [
  { key: "ollama-cloud", label: "Ollama Cloud", hint: "GLM, DeepSeek, Qwen via OpenAI-compatible API. Requires API key.", baseUrl: "https://ollama.com/v1", defaultModel: "glm-5", defaultApiKeyEnv: "OLLAMA_API_KEY" },
  { key: "ollama", label: "Ollama (Local)", hint: "Runs on your machine. No API cost.", baseUrl: "http://localhost:11434", defaultModel: "llama3.2", defaultApiKeyEnv: "" },
  { key: "anthropic", label: "Anthropic", hint: "Claude models. Requires ANTHROPIC_API_KEY env var.", baseUrl: "https://api.anthropic.com", defaultModel: "claude-sonnet-4-6", defaultApiKeyEnv: "ANTHROPIC_API_KEY" },
] as const;

const POPULAR_MODELS: Record<string, string[]> = {
  "ollama-cloud": ["glm-5", "glm-5.1", "deepseek-v4-flash", "deepseek-v4-pro", "qwen3.5", "gemma4", "kimi-k2.6", "ministral-3", "nemotron-3-super"],
  ollama: ["llama3.2", "llama3.1", "mistral", "codellama"],
  anthropic: ["claude-sonnet-4-6", "claude-opus-4-7", "claude-haiku-4-5-20251001"],
};

interface ChatResult {
  model: string;
  prompt: string;
  response: string;
  latency_ms: number;
  ok: boolean;
  error?: string;
}

export default function LLMConfigPage() {
  const t = useTranslations("superAdmin.llmConfig");
  const [configs, setConfigs] = useState<LLMConfig[]>([]);
  const [editing, setEditing] = useState<Partial<LLMConfig>>({ provider: "ollama-cloud", model_name: "glm-5", base_url: "https://ollama.com/v1", api_key_env_ref: "OLLAMA_API_KEY", company_id: null });
  const [testResult, setTestResult] = useState<{ ok: boolean; latency_ms: number; error: string | null } | null>(null);
  const [testing, setTesting] = useState(false);
  const [saving, setSavingCfg] = useState(false);

  const [chatPrompt, setChatPrompt] = useState("What is 2+2? Reply with just the number.");
  const [chatTesting, setChatTesting] = useState(false);
  const [chatResults, setChatResults] = useState<ChatResult[]>([]);

  const globalConfig = configs.find(c => c.company_id === null);
  const tenantConfigs = configs.filter(c => c.company_id !== null);

  useEffect(() => {
    listLLMConfigs().then(setConfigs).catch(console.error);
  }, []);

  useEffect(() => {
    if (globalConfig) {
      const id = setTimeout(() => setEditing({ ...globalConfig }), 0);
      return () => clearTimeout(id);
    }
  }, [globalConfig]);

  async function handleTest() {
    setTesting(true);
    setTestResult(null);
    try {
      const r = await testLLMConnection(editing);
      setTestResult(r);
    } catch (e: unknown) {
      setTestResult({ ok: false, latency_ms: 0, error: e instanceof Error ? e.message : String(e) });
    } finally {
      setTesting(false);
    }
  }

  async function handleSave() {
    if (editing.api_key_env_ref) {
      const val = editing.api_key_env_ref.trim();
      if (val.length > 25 && val !== val.toUpperCase()) {
        alert("API Key Env Var should be the NAME of the environment variable (e.g., LLM_API_KEY), not the actual key value!");
        return;
      }
    }
    setSavingCfg(true);
    try {
      const updated = await upsertLLMConfig({ ...editing, company_id: null });
      setConfigs(prev => {
        const without = prev.filter(c => c.company_id !== null);
        return [updated, ...without];
      });
    } finally {
      setSavingCfg(false);
    }
  }

  async function handleChatTest() {
    if (!chatPrompt.trim()) return;
    setChatTesting(true);
    try {
      const r = await testLLMChat({
        prompt: chatPrompt,
        provider: editing.provider || "ollama-cloud",
        model_name: editing.model_name || "glm-5",
        base_url: editing.base_url || "https://ollama.com",
        api_key_env_ref: editing.api_key_env_ref || "LLM_API_KEY",
      });
      const result: ChatResult = {
        model: r.model || editing.model_name || "unknown",
        prompt: chatPrompt,
        response: r.content || "",
        latency_ms: r.latency_ms,
        ok: r.ok,
        error: r.error || undefined,
      };
      setChatResults(prev => [result, ...prev.slice(0, 9)]);
    } catch (e: unknown) {
      setChatResults(prev => [{
        model: editing.model_name || "unknown",
        prompt: chatPrompt,
        response: "",
        latency_ms: 0,
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      }, ...prev.slice(0, 9)]);
    } finally {
      setChatTesting(false);
    }
  }

  async function testAllModels() {
    const models = POPULAR_MODELS[editing.provider || "ollama-cloud"] || [];
    for (const model of models) {
      try {
        const r = await testLLMChat({
          prompt: chatPrompt,
          provider: editing.provider || "ollama-cloud",
          model_name: model,
          base_url: editing.base_url || "https://ollama.com",
          api_key_env_ref: editing.api_key_env_ref || "LLM_API_KEY",
        });
        setChatResults(prev => [{
          model: model,
          prompt: chatPrompt,
          response: r.content || "",
          latency_ms: r.latency_ms,
          ok: r.ok,
          error: r.error || undefined,
        }, ...prev.slice(0, 19)]);
      } catch (e: unknown) {
        setChatResults(prev => [{
          model: model,
          prompt: chatPrompt,
          response: "",
          latency_ms: 0,
          ok: false,
          error: e instanceof Error ? e.message : String(e),
        }, ...prev.slice(0, 19)]);
      }
    }
  }

  const providerLabel = PROVIDERS.find(p => p.key === editing.provider)?.label || editing.provider;

  return (
    <div className="mx-auto max-w-5xl px-5 py-5 space-y-5">
      <PremiumHeader
        icon={<KeyRound className="h-4 w-4" />}
        title={t("title")}
        subtitle={t("subtitle")}
        section="platform-api"
        action={
          <button
            onClick={() => { listLLMConfigs().then(setConfigs).catch(() => {}); }}
            className="flex items-center gap-1.5 rounded border border-subtle bg-surface-1 px-2.5 py-1.5 text-[11px] text-secondary hover:bg-surface-2"
          >
            <RefreshCw className="h-3 w-3" />
            {t("refresh")}
          </button>
        }
      />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* Left: Config */}
        <SectionPanel title={t("globalConfig")}>
          <div className="space-y-3">
            <div>
              <SectionLabel>{t("provider")}</SectionLabel>
              <select
                value={editing.provider || "ollama-cloud"}
                onChange={(e) => {
                  const p = PROVIDERS.find(pr => pr.key === e.target.value);
                  if (p) setEditing({ ...editing, provider: p.key, base_url: p.baseUrl, model_name: p.defaultModel, api_key_env_ref: p.defaultApiKeyEnv });
                }}
                className={inputClasses.select}
              >
                {PROVIDERS.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
              </select>
            </div>

            <div>
              <SectionLabel>{t("modelName")}</SectionLabel>
              <input
                type="text"
                value={editing.model_name || ""}
                onChange={(e) => setEditing({ ...editing, model_name: e.target.value })}
                className={inputClasses.mono}
              />
            </div>

            <div>
              <SectionLabel>{t("baseUrl")}</SectionLabel>
              <input
                type="text"
                value={editing.base_url || ""}
                onChange={(e) => setEditing({ ...editing, base_url: e.target.value })}
                className={inputClasses.mono}
              />
            </div>

            <div>
              <SectionLabel>{t("apiKeyEnv")}</SectionLabel>
              <input
                type="text"
                value={editing.api_key_env_ref || ""}
                onChange={(e) => setEditing({ ...editing, api_key_env_ref: e.target.value })}
                placeholder="LLM_API_KEY"
                className={inputClasses.mono}
              />
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                onClick={handleTest}
                disabled={testing}
                className="flex items-center gap-1.5 rounded border border-default bg-surface-1 px-3 py-1.5 text-[11px] text-secondary hover:bg-surface-2 disabled:opacity-50"
              >
                {testing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                {t("test")}
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="bg-accent text-white py-1.5 px-3 shadow-sm hover:bg-accent-hover disabled:opacity-40 rounded text-[11px] font-semibold"
              >
                {saving ? <Loader2 className="h-3 w-3 animate-spin inline mr-1" /> : null}
                {t("save")}
              </button>
              {testResult && (
                <span className={`text-[10px] ${testResult.ok ? "text-success" : "text-error"}`}>
                  {testResult.ok ? `${t("connectionOk")} (${testResult.latency_ms}${t("latency")})` : `${t("connectionFailed")}: ${testResult.error}`}
                </span>
              )}
            </div>

            {tenantConfigs.length > 0 && (
              <div className="mt-4 border-t border-subtle pt-3">
                <SectionLabel>{t("tenantConfigs")}</SectionLabel>
                <div className="space-y-1">
                  {tenantConfigs.map(c => (
                    <div key={c.id} className="flex items-center justify-between rounded border border-subtle bg-surface-0 px-3 py-2">
                      <span className="text-[11px] font-medium text-primary">Company #{c.company_id}</span>
                      <span className="text-[10px] text-muted">{c.provider}</span>
                      <span className="text-[10px] font-mono text-secondary">{c.model_name}</span>
                      <button onClick={async () => { await deleteLLMConfig(c.id); setConfigs(p => p.filter(x => x.id !== c.id)); }} className="text-muted hover:text-error/70">
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </SectionPanel>

        {/* Right: Chat Playground */}
        <SectionPanel title={t("chatPlayground")}>
          <div className="space-y-3">
            <div>
              <SectionLabel>{t("testPrompt")}</SectionLabel>
              <textarea
                value={chatPrompt}
                onChange={e => setChatPrompt(e.target.value)}
                placeholder="Enter a prompt..."
                rows={3}
                className={inputClasses.textarea}
              />
            </div>

            <div className="flex items-center gap-2 text-[10px] text-muted">
              <span>{t("testingLabel")}</span>
              <span className="font-mono text-accent">{editing.model_name || t("noModel")}</span>
              <span className="text-muted">({providerLabel})</span>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleChatTest}
                disabled={chatTesting || !chatPrompt.trim()}
                className="flex items-center gap-1.5 rounded bg-accent px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-accent-hover disabled:opacity-40"
              >
                {chatTesting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                {t("testModel")}
              </button>
              <button
                onClick={testAllModels}
                disabled={chatTesting || !chatPrompt.trim()}
                className="flex items-center gap-1.5 rounded border border-default bg-surface-1 px-3 py-1.5 text-[11px] text-secondary hover:bg-surface-2 disabled:opacity-40"
              >
                {t("testAllModels")} ({POPULAR_MODELS[editing.provider || "ollama-cloud"]?.length || 0})
              </button>
              {chatResults.length > 0 && (
                <button onClick={() => setChatResults([])} className="flex items-center gap-1 px-2 py-1.5 text-muted hover:text-error/70" title={t("clear")}>
                  <Trash2 className="h-3 w-3" />
                </button>
              )}
            </div>

            {chatResults.length > 0 && (
              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                {chatResults.map((r, i) => (
                  <div key={i} className={`rounded border p-3 ${r.ok ? "border-default bg-surface-0" : "border-error/30 bg-error/5"}`}>
                    <div className="mb-2 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <MessageSquare className={`h-3 w-3 ${r.ok ? "text-accent" : "text-error"}`} />
                        <span className="text-[10px] font-mono font-semibold text-primary">{r.model}</span>
                        <span className="text-[9px] text-muted">{r.latency_ms}{t("latency")}</span>
                      </div>
                      {r.ok && r.response && (
                        <button onClick={() => copyToClipboard(r.response)} className="text-muted hover:text-secondary" title={t("copy")}>
                          <Copy className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                    {r.ok ? (
                      <p className="text-[11px] text-secondary leading-relaxed">{r.response}</p>
                    ) : (
                      <p className="text-[10px] text-error/80">{r.error}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </SectionPanel>
      </div>

      <LLMConfigAssistant currentProvider={editing.provider} currentModel={editing.model_name} />
    </div>
  );
}
