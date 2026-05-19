"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Plug, KeyRound, Download, ArrowRightLeft } from "lucide-react";
import IntegrationsSection from "./IntegrationsSection";
import PlatformApiSection from "./PlatformApiSection";
import ExportWizardSection from "./ExportWizardSection";
import { PremiumHeader, SectionPanel } from "@/components/admin/shared/AdminPatterns";

type Tab = "connections" | "export" | "api";

export default function IntegrationsHubSection() {
  const t = useTranslations("admin.integrations");
  const [tab, setTab] = useState<Tab>("connections");

  const tabs: { id: Tab; label: string; icon: any }[] = [
    { id: "connections", label: t("tabConnections"), icon: ArrowRightLeft },
    { id: "export", label: t("tabExport"), icon: Download },
    { id: "api", label: t("tabApi"), icon: KeyRound },
  ];

  return (
    <div className="space-y-4">
      <PremiumHeader
        icon={<Plug className="h-5 w-5" />}
        title={t("hubTitle")}
        subtitle={t("hubSubtitle")}
        section="integrations"
      />

      {/* Tab navigation */}
      <div className="flex flex-wrap gap-1">
        {tabs.map((tb) => {
          const Icon = tb.icon;
          const isActive = tab === tb.id;
          return (
            <button
              key={tb.id}
              type="button"
              onClick={() => setTab(tb.id)}
              className={`flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-[10px] font-medium transition-all ${
                isActive
                  ? "border-accent/30 bg-accent/10 text-accent"
                  : "border-default bg-surface-2 text-secondary hover:border-strong hover:text-primary"
              }`}
            >
              <Icon className="h-3 w-3" />
              {tb.label}
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div>
        {tab === "connections" && <IntegrationsSection />}
        {tab === "export" && <ExportWizardSection />}
        {tab === "api" && <PlatformApiSection />}
      </div>
    </div>
  );
}
