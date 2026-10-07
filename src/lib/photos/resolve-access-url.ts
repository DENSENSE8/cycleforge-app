import pool from '@/lib/db';
import { getPrimaryPhotoStorage } from './storage/resolve-primary';
import type { PhotoStorageRow } from './storage/types';
import { getStorageAdapter } from './storage/registry';
import { readPhotoBytesById } from './read-bytes';
import { photoContentUrl } from './display-url';

const TTL = Number(process.env.PHOTOS_SIGNED_URL_TTL_SECONDS || 3600);

/** Signed GCS URL for public share packs; falls back to app content route. */
export async function resolvePhotoAccessUrl(
  photoId: number,
  organizationId: string,
  variant: 'thumb' | 'full' = 'full',
  origin?: string,
): Promise<string> {
  // Thumbs first via the content route — it can synthesize a downscale when
  // storage has no thumbObjectKey. Hitting signed GCS for full-res tiles made
  // five peek photos ≈ 1MB and one of them owned LCP.
  if (variant === 'thumb') {
    if (origin) {
      return `${origin.replace(/\/+$/, '')}${photoContentUrl(photoId, 'thumb')}`;
    }
    return photoContentUrl(photoId, 'thumb');
  }

  return fullUrlFromStorage(photoId, await getPrimaryPhotoStorage(photoId, organizationId), origin);
}

/** Full-variant `resolvePhotoAccessUrl` for many photos of one org: one storage read, not one per photo. */
export async function resolveFullPhotoAccessUrls(
  photoIds: readonly number[],
  organizationId: string,
): Promise<Map<number, string>> {
  // The primary storage row of every photo in one query (unique per photo: ux_photo_storage_primary),
  // only the columns the URL needs.
  const res = photoIds.length
    ? await pool.query<{ photo_id: string; provider: PhotoStorageRow['provider']; bucket: string | null; object_key: string }>(
        `SELECT photo_id, provider, bucket, object_key
           FROM photo_storage
          WHERE photo_id = ANY($1::bigint[]) AND is_primary = TRUE AND organization_id = $2`,
        [[...photoIds], organizationId],
      )
    : { rows: [] };
  const storages = new Map(
    res.rows.map((r) => [Number(r.photo_id), { provider: r.provider, bucket: r.bucket, objectKey: r.object_key }]),
  );
  const urls = await Promise.all(
    photoIds.map((id) => fullUrlFromStorage(id, storages.get(id) ?? null)),
  );
  return new Map(photoIds.map((id, i) => [id, urls[i]!]));
}

async function fullUrlFromStorage(
  photoId: number,
  storage: Pick<PhotoStorageRow, 'provider' | 'bucket' | 'objectKey'> | null,
  origin?: string,
): Promise<string> {
  if (storage?.provider === 'gcs' && storage.bucket) {
    try {
      const adapter = getStorageAdapter('gcs');
      return await adapter.getSignedReadUrl({
        bucket: storage.bucket,
        objectKey: storage.objectKey,
        ttlSeconds: TTL,
      });
    } catch {
      /* fall through */
    }
  }

  if (origin) {
    return `${origin.replace(/\/+$/, '')}${photoContentUrl(photoId)}`;
  }
  return photoContentUrl(photoId);
}

export { readPhotoBytesById };
