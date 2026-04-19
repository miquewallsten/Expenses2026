"use client";

import { useEffect, useState } from "react";
import { Building2, Info } from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_BASE_URL;

interface CompanyRead {
  id: number;
  name: string;
  slug: string;
  created_at: string;
}

interface Props {
  companyId: number;
}

function FieldRow({ label, value, mono }: { label: string; value?: string | null; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-white/[0.04] px-4 py-2.5 last:border-0">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-white/28">{label}</span>
      {value
        ? <span className={`text-[11px] text-white/55 ${mono ? "font-mono" : ""}`}>{value}</span>
        : <span className="text-[10px] italic text-white/18">—</span>
      }
    </div>
  );
}

export default function AdminCompanySetupPanel({ companyId }: Props) {
  const [company, setCompany] = useState<CompanyRead | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`${API}/companies/${companyId}`, { headers: { "X-User-Id": "1" } })
      .then((r) => r.ok ? r.json() : null)
      .then(setCompany)
      .catch(() => setCompany(null))
      .finally(() => setLoading(false));
  }, [companyId]);

  return (
    <div className="max-w-xl space-y-5">

      {/* Header */}
      <div className="border-b border-white/[0.06] pb-3">
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-white/25" />
          <h2 className="text-sm font-semibold text-white/80">Company Setup</h2>
        </div>
        <p className="mt-0.5 text-[11px] text-white/35">
          Core company identity and organisation configuration.
        </p>
      </div>

      {/* Company identity */}
      <div>
        <p className="mb-1 px-1 text-[9px] font-bold uppercase tracking-widest text-white/22">
          Company Identity
        </p>
        {loading ? (
          <p className="text-[10px] text-white/20 px-1">Loading…</p>
        ) : !company ? (
          <p className="text-[10px] italic text-white/20 px-1">Company not found.</p>
        ) : (
          <div className="overflow-hidden rounded-lg border border-white/[0.07] bg-white/[0.02]">
            <FieldRow label="Name"       value={company.name} />
            <FieldRow label="Slug"       value={company.slug} mono />
            <FieldRow label="Company ID" value={String(company.id)} mono />
            <FieldRow
              label="Created"
              value={new Date(company.created_at).toLocaleDateString("en-US", {
                month: "short", day: "numeric", year: "numeric",
              })}
            />
          </div>
        )}
      </div>

      {/* Extended setup notice */}
      <div className="flex items-start gap-2.5 rounded border border-white/[0.07] bg-white/[0.02] px-3 py-2.5">
        <Info className="mt-0.5 h-3 w-3 shrink-0 text-white/22" />
        <div className="space-y-0.5">
          <p className="text-[10px] font-semibold text-white/40">Extended company setup</p>
          <p className="text-[10px] leading-snug text-white/25">
            Organisation model, employee count, multi-entity configuration, and module activation
            are managed through the <span className="text-white/40 font-medium">Add-Ons</span> section
            and the <span className="text-white/40 font-medium">Expense Module</span> setup.
          </p>
        </div>
      </div>

    </div>
  );
}
