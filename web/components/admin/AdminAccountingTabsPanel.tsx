"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import AdminAccountingSetupStudio from "./AdminAccountingSetupStudio";
import AdminChartOfAccountsStudio from "./AdminChartOfAccountsStudio";
import AdminDimensionsStudio from "./AdminDimensionsStudio";

type AccountingTab = "setup" | "chart" | "dimensions";

interface Props {
  companyId: number;
  accountingSetup: any;
  companySetup?: any;
  expensePolicy?: any;
  onSaved: (s: any) => void;
  draftPatch?: Partial<any>;
  initialTab?: AccountingTab;
  onTabChange?: (tab: AccountingTab) => void;
}

export default function AdminAccountingTabsPanel({
  companyId,
  accountingSetup,
  companySetup,
  expensePolicy,
  onSaved,
  draftPatch,
  initialTab,
  onTabChange,
}: Props) {
  const t = useTranslations("admin.accountingTabs");
  const [tab, setTab] = useState<AccountingTab>(initialTab ?? "setup");

  // React when the parent passes a new initialTab (e.g. when the Onboarding
  // step buttons re-target Chart of Accounts or Dimensions while the panel
  // is already mounted).
  useEffect(() => {
    if (initialTab) setTab(initialTab);
  }, [initialTab]);

  const selectTab = (next: AccountingTab) => {
    setTab(next);
    onTabChange?.(next);
  };

  const tabs: { key: AccountingTab; label: string }[] = [
    { key: "setup",      label: t("setup")      },
    { key: "chart",      label: t("chart")      },
    { key: "dimensions", label: t("dimensions") },
  ];

  return (
    <div className="flex flex-col gap-0">
      {/* Tab bar */}
      <div className="mb-4 flex items-center border-b border-white/[0.07]">
        {tabs.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => selectTab(key)}
            className={`px-3 pb-2 text-[11px] font-medium transition-colors ${
              tab === key
                ? "border-b-2 border-indigo-400/60 text-white/80"
                : "text-white/35 hover:text-white/60"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Content */}
      {tab === "setup" && (
        <AdminAccountingSetupStudio
          companyId={companyId}
          setup={accountingSetup ?? {}}
          companySetup={companySetup}
          expensePolicy={expensePolicy}
          onSaved={onSaved}
          draftPatch={draftPatch}
        />
      )}
      {tab === "chart" && (
        <AdminChartOfAccountsStudio companyId={companyId} />
      )}
      {tab === "dimensions" && (
        <AdminDimensionsStudio
          companyId={companyId}
          allocationDimensions={expensePolicy?.allocation_dimensions ?? null}
        />
      )}
    </div>
  );
}
