"use client";

import { useEffect, useState, useCallback } from "react";
import type { PermissionManifest } from "@/types/mywork";
import { fetchManifest } from "@/lib/mywork/manifest";

const CACHE_KEY = "mywork_manifest_cache";
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface CacheEntry {
  manifest: PermissionManifest;
  timestamp: number;
}

function readCache(): CacheEntry | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const entry = JSON.parse(raw) as CacheEntry;
    if (Date.now() - entry.timestamp > CACHE_TTL_MS) return null;
    return entry;
  } catch {
    return null;
  }
}

function writeCache(manifest: PermissionManifest) {
  try {
    localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({ manifest, timestamp: Date.now() }),
    );
  } catch {
    // ignore
  }
}

function clearCache() {
  localStorage.removeItem(CACHE_KEY);
}

export interface UseManifestResult {
  manifest: PermissionManifest | null;
  loading: boolean;
  error: Error | null;
  refresh: () => void;
}

export function useManifest(): UseManifestResult {
  const [manifest, setManifest] = useState<PermissionManifest | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const cached = readCache();
    if (cached) {
      setManifest(cached.manifest);
      setLoading(false);
    }

    fetchManifest()
      .then((data) => {
        if (cancelled) return;
        setManifest(data);
        writeCache(data);
        setError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err : new Error(String(err)));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [refreshToken]);

  // Invalidate on window focus
  useEffect(() => {
    const handleFocus = () => {
      clearCache();
      setRefreshToken((t) => t + 1);
    };
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, []);

  const refresh = useCallback(() => {
    clearCache();
    setRefreshToken((t) => t + 1);
  }, []);

  return { manifest, loading, error, refresh };
}
