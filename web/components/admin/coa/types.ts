"use client";

// ── Shared types for Chart of Accounts components ────────────────────────────

export interface AccountRead {
  id: number;
  code: string;
  name: string;
  parent_id: number | null;
  sat_group_code: string | null;
  account_class: string;
  is_postable: boolean;
  split_by: string;
  sort_order: number;
  is_active: boolean;
}

export interface TaxRateRead {
  id: number;
  name: string;
  rate: number;
  behavior: string;
  gl_account_id: number | null;
  is_active: boolean;
}

export interface CategoryRead {
  id: number;
  code: string;
  name: string;
  expense_account_id: number | null;
  tax_rate_id: number | null;
  counterparty_account_id: number | null;
}

export interface PolizaLine {
  account_code: string;
  account_name: string;
  debit:  string;
  credit: string;
  note:   string;
}

export interface PolizaResult {
  lines: PolizaLine[];
  balanced: boolean;
  total_debit:  string;
  total_credit: string;
  warnings: string[];
}

export type Tab = "mapeo" | "cuentas" | "iva" | "importar" | "pruebas" | "exportar";

export const SAMPLE_EXPENSES: {
  category_code: string;
  amount: number;
  description: string;
  vendor: string;
}[] = [
  { category_code: "TRAVEL",                amount: 1856.00, description: "Vuelo MEX-MTY",          vendor: "Aeroméxico" },
  { category_code: "MEALS",                 amount:   742.40, description: "Cena con cliente",       vendor: "Pujol" },
  { category_code: "SOFTWARE",              amount:  3480.00, description: "Suscripción Notion",     vendor: "Notion Labs" },
  { category_code: "OFFICE",                amount:   464.00, description: "Papelería trimestral",   vendor: "Office Depot" },
  { category_code: "PROFESSIONAL_SERVICES", amount: 12760.00, description: "Honorarios legales",     vendor: "Bufete García" },
  { category_code: "MARKETING",             amount:  5800.00, description: "Campaña LinkedIn",       vendor: "LinkedIn Corp" },
  { category_code: "UTILITIES",             amount:  1276.00, description: "Internet oficina",       vendor: "Totalplay" },
  { category_code: "MISCELLANEOUS",         amount:   348.00, description: "Estacionamiento",        vendor: "OperaPark" },
];

export const ACCOUNT_CLASSES = ["expense", "asset", "liability", "income", "equity"];
export const SPLIT_OPTIONS   = ["none", "cost_center", "project", "client"];
export const TAX_BEHAVIORS   = ["acreditable", "no_acreditable", "trasladable", "retenido", "exento"];

export type AccountDraft = {
  id?: number;
  code: string;
  name: string;
  sat_group_code: string;
  account_class: string;
  split_by: string;
  is_postable: boolean;
  parent_id: number | null;
};

export type TaxRateDraft = {
  id?: number;
  name: string;
  rate: string;
  behavior: string;
  gl_account_id: number | null;
};

export const blankAccount = (): AccountDraft => ({
  code: "", name: "", sat_group_code: "",
  account_class: "expense", split_by: "none", is_postable: true,
  parent_id: null,
});

export const blankRate = (): TaxRateDraft => ({
  name: "", rate: "0.16", behavior: "acreditable", gl_account_id: null,
});

export const CUSTOM_PRESETS: { label: string; header: string; line: string; ext: string }[] = [
  {
    label: "CSV plano (1 fila por movimiento)",
    header: "fecha,poliza,cuenta,debe,haber,concepto",
    line:   "{date},EXP-{expense_id},{account_code},{debit},{credit},{description}",
    ext:    "csv",
  },
  {
    label: "TXT tabulado (ERP genérico)",
    header: "FECHA\tCUENTA\tDEBE\tHABER\tCONCEPTO",
    line:   "{date}\t{account_code}\t{debit}\t{credit}\t{description}",
    ext:    "txt",
  },
  {
    label: "Resumen por gasto (1 fila)",
    header: "id,fecha,categoría,monto,balanceado",
    line:   "{expense_id},{date},{category_code},{amount},{balanced}",
    ext:    "csv",
  },
];

export function buildAccountTree(accounts: AccountRead[]): { row: AccountRead; depth: number }[] {
  // Build an indented, parent-grouped list. Falls back to code-prefix
  // matching when parent_id is not set on the row (so legacy seeds still
  // render as a tree by their `601.10 → 601` numeric prefix).
  const byParent = new Map<number | null, AccountRead[]>();
  for (const a of accounts) {
    const pid = a.parent_id ?? null;
    if (!byParent.has(pid)) byParent.set(pid, []);
    byParent.get(pid)!.push(a);
  }
  const result: { row: AccountRead; depth: number }[] = [];
  const visit = (pid: number | null, depth: number) => {
    const children = byParent.get(pid) ?? [];
    for (const child of children) {
      result.push({ row: child, depth });
      visit(child.id, depth + 1);
    }
  };
  visit(null, 0);
  // If flat and no parent_id set, group by numeric prefix
  if (result.length === 0 && accounts.length > 0) {
    const sorted = [...accounts].sort((a, b) =>
      a.code.localeCompare(b.code, undefined, { numeric: true })
    );
    const seen = new Set<string>();
    for (const a of sorted) {
      const prefix = a.code.split(".")[0];
      if (!seen.has(prefix)) {
        const header = sorted.find(h => h.code === prefix);
        if (header && header.id !== a.id) {
          result.push({ row: header, depth: 0 });
          seen.add(prefix);
        }
      }
      result.push({ row: a, depth: prefix === a.code ? 0 : 1 });
    }
  }
  return result;
}
