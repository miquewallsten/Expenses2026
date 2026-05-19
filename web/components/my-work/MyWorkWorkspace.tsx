"use client";

import Link from "next/link";
import { Suspense } from "react";
import { AlertCircle, ArrowRight, Settings } from "lucide-react";
import { useMyWorkContext } from "@/context/MyWorkContext";
import { useUserContext } from "@/context/UserContext";
import { useTranslations } from "next-intl";

// ── Fallback while a lazy module chunk loads ──────────────────────────────────

function ModuleLoadingFallback() {
  const tc = useTranslations("common");
  return (
    <div className="flex h-full items-center justify-center">
      <p className="text-xs text-tertiary">{tc("loading")}</p>
    </div>
  );
}

// ── Fallback when no module is active ────────────────────────────────────────
//
// Shown when `visibleModules` is empty - i.e. the admin hasn't configured
// anything that this user's role can use yet. Explains *why* and points the
// right person at the right place to fix it.

function NoVisibleModules({ role }: { role: string | null }) {
  const t = useTranslations("myWork.emptyPortal");
  const tn = useTranslations("nav");
  const roleLabel = role ? tn(role) : "";
  const isAdmin = role === "admin";

  // Map role → explanation key. Unknown roles fall back to a generic message.
  const BODY_KEY: Record<string, string> = {
    admin:      "bodyAdmin",
    employee:   "bodyEmployee",
    manager:    "bodyManager",
    accounting: "bodyAccounting",
    executive:  "bodyExecutive",
    secretary:  "bodySecretary",
  };
  const bodyKey = (role && BODY_KEY[role]) || "bodyDefault";

  return (
    <div className="flex h-full items-center justify-center px-8">
      <div className="max-w-md rounded-lg border border-subtle bg-surface-2 p-6">
        <div className="mb-3 flex items-center gap-2">
          <AlertCircle className="h-4 w-4 text-warning/70" />
          <h2 className="text-[12px] font-bold uppercase tracking-widest text-secondary">
            {t("title", { role: roleLabel })}
          </h2>
        </div>
        <p className="mb-4 text-[11px] leading-relaxed text-tertiary">
          {t(bodyKey)}
        </p>
        <div className="flex flex-col gap-1.5">
          {isAdmin ? (
            <Link
              href="/mywork?module=admin"
              className="inline-flex items-center gap-1.5 rounded border bg-accent-muted-muted bg-accent-muted px-3 py-1.5 text-[11px] font-semibold text-accent transition-colors hover:bg-accent-muted/80"
            >
              <ArrowRight className="h-3 w-3" />
              {t("goToAdmin")}
            </Link>
          ) : (
            <>
              <p className="text-[10px] italic text-muted">
                {t("askAdmin")}
              </p>
              <Link
                href="/settings"
                className="inline-flex items-center gap-1.5 rounded border border-subtle bg-surface-3 px-3 py-1.5 text-[11px] font-medium text-secondary transition-colors hover:bg-surface-4"
              >
                <Settings className="h-3 w-3" />
                {tn("settings")}
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function NoModuleSelected() {
  const t = useTranslations("myWork");
  return (
    <div className="flex h-full items-center justify-center">
      <p className="text-xs text-tertiary">{t("noModule")}</p>
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * Renders the workspace area (column 3) for whichever module is currently
 * active.  Only one module is ever mounted at a time.
 */
export default function MyWorkWorkspace() {
  const myWork = useMyWorkContext();
  const user = useUserContext();

  const { activeModule, configLoading, selectedItem, setSelectedItem, clearSelectedItem, effectiveConfig, visibleModules } = myWork;

  const tc = useTranslations("common");
  if (configLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <div className="h-10 w-10 animate-spin rounded-xl border-2 border-accent border-t-transparent" />
            <div className="absolute inset-0 h-10 w-10 animate-pulse rounded-xl bg-accent-muted" />
          </div>
          <p className="text-sm text-tertiary">{tc("loading")}</p>
        </div>
      </div>
    );
  }

  if (!activeModule) {
    // Distinguish "nothing visible for this role" from "module simply unselected"
    if (visibleModules.length === 0) {
      return <NoVisibleModules role={user.role} />;
    }
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
