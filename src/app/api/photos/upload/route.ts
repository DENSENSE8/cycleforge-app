import { NextRequest, NextResponse, after } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { ApiError, errorResponse } from '@/lib/api';
import { uploadPhoto } from '@/lib/photos/service';
import {
  CLIENT_CAPTURED_AT_FIELD,
  parseClientCapturedAt,
} from '@/lib/photos/capture-provenance';
import { linkReceivingPhotoToClaim } from '@/lib/photos/claim-link';
import { autoArchiveClaimPhotosAfterCapture } from '@/lib/receiving-claim-archive';
import { parseMediaEntityTarget, uploadPermissionFor } from '@/lib/photos/entity-permissions';
import type { PhotoLinkRole } from '@/lib/photos/types';
import { PHOTO_LINK_ROLES } from '@/lib/photos/types';
import type { PhotoAspect } from '@/lib/photos/photo-aspects';
import { isAspectLegalForStage, parsePhotoAspect } from '@/lib/photos/photo-aspects';
import { receivingStageFromPhotoType } from '@/lib/receiving/photo-intent';
import { resolvePhotoAccessUrl } from '@/lib/photos/resolve-access-url';
import { publishEntityMediaInsert } from '@/lib/photos/publish-entity-media';
import { assertTaskInOrg } from '@/lib/tasks/task-links-db';

export const dynamic = 'force-dynamic';

/**
 * Read the device-reported capture instant off the multipart body.
 *
 * Absent is the normal case (desktop uploads, and any legacy client that
 * predates the field) and must be indistinguishable from a clean upload —
 * hence `null`, never a 400. Present-but-unparseable also degrades to `null`
 * rather than rejecting: provenance is a secondary fact on an evidence upload,
 * so a client bug must cost the timestamp, not the photo. It is logged so the
 * bug is still visible instead of silently eroding the column.
 */
function parseCapturedAt(raw: FormDataEntryValue | null): Date | null {
  const captured = parseClientCapturedAt(raw);
  if (!captured && raw !== null && String(raw).trim()) {
    console.warn(
      `[photos.upload] ignoring unparseable ${CLIENT_CAPTURED_AT_FIELD}; storing NULL`,
      { raw: String(raw).slice(0, 64) },
    );
  }
  return captured;
}

function parseLinkRole(raw: FormDataEntryValue | null): PhotoLinkRole | undefined {
  const value = String(raw || '').trim();
  if (!value) return undefined;
  if (!PHOTO_LINK_ROLES.includes(value as PhotoLinkRole)) {
    throw ApiError.badRequest(`Invalid linkRole: ${value}`);
  }
  return value as PhotoLinkRole;
}

export const POST = withAuth(async (req: NextRequest, ctx) => {
  try {
    const form = await req.formData();
    const { entityType, entityId } = parseMediaEntityTarget(form.get('entityType'), form.get('entityId'));

    const requiredPerm = uploadPermissionFor(entityType);
    if (!ctx.permissions.has(requiredPerm)) {
      return NextResponse.json(
        { error: 'FORBIDDEN', permission: requiredPerm },
        { status: 403 },
      );
    }
    // Task media must hang off a FOLLOW_UP task in THIS org — the permission
    // above is an everyday floor gate, so it cannot stand in for existence.
    if (entityType === 'WORK_ASSIGNMENT') await assertTaskInOrg(ctx.organizationId, entityId);

    const file = form.get('file');
    if (!(file instanceof Blob) || file.size === 0) {
      throw ApiError.badRequest('file is required');
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const contentType = file.type || 'image/jpeg';
    const photoType = String(form.get('photoType') || '').trim() || null;
    const poRef = String(form.get('poRef') || '').trim() || null;
    const linkRole = parseLinkRole(form.get('linkRole'));
    const clientCapturedAt = parseCapturedAt(form.get(CLIENT_CAPTURED_AT_FIELD));

    // What this shot SHOWS, within its stage — the second axis beside
    // `photoType`. Validated against the stage the (entity × photo_type) pair
    // RESOLVES to, never a stage the caller claimed: a caller that mis-claims
    // the stage must not also get to mis-claim the aspect, or the pairing the
    // `require_one` receive gate depends on stops meaning anything.
    //
    // Absent → null → legal (unclassified evidence, what every pre-aspect row
    // carries). Present-but-unknown → 400, never silently dropped: an aspect is
    // a claim about the frame, and a dropped claim reads to the operator as a
    // recorded one.
    const rawAspect = String(form.get('photoAspect') || '').trim();
    let photoAspect: PhotoAspect | null = null;
    if (rawAspect) {
      photoAspect = parsePhotoAspect(rawAspect);
      if (!photoAspect) {
        throw ApiError.badRequest(`photoAspect '${rawAspect}' is not a known photo aspect`);
      }
      const stage = receivingStageFromPhotoType(entityType, photoType);
      if (!stage) {
        throw ApiError.badRequest(
          `photoAspect cannot be recorded: (${entityType}, ${photoType}) resolves to no evidence stage`,
        );
      }
      if (!isAspectLegalForStage(photoAspect, stage)) {
        throw ApiError.badRequest(
          `photoAspect '${photoAspect}' is not allowed at the ${stage} stage`,
        );
      }
    }

    const result = await uploadPhoto({
      organizationId: ctx.organizationId,
      staffId: ctx.staffId,
      entityType,
      entityId,
      photoType,
      linkRole,
      poRef,
      fileBuffer: buffer,
      contentType,
      clientCapturedAt,
      photoAspect,
      useStorageAdapter: true,
    });

    const displayUrl = await resolvePhotoAccessUrl(result.id, ctx.organizationId, 'full');
    const thumbUrl = await resolvePhotoAccessUrl(result.id, ctx.organizationId, 'thumb');

    let claimTicketId: number | null = null;
    if (entityType === 'RECEIVING' || entityType === 'RECEIVING_LINE') {
      // Dual-link to the carton's claim (best-effort) when one exists, so a photo
      // captured after the claim was filed still lands under the claim umbrella.
      claimTicketId = await linkReceivingPhotoToClaim({
        organizationId: ctx.organizationId,
        photoId: result.id,
        entityType,
        entityId,
      });
    }
    const { receivingId } = await publishEntityMediaInsert({
      organizationId: ctx.organizationId,
      entityType,
      entityId,
      orderId: poRef,
      photoId: result.id,
      source: 'photos.upload',
    });
    if (receivingId && claimTicketId) {
      const ticketId = claimTicketId;
      after(() =>
        autoArchiveClaimPhotosAfterCapture({
          orgId: ctx.organizationId,
          receivingId,
          ticketId,
        }).catch((err) => {
          console.warn('[photos.upload] auto NAS archive failed', err);
        }),
      );
    }

    return NextResponse.json({
      ...result,
      url: displayUrl,
      thumbUrl,
      claimTicketId,
    });
  } catch (error) {
    return errorResponse(error, 'POST /api/photos/upload');
  }
}, {});
