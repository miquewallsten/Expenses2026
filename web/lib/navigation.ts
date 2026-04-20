export type GlobalNavItem = {
  key: string;
  label: string;
  href: string;
  active?: boolean;
  group?: string;
  icon?: string;
};

export type NavigationContext = {
  role: string | null;
  enabledModuleKeys: string[];
  permissionKeys: string[];
  currentPortal: "employee" | "admin" | "settings";
};

export function buildGlobalNav(context: NavigationContext): GlobalNavItem[] {
  const { role, permissionKeys, currentPortal } = context;

  const hasPermission = (key: string) => permissionKeys.includes(key);

  const items: GlobalNavItem[] = [];

  // ── My Work — single portal for all roles ──────────────────────────────────
  // Visible module tabs are controlled by moduleRegistry.ts based on role.
  // All roles (employee, manager, accounting, executive, secretary, admin)
  // use the same URL; role-appropriate modules appear automatically.
  if (role !== null) {
    items.push({
      key: "employee",
      label: "My Work",
      href: "/mywork",
      group: "Workspaces",
      active: currentPortal === "employee",
    });
  }

  // ── Admin ──────────────────────────────────────────────────────────────────
  if (
    role === "admin" ||
    hasPermission("configure_rules") ||
    hasPermission("activate_modules")
  ) {
    items.push({
      key: "admin",
      label: "Admin",
      href: "/admin",
      group: "Administration",
      active: currentPortal === "admin",
    });
  }

  // ── Time Setup — project & activity catalog (admin tool) ───────────────────
  if (
    role === "admin" ||
    hasPermission("configure_rules") ||
    hasPermission("manage_projects")
  ) {
    items.push({
      key: "time-admin",
      label: "Time Setup",
      href: "/time-admin",
      group: "Administration",
      active: currentPortal === ("time-admin" as never),
    });
  }

  return items;
}

