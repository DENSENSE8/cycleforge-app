/**
 * Browser transport for Labels & docs › Bulk, the file list
 * (`GET /api/shipping/label-intake/files[/{id}]`), and its writes — upload
 * (`POST /api/v1/label-batches`) and delete (`DELETE /api/v1/label-batches/{id}`).
 * Same-origin, session cookie only; it never sends a tenant or an actor.
 */
import { safeRandomUUID } from '@/lib/safe-uuid';
import type { PrintFileDetail, PrintFileQuery, PrintFileQueue, PrintFileUploadResult } from './print-file-contracts';

const FILES_ENDPOINT = '/api/shipping/label-intake/files';
const UPLOAD_ENDPOINT = '/api/v1/label-batches';

/** Every file-list read — invalidate after an upload, a delete or a print. */
export const PRINT_FILES_KEY_ROOT = ['label-intake', 'print-files'] as const;

export const printFilesKey = (query: PrintFileQuery) => [...PRINT_FILES_KEY_ROOT, query] as const;

async function readJson<T>(response: Response, envelope: 'plain' | 'v1'): Promise<T> {
  const payload = (await response.json().catch(() => null)) as { data?: T; error?: string | { message?: string } } | null;
  const value = envelope === 'v1' ? payload?.data : (payload as T | null);
  if (!response.ok || value == null) {
    const error = payload?.error;
    throw new Error((typeof error === 'string' ? error : error?.message) ?? `Files request failed (${response.status}).`);
  }
  return value;
}

export async function fetchPrintFiles(query: PrintFileQuery): Promise<PrintFileQueue> {
  const params = new URLSearchParams();
  for (const [name, value] of Object.entries(query)) {
    if (value != null && value !== '') params.set(name, String(value));
  }
  const search = params.toString();
  return readJson(await fetch(`${FILES_ENDPOINT}${search ? `?${search}` : ''}`, { credentials: 'same-origin', cache: 'no-store' }), 'plain');
}

export async function fetchPrintFile(id: number): Promise<PrintFileDetail> {
  return readJson(await fetch(`${FILES_ENDPOINT}/${id}`, { credentials: 'same-origin', cache: 'no-store' }), 'plain');
}

/** Upload one PDF; every page is classified by its size on the server. Identical bytes answer the existing file (`duplicate`). */
export async function uploadPrintFile(file: File): Promise<PrintFileUploadResult> {
  const form = new FormData();
  form.set('file', file);
  form.set('clientEventId', safeRandomUUID());
  return readJson(await fetch(UPLOAD_ENDPOINT, { method: 'POST', body: form, credentials: 'same-origin' }), 'v1');
}

/** Delete one file and its pages; refused (throws) when any page is on an order. */
export async function deletePrintFile(id: number): Promise<void> {
  await readJson(await fetch(`${UPLOAD_ENDPOINT}/${id}`, { method: 'DELETE', credentials: 'same-origin' }), 'v1');
}
