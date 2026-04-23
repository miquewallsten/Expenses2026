"use client";

import { useTranslations } from "next-intl";
import AgentChat from "./AgentChat";

interface Props {
  companyId: number;
  variant?: "rail" | "page";
}

/**
 * Employee persona wrapper — read-mostly; no ingestion tools exposed server-side.
 * Uploads are disabled here by convention (backend admin-only gate would
 * return 403 anyway).
 */
export default function EmployeeExpenseAgent({ companyId, variant = "rail" }: Props) {
  const t = useTranslations("agent.employee");
  return (
    <AgentChat
      companyId={companyId}
      persona="employee"
      allowUpload={false}
      greeting={t("greeting")}
      presets={[
        { label: t("pendingLabel"),   text: t("pendingText")   },
        { label: t("rejectedLabel"),  text: t("rejectedText")  },
        { label: t("nextActionLabel"), text: t("nextActionText") },
      ]}
      variant={variant}
    />
  );
}
