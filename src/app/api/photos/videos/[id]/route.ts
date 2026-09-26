import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { requireRoutePerm } from '@/lib/auth/dynamic-route-guard';
import { getCurrentUserBySid } from '@/lib/auth/current-user';
import { readSessionSid } from '@/lib/auth/session';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import { uploadPermissionFor } from '@/lib/photos/entity-permissions';
import { deleteVideo, getVideo } from '@/lib/photos/videos';

/** DELETE /api/photos/videos/[id] — remove one entity video (row + GCS object, the object best-effort). */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: idParam } = await params;
  const id = Number(idParam);
  if (!Number.isSafeInteger(id) || id <= 0) {
    return NextResponse.json({ error: 'Valid video id is required' }, { status: 400 });
  }

  // The permission depends on the row, so the org comes from the session
  // first; `requireRoutePerm` then gates (and audits a denial) on that perm.
  const actor = await getCurrentUserBySid(readSessionSid(request.cookies));
  if (!actor) {
    return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  }
  const orgId = actor.organizationId;

  try {
    const video = await getVideo(orgId, id);
    if (!video) {
      return NextResponse.json({ error: 'Video not found' }, { status: 404 });
    }
    const perm = uploadPermissionFor(video.entityType);
    if (!perm) {
      return NextResponse.json(
        { error: `Unsupported entity_type: ${video.entityType}` },
        { status: 400 },
      );
    }

    const gate = await requireRoutePerm(request, perm);
    if (gate.denied) return gate.denied;

    const deleted = await deleteVideo(orgId, id);
    if (!deleted) {
      // Removed between the read and the delete — a double-tapped remove.
      return NextResponse.json({ error: 'Video not found' }, { status: 404 });
    }

    await recordAudit(pool, gate.ctx, request, {
      source: 'api',
      action: AUDIT_ACTION.ENTITY_VIDEO_DELETE,
      entityType: AUDIT_ENTITY.ENTITY_VIDEO,
      entityId: id,
      before: {
        entityType: deleted.entityType,
        entityId: deleted.entityId,
        status: deleted.status,
        objectKey: deleted.objectKey,
      },
    });

    return NextResponse.json({ success: true, id });
  } catch (err: unknown) {
    console.error('[photos/videos/[id] DELETE] error:', err);
    return NextResponse.json({ error: 'Failed to delete video' }, { status: 500 });
  }
}
