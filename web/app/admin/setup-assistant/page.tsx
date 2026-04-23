import { redirect } from "next/navigation";

// Legacy route — the standalone Setup Assistant was replaced by the unified
// AI agent in Phase 7.5. Redirect any lingering links to /admin/agent.
export default function SetupAssistantPage() {
  redirect("/admin/agent");
}
