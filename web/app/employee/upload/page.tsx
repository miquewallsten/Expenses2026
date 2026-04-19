"use client";

import { useCallback, useMemo, useState } from "react";
import { useDropzone } from "react-dropzone";

type ValidationResult = {
  id?: number;
  source: string;
  rule_code: string;
  status: string;
  message: string;
};

type ExtractedData = {
  uuid?: string | null;
  total?: string | null;
  subtotal?: string | null;
  moneda?: string | null;
  tipo_comprobante?: string | null;
  metodo_pago?: string | null;
  forma_pago?: string | null;
  fecha?: string | null;
  emisor_rfc?: string | null;
  emisor_nombre?: string | null;
  receptor_rfc?: string | null;
  receptor_nombre?: string | null;
  descripcion?: string | null;
  total_impuestos_trasladados?: string | null;
  total_impuestos_retenidos?: string | null;
  objeto_imp?: string | null;
  impuesto?: string | null;
  tasa_o_cuota?: string | null;
  tipo_factor?: string | null;
  impuestos_trasladados?: string | null;
  impuestos_retenidos?: string | null;
};

type UploadItem = {
  localId: string;
  id?: number;
  name: string;
  status: "uploading" | "validating" | "valid" | "warning" | "error";
  validationResults: ValidationResult[];
  extractedData?: ExtractedData;
  errorMessage?: string;
};

function parseXmlExtracted(contentText: string): ExtractedData | undefined {
  const block = contentText.match(/\[XML_EXTRACTED\]([\s\S]*?)(?:\[|$)/);
  if (!block) return undefined;
  const lines = block[1].trim().split("\n");
  const get = (key: string) => {
    const line = lines.find((l) => l.startsWith(`${key}:`));
    if (!line) return null;
    const val = line.slice(key.length + 1).trim();
    return val === "None" || val === "" ? null : val;
  };
  return {
    uuid:                        get("uuid"),
    total:                       get("total"),
    subtotal:                    get("subtotal"),
    moneda:                      get("moneda"),
    tipo_comprobante:            get("tipo_comprobante"),
    metodo_pago:                 get("metodo_pago"),
    forma_pago:                  get("forma_pago"),
    fecha:                       get("fecha"),
    emisor_rfc:                  get("emisor_rfc"),
    emisor_nombre:               get("emisor_nombre"),
    receptor_rfc:                get("receptor_rfc"),
    receptor_nombre:             get("receptor_nombre"),
    descripcion:                 get("descripcion"),
    total_impuestos_trasladados: get("total_impuestos_trasladados"),
    total_impuestos_retenidos:   get("total_impuestos_retenidos"),
    objeto_imp:                  get("objeto_imp"),
    impuesto:                    get("impuesto"),
    tasa_o_cuota:                get("tasa_o_cuota"),
    tipo_factor:                 get("tipo_factor"),
    impuestos_trasladados:       get("impuestos_trasladados"),
    impuestos_retenidos:         get("impuestos_retenidos"),
  };
}

const API = process.env.NEXT_PUBLIC_API_BASE_URL;

async function getFileContent(file: File): Promise<string> {
  const lowerName = file.name.toLowerCase();

  if (
    lowerName.endsWith(".xml") ||
    lowerName.endsWith(".txt") ||
    file.type.startsWith("text/")
  ) {
    return await file.text();
  }

  return `[BINARY_FILE]
filename: ${file.name}
type: ${file.type || "unknown"}`;
}

export default function EmployeeUploadPage() {
  const [files, setFiles] = useState<UploadItem[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submissionSuccess, setSubmissionSuccess] = useState<{
    report_id: number;
    documents_linked: number;
  } | null>(null);

  const updateFile = (localId: string, patch: Partial<UploadItem>) => {
    setFiles((prev) =>
      prev.map((file) =>
        file.localId === localId ? { ...file, ...patch } : file
      )
    );
  };

  const computeOverallStatus = (results: ValidationResult[]) => {
    if (!results.length) return "validating";
    if (results.some((r) => r.status === "failed")) return "error";
    if (results.some((r) => r.status === "warning")) return "warning";
    if (results.every((r) => r.status === "passed")) return "valid";
    return "validating";
  };

  const handleFiles = useCallback(async (acceptedFiles: File[]) => {
    for (const file of acceptedFiles) {
      const localId = `${file.name}-${crypto.randomUUID()}`;

      setFiles((prev) => [
        { localId, name: file.name, status: "uploading", validationResults: [] },
        ...prev,
      ]);

      try {
        const contentText = await getFileContent(file);
        const uploadRes = await fetch(`${API}/expenses/documents`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-User-Id": "1" },
          body: JSON.stringify({ company_id: 1, filename: file.name, content_text: contentText }),
        });
        if (!uploadRes.ok) {
          const txt = await uploadRes.text();
          throw new Error(`Upload failed: ${txt}`);
        }
        const uploadedDoc = await uploadRes.json();

        updateFile(localId, { id: uploadedDoc.id, status: "validating" });

        // Fetch document to parse XML extracted block
        let extractedData: ExtractedData | undefined;
        const docRes = await fetch(`${API}/expenses/documents/${uploadedDoc.id}`, {
          headers: { "X-User-Id": "1" },
        });
        if (docRes.ok) {
          const doc = await docRes.json();
          if (typeof doc.content_text === "string") {
            extractedData = parseXmlExtracted(doc.content_text);
          }
        }

        const validationRes = await fetch(
          `${API}/expenses/documents/${uploadedDoc.id}/validation-results`,
          { headers: { "X-User-Id": "1" } }
        );
        if (!validationRes.ok) {
          const txt = await validationRes.text();
          throw new Error(`Validation lookup failed: ${txt}`);
        }
        const validationResults = await validationRes.json();
        const finalStatus = computeOverallStatus(validationResults);

        updateFile(localId, {
          id: uploadedDoc.id,
          validationResults,
          status: finalStatus as UploadItem["status"],
          extractedData,
        });
      } catch (error) {
        updateFile(localId, {
          status: "error",
          errorMessage: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }
  }, []);

  const onDrop = useCallback(
    (acceptedFiles: File[]) => { void handleFiles(acceptedFiles); },
    [handleFiles]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop, multiple: true });

  const validFiles = useMemo(() => files.filter((f) => f.status === "valid"), [files]);
  const blockedFiles = useMemo(() => files.filter((f) => f.status === "error"), [files]);
  const validCount = validFiles.length;
  const blockedCount = blockedFiles.length;

  const handleSubmit = async () => {
    const documentIds = validFiles.map((f) => f.id).filter((id): id is number => id !== undefined);
    if (!documentIds.length || submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch(`${API}/expenses/submissions/from-documents`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-User-Id": "1" },
        body: JSON.stringify({ company_id: 1, document_ids: documentIds }),
      });
      if (!res.ok) throw new Error("Submission failed");
      const data = await res.json();
      setSubmissionSuccess({ report_id: data.report_id, documents_linked: data.documents_linked });
      setFiles([]);
    } catch {
      alert("Failed to create submission. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const badgeClass = (status: UploadItem["status"]) => {
    switch (status) {
      case "valid":     return "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30";
      case "warning":   return "bg-amber-500/15 text-amber-300 border border-amber-500/30";
      case "error":     return "bg-red-500/15 text-red-300 border border-red-500/30";
      case "validating":return "bg-sky-500/15 text-sky-300 border border-sky-500/30";
      default:          return "bg-zinc-500/15 text-zinc-300 border border-zinc-500/30";
    }
  };

  const summaryPill = (status: UploadItem["status"]) => {
    switch (status) {
      case "valid":     return { label: "Ready",    cls: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40" };
      case "warning":   return { label: "Review",   cls: "bg-amber-500/20 text-amber-300 border-amber-500/40" };
      case "error":     return { label: "Blocked",  cls: "bg-red-500/20 text-red-300 border-red-500/40" };
      case "validating":return { label: "Checking", cls: "bg-sky-500/20 text-sky-300 border-sky-500/40" };
      default:          return { label: "Uploading",cls: "bg-zinc-500/20 text-zinc-300 border-zinc-500/40" };
    }
  };

  const validationBadgeClass = (status: string) => {
    if (status === "passed") return "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30";
    if (status === "warning") return "bg-amber-500/15 text-amber-300 border border-amber-500/30";
    if (status === "failed")  return "bg-red-500/15 text-red-300 border border-red-500/30";
    return "bg-zinc-500/15 text-zinc-300 border border-zinc-500/30";
  };

  return (
    <main className="min-h-screen bg-neutral-950 text-white pb-28">
      <div className="mx-auto max-w-7xl px-6 py-10">

        {/* Success panel */}
        {submissionSuccess && (
          <div className="mb-8 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-6 py-6">
            <div className="flex items-start justify-between gap-6">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <svg className="h-4 w-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="text-base font-semibold text-emerald-300">Submission created</span>
                </div>
                <p className="text-sm text-white/55 mb-3">
                  Your validated files were packaged and sent for approval.
                </p>
                <div className="flex items-center gap-5">
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-widest text-white/35">Report ID</div>
                    <div className="text-sm font-mono text-white/70">#{submissionSuccess.report_id}</div>
                  </div>
                  <div className="w-px h-8 bg-white/10" />
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-widest text-white/35">Documents linked</div>
                    <div className="text-sm font-mono text-white/70">{submissionSuccess.documents_linked}</div>
                  </div>
                </div>
              </div>
              <div className="flex flex-col items-end gap-2 shrink-0">
                <button
                  onClick={() => setSubmissionSuccess(null)}
                  className="text-white/25 hover:text-white/55 text-lg leading-none"
                  aria-label="Dismiss"
                >
                  ✕
                </button>
                <button
                  onClick={() => setSubmissionSuccess(null)}
                  className="mt-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/20 transition-colors"
                >
                  Upload More
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Hero header */}
        <div className="mb-10 rounded-3xl border border-white/10 bg-gradient-to-r from-sky-500/10 via-indigo-500/10 to-emerald-500/10 p-8 shadow-2xl shadow-black/20 backdrop-blur">
          <div className="flex items-start justify-between gap-6">
            <div>
              <p className="mb-3 text-sm uppercase tracking-[0.25em] text-white/50">Employee Portal</p>
              <h1 className="text-4xl font-semibold tracking-tight">Upload Expenses</h1>
              <p className="mt-3 max-w-2xl text-sm text-white/65">
                Drag and drop XML invoices, PDFs, and ticket images. Files are validated automatically and prepared for submission.
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-right">
              <div className="text-xs text-white/50">Valid files</div>
              <div className="text-2xl font-semibold">{validCount}</div>
            </div>
          </div>
        </div>

        {/* Dropzone */}
        <div
          {...getRootProps()}
          className={`group relative mb-10 cursor-pointer rounded-3xl border border-dashed p-12 text-center transition-all ${
            isDragActive
              ? "border-sky-400 bg-sky-500/10 shadow-[0_0_80px_rgba(56,189,248,0.08)]"
              : "border-white/15 bg-white/5 hover:border-white/30 hover:bg-white/[0.07]"
          }`}
        >
          <input {...getInputProps()} />
          <div className="mx-auto max-w-2xl">
            <div className="mb-4 text-5xl">⬆</div>
            <h2 className="text-2xl font-medium">
              {isDragActive ? "Drop files here" : "Drag & drop files or click"}
            </h2>
            <p className="mt-3 text-sm text-white/55">
              Supports XML invoices, PDFs, and ticket images. Multiple files are supported.
            </p>
          </div>
        </div>

        {/* File cards */}
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {files.map((file) => {
            const pill = summaryPill(file.status);
            return (
              <div
                key={file.localId}
                className="rounded-3xl border border-white/10 bg-white/5 p-5 shadow-xl shadow-black/10 backdrop-blur"
              >
                {/* Card header */}
                <div className="mb-3 flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <h3 className="truncate text-base font-medium">{file.name}</h3>
                    <p className="mt-1 text-xs text-white/45">
                      Document {file.id ? `#${file.id}` : "pending"}
                    </p>
                  </div>
                  <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium capitalize ${badgeClass(file.status)}`}>
                    {file.status}
                  </span>
                </div>

                {/* Summary pill */}
                <div className={`mb-4 inline-flex items-center rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-wider ${pill.cls}`}>
                  {pill.label}
                </div>

                <div className="space-y-3">
                  {/* Extracted Data */}
                  {file.extractedData && (
                    <div className="space-y-2">
                      {/* Invoice Summary */}
                      <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                        <div className="mb-2 text-[10px] font-bold uppercase tracking-widest text-white/35">Invoice Summary</div>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                          {([
                            ["Total",          file.extractedData.total],
                            ["Currency",        file.extractedData.moneda],
                            ["Type",            file.extractedData.tipo_comprobante],
                            ["Payment Method",  file.extractedData.metodo_pago],
                          ] as [string, string | null | undefined][]).map(([label, val]) => (
                            <div key={label}>
                              <div className="text-[9px] font-bold uppercase tracking-widest text-white/25">{label}</div>
                              <div className="text-[11px] font-mono text-white/65 truncate">{val ?? "—"}</div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Parties */}
                      <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                        <div className="mb-2 text-[10px] font-bold uppercase tracking-widest text-white/35">Parties</div>
                        <div className="space-y-1.5">
                          <div>
                            <div className="text-[9px] font-bold uppercase tracking-widest text-white/25">Emisor</div>
                            <div className="text-[11px] text-white/65 truncate">{file.extractedData.emisor_nombre ?? "—"}</div>
                            <div className="text-[10px] font-mono text-white/40 truncate">{file.extractedData.emisor_rfc ?? "—"}</div>
                          </div>
                          <div className="border-t border-white/[0.06] pt-1.5">
                            <div className="text-[9px] font-bold uppercase tracking-widest text-white/25">Receptor</div>
                            <div className="text-[11px] text-white/65 truncate">{file.extractedData.receptor_nombre ?? "—"}</div>
                            <div className="text-[10px] font-mono text-white/40 truncate">{file.extractedData.receptor_rfc ?? "—"}</div>
                          </div>
                        </div>
                      </div>

                      {/* Line Item */}
                      <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                        <div className="mb-2 text-[10px] font-bold uppercase tracking-widest text-white/35">Line Item</div>
                        <div>
                          <div className="text-[9px] font-bold uppercase tracking-widest text-white/25">Description</div>
                          <div className="text-[11px] text-white/65 mb-1.5">{file.extractedData.descripcion ?? "—"}</div>
                        </div>
                      </div>

                      {/* Fiscal */}
                      <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                        <div className="mb-2 text-[10px] font-bold uppercase tracking-widest text-white/35">Fiscal</div>
                        <div className="space-y-1.5">
                          <div>
                            <div className="text-[9px] font-bold uppercase tracking-widest text-white/25">UUID</div>
                            <div className="text-[10px] font-mono text-white/55 break-all">{file.extractedData.uuid ?? "—"}</div>
                          </div>
                          <div>
                            <div className="text-[9px] font-bold uppercase tracking-widest text-white/25">Invoice Date</div>
                            <div className="text-[11px] font-mono text-white/65">{file.extractedData.fecha ?? "—"}</div>
                          </div>
                        </div>
                      </div>

                      {/* Taxes */}
                      <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                        <div className="mb-2 text-[10px] font-bold uppercase tracking-widest text-white/35">Taxes</div>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                          {([
                            ["Tax Object",       file.extractedData.objeto_imp],
                            ["Tax Code",         file.extractedData.impuesto],
                            ["Tax Factor",       file.extractedData.tipo_factor],
                            ["Tax Rate",         file.extractedData.tasa_o_cuota],
                            ["Transferred Taxes",file.extractedData.impuestos_trasladados],
                            ["Withheld Taxes",   file.extractedData.impuestos_retenidos],
                            ["Total Transferred",file.extractedData.total_impuestos_trasladados],
                            ["Total Withheld",   file.extractedData.total_impuestos_retenidos],
                          ] as [string, string | null | undefined][]).map(([label, val]) => (
                            <div key={label}>
                              <div className="text-[9px] font-bold uppercase tracking-widest text-white/25">{label}</div>
                              <div className="text-[11px] font-mono text-white/65 truncate">{val ?? "—"}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Validation Results */}
                  <div>
                    <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/45">
                      Validation Results
                    </div>
                    {!file.validationResults.length ? (
                      <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white/50">
                        {file.status === "uploading"   ? "Uploading document..." :
                         file.status === "validating"  ? "Loading validation results..." :
                         file.status === "error"       ? (file.errorMessage ?? "Could not process this file.") :
                                                         "No validation results."}
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {file.validationResults.map((result, index) => (
                          <div key={`${file.localId}-${index}`} className="rounded-2xl border border-white/10 bg-black/20 p-3">
                            <div className="mb-2 flex items-center justify-between gap-3">
                              <div className="text-sm font-medium">{result.rule_code}</div>
                              <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium capitalize ${validationBadgeClass(result.status)}`}>
                                {result.status}
                              </span>
                            </div>
                            <div className="text-xs text-white/45">Source: {result.source}</div>
                            <div className="mt-2 text-sm text-white/75">{result.message}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {files.length === 0 && !submissionSuccess && (
          <div className="mt-10 rounded-3xl border border-white/10 bg-white/[0.03] p-10 text-center text-white/45">
            No files uploaded yet.
          </div>
        )}
      </div>

      {/* Sticky action bar */}
      <div className="fixed bottom-0 left-0 right-0 border-t border-white/10 bg-neutral-950/90 backdrop-blur px-6 py-4">
        <div className="mx-auto max-w-7xl flex items-center justify-end gap-4">
          {blockedCount > 0 && (
            <span className="text-xs text-red-400/80">
              Blocked files were excluded from submission
            </span>
          )}
          <button
            onClick={handleSubmit}
            disabled={validCount === 0 || submitting}
            className={`rounded-2xl px-8 py-3 text-sm font-semibold transition-all ${
              validCount > 0 && !submitting
                ? "bg-sky-500 hover:bg-sky-400 text-white shadow-lg shadow-sky-500/20"
                : "bg-white/10 text-white/30 cursor-not-allowed"
            }`}
          >
            {submitting ? "Submitting…" : `Create Submission${validCount > 0 ? ` (${validCount})` : ""}`}
          </button>
        </div>
      </div>
    </main>
  );
}
