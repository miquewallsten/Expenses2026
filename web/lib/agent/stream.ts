// SSE wrapper for /agent/stream/{cid}.
//
// EventSource can't send custom Authorization headers, so we use fetch +
// ReadableStream and parse SSE frames manually. Yields one event per frame.

import { getAuthHeaders } from "@/lib/session";
import type { AgentPersona, AgentToolCall, AgentPendingRef } from "./client";

const API = process.env.NEXT_PUBLIC_API_BASE_URL;

export type StreamEventName =
  | "tool_call_start"
  | "tool_call_done"
  | "text_delta"
  | "final"
  | "cancelled";

export interface StreamEvent {
  event: StreamEventName;
  data: Record<string, unknown>;
}

export interface StreamFinalPayload {
  ok: boolean;
  error: string | null;
  session_id?: string;
  content: string;
  tool_calls: AgentToolCall[];
  pending: AgentPendingRef[];
}

export interface StreamOpts {
  persona?: AgentPersona;
  sessionId?: string | null;
  signal?: AbortSignal;
}

/** Async generator that yields SSE events from /agent/stream/{cid}. */
export async function* agentStream(
  companyId: number,
  prompt: string,
  opts: StreamOpts = {},
): AsyncGenerator<StreamEvent, void, void> {
  if (!API) throw new Error("NEXT_PUBLIC_API_BASE_URL is not configured");

  const params = new URLSearchParams({
    prompt,
    persona: opts.persona ?? "admin",
  });
  if (opts.sessionId) params.set("session_id", opts.sessionId);

  const res = await fetch(`${API}/agent/stream/${companyId}?${params}`, {
    method: "GET",
    headers: { Accept: "text/event-stream", ...getAuthHeaders() },
    signal: opts.signal,
  });

  if (!res.ok || !res.body) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = typeof body?.detail === "string" ? body.detail : JSON.stringify(body);
    } catch { /* leave statusText */ }
    throw new Error(`${res.status} ${detail}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buf = "";

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });

      // SSE frames are separated by \n\n.
      let sep: number;
      while ((sep = buf.indexOf("\n\n")) >= 0) {
        const frame = buf.slice(0, sep);
        buf = buf.slice(sep + 2);
        const evt = parseFrame(frame);
        if (evt) yield evt;
      }
    }
  } finally {
    try { reader.releaseLock(); } catch { /* noop */ }
  }
}

function parseFrame(frame: string): StreamEvent | null {
  let event: string | null = null;
  const dataLines: string[] = [];
  for (const raw of frame.split("\n")) {
    if (!raw || raw.startsWith(":")) continue;
    if (raw.startsWith("event:")) {
      event = raw.slice(6).trim();
    } else if (raw.startsWith("data:")) {
      dataLines.push(raw.slice(5).trim());
    }
  }
  if (!event || dataLines.length === 0) return null;
  try {
    const data = JSON.parse(dataLines.join("\n")) as Record<string, unknown>;
    return { event: event as StreamEventName, data };
  } catch {
    return null;
  }
}
