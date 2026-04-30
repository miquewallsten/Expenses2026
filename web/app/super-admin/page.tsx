import { redirect } from "next/navigation";

// Super admin landing moved to unified MyWork portal.
export default function SuperAdminPage() {
  redirect("/mywork?module=super-admin");
}
