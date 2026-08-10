import { NextRequest, NextResponse } from 'next/server';
import { after } from 'next/server';
import { requireRoutePerm } from '@/lib/auth/dynamic-route-guard';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import pool from '@/lib/db';
import {
  CLAIMABLE_PHOTO_STAGE,
  PhotoStageClaimError,
  claimReceivingPhotoStage,
} from '@/lib/photos/claim-receiving-photo-stage';
import { parsePhotoAspect } from '@/lib/photos/photo-aspects';
import { countReceivingPhotos } from '@/lib/photos/queries/receiving-list';
import { publishReceivingPhotoChanged } from '@/lib/realtime/publish';
import type { OrgId } from '@/lib/tenancy/constants';

export const dynamic = 'force-dynamic';

/**
 * PATCH /api/photos/[id]/claim-stage — claim an existing carton photo as door
 * evidence for Arrival Link.
 *
 * One audited write: `photo_type` → receiving package type for
 * `arrival_package`, and `photo_aspect` → a legal door aspect. Same RECEIVING
 * entity — not an entity reassign, not within-stage aspect rename alone.
 *
 * ## Permission
 *
 * `receiving.upload_photo`, matching the `aspect` / `reassign` siblings.
 *
 * ## Body
 *
 * `{ stage: 'arrival_package', aspect: 'shipping_label' | 'box_exterior' }`
 * — both required. Aspect clear is not in scope (use `/aspect` for that).
 */
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

  const body = (await request.json().catch(() => null)) as {
    stage?: unknown;
    aspect?: unknown;
  } | null;
  if (!body) {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const stage = String(body.stage ?? '').trim();
  if (stage !== CLAIMABLE_PHOTO_STAGE) {
    return NextResponse.json(
      { error: `stage must be '${CLAIMABLE_PHOTO_STAGE}'` },
      { status: 400 },
    );
  }

  if (!('aspect' in body) || body.aspect == null) {
    return NextResponse.json(
      { error: 'aspect is required — name the door evidence this shot shows' },
      { status: 400 },
    );
  }
  if (typeof body.aspect !== 'string') {
    return NextResponse.json({ error: 'aspect must be a string' }, { status: 400 });
  }
  const aspect = parsePhotoAspect(body.aspect);
  if (!aspect) {
    return NextResponse.json({ error: `Unknown photo aspect "${body.aspect}"` }, { status: 400 });
  }

  const orgId = gate.ctx.organizationId;

  try {
    const result = await claimReceivingPhotoStage({
      organizationId: orgId,
      photoId,
      stage: CLAIMABLE_PHOTO_STAGE,
      aspect,
    });

    if (!result.idempotent) {
      await recordAudit(pool, gate.ctx, request, {
        source: 'photos-claim-stage-api',
        action: AUDIT_ACTION.PHOTO_STAGE_CLAIM,
        entityType: AUDIT_ENTITY.PHOTO,
        entityId: photoId,
        before: {
          photoType: result.fromPhotoType,
          photoAspect: result.fromAspect,
          stage: result.fromStage,
          receivingId: result.receivingId,
          receivingLineId: result.receivingLineId,
        },
        after: {
          photoType: result.toPhotoType,
          photoAspect: result.toAspect,
          stage: result.toStage,
          receivingId: result.receivingId,
          receivingLineId: result.receivingLineId,
        },
      });

      after(async () => {
        const org = orgId as OrgId;
        await publishReceivingPhotoChanged({
          organizationId: org,
          action: 'update',
          receivingId: result.receivingId,
          receivingLineId: result.receivingLineId,
          photoId,
          totalPhotoCount: await countReceivingPhotos(org, result.receivingId),
          source: 'photos.claim-stage',
        });
      });
    }

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    if (error instanceof PhotoStageClaimError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('PATCH /api/photos/[id]/claim-stage failed:', error);
    return NextResponse.json({ error: 'Failed to claim photo for step' }, { status: 500 });
  }
}
