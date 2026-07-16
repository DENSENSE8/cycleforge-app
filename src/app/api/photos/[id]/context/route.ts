import { NextRequest, NextResponse } from 'next/server';
import { requireRoutePerm } from '@/lib/auth/dynamic-route-guard';
import { getPhotoReceivingContext } from '@/lib/photos/queries/photo-receiving-context';

export const dynamic = 'force-dynamic';

/**
 * Viewer-only provenance detail for one photo — serial(s), tracking, claim.
 * Gated by `photos.view` (the base photo-viewing grant) via the canonical route
 * guard, and strictly org-scoped in the query so a caller only ever sees their
 * own tenant's provenance. Read-only sibling of the photo content route.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const photoId = Number(id);
  if (!Number.isFinite(photoId) || photoId <= 0) {
    return NextResponse.json({ error: 'Valid photo id is required' }, { status: 400 });
  }

  const gate = await requireRoutePerm(request, 'photos.view');
  if (gate.denied) return gate.denied;

  const ctx = await getPhotoReceivingContext(photoId, gate.ctx.organizationId);
  return NextResponse.json(
    ctx ?? { cartonId: null, claim: null, tracking: null, serials: [] },
  );
}
