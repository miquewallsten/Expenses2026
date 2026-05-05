"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getStoredSession } from "@/lib/session";

/**
 * Super Admin layout — guards every /super-admin/* route.
 *
 * Customer admins (is_super_admin=false) are redirected to /admin.
 * Super admins see a thin red top strip + the route content.
 *
 * Cross-tenant scope: AI engine governance, kNN category memory,
 * cross-tenant agent usage rollups, daily insight digest.
 */
export default function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [ok, setOk] = useState<boolean | null>(null);

  useEffect(() => {
    const s = getStoredSession();
    if (!s) {
      router.replace("/login");
      return;
    }
    if (!s.isSuperAdmin) {
      router.replace("/mywork");
      return;
    }
    setOk(true);
  }, [router]);

  if (ok !== true) {
    return (
      <div className="flex h-screen items-center justify-center bg-surface-0 text-[11px] text-tertiary">
        Verifying access…
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-surface-0">
      <div className="flex h-7 shrink-0 items-center gap-2 border-b border-rose-500/25 bg-rose-950/30 px-3 text-[10px] uppercase tracking-widest text-rose-300/80">
        <span className="font-bold">Super Admin</span>
        <span className="text-error/40">·</span>
        <span className="text-rose-300/55">Cross-tenant. Customers cannot see this surface.</span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
    </div>
  );
}
