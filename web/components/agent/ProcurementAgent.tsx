"use client";

import { useTranslations } from "next-intl";
import AgentChat from "./AgentChat";

interface Props {
  companyId: number;
  variant?: "rail" | "page";
}

/** Procurement persona wrapper — purchase-request flows. */
export default function ProcurementAgent({ companyId, variant = "rail" }: Props) {
  const t = useTranslations("agent.procurement");
  return (
    <AgentChat
      companyId={companyId}
      persona="procurement"
      allowUpload={false}
      greeting={t("greeting")}
      presets={[
        { label: t("createLabel"),  text: t("createText")  },
        { label: t("statusLabel"),  text: t("statusText")  },
        { label: t("summaryLabel"), text: t("summaryText") },
      ]}
      variant={variant}
    />
  );
}
