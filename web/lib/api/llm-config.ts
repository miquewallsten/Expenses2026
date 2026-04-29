// web/lib/api/llm-config.ts
import { getStoredSession } from "@/lib/session";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

function authHeaders(): HeadersInit {
  const s = getStoredSession();
  return s ? { Authorization: `Bearer ${s.token}` } : {};
}

export interface LLMConfig {
  id: number;
  company_id: number | null;
  provider: "ollama" | "anthropic" | "openai";
  base_url: string | null;
  api_key_env_ref: string | null;
  model_name: string;
  is_active: boolean;
}

export async function listLLMConfigs(): Promise<LLMConfig[]> {
  const r = await fetch(`${BASE}/super-admin/llm-configs`, { headers: authHeaders() });
  if (!r.ok) throw new Error(`${r.status}`);
  return r.json();
}

export async function upsertLLMConfig(data: Partial<LLMConfig>): Promise<LLMConfig> {
  const r = await fetch(`${BASE}/super-admin/llm-configs`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(data),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function updateLLMConfig(id: number, data: Partial<LLMConfig>): Promise<LLMConfig> {
  const r = await fetch(`${BASE}/super-admin/llm-configs/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(data),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function deleteLLMConfig(id: number): Promise<void> {
  await fetch(`${BASE}/super-admin/llm-configs/${id}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
}

export async function testLLMConnection(data: Partial<LLMConfig>): Promise<{ ok: boolean; latency_ms: number; error: string | null }> {
  const r = await fetch(`${BASE}/super-admin/llm-configs/test`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(data),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}
