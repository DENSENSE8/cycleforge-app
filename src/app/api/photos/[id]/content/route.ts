import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserBySid } from '@/lib/auth/current-user';
import { readSessionSid } from '@/lib/auth/session';
import { requireRoutePerm } from '@/lib/auth/dynamic-route-guard';
import { tenantQuery } from '@/lib/tenancy/db';
import { getPrimaryPhotoStorage } from '@/lib/photos/storage/resolve-primary';
import { getStorageAdapter } from '@/lib/photos/storage/registry';
import { generateThumbnail, readPhotoBytesById } from '@/lib/photos/read-bytes';
import { normalizePhotoDisplayUrl } from '@/lib/nas-photo-url';
import { resolveOrgIdFromRequest, NIL_ORG_ID } from '@/lib/tenancy/resolve-org-from-request';

export const dynamic = 'force-dynamic';

const TTL = Number(process.env.PHOTOS_SIGNED_URL_TTL_SECONDS || 3600);
const THUMB_MAX_PX = Number(process.env.PHOTOS_THUMB_MAX_PX || 256);
const THUMB_MEMO_MAX = 64;

/** Bounded in-process memo for on-demand thumb synthesis (missing thumbObjectKey). */
const thumbMemo = new Map<number, { bytes: Buffer; contentType: string }>();

function rememberThumb(photoId: number, entry: { bytes: Buffer; contentType: string }) {
  if (thumbMemo.size >= THUMB_MEMO_MAX) {
    const oldest = thumbMemo.keys().next().value;
    if (oldest != null) thumbMemo.delete(oldest);
  }
  thumbMemo.set(photoId, entry);
}

async function synthesizeThumb(
  photoId: number,
  orgId: string,
): Promise<{ bytes: Buffer; contentType: string } | null> {
  const cached = thumbMemo.get(photoId);
  if (cached) return cached;
  const full = await readPhotoBytesById(photoId, orgId);
  if (!full) return null;
  const bytes = await generateThumbnail(Buffer.from(full.bytes), THUMB_MAX_PX);
  const entry = { bytes, contentType: 'image/jpeg' };
  rememberThumb(photoId, entry);
  return entry;
}

// A photo is content-addressed by an immutable {id}+variant — its bytes never
// change (a re-upload is a new id). Cache thumbnails hard, browser-only.
// `private` (never `public`) keeps these auth-gated tenant photos off any shared
// CDN — the cache stays per-browser, so no cross-tenant leak.
const IMMUTABLE_CACHE = 'private, max-age=31536000, immutable';
// Cached-302 lifetime for the full-res redirect: half the signing TTL, so the
// browser always re-fetches the redirect (getting a fresh signed URL) BEFORE the
// previously-signed target can expire — a cached 302 never replays a dead URL.
const REDIRECT_CACHE = `private, max-age=${Math.max(60, Math.floor(TTL / 2))}`;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: idParam } = await params;
  const photoId = Number(idParam);
  if (!Number.isFinite(photoId) || photoId <= 0) {
    return NextResponse.json({ error: 'Valid photo id is required' }, { status: 400 });
  }

  const variant = new URL(request.url).searchParams.get('variant') === 'thumb' ? 'thumb' : 'full';
  const download = new URL(request.url).searchParams.get('download') === '1';

  const sid = readSessionSid(request.cookies);
  const actor = await getCurrentUserBySid(sid);

  let organizationId: string | undefined;
  if (actor) {
    organizationId = actor.organizationId;
    const gate = await requireRoutePerm(request, 'photos.view');
    if (gate.denied) {
      // Allow entity-scoped viewers without photos.view — fall through to legacy URL redirect
      organizationId = actor.organizationId;
    }
  }

  // Anonymous branch — sign-in staff-photo ONLY.
  //
  // The sign-in picker renders before any session exists, and it already
  // discloses this exact set of people (name + role + colour) to anyone who can
  // reach the tenant's host — see /api/auth/staff-picker, which is public by
  // construction. `resolveCurrentStaffAvatarOrg` matches that set exactly: it
  // resolves an org ONLY when the photo is the CURRENT `avatar_photo_id` of an
  // active staffer in the tenant this request's host resolves to. Anything
  // else — evidence photos, a replaced avatar, another tenant's staffer —
  // falls through to the 401 below, unchanged.
  if (!organizationId) {
    const anonOrgId = await resolveCurrentStaffAvatarOrg(request, photoId);
    if (anonOrgId) organizationId = anonOrgId;
  }

  const photoRes = organizationId
    ? await tenantQuery<{ organization_id: string }>(
        organizationId,
        `SELECT organization_id FROM photos WHERE id = $1 AND organization_id = $2`,
        [photoId, organizationId],
      )
    : null;

  if (actor && photoRes && photoRes.rowCount === 0) {
    return NextResponse.json({ error: 'Photo not found' }, { status: 404 });
  }

  const orgId = organizationId || photoRes?.rows[0]?.organization_id;
  if (!orgId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const storage = await getPrimaryPhotoStorage(photoId, orgId);

  if (download) {
    const bytes = await readPhotoBytesById(photoId, orgId);
    if (bytes) {
      return new NextResponse(Buffer.from(bytes.bytes), {
        headers: {
          'content-type': bytes.contentType,
          'content-disposition': `attachment; filename="${bytes.filename}"`,
          'cache-control': 'private, max-age=300',
        },
      });
    }
  }

  if (storage?.provider === 'gcs' && storage.bucket) {
    const isStoredThumb = variant === 'thumb' && !!storage.thumbObjectKey;
    const key = isStoredThumb ? storage.thumbObjectKey! : storage.objectKey;
    try {
      const adapter = getStorageAdapter('gcs');

      // Thumbnails render by the hundreds (grid + strip) and are tiny (≤256px).
      // Stream their bytes inline off THIS stable route URL with an immutable
      // cache, so the browser reuses them across scroll / reopen / revisit with
      // zero network. The old signed-URL redirect rotated the cache key on every
      // request, so nothing was ever reused — the "no caching at all" symptom.
      if (variant === 'thumb') {
        const etag = `"p${photoId}-thumb"`;
        if (request.headers.get('if-none-match') === etag) {
          return new NextResponse(null, {
            status: 304,
            headers: { etag, 'cache-control': IMMUTABLE_CACHE },
          });
        }
        if (isStoredThumb) {
          const bytes = await adapter.getObjectBytes({ bucket: storage.bucket, objectKey: key });
          return new NextResponse(Buffer.from(bytes), {
            headers: {
              'content-type': storage.contentType || 'image/jpeg',
              'cache-control': IMMUTABLE_CACHE,
              etag,
            },
          });
        }
        // No stored thumb — synthesize from full bytes and memoize.
        const synthesized = await synthesizeThumb(photoId, orgId);
        if (synthesized) {
          return new NextResponse(Buffer.from(synthesized.bytes), {
            headers: {
              'content-type': synthesized.contentType,
              'cache-control': IMMUTABLE_CACHE,
              etag,
            },
          });
        }
      }

      // Full-res stays a direct-from-GCS redirect (avoids streaming MBs through
      // the function), but the 302 is now browser-cacheable — see REDIRECT_CACHE.
      const signed = await adapter.getSignedReadUrl({
        bucket: storage.bucket,
        objectKey: key,
        ttlSeconds: TTL,
      });
      return NextResponse.redirect(signed, {
        status: 302,
        headers: { 'cache-control': REDIRECT_CACHE },
      });
    } catch (err) {
      // Do NOT swallow silently — a signing failure here (bad SA key, missing
      // IAM, malformed creds) is exactly how photo content 404s with no trace.
      console.error(
        '[photos/content] GCS signed-url failed',
        { photoId, bucket: storage.bucket, objectKey: key },
        err instanceof Error ? err.message : err,
      );
      /* fall through to byte read / legacy */
    }
  }

  const legacyUrl = storage?.legacyUrl;
  if (legacyUrl && !legacyUrl.startsWith('/api/photos/')) {
    const display = normalizePhotoDisplayUrl(legacyUrl);
    if (display.startsWith('http') || display.startsWith('/')) {
      // Legacy targets (NAS proxy / blob) are stable URLs, so this redirect is
      // safe to cache — immutable for thumbs, TTL-bounded for full.
      return NextResponse.redirect(display, {
        status: 302,
        headers: { 'cache-control': variant === 'thumb' ? IMMUTABLE_CACHE : REDIRECT_CACHE },
      });
    }
  }

  if (actor) {
    if (variant === 'thumb') {
      const synthesized = await synthesizeThumb(photoId, orgId);
      if (synthesized) {
        const etag = `"p${photoId}-thumb"`;
        return new NextResponse(Buffer.from(synthesized.bytes), {
          headers: {
            'content-type': synthesized.contentType,
            'cache-control': IMMUTABLE_CACHE,
            etag,
          },
        });
      }
    }
    const bytes = await readPhotoBytesById(photoId, orgId);
    if (bytes) {
      return new NextResponse(Buffer.from(bytes.bytes), {
        headers: {
          'content-type': bytes.contentType,
          'cache-control': variant === 'thumb' ? IMMUTABLE_CACHE : REDIRECT_CACHE,
        },
      });
    }
  }

  return NextResponse.json({ error: 'Photo content unavailable' }, { status: 404 });
}

/**
 * Resolve the org for an ANONYMOUS request, and only for a photo that is the
 * current profile photo of an active staffer in the tenant this request's host
 * resolves to. Returns null for everything else — including a staff avatar in a
 * DIFFERENT tenant, so a photo id cannot be walked across orgs.
 *
 * Scoped deliberately to `staff.avatar_photo_id` rather than "any STAFF-linked
 * photo": a replaced avatar keeps its `photo_entity_links` row until the delete
 * lands, and a superseded face should stop being publicly readable the moment
 * it stops being the current one.
 */
async function resolveCurrentStaffAvatarOrg(
  request: NextRequest,
  photoId: number,
): Promise<string | null> {
  try {
    const hostOrgId = await resolveOrgIdFromRequest(request);
    if (!hostOrgId || hostOrgId === NIL_ORG_ID) return null;
    const r = await tenantQuery<{ organization_id: string }>(
      hostOrgId,
      `SELECT organization_id
         FROM staff
        WHERE avatar_photo_id = $1
          AND organization_id = $2
          AND COALESCE(status, 'active') IN ('active', 'invited')
          AND COALESCE(active, true) = true
        LIMIT 1`,
      [photoId, hostOrgId],
    );
    return r.rows[0]?.organization_id ?? null;
  } catch {
    return null;
  }
}
