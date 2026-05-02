/**
 * Phase 3.2 — Centralized API client.
 *
 * Replaces ad-hoc `fetch(`${API}/...`)` patterns scattered across the app.
 * Provides typed errors, automatic auth headers, abort/timeout, and 401
 * auto-logout. Read this file before introducing yet another fetch wrapper.
 *
 * Usage:
 *   import { apiCall, HttpError } from "@/lib/api/client";
 *   const expenses = await apiCall<Expense[]>("/expenses");
 *
 * On 401 the client clears the session and redirects to /login.
 */

import { clearStoredSession, getStoredSession } from "@/lib/session";

const DEFAULT_TIMEOUT_MS = 30_000;

export class HttpError extends Error {
  status: number;
  code?: string;
  requestId?: string;
  /** Raw error body, when the server returned JSON. */
  body?: unknown;

  constructor(opts: {
    status: number;
    message: string;
    code?: string;
    requestId?: string;
    body?: unknown;
  }) {
    super(opts.message);
    this.name = "HttpError";
    this.status = opts.status;
    this.code = opts.code;
    this.requestId = opts.requestId;
    this.body = opts.body;
  }
}

export interface ApiCallOptions extends Omit<RequestInit, "body"> {
  /** JSON body — will be stringified and Content-Type set automatically. */
  json?: unknown;
  /** Raw body. Mutually exclusive with `json`. */
  body?: BodyInit | null;
  /** Timeout in ms (default 30s). */
  timeoutMs?: number;
  /** When false, skip the auth header (e.g. magic-link request). */
  authenticated?: boolean;
  /** When false, do NOT redirect on 401. Useful for the login page. */
  redirectOn401?: boolean;
  /** Optional Idempotency-Key header. */
  idempotencyKey?: string;
}

function getApiBase(): string {
  return (
    process.env.NEXT_PUBLIC_API_BASE_URL ||
    (typeof window !== "undefined"
      ? `${window.location.protocol}//${window.location.hostname}:8000`
      : "http://localhost:8000")
  );
}

function buildUrl(path: string): string {
  if (/^https?:\/\//.test(path)) return path;
  const base = getApiBase().replace(/\/+$/, "");
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${base}${p}`;
}

function handle401() {
  if (typeof window === "undefined") return;
  clearStoredSession();
  if (!window.location.pathname.startsWith("/login")) {
    window.location.href = "/login";
  }
}

/** Dedup in-flight identical GETs so siblings sharing a prop don't double-fetch. */
const inFlightGets = new Map<string, Promise<unknown>>();

export async function apiCall<T = unknown>(
  path: string,
  opts: ApiCallOptions = {},
): Promise<T> {
  const {
    json,
    body,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    authenticated = true,
    redirectOn401 = true,
    idempotencyKey,
    headers: callerHeaders,
    method = "GET",
    signal: externalSignal,
    ...rest
  } = opts;

  const url = buildUrl(path);
  const headers = new Headers(callerHeaders);
  if (json !== undefined) {
    headers.set("Content-Type", "application/json");
  }

  if (authenticated) {
    const session = getStoredSession();
    if (session?.token) {
      headers.set("Authorization", `Bearer ${session.token}`);
    } else if (typeof window !== "undefined") {
      // Dev fallback — the backend still honours X-User-Id header.
      const devId =
        localStorage.getItem("currentUserId") ||
        new URLSearchParams(window.location.search).get("userId");
      if (devId) headers.set("X-User-Id", devId);
    }
  }

  if (idempotencyKey) headers.set("Idempotency-Key", idempotencyKey);

  // Combine external signal with our timeout.
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  if (externalSignal) {
    if (externalSignal.aborted) controller.abort();
    else
      externalSignal.addEventListener("abort", () => controller.abort(), {
        once: true,
      });
  }

  const fetchInit: RequestInit = {
    ...rest,
    method,
    headers,
    body: json !== undefined ? JSON.stringify(json) : (body ?? undefined),
    signal: controller.signal,
  };

  // Dedup GET requests with no body.
  const dedupKey =
    method === "GET" && !json && !body
      ? `${url}::${headers.get("Authorization") || headers.get("X-User-Id") || ""}`
      : null;

  if (dedupKey && inFlightGets.has(dedupKey)) {
    clearTimeout(timeoutId);
    return inFlightGets.get(dedupKey) as Promise<T>;
  }

  const promise = (async () => {
    let response: Response;
    try {
      response = await fetch(url, fetchInit);
    } catch (err) {
      if (
        err instanceof DOMException &&
        err.name === "AbortError" &&
        controller.signal.aborted
      ) {
        throw new HttpError({
          status: 0,
          message: `Request timed out after ${timeoutMs}ms`,
          code: "timeout",
        });
      }
      throw new HttpError({
        status: 0,
        message: (err as Error).message || "Network error",
        code: "network",
      });
    } finally {
      clearTimeout(timeoutId);
    }

    const requestId =
      response.headers.get("X-Request-Id") ||
      response.headers.get("x-request-id") ||
      undefined;

    if (response.status === 401 && redirectOn401) {
      handle401();
    }

    let parsed: unknown = undefined;
    const ct = response.headers.get("Content-Type") || "";
    if (response.status !== 204) {
      if (ct.includes("application/json")) {
        try {
          parsed = await response.json();
        } catch {
          parsed = undefined;
        }
      } else {
        parsed = await response.text().catch(() => undefined);
      }
    }

    if (!response.ok) {
      // Phase 2.5 envelope: {ok:false, error:{code,message,...}}
      // Legacy: {detail: "..."}
      let code: string | undefined;
      let message = `HTTP ${response.status}`;
      if (parsed && typeof parsed === "object") {
        const p = parsed as Record<string, unknown>;
        const err = p.error as Record<string, unknown> | undefined;
        if (err && typeof err === "object") {
          code = typeof err.code === "string" ? err.code : undefined;
          if (typeof err.message === "string") message = err.message;
        } else if (typeof p.detail === "string") {
          message = p.detail;
        }
      }
      throw new HttpError({
        status: response.status,
        message,
        code,
        requestId,
        body: parsed,
      });
    }

    return parsed as T;
  })();

  if (dedupKey) {
    inFlightGets.set(dedupKey, promise);
    // Attach a no-op catch so the dedup-tracking chain itself never produces
    // an unhandled-rejection warning; callers still observe the original
    // rejection on the returned `promise`.
    promise
      .finally(() => inFlightGets.delete(dedupKey))
      .catch(() => undefined);
  }

  return promise;
}

/** Convenience wrapper for typed JSON POST. */
export function apiPost<T = unknown>(
  path: string,
  json?: unknown,
  opts: Omit<ApiCallOptions, "method" | "json"> = {},
): Promise<T> {
  return apiCall<T>(path, { ...opts, method: "POST", json });
}

/** Convenience wrapper for typed JSON PUT. */
export function apiPut<T = unknown>(
  path: string,
  json?: unknown,
  opts: Omit<ApiCallOptions, "method" | "json"> = {},
): Promise<T> {
  return apiCall<T>(path, { ...opts, method: "PUT", json });
}

/** Convenience wrapper for typed JSON PATCH. */
export function apiPatch<T = unknown>(
  path: string,
  json?: unknown,
  opts: Omit<ApiCallOptions, "method" | "json"> = {},
): Promise<T> {
  return apiCall<T>(path, { ...opts, method: "PATCH", json });
}

/** Convenience wrapper for DELETE. */
export function apiDelete<T = unknown>(
  path: string,
  opts: Omit<ApiCallOptions, "method"> = {},
): Promise<T> {
  return apiCall<T>(path, { ...opts, method: "DELETE" });
}
