import { NextRequest, NextResponse } from 'next/server';
import { after } from 'next/server';
import { requireRoutePerm } from '@/lib/auth/dynamic-route-guard';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import pool from '@/lib/db';
import { PhotoAspectError, setPhotoAspect } from '@/lib/photos/set-photo-aspect';
import { parsePhotoAspect } from '@/lib/photos/photo-aspects';
import { countReceivingPhotos } from '@/lib/photos/queries/receiving-list';
import { publishReceivingPhotoChanged } from '@/lib/realtime/publish';
import type { OrgId } from '@/lib/tenancy/constants';

export const dynamic = 'force-dynamic';

/** PATCH /api/photos/[id]/aspect — say what an existing receiving photo SHOWS. */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await requireRoutePerm(request, 'receiving.upload_photo');
  if (gate.denied) return gate.denied;

  const { id: idParam } = await params;
  const photoId = Number(idParam);
  if (!Number.isFinite(photoId) || photoId <= 0) {
    return NextResponse.json({ error: 'Valid photo id is required' }, { status: 400 });
  }

  const body = (await request.json().catch(() => null)) as { aspect?: unknown } | null;
  if (!body || !('aspect' in body)) {
    return NextResponse.json(
      { error: 'aspect is required — send null to clear the claim' },
      { status: 400 },
    );
  }

  const raw = body.aspect;
  let aspect: ReturnType<typeof parsePhotoAspect> = null;
  if (raw !== null) {
    if (typeof raw !== 'string') {
      return NextResponse.json({ error: 'aspect must be a string or null' }, { status: 400 });
    }
    aspect = parsePhotoAspect(raw);
    // Unknown → 400. Falling through to `null` here would turn "shipping-label"
    // (a typo) into a silent clear of a correct claim.
    if (!aspect) {
      return NextResponse.json({ error: `Unknown photo aspect "${raw}"` }, { status: 400 });
    }
  }

  const orgId = gate.ctx.organizationId;

  try {
    const result = await setPhotoAspect({ organizationId: orgId, photoId, aspect });

    if (!result.idempotent) {
      // Paired actions, not one action with a null `after`: the column is
      // overwritable, so audit_logs is the only place the original claim
      // survives, and a rollup must not count a retraction as a classification.
      await recordAudit(pool, gate.ctx, request, {
        source: 'photos-aspect-api',
        action: result.to ? AUDIT_ACTION.PHOTO_ASPECT_SET : AUDIT_ACTION.PHOTO_ASPECT_CLEARED,
        entityType: AUDIT_ENTITY.PHOTO,
        entityId: photoId,
        before: {
          photoAspect: result.from,
          receivingId: result.receivingId,
          receivingLineId: result.receivingLineId,
          stage: result.stage,
        },
        after: {
          photoAspect: result.to,
          receivingId: result.receivingId,
          receivingLineId: result.receivingLineId,
          stage: result.stage,
        },
      });

      after(async () => {
        const org = orgId as OrgId;
        // Same channel the phone capture publishes on, so a pair made at the desk lands on the phone's gallery and vice versa — and so the deck…
        await publishReceivingPhotoChanged({
          organizationId: org,
          // No photo arrived or left; only the claim about one changed.
          action: 'update',
          receivingId: result.receivingId,
          receivingLineId: result.receivingLineId,
          photoId,
          totalPhotoCount: await countReceivingPhotos(org, result.receivingId),
          source: 'photos.aspect',
        });
      });
    }

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    if (error instanceof PhotoAspectError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('PATCH /api/photos/[id]/aspect failed:', error);
    return NextResponse.json({ error: 'Failed to set photo aspect' }, { status: 500 });
  }
}
