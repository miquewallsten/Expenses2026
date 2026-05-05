// web/lib/api/llm-config.ts
import { superAdminApiCall, superAdminPost, superAdminPut, superAdminDelete } from "./super-admin-client";

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
  return superAdminApiCall<LLMConfig[]>("/super-admin/llm-configs");
}

export async function upsertLLMConfig(data: Partial<LLMConfig>): Promise<LLMConfig> {
  return superAdminPost<LLMConfig>("/super-admin/llm-configs", data);
}

export async function updateLLMConfig(id: number, data: Partial<LLMConfig>): Promise<LLMConfig> {
  return superAdminPut<LLMConfig>(`/super-admin/llm-configs/${id}`, data);
}

export async function deleteLLMConfig(id: number): Promise<void> {
  return superAdminDelete(`/super-admin/llm-configs/${id}`);
}

export async function testLLMConnection(data: Partial<LLMConfig>): Promise<{ ok: boolean; latency_ms: number; error: string | null }> {
  return superAdminPost<{ ok: boolean; latency_ms: number; error: string | null }>("/super-admin/llm-configs/test", data);
}