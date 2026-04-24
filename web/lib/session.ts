// ── Magic Link / JWT session ───────────────────────────────────────────────

export interface StoredSession {
  token: string;
  userId: number;
  email: string;
  role: string;
  companyId: number;
  fullName: string;
}

export function getStoredSession(): StoredSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem("session");
    return raw ? (JSON.parse(raw) as StoredSession) : null;
  } catch {
    return null;
  }
}

export function storeSession(session: StoredSession): void {
  localStorage.setItem("session", JSON.stringify(session));
}

export function clearStoredSession(): void {
  localStorage.removeItem("session");
}

// ── Legacy helpers (kept for compatibility during transition) ─────────────

export function getCurrentUserId(): string | null {
  if (typeof window === "undefined") return null;
  const s = getStoredSession();
  return s ? String(s.userId) : localStorage.getItem("currentUserId");
}

export function setCurrentUserId(userId: string): void {
  localStorage.setItem("currentUserId", userId);
}

export function clearCurrentUserId(): void {
  localStorage.removeItem("currentUserId");
}

export function getCurrentRole(): string | null {
  if (typeof window === "undefined") return null;
  const s = getStoredSession();
  return s ? s.role : localStorage.getItem("currentUserRole");
}

export function setCurrentRole(role: string): void {
  localStorage.setItem("currentUserRole", role);
}

export function getCurrentCompanyId(): string | null {
  if (typeof window === "undefined") return null;
  const s = getStoredSession();
  return s ? String(s.companyId) : localStorage.getItem("currentCompanyId");
}

export function setCurrentCompanyId(companyId: string): void {
  localStorage.setItem("currentCompanyId", companyId);
}

export function clearSession(): void {
  clearStoredSession();
  localStorage.removeItem("currentUserId");
  localStorage.removeItem("currentUserRole");
  localStorage.removeItem("currentCompanyId");
}

/** Returns the correct Authorization headers for API calls.
 *  Prefers Bearer JWT (from stored session); falls back to X-User-Id in dev.
 *  If the JWT is expired, clears the session and redirects to login. */
export function getAuthHeaders(): Record<string, string> {
  const stored = getStoredSession();
  if (stored?.token) {
    if (isSessionExpired(stored.token)) {
      clearSession();
      if (typeof window !== "undefined") {
        window.location.href = "/auth/login";
      }
      return {};
    }
    return { Authorization: `Bearer ${stored.token}` };
  }
  const userId = getCurrentUserId() ?? "1";
  return { "X-User-Id": userId };
}

/** Decode a JWT payload without verifying the signature.
 *  Returns null on malformed input. */
export function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    // base64url → base64
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    const json =
      typeof atob === "function"
        ? atob(padded)
        : Buffer.from(padded, "base64").toString("utf-8");
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** True if the JWT has an `exp` claim that has passed (with 30s clock skew). */
export function isSessionExpired(token: string, skewSeconds = 30): boolean {
  const payload = decodeJwtPayload(token);
  if (!payload) return true;
  const exp = payload.exp;
  if (typeof exp !== "number") return false;
  const nowSec = Math.floor(Date.now() / 1000);
  return exp < nowSec + skewSeconds;
}

/** Fetch wrapper that auto-clears the session on 401. */
export async function authFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const headers = {
    ...(init?.headers || {}),
    ...getAuthHeaders(),
  };
  const res = await fetch(input, { ...init, headers });
  if (res.status === 401) {
    clearSession();
    if (typeof window !== "undefined") {
      window.location.href = "/auth/login";
    }
  }
  return res;
}
