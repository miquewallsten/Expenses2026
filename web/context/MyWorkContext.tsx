"use client";

/**
 * MyWorkContext — combined UI decision context for the My Work portal.
 *
 * Aggregates:
 *   - User identity / roles / permissions  (from UserContext)
 *   - Company portal config                (fetched from /admin/portal-config)
 *   - Active module selection              (local state, driven by nav)
 *   - Selected work item state             (expense / report; set by modules)
 *
 * Everything that drives a UI visibility or routing decision should be
 * derived here and consumed via `useMyWorkContext()`.  UI components must NOT
 * contain their own visibility logic.
 *
 * Provider hierarchy:
 *   <UserProvider>            ← identity / permissions
 *     <MyWorkProvider>        ← portal config + module state
 *       <shell / modules>
 *
 * When portal config hasn't loaded yet (`configLoading: true`) the
 * `visibleModules` list is empty and `effectiveConfig` is null.  Consumers
 * should gate on `configLoading` before rendering module content.
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
import {
  MY_WORK_MODULES,
  getVisibleModules,
} from "@/modules/my-work/moduleRegistry";
import type {
  PortalConfig,
  ExpensePolicy,
  MyWorkModule,
  ModuleVisibilityContext,
  SelectedWorkItem,
} from "@/types";
import { EMPTY_SELECTED_WORK_ITEM } from "@/types";

const API = process.env.NEXT_PUBLIC_API_BASE_URL;

// ── Context value ─────────────────────────────────────────────────────────────

export interface MyWorkContextValue {
  // ── Module routing ──────────────────────────────────────────────────────

  /** Modules that are visible for the current user + company config */
  visibleModules: MyWorkModule[];

  /** The module currently shown in the center workspace area */
  activeModule: MyWorkModule | null;

  /** Navigate to a different module by id. No-ops if the id is not visible. */
  setActiveModule: (id: string) => void;

  // ── Config ──────────────────────────────────────────────────────────────

  /**
   * Full portal config as returned by the API.  Null while loading or when
   * the fetch has not yet completed.  Prefer the derived sub-fields below
   * for visibility decisions.
   */
  effectiveConfig: PortalConfig | null;

  /** True while the portal config fetch is in flight */
  configLoading: boolean;

  // ── Derived config helpers ───────────────────────────────────────────────
  //
  // These are extracted from effectiveConfig.derived and null-guarded so
  // consumers do not need to optional-chain into effectiveConfig every time.

  /** Whether the manager approval flow is active for this company */
  managerFlowEnabled: boolean;

  /** Whether the accounting review flow is active for this company */
  accountingFlowEnabled: boolean;

  /** Which dimensions are active for expense allocation */
  allocationDimensions: string[];

  /** Whether split allocations are permitted */
  allowSplitAllocations: boolean;

  // ── Selection state ──────────────────────────────────────────────────────

  /** The currently selected work item in the active module */
  selectedItem: SelectedWorkItem;

  /** Replace the current selection (called by the active module's list panel) */
  setSelectedItem: (item: Partial<SelectedWorkItem> | ((prev: SelectedWorkItem) => Partial<SelectedWorkItem>)) => void;

  /** Clear the current selection */
  clearSelectedItem: () => void;

  // ── Module-level section visibility ─────────────────────────────────────
  //
  // These are derived from effectiveConfig + user context and answer the
  // "should this UI section render?" questions that previously lived in
  // individual components.

  /** Whether the CFDI XML upload / pairing section should be shown */
  showCfdiSection: boolean;

  /** Whether the allocation section should be shown */
  showAllocationSection: boolean;

  /** Whether the manager approval action should be shown */
  showApprovalActions: boolean;

  /** Whether the accounting assignment actions should be shown */
  showAccountingActions: boolean;

  /** Whether AI copilot features should be offered */
  showAiCopilot: boolean;
}

// ── Context object ────────────────────────────────────────────────────────────

const MyWorkContext = createContext<MyWorkContextValue | null>(null);

// ── Provider ──────────────────────────────────────────────────────────────────

export function MyWorkProvider({ children, initialModuleId }: { children: ReactNode; initialModuleId?: string | null }) {
  const user = useUserContext();

  const [portalConfig, setPortalConfig] = useState<PortalConfig | null>(null);
  const [configLoading, setConfigLoading] = useState(true);
  const [activeModuleId, setActiveModuleId] = useState<string | null>(null);
  const [selectedItem, setSelectedItemState] = useState<SelectedWorkItem>(EMPTY_SELECTED_WORK_ITEM);

  const abortRef = useRef<AbortController | null>(null);

  // ── Fetch portal config ─────────────────────────────────────────────────
  //
  // Re-fetches whenever the resolved companyId changes (e.g. after login or
  // impersonation switch).  While user.loading is still true, companyId is
  // null and we skip the fetch to avoid a redundant /1 call.

  useEffect(() => {
    if (user.loading) return;

    const cid = user.companyId ?? 1;

    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    setConfigLoading(true);

    fetch(`${API}/admin/portal-config/${cid}`, {
      signal: ac.signal,
      headers: user.userIdStr ? { "X-User-Id": user.userIdStr } : {},
    })
      .then((r) => (r.ok ? r.json() : null))
      .catch((err) => {
        if ((err as { name?: string }).name === "AbortError") return "aborted";
        return null;
      })
      .then((cfg) => {
        if (cfg === "aborted") return;
        setPortalConfig(cfg ?? null);
        setConfigLoading(false);
      });

    return () => { ac.abort(); };
  }, [user.loading, user.companyId, user.userIdStr]);

  // ── Build ModuleVisibilityContext from live data ─────────────────────────

  const visibilityCtx = useMemo<ModuleVisibilityContext>(() => ({
    role: user.role,
    permissionKeys: user.permissionKeys,
    derived: portalConfig?.derived ?? null,
    capabilities: user.capabilities,
  }), [user.role, user.permissionKeys, user.capabilities, portalConfig]);

  // ── Compute visible modules ──────────────────────────────────────────────

  const visibleModules = useMemo(
    () => (configLoading || user.loading ? [] : getVisibleModules(visibilityCtx)),
    [configLoading, user.loading, visibilityCtx],
  );

  // ── Auto-select module when list resolves ───────────────────────────────
  //
  // If an initial module was requested via ?module=, prefer it when visible.
  // Otherwise fall back to the first visible module.

  useEffect(() => {
    if (!visibleModules.length) return;
    setActiveModuleId((prev) => {
      // Keep current selection if it's still visible
      if (prev && visibleModules.some((m) => m.id === prev)) return prev;
      // Prefer initialModuleId (e.g. from ?module=) if it resolves to a visible module
      if (initialModuleId && visibleModules.some((m) => m.id === initialModuleId)) {
        return initialModuleId;
      }
      return visibleModules[0].id;
    });
  }, [visibleModules, initialModuleId]);

  // ── Derived module ───────────────────────────────────────────────────────

  const activeModule = useMemo(
    () => visibleModules.find((m) => m.id === activeModuleId) ?? null,
    [visibleModules, activeModuleId],
  );

  // ── setActiveModule — no-op on unknown / invisible ids ──────────────────

  const setActiveModule = useCallback((id: string) => {
    if (visibleModules.some((m) => m.id === id)) {
      setActiveModuleId(id);
      // Clear selection when switching modules so the detail area resets.
      setSelectedItemState(EMPTY_SELECTED_WORK_ITEM);
    }
  }, [visibleModules]);

  // ── Selection helpers ────────────────────────────────────────────────────

  const setSelectedItem = useCallback(
    (patchOrFn: Partial<SelectedWorkItem> | ((prev: SelectedWorkItem) => Partial<SelectedWorkItem>)) => {
      setSelectedItemState((prev) => {
        const patch = typeof patchOrFn === "function" ? patchOrFn(prev) : patchOrFn;
        return { ...prev, ...patch };
      });
    },
    [],
  );

  const clearSelectedItem = useCallback(() => {
    setSelectedItemState(EMPTY_SELECTED_WORK_ITEM);
  }, []);

  // ── Derived config scalars ───────────────────────────────────────────────

  const derived = portalConfig?.derived ?? null;
  const ep = portalConfig?.expense_policy ?? null;

  const managerFlowEnabled = derived?.manager_flow_enabled ?? false;
  const accountingFlowEnabled = derived?.accounting_flow_enabled ?? false;
  const allocationDimensions = derived?.allocation_dimensions ?? [];
  const allowSplitAllocations = derived?.allow_split_allocations ?? false;

  // ── Section visibility ───────────────────────────────────────────────────
  //
  // Pure derivations — no component-side logic needed.

  const showCfdiSection = useMemo(() => {
    if (!ep) return false;
    return ep.xml_required_mode !== "never";
  }, [ep]);

  const showAllocationSection = useMemo(
    () => allocationDimensions.length > 0,
    [allocationDimensions],
  );

  const showApprovalActions = useMemo(
    () =>
      managerFlowEnabled &&
      (user.hasRole("manager", "admin") || user.hasPermission("approve_expense")),
    [managerFlowEnabled, user],
  );

  const showAccountingActions = useMemo(
    () =>
      accountingFlowEnabled &&
      (user.hasRole("accounting", "admin") || user.hasPermission("assign_account")),
    [accountingFlowEnabled, user],
  );

  // AI Copilot is now always on — it's part of the platform, not an add-on.
  const showAiCopilot = true;

  // ── Assemble value ───────────────────────────────────────────────────────

  const value = useMemo<MyWorkContextValue>(
    () => ({
      visibleModules,
      activeModule,
      setActiveModule,
      effectiveConfig: portalConfig,
      configLoading,
      managerFlowEnabled,
      accountingFlowEnabled,
      allocationDimensions,
      allowSplitAllocations,
      selectedItem,
      setSelectedItem,
      clearSelectedItem,
      showCfdiSection,
      showAllocationSection,
      showApprovalActions,
      showAccountingActions,
      showAiCopilot,
    }),
    [
      visibleModules,
      activeModule,
      setActiveModule,
      portalConfig,
      configLoading,
      managerFlowEnabled,
      accountingFlowEnabled,
      allocationDimensions,
      allowSplitAllocations,
      selectedItem,
      setSelectedItem,
      clearSelectedItem,
      showCfdiSection,
      showAllocationSection,
      showApprovalActions,
      showAccountingActions,
      showAiCopilot,
    ],
  );

  return (
    <MyWorkContext.Provider value={value}>{children}</MyWorkContext.Provider>
  );
}

// ── Hook ──────────────────────────────────────────────────────────────────────

/**
 * Returns the My Work portal context.
 * Must be called inside a `<MyWorkProvider>` tree (which itself requires a
 * `<UserProvider>` ancestor).
 */
export function useMyWorkContext(): MyWorkContextValue {
  const ctx = useContext(MyWorkContext);
  if (!ctx) {
    throw new Error(
      "useMyWorkContext() must be used inside a <MyWorkProvider>. " +
        "Ensure <UserProvider><MyWorkProvider> wraps your portal layout.",
    );
  }
  return ctx;
}
