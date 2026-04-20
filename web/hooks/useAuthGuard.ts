"use client";

/**
 * useAuthGuard
 *
 * Redirects unauthenticated users to /login as soon as UserContext finishes
 * loading and no session is present.  Protects all authenticated pages.
 *
 * Usage: call inside any page component that is wrapped in <UserProvider>.
 * The hook reads from UserContext so UserProvider must be an ancestor.
 *
 * Security note: session tokens live in localStorage and are sent as
 * Authorization headers on every API call.  URLs remain predictable
 * (enterprise standard — Salesforce, SAP, Workday all use readable URLs).
 * Security is enforced by authentication on every request, not URL obscurity.
 */

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useUserContext } from "@/context/UserContext";

export function useAuthGuard(): void {
  const { userId, loading } = useUserContext();
  const router = useRouter();

  useEffect(() => {
    // Wait until UserContext has read localStorage and resolved
    if (loading) return;
    // No userId = no valid session → redirect to login
    if (!userId) {
      router.replace("/login");
    }
  }, [loading, userId, router]);
}
