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
      label: "myWork",
      href: "/mywork",
      group: "Workspaces",  // i18n key for nav.groups.Workspaces
      active: currentPortal === "employee",
    });
  }

  // ── Super Admin — system-wide administration ──────────────────────────────
  if (role === "super_admin") {
    items.push({
      key: "super-admin",
      label: "superAdmin",
      href: "/super-admin",
      group: "Administration",  // i18n key for nav.groups.Administration
      active: currentPortal === ("super-admin" as never),
    });
  }

  return items;
}

