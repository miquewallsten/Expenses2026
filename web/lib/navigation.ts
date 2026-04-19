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
  currentPortal: "employee" | "manager" | "accounting" | "admin" | "settings";
};

export function buildGlobalNav(context: NavigationContext): GlobalNavItem[] {
  const { role, enabledModuleKeys, permissionKeys, currentPortal } = context;

  const hasPermission = (key: string) => permissionKeys.includes(key);
  const hasModule = (key: string) =>
    enabledModuleKeys.length === 0 || enabledModuleKeys.includes(key);

  const items: GlobalNavItem[] = [];

  // Employee
  if (
    (role === "employee" || role === "admin") &&
    hasModule("expenses")
  ) {
    items.push({
      key: "employee",
      label: "Employee",
      href: "/employee",
      group: "Workspaces",
      active: currentPortal === "employee",
    });
  }

  // Manager
  if (
    role === "manager" ||
    role === "admin" ||
    hasPermission("approve_expense")
  ) {
    items.push({
      key: "manager",
      label: "Manager",
      href: "/manager",
      group: "Workspaces",
      active: currentPortal === "manager",
    });
  }

  // Accounting
  if (
    role === "accounting" ||
    role === "admin" ||
    hasPermission("assign_account")
  ) {
    items.push({
      key: "accounting",
      label: "Accounting",
      href: "/accounting",
      group: "Workspaces",
      active: currentPortal === "accounting",
    });
  }

  // Admin
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

  // Settings — always included
  items.push({
    key: "settings",
    label: "Settings",
    href: "/settings",
    group: "Personal",
    active: currentPortal === "settings",
  });

  return items;
}
