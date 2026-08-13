import { getPrimaryPhotoStorage } from './storage/resolve-primary';
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

  const storage = await getPrimaryPhotoStorage(photoId, organizationId);
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
