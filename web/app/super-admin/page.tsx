import { redirect } from "next/navigation";

// Redirect to the super-admin dashboard
export default function SuperAdminPage() {
  redirect("/super-admin/dashboard");
}
