"use client";

/**
 * UserContext — user identity, role, and permissions.
 *
 * Current implementation:
 *   - userId / companyId / role are read from localStorage (via lib/session.ts)
 *   - permissionKeys are fetched from the already-wired /roles/user-permissions
 *     endpoint once on mount and whenever userId changes
 *
 * Future-auth migration path:
 *   1. Replace the localStorage reads with tokens / JWT claims from your auth
 *      provider (e.g. NextAuth session, Clerk, Auth0).
 *   2. The `UserProvider` contract — and all `useUserContext()` call sites —
 *      do not need to change; only the data sources inside the provider change.
 *   3. If the auth token already contains permission scopes, remove the
 *      permissionKeys fetch and map scopes into the same string[] shape.
 *
 * The provider intentionally does NOT block rendering: it starts with
 * `loading: true` and resolves asynchronously.  Components must handle
 * the loading state themselves or wait via the `loading` flag.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  getCurrentUserId,
  getCurrentRole,
  getCurrentCompanyId,
  getStoredSession,
} from "@/lib/session";
import type { UserCapabilities, UserRole } from "@/types";
import { DEFAULT_USER_CAPABILITIES } from "@/types";

const API = process.env.NEXT_PUBLIC_API_BASE_URL;

export interface UserContextValue {
  /** Numeric user id (null while unauthenticated or loading) */
  userId: number | null;
  /** String user id as sent in the X-User-Id header */
  userIdStr: string | null;
  /** Company the user belongs to */
  companyId: number | null;
  /**
   * The user's current primary role string.  Null when session has no role.
   * Kept as the raw string so callers handle unknown future roles gracefully.
   */
  role: string | null;
  /**
   * All roles the user holds.  Currently derived from the single `role`
   * session value; will map to a real roles array once multi-role is supported.
   */
  roles: UserRole[];
  /**
   * Flat list of fine-grained permission keys fetched from
   * /roles/user-permissions/:userId.  Empty while loading or when the user
   * has no explicit permissions beyond what their role grants.
   */
  permissionKeys: string[];
  /** Per-user capability flags configured by admin */
  capabilities: UserCapabilities;
  /** Full name of the authenticated user — null while loading */
  displayName: string | null;
  /** True while the initial identity / permissions load is in flight */
  loading: boolean;
  /**
   * Check a single permission key.
   * Returns true when the key is in `permissionKeys` OR when the user is an
   * admin (admins implicitly pass all permission checks).
   */
  hasPermission: (key: string) => boolean;
  /** Check whether the user holds a specific role */
  hasRole: (...roles: UserRole[]) => boolean;
  /**
   * Re-read session values and re-fetch permissions.  Call this after a
   * login/logout or when impersonation changes.
   */
  refresh: () => void;
}

// ── Context ────────────────────────────────────────────────────────────────────

const UserContext = createContext<UserContextValue | null>(null);

// ── Provider ───────────────────────────────────────────────────────────────────

export function UserProvider({ children }: { children: ReactNode }) {
  const [userId, setUserId] = useState<number | null>(null);
  const [userIdStr, setUserIdStr] = useState<string | null>(null);
  const [companyId, setCompanyId] = useState<number | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [permissionKeys, setPermissionKeys] = useState<string[]>([]);
  const [capabilities, setCapabilities] = useState<UserCapabilities>(DEFAULT_USER_CAPABILITIES);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Monotonically increasing refresh token — increment to trigger a full reload.
  const [refreshToken, setRefreshToken] = useState(0);

  const refresh = useCallback(() => setRefreshToken((n) => n + 1), []);

  // Track in-flight fetch so we can cancel on refresh / unmount.
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    // Cancel any previous in-flight fetch.
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    setLoading(true);

    // ── Read identity from session ─────────────────────────────────────────
    // Prefer the JWT session written by magic link verify; fall back to the
    // legacy localStorage values for backwards compatibility.

    const stored = getStoredSession();

    const rawId      = stored ? String(stored.userId) : getCurrentUserId();
    const rawRole    = stored ? stored.role            : getCurrentRole();
    const rawCompany = stored ? String(stored.companyId) : getCurrentCompanyId();
    const bearerToken = stored?.token ?? null;

    const numId      = rawId      ? parseInt(rawId, 10)      : null;
    const numCompany = rawCompany ? parseInt(rawCompany, 10) : null;

    setUserId(isNaN(numId ?? NaN) ? null : numId);
    setUserIdStr(rawId);
    setCompanyId(isNaN(numCompany ?? NaN) ? null : numCompany);
    setRole(rawRole);

    // ── Fetch permissions ──────────────────────────────────────────────────
    if (!rawId) {
      setPermissionKeys([]);
      setCapabilities(DEFAULT_USER_CAPABILITIES);
      setLoading(false);
      return;
    }

    const headers: Record<string, string> = bearerToken
      ? { Authorization: `Bearer ${bearerToken}` }
      : { "X-User-Id": rawId };

    Promise.all([
      fetch(`${API}/roles/user-permissions/${rawId}`, { signal: ac.signal, headers })
        .then((r) => (r.ok ? r.json() : { permission_keys: [] }))
        .catch((err) => ((err as { name?: string }).name === "AbortError" ? null : { permission_keys: [] })),
      fetch(`${API}/users/${rawId}`, { signal: ac.signal, headers })
        .then((r) => (r.ok ? r.json() : null))
        .catch((err) => ((err as { name?: string }).name === "AbortError" ? null : null)),
    ]).then(([permData, userData]) => {
      if (permData === null && userData === null) return; // both aborted
      if (permData !== null) setPermissionKeys(permData?.permission_keys ?? []);
      if (userData) {
        setDisplayName(userData.full_name ?? null);
        setCapabilities({
          can_create_expenses:         userData.can_create_expenses         ?? true,
          can_create_corporate_expenses: userData.can_create_corporate_expenses ?? false,
          can_invoice_corporation:     userData.can_invoice_corporation     ?? false,
          is_amex_reconciler:          userData.is_amex_reconciler          ?? false,
          requires_time_tracking:      userData.requires_time_tracking      ?? false,
          has_executive_reporting:     userData.has_executive_reporting     ?? false,
          can_access_accounting:       userData.can_access_accounting        ?? false,
          can_view_analytics:          userData.can_view_analytics          ?? false,
          delegates_for_user_id:       userData.delegates_for_user_id       ?? null,
          delegates_for_user_name:     userData.delegates_for_user_name     ?? null,
        });
      }
      setLoading(false);
    });

    return () => {
      ac.abort();
    };
  }, [refreshToken]);

  // ── Derived helpers ────────────────────────────────────────────────────────

  const roles = useMemo<UserRole[]>(() => {
    if (!role) return [];
    // Admins implicitly hold all roles so role-checks work without listing them
    // all.  Once the API returns a real roles array, replace this derivation.
    if (role === "admin") return ["employee", "manager", "accounting", "admin", "executive", "secretary"];
    return [role as UserRole];
  }, [role]);

  const hasPermission = useCallback(
    (key: string) => role === "admin" || permissionKeys.includes(key),
    [role, permissionKeys],
  );

  const hasRole = useCallback(
    (...check: UserRole[]) => check.some((r) => roles.includes(r)),
    [roles],
  );

  const value = useMemo<UserContextValue>(
    () => ({
      userId,
      userIdStr,
      companyId,
      role,
      roles,
      permissionKeys,
      capabilities,
      displayName,
      loading,
      hasPermission,
      hasRole,
      refresh,
    }),
    [userId, userIdStr, companyId, role, roles, permissionKeys, capabilities, displayName, loading, hasPermission, hasRole, refresh],
  );

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
}

// ── Hook ───────────────────────────────────────────────────────────────────────

/**
 * Returns the current user context.
 * Must be called inside a `<UserProvider>` tree.
 * Throws a descriptive error if used outside the provider so misconfiguration
 * surfaces immediately in development.
 */
export function useUserContext(): UserContextValue {
  const ctx = useContext(UserContext);
  if (!ctx) {
    throw new Error(
      "useUserContext() must be used inside a <UserProvider>. " +
        "Add <UserProvider> to your root layout.",
    );
  }
  return ctx;
}
