// Unified Agent v2 client — thin wrapper over /agent/* endpoints.
// Backend is synchronous JSON for now (no SSE); one POST per turn.

import { apiCall, apiPost } from "@/lib/api/client";

export type AgentPersona = "admin" | "employee" | "procurement" | "accounting" | "manager" | "super_admin";

export interface AgentToolCall {
  tool:    string;
  args:    Record<string, unknown>;
  result:  Record<string, unknown> | null;
  error:   string | null;
  status:  "ok" | "error" | "pending_confirmation";
}

export interface AgentPendingRef {
  receipt_id: string;
  tool_name:  string;
  summary?:   string;
}

export interface AgentChatResponse {
  ok:         boolean;
  session_id: string;
  content:    string;
  tool_calls: AgentToolCall[];
  pending:    AgentPendingRef[];
  error:      string | null;
}

export interface AgentReceipt {
  receipt_id:   string;
  company_id:   number;
  session_id:   string;
  tool_name:    string;
  args:         Record<string, unknown>;
  preview:      Record<string, unknown>;
  status:       "pending" | "confirmed" | "rejected" | "expired" | "failed";
  expires_at:   string | null;
  created_at:   string;
  confirmed_at: string | null;
  confirmed_by: string | null;
  result:       Record<string, unknown> | null;
  error:        string | null;
}

export interface AgentSessionMeta {
  session_id: string;
  persona:    AgentPersona;
  user_id:    number;
  created_at: string;
  updated_at: string;
  turn_count: number;
}

export interface AgentSessionDetail extends AgentSessionMeta {
  turns: Array<{
    role:       "user" | "assistant" | "tool";
    content?:   string;
    tool_name?: string;
    summary?:   string;
    created_at: string;
  }>;
}

export interface AgentUploadResponse {
  file_id:      string;
  filename:     string;
  content_type: string;
  size_bytes:   number;
  session_id:   string | null;
}

export async function agentChat(
  companyId: number,
  message: string,
  opts: { persona?: AgentPersona; sessionId?: string | null } = {},
): Promise<AgentChatResponse> {
  return apiPost<AgentChatResponse>(`/agent/chat/${companyId}`, {
    message,
    persona:    opts.persona ?? "admin",
    session_id: opts.sessionId ?? null,
  });
}

export async function getReceipt(companyId: number, receiptId: string): Promise<AgentReceipt> {
  return apiCall<AgentReceipt>(`/agent/receipts/${companyId}/${receiptId}`);
}

export async function confirmReceipt(companyId: number, receiptId: string): Promise<{
  ok: boolean;
  receipt: AgentReceipt;
  result: Record<string, unknown>;
}> {
  return apiPost("/agent/confirm", { receipt_id: receiptId, company_id: companyId });
}

export async function rejectReceipt(companyId: number, receiptId: string): Promise<{
  ok: boolean;
  receipt: AgentReceipt;
}> {
  return apiPost("/agent/reject", { receipt_id: receiptId, company_id: companyId });
}

export async function uploadAgentFile(
  companyId: number,
  file: File,
  sessionId?: string | null,
): Promise<AgentUploadResponse> {
  const form = new FormData();
  form.append("file", file);
  if (sessionId) form.append("session_id", sessionId);
  return apiCall<AgentUploadResponse>(`/agent/upload/${companyId}`, {
    method: "POST",
    body: form,
  });
}

export async function listSessions(companyId: number, limit = 20): Promise<AgentSessionMeta[]> {
  return apiCall<AgentSessionMeta[]>(`/agent/sessions/${companyId}?limit=${limit}`);
}

export async function getSession(companyId: number, sessionId: string): Promise<AgentSessionDetail> {
  return apiCall<AgentSessionDetail>(`/agent/sessions/${companyId}/${sessionId}`);
}