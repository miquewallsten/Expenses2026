import { redirect } from "next/navigation";

// Legacy route — redirects to unified admin module in /mywork.
export default function SetupAssistantPage() {
  redirect("/mywork?module=admin");
}
