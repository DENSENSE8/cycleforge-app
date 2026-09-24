import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { ApiError, errorResponse } from '@/lib/api';
import { uploadPermissionFor } from '@/lib/photos/entity-permissions';
import { publishEntityMediaInsert } from '@/lib/photos/publish-entity-media';
import { statGcsObject } from '@/lib/photos/storage/gcs-adapter';
import { resolveVideoMaxBytes, validateStoredVideo } from '@/lib/photos/video-upload-rules';
import { videoContentUrl } from '@/lib/photos/display-url';
import { getVideo, markVideoReady } from '@/lib/photos/videos';

export const dynamic = 'force-dynamic';

/**
 * POST /api/photos/upload/video/{id}/finalize — step 2 of a video upload.
 *
 * Gated like the create step, by `uploadPermissionFor` of the entity the
 * pending row names. Reads what GCS actually stored (never the client's claim),
 * flips the row to `ready`, and announces it through the same per-entity
 * realtime dispatch a photo upload uses. Idempotent: finalizing a ready video
 * returns it again without re-publishing.
 */
export const POST = withAuth(async (req: NextRequest, ctx) => {
  try {
    const parts = req.nextUrl.pathname.split('/').filter(Boolean);
    const videoId = Number(parts[parts.length - 2]);
    if (!Number.isSafeInteger(videoId) || videoId <= 0) throw ApiError.badRequest('Valid video id is required');

    const video = await getVideo(ctx.organizationId, videoId);
    if (!video) throw ApiError.notFound('Video', videoId);

    const requiredPerm = uploadPermissionFor(video.entityType);
    if (!ctx.permissions.has(requiredPerm)) {
      return NextResponse.json({ error: 'FORBIDDEN', permission: requiredPerm }, { status: 403 });
    }

    let ready = video;
    if (video.status === 'pending') {
      const stored = await statGcsObject({ bucket: video.bucket, objectKey: video.objectKey });
      const verdict = validateStoredVideo(
        stored,
        video.contentType,
        Math.min(video.declaredSizeBytes, resolveVideoMaxBytes(process.env.PHOTOS_VIDEO_MAX_BYTES)),
      );
      if (!verdict.ok) throw ApiError.conflict(verdict.error);

      const updated = await markVideoReady(ctx.organizationId, videoId, verdict.sizeBytes);
      if (!updated) throw ApiError.notFound('Video', videoId);
      ready = updated;
      await publishEntityMediaInsert({
        organizationId: ctx.organizationId,
        entityType: ready.entityType,
        entityId: ready.entityId,
        photoId: null,
        source: 'photos.upload.video',
      });
    }

    return NextResponse.json({
      id: ready.id,
      url: videoContentUrl(ready.id),
      contentType: ready.contentType,
      sizeBytes: ready.fileSizeBytes,
      createdAt: ready.createdAt,
    });
  } catch (error) {
    return errorResponse(error, 'POST /api/photos/upload/video/[id]/finalize');
  }
}, {});
