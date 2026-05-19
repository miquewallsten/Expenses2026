"use client";

import { ExternalLink, FileText, Image as Img, Link2, Paperclip, Plus, X } from "lucide-react";
import { useCallback } from "react";

const API = process.env.NEXT_PUBLIC_API_BASE_URL;

// ── Types ──────────────────────────────────────────────────────────────────────

export interface LineItem {
  description: string;
  qty: number | null;
  unit: string | null;
  unit_price: number | null;
  total: number | null;
}

export interface RequisitionData {
  // Section A – Requestor
  department?: string | null;
  cost_center?: string | null;
  // Section B – Request
  type?: string | null;
  title?: string | null;
  priority?: string | null;
  required_date?: string | null;
  delivery_address?: string | null;
  // Section C – Vendor
  vendor_name?: string | null;
  vendor_contact?: string | null;
  vendor_url?: string | null;
  // Section D – Items
  items?: LineItem[] | null;
  // Section E – Justification
  justification?: string | null;
  // Section F – Financial
  currency?: string | null;
  account_code?: string | null;
  subtotal?: number | null;
  tax?: number | null;
  total_amount?: number | null;
  // legacy / fallback fields from old agent
  [key: string]: unknown;
}

export interface Attachment {
  id: number;
  request_id: number;
  attachment_type: "file" | "url";
  original_name: string | null;
  file_size: number | null;
  mime_type: string | null;
  url: string | null;
  label: string | null;
  created_at: string;
}

export interface PurchaseRequisitionFormProps {
  requestId: number;
  requestNo: string;
  requestDate: string;
  requesterName: string;
  companyId: string;
  data: RequisitionData;
  attachments?: Attachment[];
  logoUrl?: string | null;
  status?: string;
  editable?: boolean;
  onDataChange?: (updated: RequisitionData) => void;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const TYPE_OPTIONS = [
  { value: "",          label: " -  Select type  - " },
  { value: "travel",    label: "Travel / Transportation" },
  { value: "hotel",     label: "Hotel / Accommodation" },
  { value: "equipment", label: "Equipment / Hardware" },
  { value: "software",  label: "Software / Subscription" },
  { value: "service",   label: "Service / Contractor" },
  { value: "other",     label: "Other" },
];

const PRIORITY_OPTIONS = [
  { value: "normal", label: "Normal" },
  { value: "high",   label: "High" },
  { value: "urgent", label: "Urgent" },
];

const TYPE_LABELS: Record<string, string> = Object.fromEntries(
  TYPE_OPTIONS.slice(1).map((o) => [o.value, o.label])
);

function fmt(v: number | null | undefined, currency?: string | null) {
  if (v == null) return " - ";
  const n = Number(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return currency ? `${currency} ${n}` : n;
}

function fmtDate(iso?: string | null) {
  if (!iso) return " - ";
  return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function fmtBytes(b: number) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

function Cell({ label, value, span = 1 }: { label: string; value?: string | null; span?: 1 | 2 | 3 }) {
  const widthCls = span === 2 ? "col-span-2" : span === 3 ? "col-span-3" : "";
  return (
    <div className={`${widthCls} min-h-[38px]`}>
      <div className="border-b border-slate-200 pb-0.5 text-[8px] font-semibold uppercase tracking-wider text-slate-400">
        {label}
      </div>
      <div className="pt-1 text-[11px] text-slate-800">
        {value || <span className="text-slate-300 italic"> - </span>}
      </div>
    </div>
  );
}

// Editable field cell - shows input/select/textarea when editable
const fieldBase =
  "w-full border-0 border-b border-slate-200 bg-transparent px-0 pt-1 pb-0.5 text-[11px] text-slate-800 outline-none placeholder-slate-300 focus:border-slate-500 focus:ring-0";

function ECell({
  label, value, span = 1, inputType = "text", placeholder, onChange, options,
}: {
  label: string;
  value?: string | null;
  span?: 1 | 2 | 3;
  inputType?: "text" | "date" | "number" | "select";
  placeholder?: string;
  onChange?: (val: string) => void;
  options?: { value: string; label: string }[];
}) {
  const widthCls = span === 2 ? "col-span-2" : span === 3 ? "col-span-3" : "";
  return (
    <div className={`${widthCls} min-h-[38px]`}>
      <div className="pb-0.5 text-[8px] font-semibold uppercase tracking-wider text-slate-400">{label}</div>
      {inputType === "select" && options ? (
        <select
          value={value ?? ""}
          onChange={(e) => onChange?.(e.target.value)}
          className="w-full border-0 border-b border-slate-200 bg-transparent px-0 pt-1 pb-0.5 text-[11px] text-slate-800 outline-none focus:border-slate-500"
        >
          {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      ) : (
        <input
          type={inputType}
          value={value ?? ""}
          placeholder={placeholder ?? " - "}
          onChange={(e) => onChange?.(e.target.value)}
          className={fieldBase}
        />
      )}
    </div>
  );
}

// ── Form component ─────────────────────────────────────────────────────────────

export default function PurchaseRequisitionForm({
  requestId,
  requestNo,
  requestDate,
  requesterName,
  companyId,
  data,
  attachments = [],
  logoUrl,
  status,
  editable = false,
  onDataChange,
}: PurchaseRequisitionFormProps) {
  void requestId; void requestDate;

  const currency = data.currency ?? null;

  // Build items - fall back to legacy free-form details if items array absent
  const items: LineItem[] = Array.isArray(data.items) && data.items.length > 0
    ? data.items
    : [];

  const computedSubtotal = items.length > 0
    ? items.reduce((s, it) => {
        const lineTotal = it.total ?? (it.qty != null && it.unit_price != null ? it.qty * it.unit_price : null);
        return s + (Number(lineTotal) || 0);
      }, 0)
    : null;
  const subtotal = data.subtotal != null ? Number(data.subtotal) : computedSubtotal;
  const tax      = data.tax != null ? Number(data.tax) : null;
  const total    = data.total_amount != null ? Number(data.total_amount) : (subtotal != null ? subtotal + (tax ?? 0) : null);

  // Collect unmapped legacy keys for "Additional Details" section
  const knownKeys = [
    "type", "title", "department", "cost_center", "priority", "required_date",
    "delivery_address", "vendor_name", "vendor_contact", "vendor_url", "items",
    "justification", "currency", "account_code", "subtotal", "tax", "total_amount", "budget",
    "origin", "destination", "departure_date", "return_date", "travelers", "travel_class",
    "check_in_date", "check_out_date", "product_name", "license_type", "seats", "business_purpose",
  ];
  const extra = Object.entries(data).filter(
    ([k, v]) => !knownKeys.includes(k) && v != null && typeof v !== "object"
  );

  // Field-change helper - merges a single key and fires onDataChange
  const change = useCallback(
    (field: string, value: unknown) => onDataChange?.({ ...data, [field]: value || null }),
    [data, onDataChange]
  );

  // Line-item helpers
  const updateItem = useCallback(
    (idx: number, field: keyof LineItem, raw: string) => {
      const updated = items.map((it, i) => {
        if (i !== idx) return it;
        const next = {
          ...it,
          [field]: raw === "" ? null : field === "description" || field === "unit" ? raw : Number(raw) || null,
        };
        if (field === "qty" || field === "unit_price") {
          const q = field === "qty" ? (Number(raw) || null) : next.qty;
          const p = field === "unit_price" ? (Number(raw) || null) : next.unit_price;
          next.total = q != null && p != null ? q * p : null;
        }
        return next;
      });
      onDataChange?.({ ...data, items: updated });
    },
    [items, data, onDataChange]
  );

  const addItem = useCallback(
    () => onDataChange?.({ ...data, items: [...items, { description: "", qty: null, unit: null, unit_price: null, total: null }] }),
    [items, data, onDataChange]
  );

  const removeItem = useCallback(
    (idx: number) => onDataChange?.({ ...data, items: items.filter((_, i) => i !== idx) }),
    [items, data, onDataChange]
  );

  const hasVendor = data.vendor_name || data.vendor_contact || data.vendor_url;

  return (
    <div className="h-full overflow-y-auto bg-slate-100 p-4">
      <div
        className="mx-auto max-w-[680px] bg-surface-1 border border-default rounded-lg"
        style={{ fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif" }}
      >
        {/* ── Header ──────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between border-b-2 border-slate-800 px-6 py-4">
          <div className="flex items-center gap-3">
            {logoUrl ? (
              <img
                src={`${API}${logoUrl}`}
                alt="Company logo"
                className="h-10 max-w-[120px] object-contain"
                onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
              />
            ) : (
              <div className="flex h-10 w-10 items-center justify-center rounded bg-slate-800 text-[10px] font-bold uppercase text-primary">
                CO
              </div>
            )}
          </div>
          <div className="text-right">
            <h1 className="text-[17px] font-bold uppercase tracking-widest text-slate-800">
              Purchase Requisition
            </h1>
            <div className="mt-1 grid grid-cols-[auto_auto] gap-x-4 text-right text-[10px]">
              <span className="font-semibold uppercase tracking-wide text-slate-400">Req. No.</span>
              <span className="font-mono font-semibold text-slate-700">{requestNo}</span>
              {status && (
                <>
                  <span className="font-semibold uppercase tracking-wide text-slate-400">Status</span>
                  <span className="font-semibold uppercase text-slate-700">{status.replace(/_/g, " ")}</span>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-0 divide-y divide-slate-100 px-6 py-5">

          {/* ── Section A: Requestor ──────────────────────────────────── */}
          <section className="pb-4">
            <h2 className="mb-3 text-[8px] font-bold uppercase tracking-widest text-slate-400">
              A - Requestor
            </h2>
            <div className="grid grid-cols-3 gap-x-6 gap-y-3">
              <Cell label="Requestor Name" value={requesterName} span={2} />
              {editable ? (
                <ECell label="Date Required" value={data.required_date ?? null} inputType="date"
                  onChange={(v) => change("required_date", v)} />
              ) : (
                <Cell label="Date Required" value={fmtDate(data.required_date)} />
              )}
              {editable ? (
                <ECell label="Department / Area" value={data.department ?? null} span={2}
                  placeholder="e.g. Engineering" onChange={(v) => change("department", v)} />
              ) : (
                <Cell label="Department / Area" value={data.department} span={2} />
              )}
              {editable ? (
                <ECell label="Cost Center" value={data.cost_center ?? null}
                  placeholder="e.g. CC-301" onChange={(v) => change("cost_center", v)} />
              ) : (
                <Cell label="Cost Center" value={data.cost_center} />
              )}
            </div>
          </section>

          {/* ── Section B: Request Details ────────────────────────────── */}
          <section className="py-4">
            <h2 className="mb-3 text-[8px] font-bold uppercase tracking-widest text-slate-400">
              B - Request Details
            </h2>
            <div className="grid grid-cols-3 gap-x-6 gap-y-3">
              {editable ? (
                <>
                  <ECell label="Request Type" value={data.type ?? ""} inputType="select"
                    options={TYPE_OPTIONS} onChange={(v) => change("type", v)} />
                  <ECell label="Priority" value={data.priority ?? "normal"} inputType="select"
                    options={PRIORITY_OPTIONS} onChange={(v) => change("priority", v)} />
                  <ECell label="Account / Budget Code" value={data.account_code ?? null}
                    placeholder="e.g. 6100" onChange={(v) => change("account_code", v)} />
                  <ECell label="Title / Description" value={data.title ?? null} span={3}
                    placeholder="Brief summary of the request" onChange={(v) => change("title", v)} />
                  <ECell label="Delivery Address" value={data.delivery_address ?? null} span={3}
                    placeholder="Leave blank if N/A" onChange={(v) => change("delivery_address", v)} />
                </>
              ) : (
                <>
                  <Cell label="Request Type" value={data.type ? (TYPE_LABELS[data.type] ?? data.type) : null} />
                  <Cell label="Priority" value={data.priority ?? "Normal"} />
                  <Cell label="Account / Budget Code" value={data.account_code} />
                  <Cell label="Title / Description" value={data.title} span={3} />
                  {data.delivery_address && <Cell label="Delivery Address" value={data.delivery_address} span={3} />}
                </>
              )}
            </div>
          </section>

          {/* ── Section C: Vendor ────────────────────────────────────── */}
          {(editable || hasVendor) && (
            <section className="py-4">
              <h2 className="mb-3 text-[8px] font-bold uppercase tracking-widest text-slate-400">
                C - Preferred Vendor (if known)
              </h2>
              <div className="grid grid-cols-3 gap-x-6 gap-y-3">
                {editable ? (
                  <>
                    <ECell label="Vendor / Supplier" value={data.vendor_name ?? null}
                      placeholder="e.g. Acme Corp" onChange={(v) => change("vendor_name", v)} />
                    <ECell label="Contact" value={data.vendor_contact ?? null}
                      placeholder="Name or email" onChange={(v) => change("vendor_contact", v)} />
                    <ECell label="Website / Quote URL" value={data.vendor_url ?? null}
                      placeholder="https://" onChange={(v) => change("vendor_url", v)} />
                  </>
                ) : (
                  <>
                    <Cell label="Vendor / Supplier" value={data.vendor_name} />
                    <Cell label="Contact" value={data.vendor_contact} />
                    <Cell label="Website / Quote URL" value={data.vendor_url} />
                  </>
                )}
              </div>
            </section>
          )}

          {/* ── Section D: Line Items ─────────────────────────────────── */}
          <section className="py-4">
            <h2 className="mb-3 text-[8px] font-bold uppercase tracking-widest text-slate-400">
              D - Items / Services Requested
            </h2>
            <table className="w-full border-collapse text-[10px]">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="py-1.5 pr-1 text-left font-semibold uppercase tracking-wide text-slate-400">#</th>
                  <th className="py-1.5 pr-2 text-left font-semibold uppercase tracking-wide text-slate-400">Description</th>
                  <th className="w-12 py-1.5 pr-2 text-center font-semibold uppercase tracking-wide text-slate-400">Qty</th>
                  <th className="w-12 py-1.5 pr-2 text-center font-semibold uppercase tracking-wide text-slate-400">Unit</th>
                  <th className="w-20 py-1.5 pr-2 text-right font-semibold uppercase tracking-wide text-slate-400">Unit Price</th>
                  <th className="w-20 py-1.5 text-right font-semibold uppercase tracking-wide text-slate-400">Total</th>
                  {editable && <th className="w-5" />}
                </tr>
              </thead>
              <tbody>
                {items.length > 0 ? items.map((it, i) => (
                  <tr key={i} className="border-b border-slate-100">
                    <td className="py-1.5 pr-1 text-slate-400">{i + 1}</td>
                    <td className="py-1.5 pr-2">
                      {editable
                        ? <input type="text" value={it.description ?? ""} placeholder="Describe item or service"
                            onChange={(e) => updateItem(i, "description", e.target.value)}
                            className="w-full border-0 border-b border-slate-200 bg-transparent text-[10px] text-slate-800 outline-none placeholder-slate-300 focus:border-slate-500" />
                        : <span className="text-slate-700">{it.description}</span>}
                    </td>
                    <td className="py-1.5 pr-2 text-center">
                      {editable
                        ? <input type="number" value={it.qty ?? ""} min={0}
                            onChange={(e) => updateItem(i, "qty", e.target.value)}
                            className="w-full border-0 border-b border-slate-200 bg-transparent text-center text-[10px] text-slate-800 outline-none focus:border-slate-500" />
                        : <span className="text-slate-600">{it.qty ?? " - "}</span>}
                    </td>
                    <td className="py-1.5 pr-2 text-center">
                      {editable
                        ? <input type="text" value={it.unit ?? ""} placeholder="ea"
                            onChange={(e) => updateItem(i, "unit", e.target.value)}
                            className="w-full border-0 border-b border-slate-200 bg-transparent text-center text-[10px] text-slate-800 outline-none placeholder-slate-300 focus:border-slate-500" />
                        : <span className="text-slate-500">{it.unit ?? " - "}</span>}
                    </td>
                    <td className="py-1.5 pr-2 text-right">
                      {editable
                        ? <input type="number" value={it.unit_price ?? ""} min={0} step="0.01"
                            onChange={(e) => updateItem(i, "unit_price", e.target.value)}
                            className="w-full border-0 border-b border-slate-200 bg-transparent text-right text-[10px] text-slate-800 outline-none focus:border-slate-500" />
                        : <span className="text-slate-600">{fmt(it.unit_price)}</span>}
                    </td>
                    <td className="py-1.5 text-right font-medium text-slate-700">
                      {fmt(it.total ?? (it.qty != null && it.unit_price != null ? it.qty * it.unit_price : null))}
                    </td>
                    {editable && (
                      <td className="py-1.5 pl-1">
                        <button type="button" onClick={() => removeItem(i)}
                          className="text-slate-300 hover:text-error">
                          <X className="h-3 w-3" />
                        </button>
                      </td>
                    )}
                  </tr>
                )) : (
                  [1, 2, 3].map((n) => (
                    <tr key={n} className="border-b border-slate-100">
                      <td className="py-1.5 pr-1 text-slate-200">{n}</td>
                      <td className="py-1.5 pr-2" colSpan={editable ? 5 : 4}>
                        <span className="italic text-slate-200"> - </span>
                      </td>
                      {editable && <td />}
                    </tr>
                  ))
                )}
              </tbody>
              <tfoot>
                {editable && (
                  <tr>
                    <td colSpan={7} className="pt-1.5 pb-0.5">
                      <button type="button" onClick={addItem}
                        className="flex items-center gap-1 text-[9px] font-medium text-accent hover:text-indigo-700">
                        <Plus className="h-3 w-3" /> Add row
                      </button>
                    </td>
                  </tr>
                )}
                <tr className="bg-slate-50">
                  <td colSpan={editable ? 5 : 4} />
                  <td className="py-1.5 pr-2 text-right text-[9px] font-semibold uppercase tracking-wide text-slate-400">Subtotal</td>
                  <td className="py-1.5 text-right text-[10px] font-medium text-slate-700">{fmt(subtotal, currency)}</td>
                  {editable && <td />}
                </tr>
                {tax != null && (
                  <tr className="bg-slate-50">
                    <td colSpan={editable ? 5 : 4} />
                    <td className="pb-1.5 pr-2 text-right text-[9px] font-semibold uppercase tracking-wide text-slate-400">Tax</td>
                    <td className="pb-1.5 text-right text-[10px] text-slate-600">{fmt(tax, currency)}</td>
                    {editable && <td />}
                  </tr>
                )}
                <tr className="border-t-2 border-slate-800 bg-slate-50">
                  <td colSpan={editable ? 5 : 4} />
                  <td className="py-1.5 pr-2 text-right text-[9px] font-bold uppercase tracking-wide text-slate-700">Total</td>
                  <td className="py-1.5 text-right text-[12px] font-bold text-slate-800">{fmt(total, currency)}</td>
                  {editable && <td />}
                </tr>
              </tfoot>
            </table>
            {editable && (
              <div className="mt-2 flex items-center gap-2">
                <span className="text-[9px] font-semibold uppercase tracking-wide text-slate-400">Currency</span>
                <input type="text" value={data.currency ?? ""} placeholder="USD" maxLength={6}
                  onChange={(e) => change("currency", e.target.value.toUpperCase())}
                  className="w-14 border-0 border-b border-slate-200 bg-transparent text-[10px] text-slate-800 outline-none focus:border-slate-500" />
              </div>
            )}
          </section>

          {/* ── Section E: Justification ──────────────────────────────── */}
          <section className="py-4">
            <h2 className="mb-3 text-[8px] font-bold uppercase tracking-widest text-slate-400">
              E - Justification / Business Purpose
            </h2>
            {editable ? (
              <textarea
                rows={3}
                value={data.justification ?? ""}
                placeholder="Explain why this purchase is needed…"
                onChange={(e) => change("justification", e.target.value)}
                className="w-full resize-none rounded border border-slate-200 px-3 py-2 text-[11px] text-slate-700 outline-none placeholder-slate-300 focus:border-slate-400"
              />
            ) : (
              <div className="min-h-[48px] rounded border border-slate-200 px-3 py-2 text-[11px] text-slate-700">
                {data.justification || <span className="italic text-slate-300"> - </span>}
              </div>
            )}
          </section>

          {/* ── Legacy extra fields ───────────────────────────────────── */}
          {extra.length > 0 && (
            <section className="py-4">
              <h2 className="mb-3 text-[8px] font-bold uppercase tracking-widest text-slate-400">Additional Details</h2>
              <div className="grid grid-cols-3 gap-x-6 gap-y-3">
                {extra.map(([k, v]) => <Cell key={k} label={k.replace(/_/g, " ")} value={String(v)} />)}
              </div>
            </section>
          )}

          {/* ── Section F: Attachments ────────────────────────────────── */}
          {attachments.length > 0 && (
            <section className="py-4">
              <h2 className="mb-3 flex items-center gap-1.5 text-[8px] font-bold uppercase tracking-widest text-slate-400">
                <Paperclip className="h-2.5 w-2.5" />
                F - Supporting Documents &amp; References
              </h2>
              <table className="w-full border-collapse text-[10px]">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50">
                    <th className="py-1 pr-2 text-left font-semibold uppercase tracking-wide text-slate-400">#</th>
                    <th className="py-1 pr-2 text-left font-semibold uppercase tracking-wide text-slate-400">Document / Link</th>
                    <th className="py-1 pr-2 text-left font-semibold uppercase tracking-wide text-slate-400">Type</th>
                    <th className="py-1 text-right font-semibold uppercase tracking-wide text-slate-400">Size</th>
                  </tr>
                </thead>
                <tbody>
                  {attachments.map((att, i) => (
                    <tr key={att.id} className="border-b border-slate-100">
                      <td className="py-1.5 pr-2 text-slate-400">{i + 1}</td>
                      <td className="py-1.5 pr-2">
                        <div className="flex items-center gap-1.5">
                          <span className="text-slate-400">
                            {att.attachment_type === "url" ? <Link2 className="h-3 w-3" />
                              : att.mime_type?.startsWith("image/") ? <Img className="h-3 w-3" />
                              : <FileText className="h-3 w-3" />}
                          </span>
                          <span className="text-slate-700">{att.label ?? att.original_name ?? att.url ?? "Attachment"}</span>
                          <a
                            href={att.attachment_type === "file"
                              ? `${API}/requests/${companyId}/attachments/${att.id}/download`
                              : (att.url ?? "#")}
                            target="_blank" rel="noopener noreferrer"
                            className="text-accent hover:text-indigo-700"
                          >
                            <ExternalLink className="h-2.5 w-2.5" />
                          </a>
                        </div>
                      </td>
                      <td className="py-1.5 pr-2 capitalize text-slate-500">
                        {att.attachment_type === "url" ? "URL / Link" : (att.mime_type?.split("/")[1]?.toUpperCase() ?? "File")}
                      </td>
                      <td className="py-1.5 text-right text-slate-400">
                        {att.file_size ? fmtBytes(att.file_size) : " - "}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          {/* ── Section G: For Purchasing Use ─────────────────────────── */}
          <section className="pt-4">
            <h2 className="mb-3 text-[8px] font-bold uppercase tracking-widest text-slate-400">
              G - For Purchasing / Accounting Use
            </h2>
            <div className="grid grid-cols-3 gap-x-6 gap-y-5">
              {(["Approved By", "Date", "PO / Reference No."] as const).map((lbl) => (
                <div key={lbl}>
                  <div className="border-b border-slate-800 pb-0.5 text-[8px] font-semibold uppercase tracking-wider text-slate-400">{lbl}</div>
                  <div className="h-5" />
                </div>
              ))}
              <div className="col-span-3">
                <div className="border-b border-slate-800 pb-0.5 text-[8px] font-semibold uppercase tracking-wider text-slate-400">Notes</div>
                <div className="h-8" />
              </div>
            </div>
          </section>
        </div>

        {/* Footer */}
        <div className="border-t border-slate-200 px-6 py-2 text-center text-[8px] text-slate-300">
          {requestNo}
        </div>
      </div>
    </div>
  );
}

