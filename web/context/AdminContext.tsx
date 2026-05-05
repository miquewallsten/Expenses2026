"use client";

import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

export type AdminSection =
  | "onboarding"
  | "company-setup"
  | "expense-policy"
  | "approval-workflow"
  | "users-roles"
  | "accounting-setup"
  | "integrations"
  | "platform-api"
  | "export"
  | "audit-log"
  | "cfdi-watcher"
  | "notifications";

interface AdminContextValue {
  activeSection: AdminSection;
  setActiveSection: (section: AdminSection) => void;
  onboardingCompleted: boolean;
  setOnboardingCompleted: (completed: boolean) => void;
}

const AdminContext = createContext<AdminContextValue | null>(null);

export function AdminProvider({ children }: { children: ReactNode }) {
  const [activeSection, setActiveSection] = useState<AdminSection>("company-setup");
  const [onboardingCompleted, setOnboardingCompleted] = useState(false);

  return (
    <AdminContext.Provider
      value={{
        activeSection,
        setActiveSection,
        onboardingCompleted,
        setOnboardingCompleted,
      }}
    >
      {children}
    </AdminContext.Provider>
  );
}

export function useAdminContext() {
  const ctx = useContext(AdminContext);
  if (!ctx) {
    throw new Error("useAdminContext must be used within AdminProvider");
  }
  return ctx;
}