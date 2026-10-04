/**
 * Browser transport for `/api/v1/label-ingestions`. It carries bytes and
 * row versions; it has no parser, resolver, database or apply import, and it
 * never sends a tenant — the session cookie is the only authority.
 */
import { safeRandomUUID } from '@/lib/safe-uuid';
import type { LabelPairingCandidates, PublicLabelIngestion } from './ingestion-service';

export type LabelIngestionDto = PublicLabelIngestion;

export const LABEL_INGESTIONS_QUERY_KEY = ['v1', 'label-ingestions'] as const;
const ENDPOINT = '/api/v1/label-ingestions';

class LabelIngestionHttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = 'LabelIngestionHttpError';
  }
}

async function readEnvelope<T>(response: Response): Promise<{ data: T; replayed: boolean }> {
  const payload = (await response.json().catch(() => null)) as
    | { data?: T; replayed?: boolean; error?: { message?: string } | string; message?: string }
    | null;
  if (!response.ok || payload?.data === undefined) {
    const error = payload?.error;
    const message =
      (typeof error === 'object' ? error?.message : undefined) ??
      payload?.message ??
      `Label intake request failed (${response.status}).`;
    throw new LabelIngestionHttpError(response.status, message);
  }
  return { data: payload.data, replayed: payload.replayed === true };
}

export async function listLabelIngestionsHttp(): Promise<LabelIngestionDto[]> {
  const response = await fetch(`${ENDPOINT}?limit=100`, { credentials: 'same-origin', cache: 'no-store' });
  return (await readEnvelope<LabelIngestionDto[]>(response)).data;
}

export async function uploadLabelPdf(file: File): Promise<{ data: LabelIngestionDto; replayed: boolean }> {
  const form = new FormData();
  form.set('file', file);
  form.set('clientEventId', safeRandomUUID());
  form.set('observedAt', new Date().toISOString());
  // The digest is an equality hint only — the server recomputes it. Web Crypto
  // is absent on an insecure origin (LAN-HTTP phone), so the hint is omitted
  // there rather than failing the upload.
  if (globalThis.crypto?.subtle) {
    const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
    form.set('sha256', Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join(''));
  }
  return readEnvelope<LabelIngestionDto>(await fetch(ENDPOINT, { method: 'POST', body: form, credentials: 'same-origin' }));
}

export async function retryLabelIngestionHttp(id: number): Promise<LabelIngestionDto> {
  const response = await fetch(`${ENDPOINT}/${id}/retry`, { method: 'POST', credentials: 'same-origin' });
  return (await readEnvelope<LabelIngestionDto>(response)).data;
}

export async function applyLabelIngestionHttp(id: number, expectedRowVersion: number): Promise<void> {
  const response = await fetch(`${ENDPOINT}/${id}/apply`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ expectedRowVersion }),
  });
  await readEnvelope<unknown>(response);
}

export async function fetchLabelPairingCandidates(id: number, signal?: AbortSignal): Promise<LabelPairingCandidates> {
  const response = await fetch(`${ENDPOINT}/${id}/candidates`, { credentials: 'same-origin', cache: 'no-store', signal });
  return (await readEnvelope<LabelPairingCandidates>(response)).data;
}

/** Pair a quarantined label to an order; `repaired` = the buyer's other waiting labels that paired on their own as a result. */
export async function confirmLabelOrderHttp(id: number, orderId: number, expectedRowVersion: number): Promise<{ ingestion: LabelIngestionDto; repaired: LabelIngestionDto[] }> {
  const response = await fetch(`${ENDPOINT}/${id}/confirm-order`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ orderId, expectedRowVersion }),
  });
  return (await readEnvelope<{ ingestion: LabelIngestionDto; repaired: LabelIngestionDto[] }>(response)).data;
}
