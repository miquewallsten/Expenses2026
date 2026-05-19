"use client";

/**
 * PortalConfigContext — fetches and provides the company portal config.
 *
 * Extracted from MyWorkContext.tsx to separate config fetching from
 * module routing and selection state.
 *
 * Provider hierarchy:
 *   <UserProvider>
 *     <PortalConfigProvider>   ← this
 *       <MyWorkProvider>
 *         <shell / modules>
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
import { useUserContext } from "@/context/UserContext";
import { apiCall } from "@/lib/api/client";
import type { PortalConfig, ExpensePolicy } from "@/types";

// ── Context value ─────────────────────────────────────────────────────────────

export interface PortalConfigContextValue {
  /** Full portal config as returned by the API. Null while loading. */
  effectiveConfig: PortalConfig | null;

  /** True while the portal config fetch is in flight */
  configLoading: boolean;

  /** Whether the manager approval flow is active */
  managerFlowEnabled: boolean;

  /** Whether the accounting review flow is active */
  accountingFlowEnabled: boolean;

  /** Which dimensions are active for expense allocation */
  allocationDimensions: string[];

  /** Whether split allocations are permitted */
  allowSplitAllocations: boolean;
}

// ── Context object ────────────────────────────────────────────────────────────

const PortalConfigContext = createContext<PortalConfigContextValue | null>(null);

// ── Provider ──────────────────────────────────────────────────────────────────

export function PortalConfigProvider({ children }: { children: ReactNode }) {
  const user = useUserContext();
  const [portalConfig, setPortalConfig] = useState<PortalConfig | null>(null);
  const [configLoading, setConfigLoading] = useState(true);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const cid = user.companyId;
    if (!cid) {
      setPortalConfig(null);
      setConfigLoading(false);
      return;
    }

    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    setConfigLoading(true);

    apiCall<PortalConfig>(`/admin/portal-config/${cid}`, { signal: ac.signal })
      .then((cfg) => {
        setPortalConfig(cfg ?? null);
        setConfigLoading(false);
      })
      .catch((err) => {
        if ((err as { name?: string }).name === "AbortError") return;
        setPortalConfig(null);
        setConfigLoading(false);
      });

    return () => ac.abort();
  }, [user.companyId]);

  // ── Derived config scalars ───────────────────────────────────────────────

  const derived = portalConfig?.derived ?? null;
  const managerFlowEnabled = derived?.manager_flow_enabled ?? false;
  const accountingFlowEnabled = derived?.accounting_flow_enabled ?? false;
  const allocationDimensions = derived?.allocation_dimensions ?? [];
  const allowSplitAllocations = derived?.allow_split_allocations ?? false;

  const value = useMemo<PortalConfigContextValue>(
    () => ({
      effectiveConfig: portalConfig,
      configLoading,
      managerFlowEnabled,
      accountingFlowEnabled,
      allocationDimensions,
      allowSplitAllocations,
    }),
    [portalConfig, configLoading, managerFlowEnabled, accountingFlowEnabled,
     allocationDimensions, allowSplitAllocations],
  );

  return (
    <PortalConfigContext.Provider value={value}>
      {children}
    </PortalConfigContext.Provider>
  );
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function usePortalConfigContext(): PortalConfigContextValue {
  const ctx = useContext(PortalConfigContext);
  if (!ctx) {
    throw new Error(
      "usePortalConfigContext() must be used inside a <PortalConfigProvider>.",
    );
  }
  return ctx;
}
