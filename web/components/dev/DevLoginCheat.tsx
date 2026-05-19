"use client";

/**
 * DevLoginCheat - collapsed dev user switcher for development.
 *
 * Rendered only when:
 *   - NODE_ENV === "development" or localhost
 *   - Dev login is enabled in the company settings
 *
 * Hidden on /super-admin routes.
 *
 * Design: bottom-right corner, collapsed to a minimal amber pill by default.
 * Click or Ctrl+Shift+D to expand. Auto-collapses after login.
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { usePathname } from "next/navigation";
import { ChevronDown, GripVertical, Loader2, LogIn, Terminal } from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_BASE_URL;
const DEV_CHEAT = process.env.NEXT_PUBLIC_DEV_CHEAT;
const IS_DEV = process.env.NODE_ENV === "development";

interface DevUser {
  id: number;
  full_name: string;
  email: string;
  role: string;
  company_id: number;
  is_active: boolean;
}

const ROLE_ORDER = ["super_admin", "admin", "executive", "manager", "accounting", "accountant", "secretary", "employee"];

const ROLE_LABELS: Record<string, string> = { secretary: "Executive Assistant", accountant: "Accounting" };
const ROLE_BADGE_ABBR: Record<string, string> = { secretary: "EA", accountant: "ACC" };
const roleLabel = (r: string) => ROLE_LABELS[r] ?? (r.charAt(0).toUpperCase() + r.slice(1));
const roleBadge = (r: string) => ROLE_BADGE_ABBR[r] ?? r.slice(0, 3);

const ROLE_COLOR: Record<string, string> = {
  super_admin: "text-cyan-400",
  admin:      "text-rose-400",
  executive:  "text-amber-400",
  manager:    "text-accent",
  accounting: "text-emerald-400",
  accountant:  "text-emerald-400",
  secretary:  "text-purple-400",
  employee:   "text-tertiary",
};

const ROLE_BADGE: Record<string, string> = {
  super_admin: "border-cyan-500/25 bg-cyan-500/10 text-cyan-400",
  admin:      "border-rose-500/25 bg-rose-500/10 text-rose-400",
  executive:  "border-amber-500/25 bg-amber-500/10 text-amber-400",
  manager:    "border-sky-500/25 bg-sky-500/10 text-accent",
  accounting: "border-emerald-500/25 bg-emerald-500/10 text-emerald-400",
  accountant:  "border-emerald-500/25 bg-emerald-500/10 text-emerald-400",
  secretary:  "border-purple-500/25 bg-purple-500/10 text-purple-400",
  employee:   "border-default bg-surface-1 text-muted",
};

function DevLoginPanel() {
  const [open, setOpen] = useState(false);
  const [users, setUsers] = useState<DevUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [loggingIn, setLoggingIn] = useState<number | null>(null);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const dragging = useRef(false);
  const dragStart = useRef({ mx: 0, my: 0, ox: 0, oy: 0 });
  const panelRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  const grouped = ROLE_ORDER
    .filter((role) => users.some((u) => u.role === role))
    .map((role) => ({ role, members: users.filter((u) => u.role === role) }));

  // Ctrl+Shift+D to toggle
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === "D") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Drag
  const onDragStart = (e: React.MouseEvent | React.TouchEvent) => {
    dragging.current = true;
    const point = "touches" in e ? e.touches[0] : e;
    dragStart.current = { mx: point.clientX, my: point.clientY, ox: dragOffset.x, oy: dragOffset.y };
    e.preventDefault();
  };

  useEffect(() => {
    const onMove = (e: MouseEvent | TouchEvent) => {
      if (!dragging.current) return;
      const point = "touches" in e ? e.touches[0] : e;
      setDragOffset({
        x: dragStart.current.ox + (point.clientX - dragStart.current.mx),
        y: dragStart.current.oy + (point.clientY - dragStart.current.my),
      });
    };
    const onUp = () => { dragging.current = false; };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    window.addEventListener("touchmove", onMove);
    window.addEventListener("touchend", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onUp);
    };
  }, [dragOffset.x, dragOffset.y]);

  // Fetch dev users
  useEffect(() => {
    setLoadingUsers(true);
    setUsers([]);

    const cid = Number(
      new URLSearchParams(window.location.search).get("companyId") ||
      localStorage.getItem("currentCompanyId") || 1
    );

    if (API && cid) {
      const devUsersUrl = `${API}/companies/${cid}/dev-users`;
      fetch(devUsersUrl)
        .then((r) => r.ok ? r.json() : null)
        .then((data) => {
          const userList = data?.users ?? (Array.isArray(data) ? data : null);
          if (userList) {
            const active = userList.filter((u: DevUser) => u.is_active !== false);
            setUsers(active);
          }
        })
        .catch(() => {
          fetch(`${API}/users/?company_id=${cid}`)
            .then((r) => r.ok ? r.json() : null)
            .then((data) => {
              if (Array.isArray(data)) {
                const active = data.filter((u: DevUser) => u.is_active !== false);
                setUsers(active);
              }
            })
            .catch(() => {});
        })
        .finally(() => setLoadingUsers(false));
    } else {
      setLoadingUsers(false);
    }
  }, [pathname]);

  const handleLogin = useCallback((user: DevUser) => {
    setLoggingIn(user.id);
    setLoginError(null);
    try {
      localStorage.removeItem("session");
      localStorage.removeItem("currentUserId");
      localStorage.removeItem("currentUserRole");
      localStorage.removeItem("currentCompanyId");
      localStorage.setItem("currentUserId", String(user.id));
      localStorage.setItem("currentUserRole", user.role);
      localStorage.setItem("currentCompanyId", String(user.company_id));
      localStorage.setItem("devCheatLogin", "1");

      window.location.reload();
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : "Login failed");
      setLoggingIn(null);
    }
  }, []);

  // Collapsed: minimal amber pill at bottom-right
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{
          bottom: 48 - dragOffset.y,
          right: 12 - dragOffset.x,
          zIndex: 9999,
        }}
        className="group fixed flex items-center gap-1.5 rounded-md border border-amber-500/20 bg-surface-0/95 px-2 py-1.5 shadow-lg shadow-black/40 backdrop-blur-sm transition-all hover:border-amber-500/40 hover:shadow-amber-500/10"
        title="Dev user switcher (Ctrl+Shift+D)"
      >
        <div
          onMouseDown={onDragStart}
          onTouchStart={onDragStart}
          className="cursor-grab active:cursor-grabbing"
        >
          <GripVertical className="h-3 w-3 text-amber-500/50 group-hover:text-amber-400" />
        </div>
        <Terminal className="h-3 w-3 text-amber-400" />
        <span className="text-[9px] font-bold uppercase tracking-widest text-amber-400/80 group-hover:text-amber-300">
          DEV
        </span>
      </button>
    );
  }

  // Expanded: panel at bottom-right
  return (
    <>
      {/* Backdrop to close on outside click */}
      <div
        className="fixed inset-0 z-[9998]"
        onClick={() => setOpen(false)}
        aria-hidden
      />
      <div
        ref={panelRef}
        style={{
          bottom: 48 - dragOffset.y,
          right: 12 - dragOffset.x,
          zIndex: 9999,
        }}
        className="fixed w-56 select-none overflow-hidden rounded-lg border border-amber-500/20 bg-surface-0/98 shadow-xl shadow-black/60 backdrop-blur-sm"
      >
        {/* Header */}
        <div
          onMouseDown={onDragStart}
          onTouchStart={onDragStart}
          className="flex cursor-grab items-center gap-1.5 border-b border-amber-500/15 bg-amber-500/8 px-2.5 py-1.5 active:cursor-grabbing"
        >
          <GripVertical className="h-3 w-3 shrink-0 text-amber-400/60" />
          <Terminal className="h-3 w-3 shrink-0 text-amber-400" />
          <span className="flex-1 text-[9px] font-bold uppercase tracking-widest text-amber-400">
            DEV SWITCH
          </span>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="text-amber-400/60 transition-colors hover:text-amber-300"
          >
            <ChevronDown className="h-3 w-3" />
          </button>
        </div>

        {/* User list */}
        <div className="max-h-64 overflow-y-auto">
          {loadingUsers ? (
            <div className="flex items-center gap-2 px-3 py-3 text-muted">
              <Loader2 className="h-3 w-3 animate-spin" />
              <span className="text-[10px]">Scanning tenant users...</span>
            </div>
          ) : grouped.length === 0 ? (
            <div className="px-3 py-4 text-center">
              <p className="text-[10px] text-muted">No users found</p>
              <p className="text-[9px] text-tertiary">Start the API server to load demo users</p>
            </div>
          ) : (
            grouped.map(({ role, members }) => (
              <div key={role}>
                <div className="border-b border-subtle bg-surface-1 px-2.5 py-1">
                  <span className={`text-[8px] font-bold uppercase tracking-[0.12em] ${ROLE_COLOR[role] ?? "text-muted"}`}>
                    {roleLabel(role)}
                  </span>
                </div>
                {members.map((user) => (
                  <button
                    key={user.id}
                    type="button"
                    onClick={() => handleLogin(user)}
                    disabled={loggingIn !== null}
                    className="flex w-full items-center gap-2 border-b border-subtle px-2.5 py-1.5 text-left transition-colors last:border-0 hover:bg-surface-2"
                  >
                    {loggingIn === user.id ? (
                      <Loader2 className="h-3 w-3 shrink-0 animate-spin text-amber-400" />
                    ) : (
                      <LogIn className="h-3 w-3 shrink-0 text-muted group-hover:text-tertiary" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[10px] font-medium text-secondary">{user.full_name}</p>
                      <p className="truncate font-mono text-[8.5px] text-muted">{user.email}</p>
                    </div>
                    <span className={`shrink-0 rounded border px-1 py-0.5 text-[7.5px] font-semibold uppercase tracking-wide ${ROLE_BADGE[role] ?? ROLE_BADGE.employee}`}>
                      {roleBadge(role)}
                    </span>
                  </button>
                ))}
              </div>
            ))
          )}
          <div className="border-t border-amber-500/10 px-2.5 py-1.5 text-center">
            <span className="text-[8px] text-tertiary">Password: </span>
            <span className="font-mono text-[9px] text-amber-400/80">demo1234</span>
          </div>
          {loginError && <p className="border-t border-error/15 bg-error/5 px-2.5 py-1.5 text-[9px] text-error/70">{loginError}</p>}
        </div>
      </div>
    </>
  );
}

export default function DevLoginCheat() {
  const [mounted, setMounted] = useState(false);
  const [localhostEnabled, setLocalhostEnabled] = useState(false);
  const [features, setFeatures] = useState<{ dev_login_enabled?: boolean }>({ dev_login_enabled: false });
  const pathname = usePathname();

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    const host = window.location.hostname;
    setLocalhostEnabled(host === "localhost" || host === "127.0.0.1");
  }, []);

  useEffect(() => {
    if (!pathname || pathname.startsWith("/super-admin")) return;
    const cid = Number(
      new URLSearchParams(window.location.search).get("companyId") ||
      localStorage.getItem("currentCompanyId")
    );
    if (cid && API) {
      fetch(`${API}/companies/${cid}/features`)
        .then(r => r.ok ? r.json() : null)
        .then(data => {
          if (data) setFeatures(data);
        })
        .catch(() => {});
    }
  }, [pathname]);

  const isDevMode = IS_DEV || DEV_CHEAT === "true" || localhostEnabled;

  if (pathname?.startsWith("/super-admin")) return null;
  if (!mounted) return null;
  if (!isDevMode && !features.dev_login_enabled) return null;

  return <DevLoginPanel />;
}
