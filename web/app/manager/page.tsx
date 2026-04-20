import { redirect } from "next/navigation";

// This route has moved to /mywork — the single unified portal for all roles.
export default function ManagerPage() {
  redirect("/mywork");
}
