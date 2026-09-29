/**
 * Browser transport for `/api/v1/label-batches` (Uploads on the Labels & docs
 * desk). Same-origin, session cookie only; it never sends a tenant or an actor.
 */
import { safeRandomUUID } from '@/lib/safe-uuid';
import type { LabelBatchDetail, LabelBatchFilters, LabelBatchList, LabelBatchUploadResult } from './contracts';

const ENDPOINT = '/api/v1/label-batches';

export const LABEL_BATCHES_QUERY_ROOT = ['v1', 'label-batches'] as const;
export const labelBatchesKey = (filters: LabelBatchFilters) =>
  [...LABEL_BATCHES_QUERY_ROOT, 'list', { q: filters.q?.trim() ?? '', from: filters.from ?? '', to: filters.to ?? '' }] as const;
export const labelBatchKey = (id: number) => [...LABEL_BATCHES_QUERY_ROOT, id] as const;

async function readData<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => null)) as { data?: T; error?: { message?: string } } | null;
  if (!response.ok || payload?.data === undefined) {
    throw new Error(payload?.error?.message ?? `Uploads request failed (${response.status}).`);
  }
  return payload.data;
}

export async function fetchLabelBatches(filters: LabelBatchFilters): Promise<LabelBatchList> {
  const params = new URLSearchParams();
  const q = filters.q?.trim();
  if (q) params.set('q', q);
  if (filters.from) params.set('from', filters.from);
  if (filters.to) params.set('to', filters.to);
  const query = params.toString();
  return readData(await fetch(query ? `${ENDPOINT}?${query}` : ENDPOINT, { credentials: 'same-origin', cache: 'no-store' }));
}

export async function fetchLabelBatch(id: number): Promise<LabelBatchDetail> {
  return readData(await fetch(`${ENDPOINT}/${id}`, { credentials: 'same-origin', cache: 'no-store' }));
}

/** Upload one label PDF. Pass the same `clientEventId` to retry an upload idempotently. */
export async function uploadLabelBatch(file: File, clientEventId: string = safeRandomUUID()): Promise<LabelBatchUploadResult> {
  const form = new FormData();
  form.set('file', file);
  form.set('clientEventId', clientEventId);
  return readData(await fetch(ENDPOINT, { method: 'POST', body: form, credentials: 'same-origin' }));
}
