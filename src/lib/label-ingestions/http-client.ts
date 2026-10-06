/**
 * Browser transport for `/api/v1/label-ingestions`. It carries bytes and
 * row versions; it has no parser, resolver, database or apply import, and it
 * never sends a tenant — the session cookie is the only authority.
 */
import { safeRandomUUID } from '@/lib/safe-uuid';
import type { LabelPairingCandidates, PublicLabelIngestion } from './ingestion-service';
import type { LabelIngestionState } from './types';

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

/** The newest 100 ingestions, optionally in one state (`QUARANTINED` = uploaded labels waiting for their order). */
export async function listLabelIngestionsHttp(state?: LabelIngestionState): Promise<LabelIngestionDto[]> {
  const params = new URLSearchParams({ limit: '100' });
  if (state) params.set('state', state);
  const response = await fetch(`${ENDPOINT}?${params}`, { credentials: 'same-origin', cache: 'no-store' });
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

export async function applyLabelIngestionHttp(id: number, expectedRowVersion: number): Promise<void> {
  const response = await fetch(`${ENDPOINT}/${id}/apply`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ expectedRowVersion }),
  });
  await readEnvelope<unknown>(response);
}

export async function deleteUnlinkedLabelIngestionHttp(id: number): Promise<void> {
  const response = await fetch(`${ENDPOINT}/${id}`, { method: 'DELETE', credentials: 'same-origin' });
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

/**
 * Put one stored label on `orderId` for good: a label with no order yet (a
 * quarantined page) is confirmed onto it first, then applied. Refuses a label
 * that resolved to another order. Answers the buyer's other labels the confirm
 * re-paired.
 */
export async function fileLabelOnOrderHttp(
  label: { id: number; rowVersion: number; matchedOrderId: number | null },
  orderId: number,
): Promise<{ repaired: number }> {
  let ingestion = label;
  let repaired = 0;
  if (label.matchedOrderId == null) {
    const confirmed = await confirmLabelOrderHttp(label.id, orderId, label.rowVersion);
    ingestion = confirmed.ingestion;
    repaired = confirmed.repaired.length;
  }
  if (ingestion.matchedOrderId !== orderId) throw new Error('The label resolved to another order and was not filed.');
  await applyLabelIngestionHttp(ingestion.id, ingestion.rowVersion);
  return { repaired };
}
