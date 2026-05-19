/**
 * CFDI Pairing API Client
 * 
 * Communicates with the backend to monitor and manage CFDI XML/PDF pairing.
 * Uses the centralized apiCall client for auth, error handling, and 401 redirect.
 */

import { apiCall, apiPost } from "./client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PairingStatistics {
  total_documents: number;
  paired_documents: number;
  unpaired_documents: number;
  pairing_success_rate: number;
  total_pairing_attempts: number;
  failed_pairing_attempts: number;
  average_processing_time: number;
}

export interface PairingFailure {
  id: number;
  document_id: number;
  document_type: string;
  company_id: number;
  error_message: string;
  created_at: string;
  retry_count: number;
  last_retry_at: string | null;
}

// ---------------------------------------------------------------------------
// Pairing Statistics
// ---------------------------------------------------------------------------

export async function getParingStatistics(): Promise<PairingStatistics> {
  return apiCall<PairingStatistics>("/expenses/cfdi-pairing/statistics");
}

// ---------------------------------------------------------------------------
// Pairing Failures
// ---------------------------------------------------------------------------

export async function listPairingFailures(): Promise<PairingFailure[]> {
  return apiCall<PairingFailure[]>("/expenses/cfdi-pairing/failures");
}

// ---------------------------------------------------------------------------
// Pairing Actions
// ---------------------------------------------------------------------------

export async function retryPairing(failureId: number): Promise<void> {
  await apiPost(`/expenses/cfdi-pairing/failures/${failureId}/retry`);
}

export async function getPairingDetails(documentId: number): Promise<any> {
  return apiCall(`/expenses/cfdi-pairing/details/${documentId}`);
}

export async function findBestMatch(documentId: number, documentType: "pdf" | "xml"): Promise<any> {
  const endpoint = documentType === "pdf" ? "pdf" : "xml";
  return apiCall(`/expenses/cfdi-pairing/${endpoint}/${documentId}`);
}
