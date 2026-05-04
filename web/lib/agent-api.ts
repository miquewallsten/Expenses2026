// web/lib/agent-api.ts
// API client for the unified Agent backend.

import { getStoredSession } from "@/lib/session";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

function authHeaders(): HeadersInit {
  const s = getStoredSession();
  return s ? { Authorization: `Bearer ${s.token}` } : {};
}

// ── Types ─────────────────────────────────────────────────────────────────────

export type Persona = "admin" | "finance_manager" | "employee" | "expense" | "accounting";

export interface ChatRequest {
  message: string;
  session_id?: string;
  persona?: Persona;
  hard_mode?: boolean;
}

export interface ToolCall {
  tool: string;
  status: string;
  summary: string;
  duration_ms?: number;
}

export interface PendingAction {
  receipt_id: string;
  tool_name: string;
  args: Record<string, unknown>;
  preview: Record<string, unknown>;
  status: string;
  expires_at: string;
}

export interface ChatResponse {
  ok: boolean;
  session_id: string;
  content: string;
  tool_calls: ToolCall[];
  pending: PendingAction[];
  error?: string;
}

export interface AgentSession {
  session_id: string;
  persona: string;
  user_id: number;
  created_at: string;
  updated_at: string;
  turn_count: number;
}

export interface SessionDetail {
  session_id: string;
  persona: string;
  user_id: number;
  created_at: string;
  updated_at: string;
  turns: Array<{
    role: string;
    content: string;
    timestamp?: string;
  }>;
}

export interface Receipt {
  receipt_id: string;
  company_id: number;
  session_id: string;
  tool_name: string;
  args: Record<string, unknown>;
  preview: Record<string, unknown>;
  status: string;
  expires_at: string;
  created_at: string;
  confirmed_at?: string;
  confirmed_by?: string;
  result?: Record<string, unknown>;
  error?: string;
}

export interface AgentInsight {
  id: number;
  kind: string;
  severity: string;
  title: string;
  body: string;
  data: Record<string, unknown> | null;
  suggested_prompt: string | null;
  status: string;
  created_at: string;
}

export interface TenantMemory {
  id: number;
  agent_key: string;
  key: string;
  value: string;
  confidence: number;
  created_at: string;
  updated_at: string;
  last_used_at: string | null;
}

export interface WorkflowProgress {
  ok: boolean;
  workflow_key: string;
  current_step: string;
  total_steps: number;
  completed_steps: number;
  context: Record<string, unknown> | null;
}

// ── Chat ───────────────────────────────────────────────────────────────────────

export async function sendChatMessage(
  companyId: number,
  request: ChatRequest,
): Promise<ChatResponse> {
  const response = await fetch(`${BASE}/agent/chat/${companyId}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Chat request failed: ${response.status} - ${text}`);
  }

  return response.json();
}

// ── Sessions ──────────────────────────────────────────────────────────────────

export async function listSessions(
  companyId: number,
  limit: number = 20,
): Promise<AgentSession[]> {
  const response = await fetch(
    `${BASE}/agent/sessions/${companyId}?limit=${limit}`,
    { headers: authHeaders() },
  );

  if (!response.ok) {
    throw new Error(`Failed to list sessions: ${response.status}`);
  }

  return response.json();
}

export async function getSession(
  companyId: number,
  sessionId: string,
): Promise<SessionDetail> {
  const response = await fetch(
    `${BASE}/agent/sessions/${companyId}/${sessionId}`,
    { headers: authHeaders() },
  );

  if (!response.ok) {
    throw new Error(`Failed to get session: ${response.status}`);
  }

  return response.json();
}

// ── Receipts ──────────────────────────────────────────────────────────────────

export async function getReceipt(
  companyId: number,
  receiptId: string,
): Promise<Receipt> {
  const response = await fetch(
    `${BASE}/agent/receipts/${companyId}/${receiptId}`,
    { headers: authHeaders() },
  );

  if (!response.ok) {
    throw new Error(`Failed to get receipt: ${response.status}`);
  }

  return response.json();
}

export async function confirmReceipt(
  receiptId: string,
  companyId: number,
): Promise<{ ok: boolean; receipt: Receipt; result: Record<string, unknown> }> {
  const response = await fetch(`${BASE}/agent/confirm`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
    },
    body: JSON.stringify({ receipt_id: receiptId, company_id: companyId }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to confirm receipt: ${response.status} - ${text}`);
  }

  return response.json();
}

export async function rejectReceipt(
  receiptId: string,
  companyId: number,
): Promise<{ ok: boolean; receipt: Receipt }> {
  const response = await fetch(`${BASE}/agent/reject`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
    },
    body: JSON.stringify({ receipt_id: receiptId, company_id: companyId }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to reject receipt: ${response.status} - ${text}`);
  }

  return response.json();
}

// ── Insights ─────────────────────────────────────────────────────────────────

export async function listInsights(
  companyId: number,
  refresh: boolean = false,
): Promise<AgentInsight[]> {
  const response = await fetch(
    `${BASE}/agent/insights/${companyId}?refresh=${refresh}`,
    { headers: authHeaders() },
  );

  if (!response.ok) {
    throw new Error(`Failed to list insights: ${response.status}`);
  }

  return response.json();
}

export async function setInsightStatus(
  companyId: number,
  insightId: number,
  status: "acknowledged" | "resolved" | "dismissed",
): Promise<{ ok: boolean; id: number; status: string }> {
  const response = await fetch(
    `${BASE}/agent/insights/${companyId}/${insightId}/status`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders(),
      },
      body: JSON.stringify({ status }),
    },
  );

  if (!response.ok) {
    throw new Error(`Failed to update insight status: ${response.status}`);
  }

  return response.json();
}

// ── Memory ───────────────────────────────────────────────────────────────────

export async function listMemory(
  companyId: number,
  kind?: string,
  limit: number = 50,
): Promise<TenantMemory[]> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (kind) params.append("kind", kind);

  const response = await fetch(
    `${BASE}/agent/memory/${companyId}?${params}`,
    { headers: authHeaders() },
  );

  if (!response.ok) {
    throw new Error(`Failed to list memory: ${response.status}`);
  }

  return response.json();
}

export async function createMemory(
  companyId: number,
  data: {
    kind?: "fact" | "preference" | "decision";
    key: string;
    value: unknown;
    scope?: "company" | "user";
  },
): Promise<{ ok: boolean; id: number; key: string; kind: string }> {
  const response = await fetch(`${BASE}/agent/memory/${companyId}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to create memory: ${response.status} - ${text}`);
  }

  return response.json();
}

export async function deleteMemory(
  companyId: number,
  memId: number,
): Promise<{ ok: boolean; id: number }> {
  const response = await fetch(
    `${BASE}/agent/memory/${companyId}/${memId}`,
    {
      method: "DELETE",
      headers: authHeaders(),
    },
  );

  if (!response.ok) {
    throw new Error(`Failed to delete memory: ${response.status}`);
  }

  return response.json();
}

// ── Tenant Memory ────────────────────────────────────────────────────────────

export async function listTenantMemory(
  companyId: number,
  agentKey: string = "admin",
): Promise<TenantMemory[]> {
  const response = await fetch(
    `${BASE}/agent/tenant-memory/${companyId}?agent_key=${agentKey}`,
    { headers: authHeaders() },
  );

  if (!response.ok) {
    throw new Error(`Failed to list tenant memory: ${response.status}`);
  }

  return response.json();
}

export async function deleteTenantMemory(
  companyId: number,
  key: string,
  agentKey: string = "admin",
): Promise<{ ok: boolean; key: string }> {
  const response = await fetch(
    `${BASE}/agent/tenant-memory/${companyId}/${key}?agent_key=${agentKey}`,
    {
      method: "DELETE",
      headers: authHeaders(),
    },
  );

  if (!response.ok) {
    throw new Error(`Failed to delete tenant memory: ${response.status}`);
  }

  return response.json();
}

// ── Workflow ────────────────────────────────────────────────────────────────

export async function startWorkflow(
  companyId: number,
  data: {
    workflow_key: string;
    total_steps: number;
    context?: Record<string, unknown>;
  },
): Promise<WorkflowProgress> {
  const response = await fetch(`${BASE}/agent/workflow/${companyId}/start`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to start workflow: ${response.status} - ${text}`);
  }

  return response.json();
}

export async function getWorkflow(
  companyId: number,
  workflowKey: string,
): Promise<WorkflowProgress> {
  const response = await fetch(
    `${BASE}/agent/workflow/${companyId}?workflow_key=${workflowKey}`,
    { headers: authHeaders() },
  );

  if (!response.ok) {
    throw new Error(`Failed to get workflow: ${response.status}`);
  }

  return response.json();
}

export async function advanceWorkflow(
  companyId: number,
  workflowKey: string,
): Promise<WorkflowProgress> {
  const response = await fetch(`${BASE}/agent/workflow/${companyId}/advance`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
    },
    body: JSON.stringify({ workflow_key: workflowKey }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to advance workflow: ${response.status} - ${text}`);
  }

  return response.json();
}

// ── Upload ──────────────────────────────────────────────────────────────────

export async function uploadFile(
  companyId: number,
  file: File,
  sessionId?: string,
): Promise<{
  file_id: string;
  filename: string;
  content_type: string;
  size_bytes: number;
  session_id?: string;
}> {
  const formData = new FormData();
  formData.append("file", file);
  if (sessionId) formData.append("session_id", sessionId);

  const response = await fetch(`${BASE}/agent/upload/${companyId}`, {
    method: "POST",
    headers: authHeaders(),
    body: formData,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to upload file: ${response.status} - ${text}`);
  }

  return response.json();
}