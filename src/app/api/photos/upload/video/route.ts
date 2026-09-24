import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { ApiError, errorResponse } from '@/lib/api';
import { parseMediaEntityTarget, uploadPermissionFor } from '@/lib/photos/entity-permissions';
import { isGcsConfigured, signGcsUploadUrl } from '@/lib/photos/storage/gcs-adapter';
import { resolveVideoMaxBytes, validateVideoUpload } from '@/lib/photos/video-upload-rules';
import { createPendingVideo } from '@/lib/photos/videos';

export const dynamic = 'force-dynamic';

/** Long enough to start a phone upload; GCS honours a PUT that began before expiry. */
const UPLOAD_URL_TTL_SECONDS = 15 * 60;

/**
 * POST /api/photos/upload/video — step 1 of a direct-to-GCS video upload.
 *
 * Same routing as `POST /api/photos/upload`: the body names `entityType` +
 * `entityId` (parsed by `parseMediaEntityTarget`, gated by
 * `uploadPermissionFor(entityType)`); the object lands in the photo bucket
 * under `{org}/videos/{entity flow}/…`. Bytes never pass through here — this
 * inserts a `pending` row and returns a V4 signed PUT that binds the content
 * type and size. The browser PUTs to `uploadUrl` with exactly `headers`, then
 * calls `POST /api/photos/upload/video/{videoId}/finalize`.
 *
 * Body: `{ entityType, entityId, contentType, sizeBytes, fileName? }`.
 */
export const POST = withAuth(async (req: NextRequest, ctx) => {
  try {
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) throw ApiError.badRequest('Invalid JSON body');
    const { entityType, entityId } = parseMediaEntityTarget(body.entityType, body.entityId);

    const requiredPerm = uploadPermissionFor(entityType);
    if (!ctx.permissions.has(requiredPerm)) {
      return NextResponse.json({ error: 'FORBIDDEN', permission: requiredPerm }, { status: 403 });
    }

    const maxBytes = resolveVideoMaxBytes(process.env.PHOTOS_VIDEO_MAX_BYTES);
    const verdict = validateVideoUpload(
      {
        contentType: typeof body.contentType === 'string' ? body.contentType : null,
        sizeBytes: Number(body.sizeBytes),
        fileName: typeof body.fileName === 'string' ? body.fileName : null,
      },
      maxBytes,
    );
    if (!verdict.ok) throw ApiError.badRequest(verdict.error);

    // Video is GCS-only: there is no legacy/NAS path to fall back to.
    if (!isGcsConfigured()) {
      throw new ApiError(
        503,
        'Video storage is not configured (PHOTOS_GCS_BUCKET + Google service-account credentials required)',
      );
    }

    const video = await createPendingVideo({
      organizationId: ctx.organizationId,
      staffId: ctx.staffId,
      entityType,
      entityId,
      contentType: verdict.contentType,
      extension: verdict.extension,
      declaredSizeBytes: Number(body.sizeBytes),
    });
    const signed = await signGcsUploadUrl({
      bucket: video.bucket,
      objectKey: video.objectKey,
      contentType: video.contentType,
      maxBytes: video.declaredSizeBytes,
      ttlSeconds: UPLOAD_URL_TTL_SECONDS,
    });

    return NextResponse.json({
      videoId: video.id,
      uploadUrl: signed.url,
      headers: signed.headers,
      expiresAt: signed.expiresAt,
    });
  } catch (error) {
    return errorResponse(error, 'POST /api/photos/upload/video');
  }
}, {});
