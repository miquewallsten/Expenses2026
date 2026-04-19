"use client";

import { Suspense } from "react";
import { useMyWorkContext } from "@/context/MyWorkContext";
import { useUserContext } from "@/context/UserContext";

// ── Fallback while a lazy module chunk loads ──────────────────────────────────

function ModuleLoadingFallback() {
  return (
    <div className="flex h-full items-center justify-center">
      <p className="text-xs text-white/22">Loading…</p>
    </div>
  );
}

// ── Fallback when no module is active ────────────────────────────────────────

function NoModuleSelected() {
  return (
    <div className="flex h-full items-center justify-center">
      <p className="text-xs text-white/22">No module selected.</p>
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * Renders the workspace area (column 3) for whichever module is currently
 * active.  Only one module is ever mounted at a time.
 *
 * Props forwarded to the module component:
 *   - Everything from MyWorkContext that a workspace might need
 *   - User identity / permissions from UserContext
 *
 * Module components should import `useMyWorkContext` / `useUserContext`
 * directly for additional data; these forwarded props are a convenience for
 * the most common reads.
 */
export default function MyWorkWorkspace() {
  const myWork = useMyWorkContext();
  const user = useUserContext();

  const { activeModule, configLoading, selectedItem, setSelectedItem, clearSelectedItem, effectiveConfig } = myWork;

  if (configLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-xs text-white/22">Loading configuration…</p>
      </div>
    );
  }

  if (!activeModule) {
    return <NoModuleSelected />;
  }

  const { component: ModuleComponent } = activeModule;

  // Props forwarded to every module component.  Each module can ignore what
  // it doesn't need; the shape is stable so adding a new module doesn't
  // require updating this file.
  const moduleProps = {
    // Selection state
    selectedItem,
    setSelectedItem,
    clearSelectedItem,

    // Config shortcuts
    effectiveConfig,
    expensePolicy: effectiveConfig?.expense_policy ?? null,
    derived: effectiveConfig?.derived ?? null,

    // User identity
    userId: user.userId,
    userIdStr: user.userIdStr,
    companyId: user.companyId,
    role: user.role,
    hasPermission: user.hasPermission,
    hasRole: user.hasRole,
  };

  return (
    <Suspense fallback={<ModuleLoadingFallback />}>
      <ModuleComponent {...moduleProps} />
    </Suspense>
  );
}
