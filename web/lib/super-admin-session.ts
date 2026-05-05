/**
 * Super Admin session — completely independent from tenant authentication.
 *
 * Stored in localStorage as "superAdminSession" (separate from "session").
 * Uses a separate JWT issued by /auth/super-admin/login.
 */

export interface SuperAdminSession {
  token: string;
  userId: number;
  email: string;
  name: string;
}

const STORAGE_KEY = "superAdminSession";

export function getSuperAdminSession(): SuperAdminSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as SuperAdminSession) : null;
  } catch {
    return null;
  }
}

export function storeSuperAdminSession(session: SuperAdminSession): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

export function clearSuperAdminSession(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export function isSuperAdminSessionExpired(token: string): boolean {
  if (!token) return true;
  const parts = token.split(".");
  if (parts.length !== 3) return true;
  try {
    const payload = JSON.parse(
      atob(parts[1].replace(/-/g, "+").replace(/_/g, "/"))
    );
    if (typeof payload.exp !== "number") return false;
    return payload.exp * 1000 < Date.now();
  } catch {
    return true;
  }
}

export function getSuperAdminAuthHeaders(): Record<string, string> {
  const session = getSuperAdminSession();
  if (!session?.token || isSuperAdminSessionExpired(session.token)) {
    clearSuperAdminSession();
    return {};
  }
  return { Authorization: `Bearer ${session.token}` };
}