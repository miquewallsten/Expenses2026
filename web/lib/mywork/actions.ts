import { apiCall } from "@/lib/api/client";
import type { ActionResponse } from "@/types/mywork";

export async function executeAction(
  actionId: string,
  module: string,
  payload: Record<string, unknown>,
): Promise<ActionResponse> {
  return apiCall<ActionResponse>("/mywork/actions", {
    method: "POST",
    json: {
      action_id: actionId,
      module,
      payload,
      context: {},
    },
  });
}
