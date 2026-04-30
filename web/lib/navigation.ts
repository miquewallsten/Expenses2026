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

  // ── Super Admin — system-wide administration ──────────────────────────────
  if (role === "admin" && hasPermission("super_admin_access")) {
    items.push({
      key: "super-admin",
      label: "Super Admin",
      href: "/super-admin",
      group: "Administration",
      active: currentPortal === ("super-admin" as never),
    });
  }

  return items;
}

