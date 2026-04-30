"use client";

import React, { Suspense, useMemo } from "react";
import { useSearchParams } from "next/navigation";

const MODULE_MAP: Record<string, React.LazyExoticComponent<React.ComponentType<unknown>>> = {
  expenses: React.lazy(() => import("@/components/modules/ExpensesModule")),
  approvals: React.lazy(() => import("@/components/modules/ApprovalsModule")),
  accounting: React.lazy(() => import("@/components/modules/AccountingModule")),
  admin: React.lazy(() => import("@/components/modules/AdminModule")),
  "super-admin": React.lazy(() => import("@/components/modules/SuperAdminModule")),
  time: React.lazy(() => import("@/components/modules/TimeModule")),
  reports: React.lazy(() => import("@/components/modules/ReportsModule")),
};

function ModuleLoadingFallback() {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/10 border-t-indigo-400/80" />
    </div>
  );
}

function ModuleNotFound({ moduleId }: { moduleId: string }) {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="text-center">
        <p className="text-[11px] font-medium text-white/45">Module not found</p>
        <p className="mt-1 text-[10px] text-white/25">{moduleId}</p>
      </div>
    </div>
  );
}

export default function ModuleRegistry() {
  const searchParams = useSearchParams();
  const activeModule = searchParams.get("module") || "";

  const ModuleComponent = useMemo(() => {
    if (!activeModule) return null;
    return MODULE_MAP[activeModule] || null;
  }, [activeModule]);

  if (!activeModule) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-[11px] text-white/25">Select a module from the sidebar</p>
      </div>
    );
  }

  if (!ModuleComponent) {
    return <ModuleNotFound moduleId={activeModule} />;
  }

  return (
    <Suspense fallback={<ModuleLoadingFallback />}>
      <ModuleComponent />
    </Suspense>
  );
}
