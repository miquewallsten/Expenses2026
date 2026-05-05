/**
 * Super Admin API client
 * Uses independent authentication stored in superAdminSession
 */

import { getSuperAdminSession, clearSuperAdminSession } from "@/lib/super-admin-session";

const DEFAULT_TIMEOUT_MS = 30_000;

export class HttpError extends Error {
  status: number;
  code?: string;
  requestId?: string;
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

export interface SuperAdminApiCallOptions extends Omit<RequestInit, "body"> {
  json?: unknown;
  body?: BodyInit | null;
  timeoutMs?: number;
  authenticated?: boolean;
  redirectOn401?: boolean;
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
  clearSuperAdminSession();
  if (!window.location.pathname.startsWith("/super-admin/login")) {
    window.location.href = "/super-admin/login";
  }
}

export async function superAdminApiCall<T = unknown>(
  path: string,
  opts: SuperAdminApiCallOptions = {},
): Promise<T> {
  const {
    json,
    body,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    authenticated = true,
    redirectOn401 = true,
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
    const session = getSuperAdminSession();
    if (session?.token) {
      headers.set("Authorization", `Bearer ${session.token}`);
    }
  }

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

  let response: Response;
  try {
    response = await fetch(url, fetchInit);
  } catch (err) {
    clearTimeout(timeoutId);
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
}

export function superAdminPost<T = unknown>(
  path: string,
  json?: unknown,
  opts: Omit<SuperAdminApiCallOptions, "method" | "json"> = {},
): Promise<T> {
  return superAdminApiCall<T>(path, { ...opts, method: "POST", json });
}

export function superAdminPut<T = unknown>(
  path: string,
  json?: unknown,
  opts: Omit<SuperAdminApiCallOptions, "method" | "json"> = {},
): Promise<T> {
  return superAdminApiCall<T>(path, { ...opts, method: "PUT", json });
}

export function superAdminPatch<T = unknown>(
  path: string,
  json?: unknown,
  opts: Omit<SuperAdminApiCallOptions, "method" | "json"> = {},
): Promise<T> {
  return superAdminApiCall<T>(path, { ...opts, method: "PATCH", json });
}

export function superAdminDelete<T = unknown>(
  path: string,
  opts: Omit<SuperAdminApiCallOptions, "method"> = {},
): Promise<T> {
  return superAdminApiCall<T>(path, { ...opts, method: "DELETE" });
}