// Unified Agent v2 client — thin wrapper over /agent/* endpoints.
// Backend is synchronous JSON for now (no SSE); one POST per turn.

import { getAuthHeaders } from "@/lib/session";

const API = process.env.NEXT_PUBLIC_API_BASE_URL;

export type AgentPersona = "admin" | "employee" | "procurement" | "finance_manager" | "manager";

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

function base(): string {
  if (!API) throw new Error("NEXT_PUBLIC_API_BASE_URL is not configured");
  return API;
}

async function toJsonOrThrow<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = typeof body?.detail === "string" ? body.detail : JSON.stringify(body);
    } catch { /* leave statusText */ }
    throw new Error(`${res.status} ${detail}`);
  }
  return res.json() as Promise<T>;
}

export async function agentChat(
  companyId: number,
  message: string,
  opts: { persona?: AgentPersona; sessionId?: string | null } = {},
): Promise<AgentChatResponse> {
  const res = await fetch(`${base()}/agent/chat/${companyId}`, {
    method:  "POST",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body:    JSON.stringify({
      message,
      persona:    opts.persona ?? "admin",
      session_id: opts.sessionId ?? null,
    }),
  });
  return toJsonOrThrow<AgentChatResponse>(res);
}

export async function getReceipt(companyId: number, receiptId: string): Promise<AgentReceipt> {
  const res = await fetch(`${base()}/agent/receipts/${companyId}/${receiptId}`, {
    headers: { ...getAuthHeaders() },
  });
  return toJsonOrThrow<AgentReceipt>(res);
}

export async function confirmReceipt(companyId: number, receiptId: string): Promise<{
  ok: boolean;
  receipt: AgentReceipt;
  result: Record<string, unknown>;
}> {
  const res = await fetch(`${base()}/agent/confirm`, {
    method:  "POST",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body:    JSON.stringify({ receipt_id: receiptId, company_id: companyId }),
  });
  return toJsonOrThrow(res);
}

export async function rejectReceipt(companyId: number, receiptId: string): Promise<{
  ok: boolean;
  receipt: AgentReceipt;
}> {
  const res = await fetch(`${base()}/agent/reject`, {
    method:  "POST",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body:    JSON.stringify({ receipt_id: receiptId, company_id: companyId }),
  });
  return toJsonOrThrow(res);
}

export async function uploadAgentFile(
  companyId: number,
  file: File,
  sessionId?: string | null,
): Promise<AgentUploadResponse> {
  const form = new FormData();
  form.append("file", file);
  if (sessionId) form.append("session_id", sessionId);
  const res = await fetch(`${base()}/agent/upload/${companyId}`, {
    method:  "POST",
    headers: { ...getAuthHeaders() },    // do NOT set Content-Type — browser adds boundary
    body:    form,
  });
  return toJsonOrThrow<AgentUploadResponse>(res);
}

export async function listSessions(companyId: number, limit = 20): Promise<AgentSessionMeta[]> {
  const res = await fetch(`${base()}/agent/sessions/${companyId}?limit=${limit}`, {
    headers: { ...getAuthHeaders() },
  });
  return toJsonOrThrow<AgentSessionMeta[]>(res);
}

export async function getSession(companyId: number, sessionId: string): Promise<AgentSessionDetail> {
  const res = await fetch(`${base()}/agent/sessions/${companyId}/${sessionId}`, {
    headers: { ...getAuthHeaders() },
  });
  return toJsonOrThrow<AgentSessionDetail>(res);
}
