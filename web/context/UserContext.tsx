"use client";

/**
 * UserContext — user identity, role, and permissions.
 *
 * Fetches from /access/{userId}/profile (resolved access profile) with fallback
 * to /users/{userId} + /roles/user-permissions/{userId} if the access endpoint
 * is unavailable.
 *
 * Auto-refreshes on window focus and every 60s so admin changes propagate
 * without a page reload.
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
  isSessionExpired,
  clearStoredSession,
} from "@/lib/session";
import type { UserCapabilities, UserRole } from "@/types";
import { apiCall } from "@/lib/api/client";
import { DEFAULT_USER_CAPABILITIES } from "@/types";

const CAPABILITIES_POLL_INTERVAL = 60_000; // 60 seconds

export interface UserContextValue {
  userId: number | null;
  userIdStr: string | null;
  companyId: number | null;
  role: string | null;
  roles: UserRole[];
  permissionKeys: string[];
  capabilities: UserCapabilities;
  enabledModules: string[];
  displayName: string | null;
  loading: boolean;
  hasPermission: (key: string) => boolean;
  hasRole: (...roles: UserRole[]) => boolean;
  refresh: () => void;
}

const UserContext = createContext<UserContextValue | null>(null);

export function UserProvider({ children }: { children: ReactNode }) {
  const [userId, setUserId] = useState<number | null>(null);
  const [userIdStr, setUserIdStr] = useState<string | null>(null);
  const [companyId, setCompanyId] = useState<number | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [permissionKeys, setPermissionKeys] = useState<string[]>([]);
  const [capabilities, setCapabilities] = useState<UserCapabilities>(DEFAULT_USER_CAPABILITIES);
  const [enabledModules, setEnabledModules] = useState<string[]>([]);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshToken, setRefreshToken] = useState(0);

  const refresh = useCallback(() => setRefreshToken((n) => n + 1), []);
  const abortRef = useRef<AbortController | null>(null);

  // ── Fetch user data ──────────────────────────────────────────────────────
  // Try /access/{id}/profile first, fall back to /users/{id} + /roles/user-permissions/{id}

  const fetchUserData = useCallback((rawId: string, bearerToken: string | null, signal?: AbortSignal) => {
    // Check JWT expiry before making any request
    if (bearerToken && isSessionExpired(bearerToken)) {
      clearStoredSession();
      if (!window.location.pathname.startsWith("/login")) {
        window.location.href = "/login";
      }
      return;
    }

    const authOpts = { signal, authenticated: !!bearerToken };

    // Try the access profile endpoint first
    apiCall<{
      user_id: number;
      company_id: number;
      email: string;
      full_name: string;
      role: string;
      is_active: boolean;
      is_super_admin: boolean;
      capabilities: Record<string, boolean>;
      permission_keys: string[];
      enabled_modules: string[];
      auto_corrected: Record<string, string>;
      delegates_for_user_id: number | null;
      delegates_for_user_name: string | null;
    }>(`/access/${rawId}/profile`, authOpts)
      .then((data) => {
        if (!data || !data.user_id) return;
        // Sync role/companyId from API to correct stale localStorage values
        if (data.role) setRole(data.role);
        if (data.company_id) setCompanyId(data.company_id);
        setDisplayName(data.full_name ?? null);
        setPermissionKeys(data.permission_keys ?? []);
        setEnabledModules(data.enabled_modules ?? []);
        setCapabilities({
          can_create_expenses:           data.capabilities?.can_create_expenses           ?? true,
          can_create_corporate_expenses: data.capabilities?.can_create_corporate_expenses ?? false,
          can_invoice_corporation:       data.capabilities?.can_invoice_corporation       ?? false,
          is_amex_reconciler:            data.capabilities?.is_amex_reconciler            ?? false,
          is_subcontractor:             data.capabilities?.is_subcontractor              ?? false,
          requires_time_tracking:       data.capabilities?.requires_time_tracking        ?? false,
          has_executive_reporting:      data.capabilities?.has_executive_reporting       ?? false,
          can_access_accounting:        data.capabilities?.can_access_accounting         ?? false,
          can_view_analytics:           data.capabilities?.can_view_analytics            ?? false,
          delegates_for_user_id:        data.delegates_for_user_id                      ?? null,
          delegates_for_user_name:      data.delegates_for_user_name                    ?? null,
          delegation_starts_at:         null,
          delegation_ends_at:           null,
        });
        setLoading(false);
      })
      .catch(() => {
        // Access endpoint not available — use legacy endpoints
        // Use redirectOn401: false so a 401 here doesn't trigger auto-logout
        // (the activity timeout handles session expiry)
        const safeOpts = { signal, authenticated: !!bearerToken, redirectOn401: false };

        Promise.all([
          apiCall<{ permission_keys: string[] }>(`/roles/user-permissions/${rawId}`, safeOpts)
            .catch(() => ({ permission_keys: [] })),
          apiCall<Record<string, any>>(`/users/${rawId}`, safeOpts)
            .catch(() => null),
        ]).then(([permData, userData]) => {
          if (permData) setPermissionKeys(permData?.permission_keys ?? []);
          if (userData) {
            // Sync role/companyId from API to correct stale localStorage values
            if (userData.role) setRole(userData.role);
            if (userData.company_id) setCompanyId(userData.company_id);
            setDisplayName(userData.full_name ?? null);
            setCapabilities({
              can_create_expenses:           userData.can_create_expenses           ?? true,
              can_create_corporate_expenses: userData.can_create_corporate_expenses ?? false,
              can_invoice_corporation:       userData.can_invoice_corporation       ?? false,
              is_amex_reconciler:            userData.is_amex_reconciler            ?? false,
              is_subcontractor:             userData.is_subcontractor              ?? false,
              requires_time_tracking:       userData.requires_time_tracking        ?? false,
              has_executive_reporting:      userData.has_executive_reporting       ?? false,
              can_access_accounting:        userData.can_access_accounting          ?? false,
              can_view_analytics:           userData.can_view_analytics            ?? false,
              delegates_for_user_id:        userData.delegates_for_user_id         ?? null,
              delegates_for_user_name:      userData.delegates_for_user_name       ?? null,
              delegation_starts_at:         userData.delegation_starts_at          ?? null,
              delegation_ends_at:           userData.delegation_ends_at            ?? null,
            });
            // Derive enabled modules from user capabilities and company config
            const mods: string[] = [];
            if (userData.can_create_expenses !== false) mods.push('expenses');
            if (userData.requires_time_tracking) mods.push('time_allocation');
            if (userData.can_access_accounting) mods.push('accounting');
            if (userData.is_amex_reconciler) mods.push('amex_reconciliation');
            setEnabledModules(prev => prev.length > 0 ? prev : mods);
          }
          setLoading(false);
        }).catch(() => {
          // Both endpoints failed — keep whatever we have
          setLoading(false);
        });
      });
  }, []);

  // ── Initial load ────────────────────────────────────────────────────────

  useEffect(() => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    setLoading(true);

    const stored = getStoredSession();
    const rawId = stored ? String(stored.userId) : getCurrentUserId();
    const rawRole = stored ? (stored.role as string) : getCurrentRole();
    const rawCompany = stored ? String(stored.companyId) : getCurrentCompanyId();
    const bearerToken = stored?.token ?? null;

    const numId      = rawId      ? parseInt(rawId, 10)      : null;
    const numCompany = rawCompany ? parseInt(rawCompany, 10) : null;

    setUserId(isNaN(numId ?? NaN) ? null : numId);
    setUserIdStr(rawId);
    setCompanyId(isNaN(numCompany ?? NaN) ? null : numCompany);
    setRole(rawRole);

    if (!rawId) {
      setPermissionKeys([]);
      setCapabilities(DEFAULT_USER_CAPABILITIES);
      setEnabledModules([]);
      setLoading(false);
      return;
    }

    fetchUserData(rawId, bearerToken, ac.signal);

    return () => {
      ac.abort();
    };
  }, [refreshToken, fetchUserData]);

  // ── Auto-refresh every 60s ──────────────────────────────────────────────

  useEffect(() => {
    if (!userIdStr) return;
    const stored = getStoredSession();
    const bearerToken = stored?.token ?? null;
    const interval = setInterval(() => {
      fetchUserData(userIdStr, bearerToken);
    }, CAPABILITIES_POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [userIdStr, fetchUserData]);

  // ── Refresh on window focus ─────────────────────────────────────────────

  useEffect(() => {
    if (!userIdStr) return;
    const stored = getStoredSession();
    const bearerToken = stored?.token ?? null;
    const onFocus = () => {
      fetchUserData(userIdStr, bearerToken);
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [userIdStr, fetchUserData]);

  // ── Derived helpers ──────────────────────────────────────────────────────

  const roles = useMemo<UserRole[]>(() => {
    if (!role) return [];
    if (role === "admin" || role === "super_admin") return ["employee", "manager", "accounting", "admin", "executive", "secretary"];
    if (role === "accountant") return ["accountant", "accounting"] as UserRole[];
    return [role as UserRole];
  }, [role]);

  const hasPermission = useCallback(
    (key: string) => role === "admin" || role === "super_admin" || permissionKeys.includes(key),
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
      enabledModules,
      displayName,
      loading,
      hasPermission,
      hasRole,
      refresh,
    }),
    [userId, userIdStr, companyId, role, roles, permissionKeys, capabilities, enabledModules, displayName, loading, hasPermission, hasRole, refresh],
  );

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
}

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
