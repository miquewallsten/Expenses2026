"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import AgentChat from "./AgentChat";

interface Props {
  companyId: number;
  /** Which admin worklist section the user is looking at. Drives preset chips. */
  section?:  string;
  variant?:  "rail" | "page";
}

/**
 * Admin persona wrapper. Preset chips change with the active admin section
 * so the same chat handles every domain (Company, Policy, Accounting, …).
 */
export default function AdminAgentChat({ companyId, section = "Overview", variant = "rail" }: Props) {
  const t  = useTranslations("agent.admin");
  const tp = useTranslations("agent.admin.presets");

  const presets = useMemo(() => buildPresets(section, tp), [section, tp]);
  const greeting = t("greeting");

  return (
    <AgentChat
      companyId={companyId}
      persona="admin"
      presets={presets}
      greeting={greeting}
      allowUpload
      variant={variant}
    />
  );
}

type T = (key: string) => string;

function buildPresets(section: string, t: T): Array<{ label: string; text: string }> {
  const common = [
    { label: t("diagnoseConfigLabel"),  text: t("diagnoseConfigText")  },
    { label: t("listAuditLabel"),       text: t("listAuditText")       },
  ];

  switch (section) {
    case "Company Setup":
      return [
        { label: t("companyMexicoLabel"),      text: t("companyMexicoText")      },
        { label: t("companyMultiEntityLabel"), text: t("companyMultiEntityText") },
        ...common,
      ];
    case "Expense Policy":
      return [
        { label: t("policyCfdiLabel"),   text: t("policyCfdiText")   },
        { label: t("policyProofLabel"),  text: t("policyProofText")  },
        ...common,
      ];
    case "Accounting Setup":
      return [
        { label: t("accountingUploadLabel"), text: t("accountingUploadText") },
        { label: t("accountingPolizaLabel"), text: t("accountingPolizaText") },
        ...common,
      ];
    case "Approval Setup":
      return [
        { label: t("approvalManagerLabel"),    text: t("approvalManagerText")    },
        { label: t("approvalThresholdLabel"),  text: t("approvalThresholdText")  },
        ...common,
      ];
    case "Workflow Setup":
      return [
        { label: t("workflowStagesLabel"),     text: t("workflowStagesText")     },
        { label: t("workflowTransitionLabel"), text: t("workflowTransitionText") },
        ...common,
      ];
    case "Users":
      return [
        { label: t("usersUploadLabel"), text: t("usersUploadText") },
        { label: t("usersListLabel"),   text: t("usersListText")   },
        ...common,
      ];
    case "Roles":
    case "Permissions":
      return [
        { label: t("rbacListLabel"),   text: t("rbacListText")   },
        { label: t("rbacAssignLabel"), text: t("rbacAssignText") },
        ...common,
      ];
    case "Report Cycle":
      return [
        { label: t("cycleWeeklyLabel"), text: t("cycleWeeklyText") },
        ...common,
      ];
    case "Channels":
      return [
        { label: t("channelsReadLabel"),   text: t("channelsReadText")   },
        ...common,
      ];
    case "Authentication":
      return [
        { label: t("authReadLabel"), text: t("authReadText") },
        ...common,
      ];
    default:
      return [
        { label: t("overviewStartLabel"), text: t("overviewStartText") },
        ...common,
      ];
  }
}
