/**
 * Browser transport for the print desk: `/api/v1/label-prints`,
 * `/api/v1/paperwork-prints` and the per-label `pdf` / `prints` resources.
 * Same-origin, session cookie only; it never sends a tenant, an actor or a
 * reprint flag.
 */
import type {
  LabelPrintEvent,
  LabelPrintQueue,
  LabelPrintRecordBody,
  LabelPrintRecordResult,
  LabelPrintView,
  PaperworkPrintRecordBody,
  PaperworkPrintRecordResult,
} from './contracts';

export const labelPrintQueueKey = (view: LabelPrintView) => ['v1', 'label-prints', view] as const;
export const LABEL_PRINTS_QUERY_ROOT = ['v1', 'label-prints'] as const;
export const labelPrintHistoryKey = (id: number) => ['v1', 'label-ingestions', id, 'prints'] as const;

async function readData<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => null)) as { data?: T; error?: { message?: string } } | null;
  if (!response.ok || payload?.data === undefined) {
    throw new Error(payload?.error?.message ?? `Print desk request failed (${response.status}).`);
  }
  return payload.data;
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  return readData(
    await fetch(url, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );
}

export async function fetchLabelPrintQueue(view: LabelPrintView): Promise<LabelPrintQueue> {
  return readData(await fetch(`/api/v1/label-prints?view=${view}`, { credentials: 'same-origin', cache: 'no-store' }));
}

export async function fetchLabelPrintHistory(id: number): Promise<LabelPrintEvent[]> {
  return readData(await fetch(`/api/v1/label-ingestions/${id}/prints`, { credentials: 'same-origin', cache: 'no-store' }));
}

export async function recordLabelPrintBatch(body: LabelPrintRecordBody): Promise<LabelPrintRecordResult> {
  return postJson('/api/v1/label-prints', body);
}

export async function recordPaperworkPrintBatch(body: PaperworkPrintRecordBody): Promise<PaperworkPrintRecordResult> {
  return postJson('/api/v1/paperwork-prints', body);
}

/** Same-origin URL of a label's stored PDF — what the pane previews and every channel prints. */
export const labelPdfSrc = (id: number) => `/api/v1/label-ingestions/${id}/pdf`;
