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
