import { apiCall } from "@/lib/api/client";
import type { PermissionManifest, ActionResponse } from "@/types/mywork";

export async function fetchManifest(): Promise<PermissionManifest> {
  return apiCall<PermissionManifest>("/mywork/manifest");
}
