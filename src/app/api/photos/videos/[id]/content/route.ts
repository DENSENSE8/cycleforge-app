import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { ApiError, errorResponse } from '@/lib/api';
import { gcsAdapter } from '@/lib/photos/storage/gcs-adapter';
import { getVideo } from '@/lib/photos/videos';

export const dynamic = 'force-dynamic';

const TTL = Number(process.env.PHOTOS_SIGNED_URL_TTL_SECONDS || 3600);
// Same cached-302 rule as full-res photo content: half the signing TTL, so a
// cached redirect never replays an expired signature.
const REDIRECT_CACHE = `private, max-age=${Math.max(60, Math.floor(TTL / 2))}`;

/** GET /api/photos/videos/{id}/content — play a ready entity video. */
export const GET = withAuth(async (req: NextRequest, ctx) => {
  try {
    const parts = req.nextUrl.pathname.split('/').filter(Boolean);
    const videoId = Number(parts[parts.length - 2]);
    if (!Number.isSafeInteger(videoId) || videoId <= 0) throw ApiError.badRequest('Valid video id is required');

    const video = await getVideo(ctx.organizationId, videoId);
    if (!video || video.status !== 'ready') throw ApiError.notFound('Video', videoId);

    const signed = await gcsAdapter.getSignedReadUrl({
      bucket: video.bucket,
      objectKey: video.objectKey,
      ttlSeconds: TTL,
    });
    return NextResponse.redirect(signed, { status: 302, headers: { 'cache-control': REDIRECT_CACHE } });
  } catch (error) {
    return errorResponse(error, 'GET /api/photos/videos/[id]/content');
  }
}, {});
