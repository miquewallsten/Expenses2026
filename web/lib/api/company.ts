// web/lib/api/company.ts
// Helper API client to fetch the list of companies (tenants) for super-admin UI.

import { superAdminApiCall } from "./super-admin-client";

export async function listCompanies(): Promise<any[]> {
  return superAdminApiCall<any[]>("/super-admin/tenants", { method: "GET" });
}
