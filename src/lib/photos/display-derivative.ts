import { generateThumbnail } from './read-bytes';
import { displayObjectKey } from './storage/path-builder';
import { getStorageAdapter } from './storage/registry';

/**
 * Long edge of the viewer's display derivative (`?variant=display`): sharp on a
 * full-screen lightbox, a fraction of a multi-MB phone original.
 */
const DISPLAY_MAX_PX = Number(process.env.PHOTOS_DISPLAY_MAX_PX || 2560);

interface GcsOriginal {
  organizationId: string;
  bucket: string;
  /** Key of the ORIGINAL upload; the derivative lives at `displayObjectKey(objectKey)`. */
  objectKey: string;
}

/** EXIF-rotated, ≤ DISPLAY_MAX_PX JPEG of an original upload. */
export function generateDisplayImage(original: Buffer): Promise<Buffer> {
  return generateThumbnail(original, DISPLAY_MAX_PX);
}

/** Store derivative bytes next to their original in GCS. */
export async function putDisplayImage(input: GcsOriginal, bytes: Buffer): Promise<void> {
  await getStorageAdapter('gcs').putObject({
    organizationId: input.organizationId,
    bucket: input.bucket,
    objectKey: displayObjectKey(input.objectKey),
    buffer: bytes,
    contentType: 'image/jpeg',
  });
}

/** Concurrent first views of one photo (tile-press prefetch + viewer) share one generation. */
const inflight = new Map<string, Promise<Buffer>>();

/**
 * The stored display derivative, generated from the original on first request
 * (lazy backfill for photos uploaded before derivatives existed).
 */
export function readOrCreateDisplayImage(input: GcsOriginal): Promise<Buffer> {
  const key = displayObjectKey(input.objectKey);
  const inflightKey = `${input.bucket}/${key}`;
  const pending = inflight.get(inflightKey);
  if (pending) return pending;

  const run = (async () => {
    const adapter = getStorageAdapter('gcs');
    try {
      return await adapter.getObjectBytes({ bucket: input.bucket, objectKey: key });
    } catch (err) {
      // GCS reports a missing object as `code: 404` — that is the "not generated yet" case.
      const notFound = typeof err === 'object' && err !== null && 'code' in err && err.code === 404;
      if (!notFound) throw err;
    }
    const original = await adapter.getObjectBytes({ bucket: input.bucket, objectKey: input.objectKey });
    const bytes = await generateDisplayImage(original);
    // A failed write only costs the next request a regeneration — still serve these bytes.
    await putDisplayImage(input, bytes).catch((err: unknown) => {
      console.warn('[photos/display] derivative store failed', { key }, err instanceof Error ? err.message : err);
    });
    return bytes;
  })().finally(() => inflight.delete(inflightKey));

  inflight.set(inflightKey, run);
  return run;
}
