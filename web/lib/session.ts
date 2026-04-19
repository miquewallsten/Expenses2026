export function getCurrentUserId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("currentUserId");
}

export function setCurrentUserId(userId: string): void {
  localStorage.setItem("currentUserId", userId);
}

export function clearCurrentUserId(): void {
  localStorage.removeItem("currentUserId");
}

export function getCurrentRole(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("currentUserRole");
}

export function setCurrentRole(role: string): void {
  localStorage.setItem("currentUserRole", role);
}

export function getCurrentCompanyId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("currentCompanyId");
}

export function setCurrentCompanyId(companyId: string): void {
  localStorage.setItem("currentCompanyId", companyId);
}

export function clearSession(): void {
  localStorage.removeItem("currentUserId");
  localStorage.removeItem("currentUserRole");
  localStorage.removeItem("currentCompanyId");
}
