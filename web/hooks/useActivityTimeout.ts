"use client";

/**
 * Activity-based session timeout.
 *
 * Clears the session after 30 minutes of inactivity (no mouse, keyboard, scroll, click, touch).
 * Session persists until browser closes (localStorage on close is handled by the browser).
 * 
 * This is a SOFT timeout — it only logs out if the user is truly idle.
 * API 401s and JWT expiry are handled separately.
 */

import { useEffect, useRef, useCallback } from "react";
import { clearStoredSession, getStoredSession, isSessionExpired } from "@/lib/session";

const INACTIVITY_MS = 30 * 60 * 1000; // 30 minutes
const CHECK_INTERVAL_MS = 60_000; // check every 60s

export function useActivityTimeout() {
  const lastActivityRef = useRef<number>(Date.now());

  const resetTimer = useCallback(() => {
    lastActivityRef.current = Date.now();
  }, []);

  useEffect(() => {
    // Check if session exists (either JWT or legacy dev login)
    const session = getStoredSession();
    const hasLegacyDevLogin = !session && (localStorage.getItem("currentUserId") || localStorage.getItem("currentUserRole"));
    if (!session && !hasLegacyDevLogin) return;

    // Check if JWT is already expired on mount (only for JWT-based sessions)
    if (session?.token && isSessionExpired(session.token)) {
      clearStoredSession();
      if (!window.location.pathname.startsWith("/login")) {
        window.location.href = "/login";
      }
      return;
    }

    // Activity events that reset the timer
    const events = ["mousedown", "keydown", "scroll", "touchstart", "click"];
    const handler = () => resetTimer();
    
    for (const evt of events) {
      window.addEventListener(evt, handler, { passive: true });
    }

    // Periodic check: if inactive for too long, logout
    const checkInterval = setInterval(() => {
      // First check if JWT is expired (only for JWT sessions)
      const s = getStoredSession();
      const hasDev = !s && (localStorage.getItem("currentUserId") || localStorage.getItem("currentUserRole"));
      if (s?.token && isSessionExpired(s.token)) {
        clearStoredSession();
        if (!window.location.pathname.startsWith("/login")) {
          window.location.href = "/login";
        }
        return;
      }

      // Then check inactivity (only logout if there's an actual JWT session)
      const elapsed = Date.now() - lastActivityRef.current;
      if (elapsed >= INACTIVITY_MS && s?.token) {
        clearStoredSession();
        if (!window.location.pathname.startsWith("/login")) {
          window.location.href = "/login";
        }
      }
    }, CHECK_INTERVAL_MS);

    return () => {
      for (const evt of events) {
        window.removeEventListener(evt, handler);
      }
      clearInterval(checkInterval);
    };
  }, [resetTimer]);
}
