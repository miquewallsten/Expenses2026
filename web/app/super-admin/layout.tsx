"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { getSuperAdminSession } from "@/lib/super-admin-session";

/**
 * Super Admin layout — guards every /super-admin/* route.
 *
 * Uses independent authentication stored in superAdminSession.
 * Redirects to /super-admin/login if not authenticated.
 *
 * Cross-tenant scope: AI engine governance, kNN category memory,
 * cross-tenant agent usage rollups, daily insight digest.
 */
export default function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [ok, setOk] = useState<boolean | null>(null);

  useEffect(() => {
    // Don't redirect on the login page itself
    if (pathname === "/super-admin/login") {
      setOk(true);
      return;
    }

    const session = getSuperAdminSession();
    if (!session?.token) {
      router.replace("/super-admin/login");
      return;
    }
    setOk(true);
  }, [router, pathname]);

  if (ok !== true) {
    return (
      <div className="flex h-screen items-center justify-center bg-surface-0 text-[11px] text-tertiary">
        Verifying access…
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-surface-0">
      {pathname !== "/super-admin/login" && (
        <div className="flex h-7 shrink-0 items-center gap-2 border-b border-rose-500/25 bg-rose-950/30 px-3 text-[10px] uppercase tracking-widest text-rose-300/80">
          <span className="font-bold">Super Admin</span>
          <span className="text-error/40">·</span>
          <span className="text-rose-300/55">Cross-tenant. Customers cannot see this surface.</span>
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
    </div>
  );
}
