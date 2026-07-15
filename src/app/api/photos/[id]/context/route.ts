import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserBySid } from '@/lib/auth/current-user';
import { readSessionSid } from '@/lib/auth/session';
import { getPhotoReceivingContext } from '@/lib/photos/queries/photo-receiving-context';

export const dynamic = 'force-dynamic';

/**
 * Viewer-only provenance detail for one photo — serial(s), tracking, claim.
 * Read-only sibling of the photo content route: same lightweight actor auth
 * (the viewer is already showing this photo), strictly org-scoped in the query.
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

  const sid = readSessionSid(request.cookies);
  const actor = await getCurrentUserBySid(sid);
  if (!actor) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const ctx = await getPhotoReceivingContext(photoId, actor.organizationId);
  return NextResponse.json(
    ctx ?? { cartonId: null, claim: null, tracking: null, serials: [] },
  );
}
