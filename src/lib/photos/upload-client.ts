import { CLIENT_CAPTURED_AT_FIELD } from './capture-provenance';
import { notifyClaimPhotosArchiving } from './claim-archive-feedback';
import type { PhotoEntityType } from './types';

interface ClientUploadInput {
  file: Blob | File;
  entityType: PhotoEntityType;
  entityId: number;
  photoType?: string;
  linkRole?: 'primary' | 'claim_evidence' | 'insurance_share';
  poRef?: string;
  /** Device-reported capture instant in epoch milliseconds — the shutter clock for a canvas capture, `File.lastModified` for a picked/dropped… */
  clientCapturedAtMs?: number | null;
  /** What this shot SHOWS, within its stage (`./photo-aspects.ts`). */
  photoAspect?: string | null;
  /** Stable per shot across retries / reloads — the server replays instead of filing a duplicate. */
  idempotencyKey?: string | null;
}

export interface ClientUploadResult {
  id: number;
  url: string;
  thumbUrl: string;
  /** Present when the carton already has a filed Zendesk claim. */
  claimTicketId?: number | null;
}

/** Browser multipart upload to the unified photos endpoint. */
export async function uploadPhotoClient(input: ClientUploadInput): Promise<ClientUploadResult> {
  const form = new FormData();
  form.append('file', input.file);
  form.append('entityType', input.entityType);
  form.append('entityId', String(input.entityId));
  if (input.photoType) form.append('photoType', input.photoType);
  if (input.linkRole) form.append('linkRole', input.linkRole);
  if (input.poRef) form.append('poRef', input.poRef);
  if (input.photoAspect) form.append('photoAspect', input.photoAspect);
  // Epoch-ms verbatim — the route's parser accepts that form, so no capture
  // surface has to format a date. Absent stays absent (null column, no warn).
  if (input.clientCapturedAtMs != null && Number.isFinite(input.clientCapturedAtMs)) {
    form.append(CLIENT_CAPTURED_AT_FIELD, String(Math.trunc(input.clientCapturedAtMs)));
  }

  const res = await fetch('/api/photos/upload', {
    method: 'POST',
    body: form,
    headers: input.idempotencyKey ? { 'Idempotency-Key': input.idempotencyKey } : undefined,
  });
  const data = (await res.json().catch(() => null)) as ClientUploadResult & {
    error?: string;
    details?: string;
  };
  // Prefer `details` — for a 500 the route returns { error: 'Internal server
  // error', details: '<real cause>' }, so the operator sees the actual reason.
  if (!res.ok) throw new Error(data?.details || data?.error || `Upload failed (${res.status})`);
  notifyClaimPhotosArchiving(data.claimTicketId);
  return data;
}

export async function linkPhotoClient(input: {
  photoId: number;
  entityType: PhotoEntityType;
  entityId: number;
  linkRole: 'primary' | 'claim_evidence' | 'insurance_share';
}): Promise<void> {
  const res = await fetch('/api/photos/links', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(data?.error || `Link failed (${res.status})`);
  }
}
