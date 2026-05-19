"use client";

/**
 * useAuthGuard
 *
 * Returns { loading, authenticated } so the consuming component can
 * render a spinner while the session is being resolved, instead of
 * flashing the authenticated UI before redirecting to /login.
 *
 * Redirects unauthenticated users to /login after the session check completes.
 */

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useUserContext } from "@/context/UserContext";

export function useAuthGuard(): { loading: boolean; authenticated: boolean } {
  const { userId, loading } = useUserContext();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!userId) {
      router.replace("/login");
    }
  }, [loading, userId, router]);

  return {
    loading,
    authenticated: !loading && !!userId,
  };
}
