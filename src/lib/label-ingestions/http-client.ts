/**
 * Browser transport for `/api/v1/label-ingestions`. It carries bytes and
 * row versions; it has no parser, resolver, database or apply import, and it
 * never sends a tenant — the session cookie is the only authority.
 */
import { safeRandomUUID } from '@/lib/safe-uuid';
import type { LabelFileCheck, LabelFileOnOrderResult, LabelFilingAnswerRequiredDetail, LabelFilingAnswers, LabelFilingQuestion } from './file-on-order-contracts';
import type { LabelPairingCandidates, PublicLabelIngestion } from './ingestion-service';
import type { LabelIngestionState } from './types';
import type { LabelUnpairCheck } from './unpair';

export type LabelIngestionDto = PublicLabelIngestion;

export const LABEL_INGESTIONS_QUERY_KEY = ['v1', 'label-ingestions'] as const;
const ENDPOINT = '/api/v1/label-ingestions';

class LabelIngestionHttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    /** The v1 `error.code`, and the error object's extras (`check` / `needs` on FILING_ANSWER_REQUIRED). */
    readonly code: string | null = null,
    readonly detail: Record<string, unknown> | null = null,
  ) {
    super(message);
    this.name = 'LabelIngestionHttpError';
  }
}

async function readEnvelope<T>(response: Response): Promise<{ data: T; replayed: boolean }> {
  const payload = (await response.json().catch(() => null)) as
    | { data?: T; replayed?: boolean; error?: { message?: string; code?: string } | string; message?: string }
    | null;
  if (!response.ok || payload?.data === undefined) {
    const error = payload?.error;
    const message =
      (typeof error === 'object' ? error?.message : undefined) ??
      payload?.message ??
      `Label intake request failed (${response.status}).`;
    throw new LabelIngestionHttpError(response.status, message, typeof error === 'object' ? error?.code ?? null : null, typeof error === 'object' && error ? error : null);
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

export async function deleteUnlinkedLabelIngestionHttp(id: number): Promise<void> {
  const response = await fetch(`${ENDPOINT}/${id}`, { method: 'DELETE', credentials: 'same-origin' });
  await readEnvelope<unknown>(response);
}

export async function fetchLabelPairingCandidates(id: number, signal?: AbortSignal): Promise<LabelPairingCandidates> {
  const response = await fetch(`${ENDPOINT}/${id}/candidates`, { credentials: 'same-origin', cache: 'no-store', signal });
  return (await readEnvelope<LabelPairingCandidates>(response)).data;
}

export type { LabelFileCheck, LabelFilingQuestion };

/** A filing that waits on the operator: `needs` says what to ask, `check` what the label and order already hold. */
export class LabelFilingAnswerRequired extends Error {
  constructor(readonly check: LabelFileCheck, readonly needs: LabelFilingQuestion[], message: string) {
    super(message);
    this.name = 'LabelFilingAnswerRequired';
  }
}

/** What filing label `id` on `q.orderId` would do — with `q.tracking` as typed when the page has none. */
export async function fetchLabelFileCheck(id: number, q: { orderId: number; tracking?: string }): Promise<LabelFileCheck> {
  const params = new URLSearchParams({ orderId: String(q.orderId) });
  if (q.tracking?.trim()) params.set('tracking', q.tracking.trim());
  const response = await fetch(`${ENDPOINT}/${id}/file-check?${params}`, { credentials: 'same-origin', cache: 'no-store' });
  return (await readEnvelope<LabelFileCheck>(response)).data;
}

/**
 * Put one stored label on `orderId` for good, server-side in one call
 * (`file-on-order`: operator evidence → confirm → apply, or stored as the
 * order's document without tracking). `opts` carries the operator's answers;
 * a filing that still needs one throws `LabelFilingAnswerRequired`. Answers
 * the buyer's other labels the confirm re-paired.
 */
export async function fileLabelOnOrderHttp(
  label: { id: number; rowVersion: number; matchedOrderId: number | null },
  orderId: number,
  opts: LabelFilingAnswers & { tracking?: string; carrier?: string } = {},
): Promise<{ repaired: number }> {
  const response = await fetch(`${ENDPOINT}/${label.id}/file-on-order`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ orderId, expectedRowVersion: label.rowVersion, ...opts }),
  });
  try {
    const { data } = await readEnvelope<LabelFileOnOrderResult>(response);
    return { repaired: data.repaired };
  } catch (error) {
    if (error instanceof LabelIngestionHttpError && error.code === 'FILING_ANSWER_REQUIRED' && error.detail) {
      const { check, needs } = error.detail as unknown as LabelFilingAnswerRequiredDetail;
      throw new LabelFilingAnswerRequired(check, needs, error.message);
    }
    throw error;
  }
}

export type { LabelUnpairCheck };

/** What unpairing this label takes off its order: the tracking that comes off, and the scan-out to warn about. */
export async function fetchLabelUnpairCheck(id: number): Promise<LabelUnpairCheck> {
  const response = await fetch(`${ENDPOINT}/${id}/unpair-check`, { credentials: 'same-origin', cache: 'no-store' });
  return (await readEnvelope<LabelUnpairCheck>(response)).data;
}

/**
 * Take a filed label back off its order (back to the waiting pool). `remove`
 * also deletes the label and its document and answers `ingestion: null`.
 * Undo of an unpair = `undoLabelUnpairHttp(ingestion.id, ingestion.rowVersion)`.
 */
export async function unpairLabelIngestionHttp(id: number, expectedRowVersion: number, opts: { remove?: boolean } = {}): Promise<{ ingestion: LabelIngestionDto | null }> {
  const response = await fetch(`${ENDPOINT}/${id}/unpair`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ expectedRowVersion, ...(opts.remove ? { remove: true } : {}) }),
  });
  return (await readEnvelope<{ ingestion: LabelIngestionDto | null }>(response)).data;
}

/** Put back exactly what this label's latest unpair took off (the toast's Undo). `expectedRowVersion` = the unpaired row's version. */
export async function undoLabelUnpairHttp(id: number, expectedRowVersion: number): Promise<{ ingestion: LabelIngestionDto }> {
  const response = await fetch(`${ENDPOINT}/${id}/unpair/undo`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ expectedRowVersion }),
  });
  return (await readEnvelope<{ ingestion: LabelIngestionDto }>(response)).data;
}
