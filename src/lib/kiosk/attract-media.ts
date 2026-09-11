/**
 * Org kiosk attract / screensaver media — MIME allowlist + Blob key helpers.
 *
 * Bytes live on public Vercel Blob; the durable pointer is
 * `organizations.settings.brand.attractMediaUrl` (AttractLoop on `/kiosk/v2`).
 * Auth-gated photo content URLs are not usable on the kiosk host.
 */

const ATTRACT_IMAGE_MIME = new Set<string>([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);

const ATTRACT_VIDEO_MIME = new Set<string>(['video/mp4', 'video/webm']);

export const ATTRACT_ALLOWED_MIME = new Set<string>([
  ...ATTRACT_IMAGE_MIME,
  ...ATTRACT_VIDEO_MIME,
]);

export const ATTRACT_ACCEPT =
  'image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm';

export const ATTRACT_IMAGE_MAX_BYTES = 8 * 1024 * 1024;
export const ATTRACT_VIDEO_MAX_BYTES = 50 * 1024 * 1024;

/** Public Blob CDN + browser cache. Keys include a timestamp, so replace = new URL. */
export const ATTRACT_BLOB_CACHE_MAX_AGE_SEC = 60 * 60 * 24 * 365;

export function isAttractVideoMime(mime: string): boolean {
  return ATTRACT_VIDEO_MIME.has(mime);
}

export function attractMediaMaxBytes(mime: string): number {
  return isAttractVideoMime(mime) ? ATTRACT_VIDEO_MAX_BYTES : ATTRACT_IMAGE_MAX_BYTES;
}

export function sanitizeAttractFileName(name: string): string {
  return name
    .replace(/[/\\]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9._-]/g, '');
}

/** Blob object key under the org prefix. */
export function attractBlobKey(orgId: string, safeName: string): string {
  const base = safeName || 'attract';
  return `orgs/${orgId}/kiosk-attract/${Date.now()}_${base}`;
}

/**
 * True when `url` looks like a Vercel Blob object we previously wrote for this
 * org's attract media — safe to best-effort `del()` on replace/clear.
 */
export function isOrgAttractBlobUrl(url: string, orgId: string): boolean {
  if (!url.includes('blob.vercel-storage.com') && !url.includes('.public.blob.vercel-storage.com')) {
    return false;
  }
  return url.includes(`/orgs/${orgId}/kiosk-attract/`);
}
