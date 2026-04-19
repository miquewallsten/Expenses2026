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
} from "@/lib/session";

const API = process.env.NEXT_PUBLIC_API_BASE_URL;

// ── Types ──────────────────────────────────────────────────────────────────────

/**
 * The set of roles a user may hold.  The current session stores one role at a
 * time, but the context exposes an array so callers do not need to change when
 * multi-role support is introduced.
 */
export type UserRole = "employee" | "manager" | "accounting" | "admin";

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
    //
    // getCurrentUserId / getCurrentRole / getCurrentCompanyId each guard
    // against SSR (return null on the server).  In a real auth setup, replace
    // these with token claims.

    const rawId = getCurrentUserId();
    const rawRole = getCurrentRole();
    const rawCompany = getCurrentCompanyId();

    const numId = rawId ? parseInt(rawId, 10) : null;
    const numCompany = rawCompany ? parseInt(rawCompany, 10) : null;

    setUserId(isNaN(numId ?? NaN) ? null : numId);
    setUserIdStr(rawId);
    setCompanyId(isNaN(numCompany ?? NaN) ? null : numCompany);
    setRole(rawRole);

    // ── Fetch permissions ──────────────────────────────────────────────────
    //
    // The /roles/user-permissions endpoint is already wired in the API.
    // When userId is absent (unauthenticated), skip the fetch and resolve
    // with an empty permission set.

    if (!rawId) {
      setPermissionKeys([]);
      setLoading(false);
      return;
    }

    fetch(`${API}/roles/user-permissions/${rawId}`, {
      signal: ac.signal,
      headers: { "X-User-Id": rawId },
    })
      .then((r) => (r.ok ? r.json() : { permission_keys: [] }))
      .catch((err) => {
        if ((err as { name?: string }).name === "AbortError") return null;
        return { permission_keys: [] };
      })
      .then((data) => {
        if (data === null) return; // aborted
        setPermissionKeys(data.permission_keys ?? []);
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
    if (role === "admin") return ["employee", "manager", "accounting", "admin"];
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
      loading,
      hasPermission,
      hasRole,
      refresh,
    }),
    [userId, userIdStr, companyId, role, roles, permissionKeys, loading, hasPermission, hasRole, refresh],
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
