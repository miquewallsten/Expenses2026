"use client";

/**
 * DevLoginCheat — floating draggable quick-login panel for development.
 *
 * Rendered only when:
 *   - NODE_ENV === "development"  (compiled away in production builds)
 *   - NEXT_PUBLIC_DEV_CHEAT !== "false"  (set to "false" in .env.local to hide)
 *
 * Usage: just mount <DevLoginCheat /> anywhere in the tree.
 * To disable: add  NEXT_PUBLIC_DEV_CHEAT=false  to web/.env.local
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronUp, GripVertical, Loader2, LogIn } from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_BASE_URL;
const DEV_CHEAT = process.env.NEXT_PUBLIC_DEV_CHEAT;
const IS_DEV = process.env.NODE_ENV === "development";

// ── Types ─────────────────────────────────────────────────────────────────────

interface DevUser {
  id: number;
  full_name: string;
  email: string;
  role: string;
  company_id: number;
  is_active: boolean;
}

// ── Role config ───────────────────────────────────────────────────────────────

const ROLE_ORDER = ["admin", "executive", "manager", "accounting", "secretary", "employee"];

const ROLE_COLOR: Record<string, string> = {
  admin:      "text-rose-300/70",
  executive:  "text-amber-300/70",
  manager:    "text-sky-300/70",
  accounting: "text-emerald-300/70",
  secretary:  "text-purple-300/70",
  employee:   "text-white/40",
};

const ROLE_BADGE: Record<string, string> = {
  admin:      "border-rose-500/25 bg-rose-500/[0.07] text-rose-300/70",
  executive:  "border-amber-500/25 bg-amber-500/[0.07] text-amber-300/70",
  manager:    "border-sky-500/25 bg-sky-500/[0.07] text-sky-300/70",
  accounting: "border-emerald-500/25 bg-emerald-500/[0.07] text-emerald-300/70",
  secretary:  "border-purple-500/25 bg-purple-500/[0.07] text-purple-300/70",
  employee:   "border-white/[0.09] bg-white/[0.03] text-white/35",
};

// ── Inner panel (always mounts, gate is outside) ──────────────────────────────

function DevLoginPanel() {
  const router = useRouter();

  // ── Position (draggable) ────────────────────────────────────────────────────
  const [pos, setPos] = useState({ x: 16, y: 16 }); // bottom-left
  const dragging = useRef(false);
  const dragStart = useRef({ mx: 0, my: 0, px: 0, py: 0 });
  const panelRef = useRef<HTMLDivElement>(null);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    dragging.current = true;
    dragStart.current = { mx: e.clientX, my: e.clientY, px: pos.x, py: pos.y };
    e.preventDefault();
  }, [pos]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      setPos({
        x: dragStart.current.px + (e.clientX - dragStart.current.mx),
        y: dragStart.current.py + (e.clientY - dragStart.current.my),
      });
    };
    const onUp = () => { dragging.current = false; };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  // ── Collapsed state ─────────────────────────────────────────────────────────
  const [collapsed, setCollapsed] = useState(false);

  // ── Users data ──────────────────────────────────────────────────────────────
  const [users, setUsers] = useState<DevUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);

  useEffect(() => {
    // Fetch all users — assumes company_id=1 for dev
    fetch(`${API}/users/?company_id=1`)
      .then((r) => (r.ok ? r.json() : []))
      .catch(() => [])
      .then((data: DevUser[]) => {
        const active = Array.isArray(data) ? data.filter((u) => u.is_active !== false) : [];
        setUsers(active);
        setLoadingUsers(false);
      });
  }, []);

  // ── Login action ─────────────────────────────────────────────────────────────
  const [loggingIn, setLoggingIn] = useState<number | null>(null);
  const [loginError, setLoginError] = useState<string | null>(null);

  const handleLogin = (user: DevUser) => {
    setLoggingIn(user.id);
    setLoginError(null);
    try {
      // Dev-mode: API accepts X-User-Id header — no JWT/magic-link needed.
      // Write identity to localStorage using the legacy keys that UserContext reads,
      // then clear any stale JWT session so the header-auth path is used.
      localStorage.removeItem("session");
      localStorage.setItem("currentUserId",    String(user.id));
      localStorage.setItem("currentUserRole",  user.role);
      localStorage.setItem("currentCompanyId", String(user.company_id ?? 1));

      const dest = user.role === "admin" ? "/admin" : "/mywork";

      router.push(dest);
    } catch (e: unknown) {
      setLoginError((e as Error)?.message ?? "Login failed");
    } finally {
      // Always reset so the panel stays usable across portal switches.
      // layout.tsx persists this component across navigations, so without
      // this the buttons stay permanently disabled after the first login.
      setLoggingIn(null);
    }
  };

  // ── Group users by role ─────────────────────────────────────────────────────
  const grouped = ROLE_ORDER
    .map((role) => ({ role, members: users.filter((u) => u.role === role) }))
    .filter((g) => g.members.length > 0);

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div
      ref={panelRef}
      style={{ left: pos.x, top: pos.y, zIndex: 9999 }}
      className="fixed w-52 select-none overflow-hidden rounded-lg border border-amber-500/20 bg-zinc-950/95 shadow-xl shadow-black/60 backdrop-blur-sm"
    >
      {/* Header / drag handle */}
      <div
        onMouseDown={onMouseDown}
        className="flex cursor-grab items-center gap-1.5 border-b border-amber-500/15 bg-amber-500/[0.06] px-2.5 py-1.5 active:cursor-grabbing"
      >
        <GripVertical className="h-3 w-3 shrink-0 text-amber-400/40" />
        <span className="flex-1 text-[9px] font-bold uppercase tracking-widest text-amber-400/60">
          Dev Login
        </span>
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          className="text-amber-400/40 hover:text-amber-400/70"
        >
          {collapsed
            ? <ChevronDown className="h-3 w-3" />
            : <ChevronUp className="h-3 w-3" />}
        </button>
      </div>

      {/* Body */}
      {!collapsed && (
        <div className="max-h-72 overflow-y-auto">
          {loadingUsers ? (
            <div className="flex items-center gap-2 px-3 py-3 text-white/25">
              <Loader2 className="h-3 w-3 animate-spin" />
              <span className="text-[10px]">Loading users…</span>
            </div>
          ) : users.length === 0 ? (
            <p className="px-3 py-3 text-[10px] text-white/25">No users found.</p>
          ) : (
            grouped.map(({ role, members }) => (
              <div key={role}>
                {/* Role group header */}
                <div className="border-b border-white/[0.04] bg-white/[0.015] px-2.5 py-1">
                  <span className={`text-[8px] font-bold uppercase tracking-[0.12em] ${ROLE_COLOR[role] ?? "text-white/30"}`}>
                    {role}
                  </span>
                </div>

                {/* Users in group */}
                {members.map((user) => (
                  <button
                    key={user.id}
                    type="button"
                    onClick={() => handleLogin(user)}
                    disabled={loggingIn !== null}
                    className="flex w-full items-center gap-2 border-b border-white/[0.03] px-2.5 py-1.5 text-left transition-colors last:border-0 hover:bg-white/[0.04] disabled:opacity-50"
                  >
                    {loggingIn === user.id ? (
                      <Loader2 className="h-3 w-3 shrink-0 animate-spin text-amber-400/60" />
                    ) : (
                      <LogIn className="h-3 w-3 shrink-0 text-white/15 group-hover:text-white/40" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[10px] font-medium text-white/60">{user.full_name}</p>
                      <p className="truncate font-mono text-[8.5px] text-white/25">{user.email}</p>
                    </div>
                    <span className={`shrink-0 rounded border px-1 py-0.5 text-[7.5px] font-semibold uppercase tracking-wide ${ROLE_BADGE[role] ?? ROLE_BADGE.employee}`}>
                      {role.slice(0, 3)}
                    </span>
                  </button>
                ))}
              </div>
            ))
          )}

          {loginError && (
            <p className="border-t border-red-500/15 bg-red-500/[0.06] px-2.5 py-1.5 text-[9px] text-red-400/70">
              {loginError}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Exported gate component ───────────────────────────────────────────────────

export default function DevLoginCheat() {
  // Compile-time + env-var gate — no panel in production
  if (!IS_DEV || DEV_CHEAT === "false") return null;
  return <DevLoginPanel />;
}
