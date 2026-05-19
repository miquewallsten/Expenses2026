// web/lib/api/agent-definitions.ts
import { superAdminApiCall, superAdminPost, superAdminPut, superAdminDelete, superAdminPatch } from "./super-admin-client";

export interface AgentDefinition {
  id: number;
  key: string;
  name: string;
  description: string | null;
  system_prompt: string;
  allowed_tools: string[];
  persona: string;
  is_system: boolean;
  is_active: boolean;
}

export interface ChannelAgentConfig {
  id: number;
  agent_id: number;
  channel_type: string;
  autonomous_threshold: number;
  high_stakes_rules: Array<{ field: string; op: string; value: number | string }>;
  test_mode: boolean;
}

export interface ToolInfo {
  name: string;
  description: string;
  category: string;
  personas: string[];
  destructive: boolean;
}

export async function listAgentDefinitions(): Promise<AgentDefinition[]> {
  return superAdminApiCall<AgentDefinition[]>("/super-admin/agent-definitions");
}

export async function createAgentDefinition(data: Partial<AgentDefinition>): Promise<AgentDefinition> {
  return superAdminPost<AgentDefinition>("/super-admin/agent-definitions", data);
}

export async function updateAgentDefinition(key: string, data: Partial<AgentDefinition>): Promise<AgentDefinition> {
  return superAdminPut<AgentDefinition>(`/super-admin/agent-definitions/${key}`, data);
}

export async function deleteAgentDefinition(key: string): Promise<void> {
  return superAdminDelete(`/super-admin/agent-definitions/${key}`);
}

export async function toggleAgent(key: string, isActive: boolean): Promise<AgentDefinition> {
  return superAdminPatch<AgentDefinition>(`/super-admin/agent-definitions/${key}/toggle?is_active=${isActive}`);
}

export async function listChannelConfigs(): Promise<ChannelAgentConfig[]> {
  return superAdminApiCall<ChannelAgentConfig[]>("/super-admin/channel-agent-configs");
}

export async function updateChannelConfig(agentKey: string, data: Partial<ChannelAgentConfig>): Promise<ChannelAgentConfig> {
  return superAdminPut<ChannelAgentConfig>(`/super-admin/channel-agent-configs/${agentKey}`, data);
}

export async function getToolRegistry(): Promise<ToolInfo[]> {
  return superAdminApiCall<ToolInfo[]>("/super-admin/tool-registry");
}

export interface LLMConfig {
  id: number;
  company_id: number | null;
  provider: string;
  base_url: string | null;
  api_key_env_ref: string | null;
  api_key: string | null;
  model_name: string;
  is_active: boolean;
}

export async function listLLMConfigs(): Promise<LLMConfig[]> {
  return superAdminApiCall<LLMConfig[]>("/super-admin/llm-configs");
}

export async function createLLMConfig(data: Partial<LLMConfig>): Promise<LLMConfig> {
  return superAdminPost<LLMConfig>("/super-admin/llm-configs", data);
}

export async function updateLLMConfig(id: number, data: Partial<LLMConfig>): Promise<LLMConfig> {
  return superAdminPut<LLMConfig>(`/super-admin/llm-configs/${id}`, data);
}

export async function deleteLLMConfig(id: number): Promise<void> {
  return superAdminDelete(`/super-admin/llm-configs/${id}`);
}