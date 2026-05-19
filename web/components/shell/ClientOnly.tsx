"use client";

import { useEffect, useState, type ReactNode } from "react";

/**
 * ClientOnly - renders children only on the client (after hydration).
 * Shows fallback (or nothing) during SSR and initial hydration.
 * This eliminates hydration mismatches for components that depend on
 * browser-only state (localStorage, window, etc.).
 */
export default function ClientOnly({
  children,
  fallback = null,
}: {
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}
