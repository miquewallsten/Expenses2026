"use client";

export const dynamic = "force-dynamic";

import { useCallback, useMemo, useState } from "react";
import { useDropzone } from "react-dropzone";
import { useTranslations } from "next-intl";
import { apiCall, apiPost } from "@/lib/api/client";
import { getStoredSession } from "@/lib/session";

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
  const t = useTranslations("upload");
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
        const form = new FormData();
        form.append("company_id", "1");
        form.append("file", file, file.name);
        const uploadedDoc = await apiCall<{ id: number }>("/expenses/documents/upload", {
          method: "POST",
          body: form,
        });

        updateFile(localId, { id: uploadedDoc.id, status: "validating" });

        // Fetch document to parse XML extracted block
        let extractedData: ExtractedData | undefined;
        const doc = await apiCall<{ content_text?: string } | null>(`/expenses/documents/${uploadedDoc.id}`).catch(() => null);
        if (doc && typeof doc.content_text === "string") {
          extractedData = parseXmlExtracted(doc.content_text);
        }

        const validationResults = await apiCall<ValidationResult[]>(`/expenses/documents/${uploadedDoc.id}/validation-results`);
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
      const data = await apiPost<{ report_id: number; documents_linked: number }>("/expenses/submissions/from-documents", {
        company_id: getStoredSession()?.companyId,
        document_ids: documentIds,
      });
      setSubmissionSuccess({ report_id: data.report_id, documents_linked: data.documents_linked });
      setFiles([]);
    } catch {
      alert(t("failedAlert"));
    } finally {
      setSubmitting(false);
    }
  };

  const badgeClass = (status: UploadItem["status"]) => {
    switch (status) {
      case "valid":     return "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30";
      case "warning":   return "bg-amber-500/15 text-warning border border-amber-500/30";
      case "error":     return "bg-error-muted text-error border border-error";
      case "validating":return "bg-accent-muted text-accent border border-sky-500/30";
      default:          return "bg-surface-2 text-tertiary border border-default";
    }
  };

  const summaryPill = (status: UploadItem["status"]) => {
    switch (status) {
      case "valid":     return "bg-success-muted text-emerald-300 border-success";
      case "warning":   return "bg-warning-muted text-warning border-amber-500/40";
      case "error":     return "bg-error-muted text-error border-error";
      case "validating":return "bg-accent-muted text-accent border-sky-500/40";
      default:          return "bg-surface-3 text-tertiary border-strong";
    }
  };

  const statusLabel = (status: UploadItem["status"]) => {
    switch (status) {
      case "valid":     return t("status.ready");
      case "warning":   return t("status.review");
      case "error":     return t("status.blocked");
      case "validating":return t("status.checking");
      default:          return t("status.uploading");
    }
  };

  const validationBadgeClass = (status: string): string => {
    if (status === "passed") return "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30";
    if (status === "warning") return "bg-amber-500/15 text-warning border border-amber-500/30";
    if (status === "failed")  return "bg-error-muted text-error border border-error";
    return "bg-surface-2 text-tertiary border border-default";
  };

  const emptyValidationMessage = (file: UploadItem): string => {
    if (file.status === "uploading")  return "Uploading document...";
    if (file.status === "validating") return "Loading validation results...";
    if (file.status === "error")      return file.errorMessage ?? "Could not process this file.";
    return "No validation results.";
  };

  return (
    <main className="min-h-screen bg-surface-0 text-primary pb-28">
      <div className="mx-auto max-w-7xl px-6 py-10">

        {/* Success panel */}
        {submissionSuccess && (
          <div className="mb-8 rounded-2xl border border-emerald-500/30 bg-success-muted px-6 py-6">
            <div className="flex items-start justify-between gap-6">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <svg className="h-4 w-4 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="text-base font-semibold text-emerald-300">{t("submissionCreated")}</span>
                </div>
                <p className="text-sm text-tertiary mb-3">
                  {t("submissionHint")}
                </p>
                <div className="flex items-center gap-5">
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-widest text-muted">{t("reportId")}</div>
                    <div className="text-sm font-mono text-secondary">#{submissionSuccess.report_id}</div>
                  </div>
                  <div className="w-px h-8 bg-surface-2" />
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-widest text-muted">{t("documentsLinked")}</div>
                    <div className="text-sm font-mono text-secondary">{submissionSuccess.documents_linked}</div>
                  </div>
                </div>
              </div>
              <div className="flex flex-col items-end gap-2 shrink-0">
                <button
                  onClick={() => setSubmissionSuccess(null)}
                  className="text-muted hover:text-tertiary text-lg leading-none"
                  aria-label="Dismiss"
                >
                  ✕
                </button>
                <button
                  onClick={() => setSubmissionSuccess(null)}
                  className="mt-2 rounded-lg border border-emerald-500/30 bg-success-muted px-3 py-1.5 text-xs font-semibold text-emerald-300 hover:bg-success-muted transition-colors"
                >
                  {t("uploadMore")}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Hero header */}
        <div className="mb-10 rounded-3xl border border-subtle bg-gradient-to-r from-sky-500/10 via-blue-500/10 to-emerald-500/10 p-8 shadow-2xl shadow-black/20 backdrop-blur">
          <div className="flex items-start justify-between gap-6">
            <div>
              <p className="mb-3 text-sm uppercase tracking-[0.25em] text-secondary">{t("portalLabel")}</p>
              <h1 className="text-4xl font-semibold tracking-tight">{t("heading")}</h1>
              <p className="mt-3 max-w-2xl text-sm text-secondary">
                {t("hint")}
              </p>
            </div>
            <div className="rounded-2xl border border-subtle bg-surface-1 px-4 py-3 text-right">
              <div className="text-xs text-secondary">{t("validFiles")}</div>
              <div className="text-2xl font-semibold">{validCount}</div>
            </div>
          </div>
        </div>

        {/* Dropzone */}
        <div
          {...getRootProps()}
          className={`group relative mb-10 cursor-pointer rounded-3xl border border-dashed p-12 text-center transition-all ${
            isDragActive
              ? "border-sky-400 bg-accent/10 shadow-[0_0_80px_rgba(56,189,248,0.08)]"
              : "border-default bg-surface-1 hover:border-strong hover:bg-surface-3"
          }`}
        >
          <input {...getInputProps()} />
          <div className="mx-auto max-w-2xl">
            <div className="mb-4 text-5xl">⬆</div>
            <h2 className="text-2xl font-medium">
              {isDragActive ? t("dropActive") : t("dropIdle")}
            </h2>
            <p className="mt-3 text-sm text-tertiary">
              {t("dropSupports")}
            </p>
          </div>
        </div>

        {/* File cards */}
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {files.map((file) => {
            const pillCls = summaryPill(file.status);
            return (
              <div
                key={file.localId}
                className="rounded-3xl border border-subtle bg-surface-1 p-5 shadow-xl shadow-black/10 backdrop-blur"
              >
                {/* Card header */}
                <div className="mb-3 flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <h3 className="truncate text-base font-medium">{file.name}</h3>
                    <p className="mt-1 text-xs text-tertiary">
                      Document {file.id ? `#${file.id}` : t("documentPending")}
                    </p>
                  </div>
                  <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium capitalize ${badgeClass(file.status)}`}>
                    {file.status}
                  </span>
                </div>

                {/* Summary pill */}
                <div className={`mb-4 inline-flex items-center rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-wider ${pillCls}`}>
                  {statusLabel(file.status)}
                </div>

                <div className="space-y-3">
                  {/* Extracted Data */}
                  {file.extractedData && (
                    <div className="space-y-2">
                      {/* Invoice Summary */}
                      <div className="rounded-xl border border-subtle bg-black/20 p-3">
                        <div className="mb-2 text-[10px] font-bold uppercase tracking-widest text-muted">{t("invoice.summary")}</div>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                          {([
                            [t("invoice.total"),         file.extractedData.total],
                            [t("invoice.currency"),      file.extractedData.moneda],
                            [t("invoice.type"),          file.extractedData.tipo_comprobante],
                            [t("invoice.paymentMethod"), file.extractedData.metodo_pago],
                          ] as [string, string | null | undefined][]).map(([label, val]) => (
                            <div key={label}>
                              <div className="text-[9px] font-bold uppercase tracking-widest text-muted">{label}</div>
                              <div className="text-[11px] font-mono text-secondary truncate">{val ?? "—"}</div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Parties */}
                      <div className="rounded-xl border border-subtle bg-black/20 p-3">
                        <div className="mb-2 text-[10px] font-bold uppercase tracking-widest text-muted">Parties</div>
                        <div className="space-y-1.5">
                          <div>
                            <div className="text-[9px] font-bold uppercase tracking-widest text-muted">Emisor</div>
                            <div className="text-[11px] text-secondary truncate">{file.extractedData.emisor_nombre ?? "—"}</div>
                            <div className="text-[10px] font-mono text-tertiary truncate">{file.extractedData.emisor_rfc ?? "—"}</div>
                          </div>
                          <div className="border-t border-subtle pt-1.5">
                            <div className="text-[9px] font-bold uppercase tracking-widest text-muted">Receptor</div>
                            <div className="text-[11px] text-secondary truncate">{file.extractedData.receptor_nombre ?? "—"}</div>
                            <div className="text-[10px] font-mono text-tertiary truncate">{file.extractedData.receptor_rfc ?? "—"}</div>
                          </div>
                        </div>
                      </div>

                      {/* Line Item */}
                      <div className="rounded-xl border border-subtle bg-black/20 p-3">
                        <div className="mb-2 text-[10px] font-bold uppercase tracking-widest text-muted">Line Item</div>
                        <div>
                          <div className="text-[9px] font-bold uppercase tracking-widest text-muted">Description</div>
                          <div className="text-[11px] text-secondary mb-1.5">{file.extractedData.descripcion ?? "—"}</div>
                        </div>
                      </div>

                      {/* Fiscal */}
                      <div className="rounded-xl border border-subtle bg-black/20 p-3">
                        <div className="mb-2 text-[10px] font-bold uppercase tracking-widest text-muted">Fiscal</div>
                        <div className="space-y-1.5">
                          <div>
                            <div className="text-[9px] font-bold uppercase tracking-widest text-muted">UUID</div>
                            <div className="text-[10px] font-mono text-tertiary break-all">{file.extractedData.uuid ?? "—"}</div>
                          </div>
                          <div>
                            <div className="text-[9px] font-bold uppercase tracking-widest text-muted">Invoice Date</div>
                            <div className="text-[11px] font-mono text-secondary">{file.extractedData.fecha ?? "—"}</div>
                          </div>
                        </div>
                      </div>

                      {/* Taxes */}
                      <div className="rounded-xl border border-subtle bg-black/20 p-3">
                        <div className="mb-2 text-[10px] font-bold uppercase tracking-widest text-muted">Taxes</div>
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
                              <div className="text-[9px] font-bold uppercase tracking-widest text-muted">{label}</div>
                              <div className="text-[11px] font-mono text-secondary truncate">{val ?? "—"}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Validation Results */}
                  <div>
                    <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-tertiary">
                      Validation Results
                    </div>
                    {!file.validationResults.length ? (
                      <div className="rounded-2xl border border-subtle bg-black/20 px-4 py-3 text-sm text-secondary">
                        {emptyValidationMessage(file)}
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {file.validationResults.map((result, index) => (
                          <div key={`${file.localId}-${index}`} className="rounded-2xl border border-subtle bg-black/20 p-3">
                            <div className="mb-2 flex items-center justify-between gap-3">
                              <div className="text-sm font-medium">{result.rule_code}</div>
                              <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium capitalize ${validationBadgeClass(result.status)}`}>
                                {result.status}
                              </span>
                            </div>
                            <div className="text-xs text-tertiary">Source: {result.source}</div>
                            <div className="mt-2 text-sm text-secondary">{result.message}</div>
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
          <div className="mt-10 rounded-3xl border border-subtle bg-surface-1 p-10 text-center text-tertiary">
            No files uploaded yet.
          </div>
        )}
      </div>

      {/* Sticky action bar */}
      <div className="fixed bottom-0 left-0 right-0 border-t border-subtle bg-surface-0 backdrop-blur px-6 py-4">
        <div className="mx-auto max-w-7xl flex items-center justify-end gap-4">
          {blockedCount > 0 && (
            <span className="text-xs text-error/80">
              Blocked files were excluded from submission
            </span>
          )}
          <button
            onClick={handleSubmit}
            disabled={validCount === 0 || submitting}
            className={`rounded-2xl px-8 py-3 text-sm font-semibold transition-all ${
              validCount > 0 && !submitting
                ? "bg-accent hover:bg-accent text-primary shadow-lg shadow-accent-muted"
                : "bg-surface-2 text-muted cursor-not-allowed"
            }`}
          >
            {submitting ? "Submitting…" : `Create Submission${validCount > 0 ? ` (${validCount})` : ""}`}
          </button>
        </div>
      </div>
    </main>
  );
}
