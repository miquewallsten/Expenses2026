"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import AgentChat from "./AgentChat";

interface Props {
  companyId: number;
  /** Which admin worklist section the user is looking at. Drives preset chips. */
  section?:  string;
  variant?:  "rail" | "page";
  /** Called after every successful tool confirmation so the host can refetch. */
  onToolConfirmed?: (tool: string) => void;
}

/**
 * Admin persona wrapper. Preset chips change with the active admin section
 * so the same chat handles every domain (Company, Policy, Accounting, …).
 */
export default function AdminAgentChat({ companyId, section = "Overview", variant = "rail", onToolConfirmed }: Props) {
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
      onToolConfirmed={onToolConfirmed}
    />
  );
}

type T = (key: string) => string;

function buildPresets(section: string, tp: T): Array<{ label: string; text: string }> {
  const common = [
    { label: tp("diagnoseConfigLabel"),  text: tp("diagnoseConfigText")  },
    { label: tp("listAuditLabel"),       text: tp("listAuditText")       },
  ];

  switch (section) {
    case "Company Setup":
      return [
        { label: tp("companyMexicoLabel"),      text: tp("companyMexicoText")      },
        { label: tp("companyMultiEntityLabel"), text: tp("companyMultiEntityText") },
        ...common,
      ];
    case "Expense Policy":
      return [
        { label: tp("policyCfdiLabel"),   text: tp("policyCfdiText")   },
        { label: tp("policyProofLabel"),  text: tp("policyProofText")  },
        ...common,
      ];
    case "Accounting Setup":
      return [
        { label: tp("accountingUploadLabel"), text: tp("accountingUploadText") },
        { label: tp("accountingPolizaLabel"), text: tp("accountingPolizaText") },
        ...common,
      ];
    case "Approval Setup":
      return [
        { label: tp("approvalManagerLabel"),    text: tp("approvalManagerText")    },
        { label: tp("approvalThresholdLabel"),  text: tp("approvalThresholdText")  },
        ...common,
      ];
    case "Workflow Setup":
      return [
        { label: tp("workflowStagesLabel"),     text: tp("workflowStagesText")     },
        { label: tp("workflowTransitionLabel"), text: tp("workflowTransitionText") },
        ...common,
      ];
    case "Users":
      return [
        { label: tp("usersUploadLabel"), text: tp("usersUploadText") },
        { label: tp("usersListLabel"),   text: tp("usersListText")   },
        ...common,
      ];
    case "Roles":
    case "Permissions":
      return [
        { label: tp("rbacListLabel"),   text: tp("rbacListText")   },
        { label: tp("rbacAssignLabel"), text: tp("rbacAssignText") },
        ...common,
      ];
    case "Report Cycle":
      return [
        { label: tp("cycleWeeklyLabel"), text: tp("cycleWeeklyText") },
        ...common,
      ];
    case "Channels":
      return [
        { label: tp("channelsReadLabel"),   text: tp("channelsReadText")   },
        ...common,
      ];
    case "Authentication":
      return [
        { label: tp("authReadLabel"), text: tp("authReadText") },
        ...common,
      ];
    default:
      return [
        { label: tp("overviewStartLabel"), text: tp("overviewStartText") },
        ...common,
      ];
  }
}
