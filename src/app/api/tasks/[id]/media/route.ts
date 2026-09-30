/** GET /api/tasks/[id]/media — the photos, ready videos and media links (photos / videos attached by URL) on one task, each oldest first. */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { withAuth } from '@/lib/auth/withAuth';
import { errorResponse } from '@/lib/api';
import { photoContentUrl, videoContentUrl } from '@/lib/photos/display-url';
import { listPhotosForEntity } from '@/lib/photos/service';
import { listReadyVideosForEntity } from '@/lib/photos/videos';
import { assertTaskInOrg } from '@/lib/tasks/task-links-db';
import { readTaskMediaLinks } from '@/lib/tasks/task-media-links-db';
import { TASK_MEDIA_ENTITY_TYPE, type TaskMediaPayload } from '@/lib/tasks/task-links-shared';

export const dynamic = 'force-dynamic';

/** `/api/tasks/:id/media` — withAuth does not forward route params. */
function taskIdFromPath(req: NextRequest): number | null {
  const parts = req.nextUrl.pathname.split('/').filter(Boolean);
  const i = parts.indexOf('tasks');
  const n = Number(i >= 0 ? parts[i + 1] : undefined);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export const GET = withAuth(
  async (req: NextRequest, ctx) => {
    try {
      const taskId = taskIdFromPath(req);
      if (taskId === null) {
        return NextResponse.json({ error: 'Invalid task id' }, { status: 400 });
      }
      await assertTaskInOrg(ctx.organizationId, taskId);

      const entity = {
        organizationId: ctx.organizationId,
        entityType: TASK_MEDIA_ENTITY_TYPE,
        entityId: taskId,
      } as const;
      const [photos, videos, links] = await Promise.all([
        listPhotosForEntity({ ...entity, linkRole: 'primary' }),
        listReadyVideosForEntity(entity),
        readTaskMediaLinks(ctx.organizationId, taskId),
      ]);

      const payload: TaskMediaPayload = {
        ok: true,
        photos: photos.map((row) => ({
          id: row.id,
          url: photoContentUrl(row.id),
          thumbUrl: photoContentUrl(row.id, 'thumb'),
          createdAt: row.createdAt,
        })),
        videos: videos.map((video) => ({
          id: video.id,
          url: videoContentUrl(video.id),
          contentType: video.contentType,
          sizeBytes: video.fileSizeBytes ?? video.declaredSizeBytes,
          createdAt: video.uploadedAt ?? video.createdAt,
          createdBy: video.uploadedBy,
        })),
        links,
      };
      return NextResponse.json(payload);
    } catch (error) {
      return errorResponse(error, 'GET /api/tasks/[id]/media');
    }
  },
  { permission: 'work_orders.claim' },
);
