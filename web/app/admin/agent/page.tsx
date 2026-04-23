"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bot, ChevronLeft } from "lucide-react";
import { useTranslations } from "next-intl";
import AdminAgentChat from "@/components/agent/AdminAgentChat";
import { getCurrentCompanyId } from "@/lib/session";

export const dynamic = "force-dynamic";

export default function AdminAgentPage() {
  const t = useTranslations("agent.admin");
  const [companyId, setCompanyId] = useState<number | null>(null);

  useEffect(() => {
    const cid = getCurrentCompanyId();
    setCompanyId(cid ? Number(cid) : null);
  }, []);

  return (
    <div className="flex h-screen flex-col bg-zinc-950">
      <header className="flex h-11 shrink-0 items-center gap-3 border-b border-white/[0.07] px-5">
        <Link
          href="/admin"
          className="flex items-center gap-1.5 text-[10px] text-white/35 transition-colors hover:text-white/55"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Admin
        </Link>
        <span className="text-white/15">/</span>
        <div className="flex items-center gap-1.5">
          <Bot className="h-3.5 w-3.5 text-indigo-400/70" />
          <span className="text-[11px] font-semibold text-white/55">{t("pageTitle")}</span>
        </div>
        <div className="ml-auto rounded border border-indigo-500/25 bg-indigo-500/10 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-widest text-indigo-300/70">
          v2
        </div>
      </header>

      <div className="min-h-0 flex-1 p-4">
        {companyId != null ? (
          <AdminAgentChat companyId={companyId} variant="page" />
        ) : (
          <p className="text-xs text-zinc-500">{t("noCompany")}</p>
        )}
      </div>
    </div>
  );
}
