import { NextRequest, NextResponse } from 'next/server';
import { requireRoutePerm } from '@/lib/auth/dynamic-route-guard';
import { photoContentUrl, videoContentUrl } from '@/lib/photos/display-url';
import { listPhotosForEntity } from '@/lib/photos/service';
import { listReadyVideosForEntity } from '@/lib/photos/videos';
import type { RepairPhotosResponse } from '@/lib/repair/repair-photos';

/**
 * GET /api/repair-service/[id]/photos — read-only list of the photos and ready
 * videos linked to a repair ticket (entity REPAIR_SERVICE), each oldest first.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await requireRoutePerm(request, 'repair.view');
  if (gate.denied) return gate.denied;
  const orgId = gate.ctx.organizationId;
  const { id } = await params;
  const repairId = Number(id);
  if (!Number.isInteger(repairId) || repairId <= 0) {
    return NextResponse.json({ error: 'Valid repair id is required' }, { status: 400 });
  }

  try {
    const entityType = 'REPAIR_SERVICE' as const;
    const [rows, videos] = await Promise.all([
      listPhotosForEntity({ organizationId: orgId, entityType, entityId: repairId }),
      listReadyVideosForEntity({ organizationId: orgId, entityType, entityId: repairId }),
    ]);

    const body: RepairPhotosResponse = {
      photos: rows.map((row) => ({
        id: row.id,
        url: photoContentUrl(row.id),
        thumbUrl: photoContentUrl(row.id, 'thumb'),
        photoType: row.photoType,
        createdAt: row.createdAt,
      })),
      videos: videos.map((video) => ({
        id: video.id,
        url: videoContentUrl(video.id),
        contentType: video.contentType,
        sizeBytes: video.fileSizeBytes ?? video.declaredSizeBytes,
        createdAt: video.createdAt,
      })),
    };
    return NextResponse.json(body);
  } catch (err: unknown) {
    console.error('[repair-service/[id]/photos GET] error:', err);
    return NextResponse.json({ error: 'Failed to fetch repair photos' }, { status: 500 });
  }
}
