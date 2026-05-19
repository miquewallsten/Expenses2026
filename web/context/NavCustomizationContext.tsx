"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useUserContext } from "@/context/UserContext";
import { apiCall } from "@/lib/api/client";

const STORAGE_KEY = "nav-customization";

// ── Types ──────────────────────────────────────────────────────────────────────

/** A custom group created by the user. */
export interface NavGroup {
  id: string;
  name: string;
  /** Ordered module IDs inside this group. */
  moduleIds: string[];
  /** Whether the group is collapsed in the sidebar. */
  collapsed: boolean;
}

export interface NavLayout {
  /** Ordered module IDs — defines the order modules appear in the sidebar. */
  order: string[];
  /** Custom groups. Modules not in any group appear above all groups. */
  groups: NavGroup[];
  /** Module IDs the user has hidden. */
  hiddenIds: string[];
}

export interface NavCustomizationValue {
  /** Current layout (order, groups, hidden) */
  layout: NavLayout;
  /** Move a module to a new position in the order. */
  moveModule: (moduleId: string, newIndex: number) => void;
  /** Move a module from wherever it is (ungrouped or group) into a specific group at an optional index */
  moveModuleToGroup: (moduleId: string, groupId: string, index?: number) => void;
  /** Move a module from a group back to ungrouped at an optional index */
  moveModuleToUngrouped: (moduleId: string, index?: number) => void;
  /** Reorder a module within its current group */
  moveModuleWithinGroup: (groupId: string, moduleId: string, newIndex: number) => void;
  /** Create a new group */
  createGroup: (name: string) => string;
  /** Rename a group */
  renameGroup: (groupId: string, name: string) => void;
  /** Delete a group (moves its items back to ungrouped) */
  deleteGroup: (groupId: string) => void;
  /** Move a group to a new position in the groups array */
  moveGroup: (groupId: string, newIndex: number) => void;
  /** Toggle a group's collapsed state */
  toggleGroupCollapsed: (groupId: string) => void;
  /** Toggle a module's visibility */
  toggleVisibility: (id: string) => void;
  /** Show a specific module */
  show: (id: string) => void;
  /** Hide a specific module */
  hide: (id: string) => void;
  /** Whether a module is visible (not hidden) */
  isVisible: (id: string) => boolean;
  /** Reset layout to defaults */
  resetLayout: () => void;
  /** Whether the customization panel is open */
  panelOpen: boolean;
  setPanelOpen: (v: boolean) => void;
}

const DEFAULT_LAYOUT: NavLayout = {
  order: [],
  groups: [],
  hiddenIds: [],
};

function generateId(): string {
  return `g_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

const NavCustomizationContext = createContext<NavCustomizationValue | null>(null);

export function NavCustomizationProvider({ children }: { children: ReactNode }) {
  const user = useUserContext();
  const [layout, setLayout] = useState<NavLayout>(DEFAULT_LAYOUT);
  const [mounted, setMounted] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const storageKey = `${STORAGE_KEY}-${user.userIdStr ?? "default"}`;

  // ── Load: localStorage first for instant paint, then backend for persistence ──

  useEffect(() => {
    setMounted(true);
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.order ?? parsed.hiddenIds)) {
          setLayout(parsed);
        }
      }
    } catch {}

    if (user.userId) {
      apiCall<{ nav_layout: NavLayout | null }>(`/user-preferences/${user.userId}`)
        .then((res) => {
          if (res?.nav_layout && Array.isArray(res.nav_layout.order ?? res.nav_layout.hiddenIds)) {
            setLayout(res.nav_layout);
            localStorage.setItem(storageKey, JSON.stringify(res.nav_layout));
          }
        })
        .catch(() => {});
    }
  }, [storageKey, user.userId]);

  // ── Persist ─────────────────────────────────────────────────────────────────

  const saveToBackend = useCallback((navLayout: NavLayout) => {
    if (!user.userId) return;
    apiCall(`/user-preferences/${user.userId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nav_layout: navLayout }),
    }).catch(() => {});
  }, [user.userId]);

  useEffect(() => {
    if (!mounted) return;
    localStorage.setItem(storageKey, JSON.stringify(layout));
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveToBackend(layout);
    }, 1000);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [layout, mounted, storageKey, saveToBackend]);

  // ── Actions ─────────────────────────────────────────────────────────────────

  /** Move a module to a new position in the ungrouped list. */
  const moveModule = useCallback((moduleId: string, newIndex: number) => {
    setLayout((prev) => {
      const order = prev.order.filter((id) => id !== moduleId);
      order.splice(newIndex, 0, moduleId);
      return { ...prev, order };
    });
  }, []);

  /** Move a module into a group. Removes it from ungrouped or any other group first. */
  const moveModuleToGroup = useCallback((moduleId: string, groupId: string, index?: number) => {
    setLayout((prev) => {
      // Remove from ungrouped
      const order = prev.order.filter((id) => id !== moduleId);
      // Remove from all groups, add to target group
      const groups = prev.groups.map((g) => {
        if (g.id === groupId) {
          const filtered = g.moduleIds.filter((id) => id !== moduleId);
          const insertAt = index !== undefined ? Math.min(index, filtered.length) : filtered.length;
          const newModuleIds = [...filtered];
          newModuleIds.splice(insertAt, 0, moduleId);
          return { ...g, moduleIds: newModuleIds };
        }
        return { ...g, moduleIds: g.moduleIds.filter((id) => id !== moduleId) };
      });
      return { ...prev, order, groups };
    });
  }, []);

  /** Move a module out of any group and into ungrouped at an optional position. */
  const moveModuleToUngrouped = useCallback((moduleId: string, index?: number) => {
    setLayout((prev) => {
      // Remove from all groups
      let wasInGroup = false;
      const groups = prev.groups.map((g) => {
        const idx = g.moduleIds.indexOf(moduleId);
        if (idx >= 0) {
          wasInGroup = true;
          return { ...g, moduleIds: [...g.moduleIds.slice(0, idx), ...g.moduleIds.slice(idx + 1)] };
        }
        return g;
      });
      // Add to ungrouped at position (or end)
      let order = prev.order.filter((id) => id !== moduleId);
      const insertAt = index !== undefined ? Math.min(index, order.length) : order.length;
      order.splice(insertAt, 0, moduleId);
      if (!wasInGroup && !prev.order.includes(moduleId)) {
        // Module was new (never in order or groups), still add it
      }
      return { ...prev, order, groups };
    });
  }, []);

  /** Reorder a module within its current group. */
  const moveModuleWithinGroup = useCallback((groupId: string, moduleId: string, newIndex: number) => {
    setLayout((prev) => {
      const groups = prev.groups.map((g) => {
        if (g.id !== groupId) return g;
        const ids = g.moduleIds.filter((id) => id !== moduleId);
        ids.splice(Math.min(newIndex, ids.length), 0, moduleId);
        return { ...g, moduleIds: ids };
      });
      return { ...prev, groups };
    });
  }, []);

  const createGroup = useCallback((name: string): string => {
    const id = generateId();
    setLayout((prev) => ({
      ...prev,
      groups: [...prev.groups, { id, name, moduleIds: [], collapsed: false }],
    }));
    return id;
  }, []);

  const renameGroup = useCallback((groupId: string, name: string) => {
    setLayout((prev) => ({
      ...prev,
      groups: prev.groups.map((g) => (g.id === groupId ? { ...g, name } : g)),
    }));
  }, []);

  const deleteGroup = useCallback((groupId: string) => {
    setLayout((prev) => {
      const group = prev.groups.find((g) => g.id === groupId);
      const groupModuleIds = group?.moduleIds ?? [];
      return {
        ...prev,
        groups: prev.groups.filter((g) => g.id !== groupId),
        order: [...prev.order, ...groupModuleIds],
      };
    });
  }, []);

  /** Move a group to a new position in the groups array. */
  const moveGroup = useCallback((groupId: string, newIndex: number) => {
    setLayout((prev) => {
      const oldIndex = prev.groups.findIndex((g) => g.id === groupId);
      if (oldIndex === -1) return prev;
      const groups = [...prev.groups];
      const [moved] = groups.splice(oldIndex, 1);
      groups.splice(Math.min(newIndex, groups.length), 0, moved);
      return { ...prev, groups };
    });
  }, []);

  const toggleGroupCollapsed = useCallback((groupId: string) => {
    setLayout((prev) => ({
      ...prev,
      groups: prev.groups.map((g) => (g.id === groupId ? { ...g, collapsed: !g.collapsed } : g)),
    }));
  }, []);

  const toggleVisibility = useCallback((id: string) => {
    setLayout((prev) => {
      const hiddenIds = new Set(prev.hiddenIds);
      if (hiddenIds.has(id)) hiddenIds.delete(id);
      else hiddenIds.add(id);
      return { ...prev, hiddenIds: [...hiddenIds] };
    });
  }, []);

  const show = useCallback((id: string) => {
    setLayout((prev) => ({
      ...prev,
      hiddenIds: prev.hiddenIds.filter((h) => h !== id),
    }));
  }, []);

  const hide = useCallback((id: string) => {
    setLayout((prev) => ({
      ...prev,
      hiddenIds: [...prev.hiddenIds.filter((h) => h !== id), id],
    }));
  }, []);

  const isVisible = useCallback((id: string) => !layout.hiddenIds.includes(id), [layout.hiddenIds]);

  const resetLayout = useCallback(() => {
    setLayout(DEFAULT_LAYOUT);
  }, []);

  const value = useMemo<NavCustomizationValue>(
    () => ({
      layout,
      moveModule, moveModuleToGroup, moveModuleToUngrouped, moveModuleWithinGroup,
      createGroup, renameGroup, deleteGroup, moveGroup,
      toggleGroupCollapsed,
      toggleVisibility, show, hide, isVisible, resetLayout,
      panelOpen, setPanelOpen,
    }),
    [layout, moveModule, moveModuleToGroup, moveModuleToUngrouped, moveModuleWithinGroup,
     createGroup, renameGroup, deleteGroup, moveGroup,
     toggleGroupCollapsed, toggleVisibility, show, hide,
     isVisible, resetLayout, panelOpen],
  );

  return (
    <NavCustomizationContext.Provider value={value}>
      {children}
    </NavCustomizationContext.Provider>
  );
}

export function useNavCustomization(): NavCustomizationValue {
  const ctx = useContext(NavCustomizationContext);
  if (!ctx) throw new Error("useNavCustomization must be inside <NavCustomizationProvider>");
  return ctx;
}
