import { readPhotoBytes } from '@/lib/receiving-claim-photos';
import { readPhotoBytesById } from '@/lib/photos/read-bytes';
import { getReceivingPhotosByIds } from '@/lib/photos/queries/receiving-list';
import type { HelpdeskProvider } from '@/lib/integrations/helpdesk';

/**
 * Upload a carton's selected receiving photos to the helpdesk as real file
 * attachments (not links), scoped to `receivingId`'s own photos for safety.
 * Shared by both the "file a new claim" route (POST /api/receiving/zendesk-claim)
 * and the "update a linked ticket" route (POST /api/receiving/zendesk-claim/thread)
 * so a photo picked in either flow lands on the ticket the same way. Best-effort
 * per file — one unreadable photo never blocks the rest.
 */
export async function uploadClaimPhotosToHelpdesk(opts: {
  helpdesk: Pick<HelpdeskProvider, 'uploadAttachment'>;
  organizationId: string;
  receivingId: number;
  photoIds: number[];
  /** Attachment filenames are `${fileLabel}_001.jpg`, etc. */
  fileLabel: string;
}): Promise<string[]> {
  const uploads: string[] = [];
  if (opts.photoIds.length === 0) return uploads;
  const photoRows = await getReceivingPhotosByIds({
    organizationId: opts.organizationId,
    receivingId: opts.receivingId,
    photoIds: opts.photoIds,
  });
  let seq = 0;
  for (const row of photoRows) {
    let pb = await readPhotoBytesById(row.id, opts.organizationId);
    if (!pb) pb = await readPhotoBytes(String(row.url || ''));
    if (!pb) continue;
    seq += 1;
    const ext = (
      /\.([A-Za-z0-9]+)$/.exec(pb.filename)?.[1] ||
      pb.contentType.split('/')[1] ||
      'jpg'
    ).toLowerCase();
    const fileName = `${opts.fileLabel}_${String(seq).padStart(3, '0')}.${ext}`;
    try {
      uploads.push(await opts.helpdesk.uploadAttachment(fileName, pb.bytes, pb.contentType));
    } catch (err) {
      console.warn('[receiving-claim-attach] photo upload failed', row.id, err);
    }
  }
  return uploads;
}
