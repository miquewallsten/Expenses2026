"use client";

/**
 * Documents tab content for EmployeeExpenseDetail.
 * Contains file upload, document list, and confirm-delete overlay.
 * Clean, dense, enterprise-grade layout.
 */

import { FileText, Upload, CheckCircle2, XCircle } from "lucide-react";
import { useTranslations } from "next-intl";

function docTypeLabel(t: string | null | undefined, labels: Record<string, string>): string {
  if (!t) return "File";
  return labels[t] ?? t;
}

function docTypeCls(t: string | null | undefined): string {
  if (t === "cfdi_xml") return "text-violet-400";
  if (t === "receipt_pdf") return "text-sky-400";
  if (t === "supporting_doc") return "text-tertiary";
  return "text-muted";
}

function docTypeIconBg(t: string | null | undefined): string {
  if (t === "cfdi_xml") return "bg-violet-500/10";
  if (t === "receipt_pdf") return "bg-sky-500/10";
  return "bg-surface-2";
}

interface ExpenseDocumentsTabProps {
  linkedDocs: any[];
  loadingDocs: boolean;
  uploadQueue: any[];
  canUpload: boolean;
  dragOver: boolean;
  setDragOver: (v: boolean) => void;
  uploadDocuments: (files: FileList) => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  confirmDeleteDocId: number | null;
  setConfirmDeleteDocId: (v: number | null) => void;
  deleteDocument: (id: number) => void;
  deletingDocId: number | null;
  xmlRequired: boolean;
  hasXml: boolean;
  pdfPairRequired: boolean;
  hasPdf: boolean;
  parsedXml: any;
  setShowXmlModal: (v: boolean) => void;
}

export default function ExpenseDocumentsTab({
  linkedDocs,
  loadingDocs,
  uploadQueue,
  canUpload,
  dragOver,
  setDragOver,
  uploadDocuments,
  fileInputRef,
  confirmDeleteDocId,
  setConfirmDeleteDocId,
  deleteDocument,
  deletingDocId,
  xmlRequired,
  hasXml,
  pdfPairRequired,
  hasPdf,
  parsedXml,
  setShowXmlModal,
}: ExpenseDocumentsTabProps) {
  const td = useTranslations("employee.expenseDetail");
  const tc = useTranslations("common");

  return (
    <div className="space-y-3 pb-20">
      {/* Upload zone */}
      {canUpload && (
        <div
          role="button"
          tabIndex={0}
          aria-label="Upload files"
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            if (e.dataTransfer.files.length) uploadDocuments(e.dataTransfer.files);
          }}
          onClick={() => fileInputRef.current?.click()}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") fileInputRef.current?.click(); }}
          className={`flex cursor-pointer items-center gap-2.5 rounded-lg border border-dashed px-4 py-3 transition-colors select-none ${
            dragOver
              ? "border-accent/50 bg-accent/[0.06]"
              : "border-default hover:border-strong bg-surface-1"
          }`}
        >
          <Upload className={`h-4 w-4 shrink-0 ${dragOver ? "text-accent" : "text-muted"}`} />
          <div className="min-w-0">
            <p className="text-[11px] text-secondary">
              {xmlRequired && !hasXml
                ? td("uploadXmlCfdi")
                : pdfPairRequired && hasXml && !hasPdf
                  ? td("uploadPdf")
                  : td("uploadFile")}
            </p>
            <p className="text-[10px] text-muted">{td("uploadHint")}</p>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".xml,.pdf,application/xml,application/pdf,text/xml"
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.length) {
                uploadDocuments(e.target.files);
                e.target.value = "";
              }
            }}
          />
        </div>
      )}

      {/* Upload queue */}
      {uploadQueue.length > 0 && (
        <div className="space-y-1">
          {uploadQueue.map((entry: any) => (
            <div
              key={entry.localId}
              className="flex items-center gap-2 rounded-lg border border-subtle bg-surface-1 px-3 py-2"
            >
              {entry.status === "uploading" && (
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent/60" />
              )}
              {entry.status === "done" && (
                <CheckCircle2 className="h-3.5 w-3.5 text-success/60" />
              )}
              {entry.status === "error" && (
                <XCircle className="h-3.5 w-3.5 text-error/50" />
              )}
              <span className="min-w-0 flex-1 truncate text-[10px] text-tertiary">
                {entry.filename}
              </span>
              {entry.status === "error" && (
                <span className="text-[9px] text-error/40">{td("uploadFailed")}</span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Confirm delete */}
      {confirmDeleteDocId !== null && (
        <div className="rounded-lg border border-red-500/20 bg-red-500/[0.06] px-4 py-3">
          <p className="text-[11px] text-secondary">{td("confirmDeleteMsg")}</p>
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={() => deleteDocument(confirmDeleteDocId)}
              disabled={deletingDocId === confirmDeleteDocId}
              className="rounded border border-error bg-error-muted px-2.5 py-1 text-[10px] font-medium text-error hover:bg-red-500/25 disabled:opacity-40"
            >
              {deletingDocId === confirmDeleteDocId ? td("deleting") : td("yesDelete")}
            </button>
            <button
              type="button"
              onClick={() => setConfirmDeleteDocId(null)}
              className="text-[10px] text-muted hover:text-tertiary"
            >
              {tc("cancel")}
            </button>
          </div>
        </div>
      )}

      {/* Loading */}
      {loadingDocs && linkedDocs.length === 0 && (
        <p className="text-[10px] text-muted">{td("loadingDocs")}</p>
      )}

      {/* Document list */}
      {linkedDocs.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[9px] font-semibold uppercase tracking-widest text-muted">
            Documentos ({linkedDocs.length})
          </p>
          {linkedDocs.map((doc: any) => {
            const isXml = doc.document_type === "cfdi_xml";
            return (
              <div
                key={doc.id}
                className="flex items-center gap-3 rounded-lg border border-subtle bg-surface-1 px-3 py-2"
              >
                <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${docTypeIconBg(doc.document_type)}`}>
                  <FileText className={`h-3.5 w-3.5 ${docTypeCls(doc.document_type)}`} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[11px] text-secondary">{doc.filename}</p>
                  <p className="text-[9px] text-muted">
                    {docTypeLabel(doc.document_type, {
                      cfdi_xml: "CFDI XML",
                      receipt_pdf: "PDF",
                      supporting_doc: "Comprobante",
                    })}
                  </p>
                </div>
                {isXml && parsedXml && (
                  <button
                    type="button"
                    onClick={() => setShowXmlModal(true)}
                    className="shrink-0 rounded-full border border-accent/20 bg-accent/10 px-2 py-0.5 text-[9px] font-medium text-accent hover:bg-accent/20"
                  >
                    XML
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
