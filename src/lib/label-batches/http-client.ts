/**
 * Browser transport for an order slot's label upload (`/api/v1/label-batches`
 * with `stock=label`) and its read-back. Same-origin, session cookie only; it
 * never sends a tenant or an actor. Bulk's file list uses
 * `@/lib/label-prints/print-files-client`.
 */
import { safeRandomUUID } from '@/lib/safe-uuid';
import type { PrintFileUploadResult } from '@/lib/label-prints/print-file-contracts';
import type { LabelBatchDetail } from './contracts';

const ENDPOINT = '/api/v1/label-batches';

async function readData<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => null)) as { data?: T; error?: { message?: string } } | null;
  if (!response.ok || payload?.data === undefined) {
    throw new Error(payload?.error?.message ?? `Uploads request failed (${response.status}).`);
  }
  return payload.data;
}

export async function fetchLabelBatch(id: number): Promise<LabelBatchDetail> {
  return readData(await fetch(`${ENDPOINT}/${id}`, { credentials: 'same-origin', cache: 'no-store' }));
}

/** Upload one label PDF, every page a label (an order slot). Pass the same `clientEventId` to retry idempotently. */
export async function uploadLabelBatch(file: File, clientEventId: string = safeRandomUUID()): Promise<PrintFileUploadResult> {
  const form = new FormData();
  form.set('file', file);
  form.set('clientEventId', clientEventId);
  form.set('stock', 'label');
  return readData(await fetch(ENDPOINT, { method: 'POST', body: form, credentials: 'same-origin' }));
}
