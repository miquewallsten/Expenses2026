// web/lib/agent-api.ts
// API client for the unified Agent backend.
// Uses the centralized apiCall client for auth, error handling, and 401 redirect.
// Only raw fetch() remains for FormData uploads and SSE streaming.

import { apiCall, apiPost, apiDelete } from "@/lib/api/client";

// ── Types ─────────────────────────────────────────────────────────────────────

export type Persona = "admin" | "employee" | "expense" | "accounting" | "manager" | "super_admin";

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
  return apiPost<ChatResponse>(`/agent/chat/${companyId}`, request);
}

// ── Sessions ──────────────────────────────────────────────────────────────────

export async function listSessions(
  companyId: number,
  limit: number = 20,
): Promise<AgentSession[]> {
  return apiCall<AgentSession[]>(`/agent/sessions/${companyId}?limit=${limit}`);
}

export async function getSession(
  companyId: number,
  sessionId: string,
): Promise<SessionDetail> {
  return apiCall<SessionDetail>(`/agent/sessions/${companyId}/${sessionId}`);
}

// ── Receipts ──────────────────────────────────────────────────────────────────

export async function getReceipt(
  companyId: number,
  receiptId: string,
): Promise<Receipt> {
  return apiCall<Receipt>(`/agent/receipts/${companyId}/${receiptId}`);
}

export async function confirmReceipt(
  receiptId: string,
  companyId: number,
): Promise<{ ok: boolean; receipt: Receipt; result: Record<string, unknown> }> {
  return apiPost(`/agent/confirm`, { receipt_id: receiptId, company_id: companyId });
}

export async function rejectReceipt(
  receiptId: string,
  companyId: number,
  reason?: string,
): Promise<{ ok: boolean; receipt_id: string }> {
  return apiPost(`/agent/reject`, { receipt_id: receiptId, company_id: companyId, reason });
}

// ── Audit ────────────────────────────────────────────────────────────────────

export async function getAuditLog(
  companyId: number,
  limit: number = 50,
): Promise<any[]> {
  return apiCall(`/agent/audit/${companyId}?limit=${limit}`);
}

// ── Insights ──────────────────────────────────────────────────────────────────

export async function listInsights(
  companyId: number,
): Promise<AgentInsight[]> {
  return apiCall<AgentInsight[]>(`/agent/insights/${companyId}`);
}

export async function dismissInsight(
  companyId: number,
  insightId: number,
): Promise<{ ok: boolean }> {
  return apiPost(`/agent/insights/${companyId}/${insightId}/dismiss`);
}

// ── Memory ────────────────────────────────────────────────────────────────────

export async function listMemory(
  companyId: number,
  opts?: { kind?: string; limit?: number },
): Promise<any[]> {
  const params = new URLSearchParams();
  if (opts?.limit) params.append("limit", String(opts.limit));
  if (opts?.kind) params.append("kind", opts.kind);
  return apiCall(`/agent/memory/${companyId}?${params}`);
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
  return apiPost(`/agent/memory/${companyId}`, data);
}

export async function deleteMemory(
  companyId: number,
  memId: number,
): Promise<{ ok: boolean; id: number }> {
  return apiDelete(`/agent/memory/${companyId}/${memId}`);
}

// ── Tenant Memory ────────────────────────────────────────────────────────────

export async function listTenantMemory(
  companyId: number,
  agentKey: string = "admin",
): Promise<TenantMemory[]> {
  return apiCall<TenantMemory[]>(`/agent/tenant-memory/${companyId}?agent_key=${agentKey}`);
}

export async function deleteTenantMemory(
  companyId: number,
  key: string,
  agentKey: string = "admin",
): Promise<{ ok: boolean; key: string }> {
  return apiDelete(`/agent/tenant-memory/${companyId}/${key}?agent_key=${agentKey}`);
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
  return apiPost<WorkflowProgress>(`/agent/workflow/${companyId}/start`, data);
}

export async function getWorkflow(
  companyId: number,
  workflowKey: string,
): Promise<WorkflowProgress> {
  return apiCall<WorkflowProgress>(`/agent/workflow/${companyId}?workflow_key=${workflowKey}`);
}

export async function advanceWorkflow(
  companyId: number,
  workflowKey: string,
): Promise<WorkflowProgress> {
  return apiPost<WorkflowProgress>(`/agent/workflow/${companyId}/advance`, { workflow_key: workflowKey });
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
  // FormData upload — must use raw fetch (apiCall doesn't support multipart)
  const { getStoredSession } = await import("@/lib/session");
  const BASE = process.env.NEXT_PUBLIC_API_URL ?? process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";
  const s = getStoredSession();
  const headers: HeadersInit = s ? { Authorization: `Bearer ${s.token}` } : {};
  const formData = new FormData();
  formData.append("file", file);
  if (sessionId) formData.append("session_id", sessionId);

  const response = await fetch(`${BASE}/agent/upload/${companyId}`, {
    method: "POST",
    headers,
    body: formData,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to upload file: ${response.status} - ${text}`);
  }

  return response.json();
}
