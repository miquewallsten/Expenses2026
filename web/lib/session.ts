// ── Magic Link / JWT session ───────────────────────────────────────────────

export interface StoredSession {
  token: string;
  userId: number;
  email: string;
  role: string;
  companyId: number;
  fullName: string;
  isSuperAdmin?: boolean;
}

/**
 * All localStorage reads in this file are safe because:
 * - These functions are only called from useEffect callbacks or event handlers
 *   (client-only contexts where localStorage is always available).
 * - The HydrationGuard in layout.tsx ensures no component renders until
 *   after mount, so these never run during SSR.
 */

export function getStoredSession(): StoredSession | null {
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
  const s = getStoredSession();
  return s ? String(s.userId) : localStorage.getItem("currentUserId");
}

export function setCurrentUserId(userId: string): void {
  localStorage.setItem("currentUserId", userId);
}

export function clearCurrentUserId(): void {
  localStorage.removeItem("currentUserId");
}

/** Normalize role aliases so the frontend always uses canonical names. */
function normalizeRole(role: string | null): string | null {
  if (!role) return null;
  // "accountant" is an alias for "accounting" (some DB rows use the shorter form)
  if (role === "accountant") return "accounting";
  return role;
}

export function getCurrentRole(): string | null {
  const s = getStoredSession();
  return normalizeRole(s ? s.role : localStorage.getItem("currentUserRole"));
}

export function setCurrentRole(role: string): void {
  localStorage.setItem("currentUserRole", role);
}

export function getCurrentCompanyId(): string | null {
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

/** Returns the correct Authorization headers for API calls. */
export function getAuthHeaders(): Record<string, string> {
  const stored = getStoredSession();
  if (stored?.token) {
    if (isSessionExpired(stored.token)) {
      clearSession();
      return {};
    }
    return { Authorization: `Bearer ${stored.token}` };
  }
  const userId = getCurrentUserId() ?? "1";
  return { "X-User-Id": userId };
}

/** Returns true if a JWT's exp claim has elapsed. */
export function isSessionExpired(token: string): boolean {
  if (!token) return true;
  const parts = token.split(".");
  if (parts.length !== 3) return true;
  try {
    const payload = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));
    if (typeof payload.exp !== "number") return false;
    return payload.exp * 1000 < Date.now();
  } catch {
    return true;
  }
}

/** Decodes a JWT payload. Returns null if the token is malformed. */
export function decodeJwtPayload(token: string): Record<string, unknown> | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const json = atob(parts[1].replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}
