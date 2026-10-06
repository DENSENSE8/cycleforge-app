/**
 * Browser calls for inbound orders — document extraction, the dry-run
 * preview, landing (with each line's listing photos), and delete. Every
 * inbound-order surface posts through here so the wire shape lives in one place.
 */

import {
  assignInboundLineKeys,
  filledInboundLines,
  type InboundOrderDraft,
  type InboundOrderType,
} from '@/lib/inbound/inbound-order-draft';
import type {
  DeleteInboundOrderResult,
  IngestInboundOrderResult,
  InboundOrderPreview,
} from '@/lib/inbound/ingest-inbound-order';
import type { CartonInboundOrder, InboundOrderEditRecord } from '@/lib/inbound/inbound-order-edit';
import { compressPhotoForUpload } from '@/lib/image/compress-for-upload';
import { uploadPhotoClient } from '@/lib/photos/upload-client';

export async function readFileAsDataUrl(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) {
    const { promise, resolve, reject } = Promise.withResolvers<string>();
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error ?? new Error('read failed'));
    reader.readAsDataURL(file);
    return promise;
  }
  const compressed = await compressPhotoForUpload(file, {
    // Paperwork needs more character detail than product photos, while still
    // staying comfortably below Vercel's request-body ceiling for a phone shot.
    longEdge: 1_600,
    quality: 0.84,
    source: 'inbound-paperwork',
  });
  return compressed.base64;
}

async function call<T>(url: string, init: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { 'content-type': 'application/json', ...init.headers } });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.success) throw new Error(data?.error || `Request failed (${res.status})`);
  return data as T;
}

/** Screenshot / pasted text → a draft to review (nothing lands). */
export async function postInboundOrderExtract(opts: { type: InboundOrderType; text?: string; imageDataUrls?: string[] }): Promise<InboundOrderDraft> {
  const data = await call<{ draft: InboundOrderDraft }>('/api/receiving/inbound/extract-po', {
    method: 'POST',
    body: JSON.stringify({
      type: opts.type,
      text: opts.text?.trim() || null,
      image_data_urls: opts.imageDataUrls?.length ? opts.imageDataUrls : null,
    }),
  });
  return data.draft;
}

export async function postInboundOrderPreview(draft: InboundOrderDraft, signal?: AbortSignal): Promise<InboundOrderPreview> {
  const data = await call<{ preview: InboundOrderPreview }>('/api/receiving/inbound/orders', {
    method: 'POST',
    body: JSON.stringify({ draft, dryRun: true }),
    signal,
  });
  return data.preview;
}

export interface InboundOrderTicketOutcome {
  success: boolean;
  ticketNumber?: string;
  ticketUrl?: string | null;
  error?: string;
  draftBody?: string;
}

export async function postInboundOrder(
  draft: InboundOrderDraft,
  idempotencyKey: string,
): Promise<{ result: IngestInboundOrderResult; ticket: InboundOrderTicketOutcome | null }> {
  return call('/api/receiving/inbound/orders', {
    method: 'POST',
    headers: { 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify({ draft }),
  });
}

/**
 * Uploads the seller-listing photos held per draft line (`photosByLine[i]` ↔
 * `draft.lines[i]`) once the order landed: each to its landed receiving line
 * (`RECEIVING_LINE`, photo type `listing` — never counted by unbox's photo
 * policy), so unbox shows them "as listed" the moment the tracking is scanned.
 * Lines map to landed rows by the writer's own key rule (`assignInboundLineKeys`
 * over the filled lines). One failed photo never stops the rest.
 */
export async function uploadInboundListingPhotos(
  draft: InboundOrderDraft,
  result: Pick<IngestInboundOrderResult, 'lines'>,
  photosByLine: ReadonlyArray<ReadonlyArray<File>>,
): Promise<{ uploaded: number; failed: number }> {
  const filled = filledInboundLines(draft);
  const keys = assignInboundLineKeys(filled);
  const lineIdByKey = new Map(result.lines.map((line) => [line.lineKey, line.receivingLineId]));
  const jobs = draft.lines.flatMap((line, index) => {
    const at = filled.indexOf(line);
    const receivingLineId = at < 0 ? undefined : lineIdByKey.get(keys[at]!);
    return receivingLineId == null ? [] : (photosByLine[index] ?? []).map((file) => ({ file, receivingLineId }));
  });
  const settled = await Promise.allSettled(
    jobs.map(async ({ file, receivingLineId }) => {
      // Serial plates and "as listed" scratches need detail, but the body must stay under the request ceiling.
      const { blob } = await compressPhotoForUpload(file, { longEdge: 1_600, quality: 0.84, source: 'inbound-listing' });
      return uploadPhotoClient({ file: blob, entityType: 'RECEIVING_LINE', entityId: receivingLineId, photoType: 'listing' });
    }),
  );
  const uploaded = settled.filter((s) => s.status === 'fulfilled').length;
  const held = photosByLine.reduce((sum, files) => sum + files.length, 0);
  return { uploaded, failed: held - uploaded };
}

export async function deleteInboundOrderRequest(inboundOrderId: number): Promise<DeleteInboundOrderResult> {
  const data = await call<{ result: DeleteInboundOrderResult }>(`/api/receiving/inbound/orders?id=${inboundOrderId}`, {
    method: 'DELETE',
  });
  return data.result;
}

/** A landed order as the draft the form edits (its identity and line keys kept). */
export async function fetchInboundOrderEdit(inboundOrderId: number, signal?: AbortSignal): Promise<InboundOrderEditRecord> {
  const data = await call<{ record: InboundOrderEditRecord }>(`/api/receiving/inbound/orders/${inboundOrderId}`, { method: 'GET', signal });
  return data.record;
}

/** The inbound orders a carton's lines belong to. */
export async function fetchCartonInboundOrders(receivingId: number, signal?: AbortSignal): Promise<CartonInboundOrder[]> {
  const data = await call<{ orders: CartonInboundOrder[] }>(
    `/api/receiving/inbound/orders/for-carton?receivingId=${receivingId}`,
    { method: 'GET', signal },
  );
  return data.orders;
}
