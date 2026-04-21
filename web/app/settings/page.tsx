"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getCurrentRole } from "@/lib/session";

export default function SettingsPage() {
  const router = useRouter();
  useEffect(() => {
    const role = getCurrentRole();
    router.replace(role === "admin" ? "/admin" : "/mywork");
  }, [router]);
  return null;
}
