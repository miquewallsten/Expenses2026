import { redirect } from "next/navigation";

// Legacy route — redirects to unified onboarding wizard.
export default function SetupAssistantPage() {
  redirect("/admin/onboarding");
}
