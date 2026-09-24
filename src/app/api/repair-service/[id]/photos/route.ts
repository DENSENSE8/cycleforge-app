import { NextRequest, NextResponse } from 'next/server';
import { requireRoutePerm } from '@/lib/auth/dynamic-route-guard';
import { photoContentUrl } from '@/lib/photos/display-url';
import { listPhotosForEntity } from '@/lib/photos/service';

/**
 * GET /api/repair-service/[id]/photos — read-only list of photos linked to a
 * repair ticket (entity REPAIR_SERVICE), oldest first.
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
    const rows = await listPhotosForEntity({
      organizationId: orgId,
      entityType: 'REPAIR_SERVICE',
      entityId: repairId,
    });

    return NextResponse.json({
      photos: rows.map((row) => ({
        id: row.id,
        url: photoContentUrl(row.id),
        thumbUrl: photoContentUrl(row.id, 'thumb'),
        photoType: row.photoType,
        createdAt: row.createdAt,
      })),
    });
  } catch (err: unknown) {
    console.error('[repair-service/[id]/photos GET] error:', err);
    return NextResponse.json({ error: 'Failed to fetch repair photos' }, { status: 500 });
  }
}
