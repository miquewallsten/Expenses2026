// web/lib/api/agent-definitions.ts
import { getStoredSession } from "@/lib/session";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

function authHeaders(): HeadersInit {
  const s = getStoredSession();
  return s ? { Authorization: `Bearer ${s.token}` } : {};
}

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
  const r = await fetch(`${BASE}/super-admin/agent-definitions`, { headers: authHeaders() });
  if (!r.ok) throw new Error(`${r.status}`);
  return r.json();
}

export async function createAgentDefinition(data: Partial<AgentDefinition>): Promise<AgentDefinition> {
  const r = await fetch(`${BASE}/super-admin/agent-definitions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(data),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function updateAgentDefinition(key: string, data: Partial<AgentDefinition>): Promise<AgentDefinition> {
  const r = await fetch(`${BASE}/super-admin/agent-definitions/${key}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(data),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function deleteAgentDefinition(key: string): Promise<void> {
  await fetch(`${BASE}/super-admin/agent-definitions/${key}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
}

export async function toggleAgent(key: string, isActive: boolean): Promise<AgentDefinition> {
  const r = await fetch(`${BASE}/super-admin/agent-definitions/${key}/toggle?is_active=${isActive}`, {
    method: "PATCH",
    headers: authHeaders(),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function listChannelConfigs(): Promise<ChannelAgentConfig[]> {
  const r = await fetch(`${BASE}/super-admin/channel-agent-configs`, { headers: authHeaders() });
  if (!r.ok) throw new Error(`${r.status}`);
  return r.json();
}

export async function updateChannelConfig(agentKey: string, data: Partial<ChannelAgentConfig>): Promise<ChannelAgentConfig> {
  const r = await fetch(`${BASE}/super-admin/channel-agent-configs/${agentKey}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(data),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function getToolRegistry(): Promise<ToolInfo[]> {
  const r = await fetch(`${BASE}/super-admin/tool-registry`, { headers: authHeaders() });
  if (!r.ok) throw new Error(`${r.status}`);
  return r.json();
}
