/**
 * Phase 5.6 — Finance copilot slash commands.
 *
 * Pre-formed prompts keyed to backend tools registered for the
 * ``admin`` and ``accounting`` personas. The agent decides
 * which tool to call based on the prompt text; we just wire a
 * convenient palette so finance users don't have to remember
 * Spanish phrasing for each operation.
 */

import type { AgentPersona } from "@/lib/agent/client";

export interface SlashCommand {
  /** Trigger as typed by the user (without the leading slash). */
  id:       string;
  /** i18n key under ``agent.chat.slash.<id>.label``. */
  labelKey: string;
  /** i18n key under ``agent.chat.slash.<id>.description``. */
  descKey:  string;
  /** Pre-formed user-message text submitted to the agent. */
  prompt:   string;
  /** When true, the user must edit a placeholder before sending. */
  needsArg?: boolean;
  /** Personas allowed to see this command. */
  personas: ReadonlyArray<AgentPersona>;
}

export const SLASH_COMMANDS: ReadonlyArray<SlashCommand> = [
  {
    id:       "nuevo-gasto",
    labelKey: "newExpense.label",
    descKey:  "newExpense.description",
    prompt:   "Quiero registrar un nuevo gasto. ¿Cuánto fue y en qué lo gastaste?",
    personas: ["admin", "employee"],
  },
  {
    id:       "mis-gastos",
    labelKey: "myExpenses.label",
    descKey:  "myExpenses.description",
    prompt:   "Muestra el estado de mis gastos y reembolsos pendientes.",
    personas: ["admin", "employee"],
  },
  {
    id:       "aprobar-gastos",
    labelKey: "approveExpenses.label",
    descKey:  "approveExpenses.description",
    prompt:   "Lista los gastos pendientes de mi aprobación.",
    personas: ["admin", "manager", "accounting"],
  },
  {
    id:       "recibos-faltantes",
    labelKey: "missingReceipts.label",
    descKey:  "missingReceipts.description",
    prompt:   "Lista los gastos aprobados sin recibo adjunto, máximo 50.",
    personas: ["admin", "accounting"],
  },
  {
    id:       "conciliar-cfdis",
    labelKey: "matchCfdis.label",
    descKey:  "matchCfdis.description",
    prompt:   "Concilia los CFDIs huérfanos contra gastos sin emparejar (máximo 100).",
    personas: ["admin", "accounting"],
  },
  {
    id:       "poliza-preview",
    labelKey: "polizaPreview.label",
    descKey:  "polizaPreview.description",
    prompt:   "Genera una vista previa de póliza para el gasto ID: ",
    needsArg: true,
    personas: ["admin", "accounting"],
  },
  {
    id:       "cierre-mensual",
    labelKey: "monthEnd.label",
    descKey:  "monthEnd.description",
    prompt:   "Ejecuta el cierre mensual y dame un resumen ejecutivo.",
    personas: ["admin", "accounting"],
  },
  {
    id:       "configurar-cuentas",
    labelKey: "setupAccounts.label",
    descKey:  "setupAccounts.description",
    prompt:   "Ayúdame a configurar las categorías contables y el catálogo de cuentas.",
    personas: ["admin"],
  },
];

export function filterSlashCommands(
  query: string,
  persona: AgentPersona,
): SlashCommand[] {
  const q = query.trim().toLowerCase();
  return SLASH_COMMANDS.filter((c) => {
    if (!c.personas.includes(persona)) return false;
    if (!q) return true;
    return c.id.toLowerCase().includes(q);
  });
}
