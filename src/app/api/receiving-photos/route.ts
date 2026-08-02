import { NextRequest, NextResponse } from 'next/server';
import { ApiError, errorResponse } from '@/lib/api';
import { withAuth } from '@/lib/auth/withAuth';
import { tenantQuery } from '@/lib/tenancy/db';
import { getOrganization } from '@/lib/tenancy/organizations';
import { getActiveNasBaseUrl, getAllNasBaseUrls } from '@/lib/tenancy/settings';
import type { OrgId } from '@/lib/tenancy/constants';
import { resolveOperatorNasFolder } from '@/lib/nas-photos-server';
import {
  getReceivingPhotoDeleteMeta,
  listReceivingPhotos,
  countReceivingPhotos,
} from '@/lib/photos/queries/receiving-list';
import { resolvePoRef } from '@/lib/photos/resolve-po-ref';
import { resolvePhotoAccessUrl } from '@/lib/photos/resolve-access-url';
import { attachPhotoWithLegacyUrl, deletePhoto } from '@/lib/photos/service';
import { linkReceivingPhotoToClaim } from '@/lib/photos/claim-link';
import { publishReceivingPhotoChanged } from '@/lib/realtime/publish';
import {
  RECEIVING_PHOTO_ITEM,
  RECEIVING_PHOTO_PACKAGE,
  receivingStageFromPhotoType,
  validateReceivingPhotoWrite,
} from '@/lib/receiving/photo-intent';
import {
  isAspectLegalForStage,
  parsePhotoAspect,
  parsePhotoAspectList,
  type PhotoAspect,
} from '@/lib/photos/photo-aspects';

export const dynamic = 'force-dynamic';

/**
 * Receiving photo endpoint.
 *
 * Photos are stored polymorphically on the `photos` table — same pattern used
 * for PACKER_LOG, SKU, BIN_ADJUSTMENT, etc.:
 *   PO-level photo   → entity_type='RECEIVING',      entity_id=receiving.id
 *   Item-level photo → entity_type='RECEIVING_LINE', entity_id=receiving_lines.id
 *
 * Photos live on the office NAS, not Vercel Blob. The browser writes the file
 * straight to the NAS over WebDAV (the Vercel server can't reach the LAN) and
 * then POSTs the resulting `photoUrl` here to link it — so this route only ever
 * stores a URL, never bytes.
 *
 * The POST body still talks in `receivingId` / `receivingLineId` because that's
 * how the mobile client thinks of scope; we translate to (entity_type,
 * entity_id) on insert and back to (receivingId, receivingLineId) on read.
 *
 * GET parameters:
 *   ?receivingId=N&receivingLineId=M → only that item's photos
 *   ?receivingId=N&scope=po          → only PO-level photos
 *   ?receivingId=N                   → every photo for the PO (PO-level
 *                                       UNION item-level on every line under N)
 */

interface PhotoRow {
  id: number;
  receivingId: number | null;
  receivingLineId: number | null;
  photoUrl: string;
  /**
   * Legacy alias of {@link PhotoRow.photoType} — kept because five readers parse
   * it AS the stage, including the server-side receive gate. See the field docs
   * on `ReceivingPhotoListRow`. New readers take `photoType`.
   */
  caption: string | null;
  /** `photos.photo_type` under its real name — the stage half of stage × aspect. */
  photoType: string | null;
  uploadedBy: number | null;
  createdAt: string;
  /** Shutter clock (`photos.client_captured_at`), beside the server-INSERT time. */
  clientCapturedAt: string | null;
  /**
   * What this shot SHOWS, within its stage (`@/lib/photos/photo-aspects`).
   * NULL = unclassified evidence — the value every pre-2026-08-01b row carries,
   * and never a reason to treat the photo as missing.
   */
  photoAspect: string | null;
  /** Carries a secondary `claim_evidence` link (a filed Zendesk claim). */
  hasClaimEvidence: boolean;
  /** Carries a secondary `insurance_share` link (carrier / external share pack). */
  hasInsuranceShare: boolean;
}

function mapRow(row: {
  id: number;
  entityType: string;
  entityId: number;
  receivingIdResolved: number | null;
  url: string;
  caption: string | null;
  photoType: string | null;
  uploadedBy: number | null;
  createdAt: string;
  clientCapturedAt: string | null;
  photoAspect: string | null;
  hasClaimEvidence: boolean;
  hasInsuranceShare: boolean;
}): PhotoRow {
  const isLine = row.entityType === 'RECEIVING_LINE';
  return {
    id: row.id,
    receivingId: row.receivingIdResolved,
    receivingLineId: isLine ? row.entityId : null,
    photoUrl: row.url,
    caption: row.caption || null,
    photoType: row.photoType || null,
    uploadedBy: row.uploadedBy,
    createdAt: row.createdAt,
    clientCapturedAt: row.clientCapturedAt ?? null,
    photoAspect: row.photoAspect ?? null,
    hasClaimEvidence: row.hasClaimEvidence,
    hasInsuranceShare: row.hasInsuranceShare,
  };
}

export const GET = withAuth(async (req: NextRequest, ctx) => {
  try {
    const params = new URL(req.url).searchParams;
    const receivingId = Number(params.get('receivingId'));
    if (!Number.isFinite(receivingId) || receivingId <= 0) {
      throw ApiError.badRequest('Valid receivingId is required');
    }

    const lineIdRaw = params.get('receivingLineId');
    const scope = params.get('scope');
    const photoIntentRaw = params.get('photoIntent');
    const photoIntent =
      photoIntentRaw === 'package' ||
      photoIntentRaw === 'item' ||
      photoIntentRaw === 'unbox_carton' ||
      photoIntentRaw === 'carton'
        ? photoIntentRaw
        : 'all';

    // Aspect NARROWS an intent, it never replaces one: the guided procedure asks
    // "which of this carton's unbox_carton shots is the shipping label", which is
    // a question about both axes at once.
    //
    // A well-formed but incoherent pair (an item aspect under the package intent)
    // returns `[]`, not a 400 — a read that asks a coherent question with no
    // answer is empty, not malformed. An UNKNOWN aspect token is a different
    // thing and is dropped by the SoT parser rather than widening the result.
    const aspectParam = params.get('photoAspects') ?? params.get('photoAspect');
    const photoAspects = parsePhotoAspectList(aspectParam);
    // A supplied filter that resolves to nothing must narrow to nothing. Falling
    // back to "no filter" would answer a narrower question with a wider result,
    // which is the one failure mode a filter must not have.
    const aspectFilterMatchesNothing =
      aspectParam != null && aspectParam.trim() !== '' && photoAspects.length === 0;

    const lineId =
      lineIdRaw != null
        ? (() => {
            const n = Number(lineIdRaw);
            if (!Number.isFinite(n) || n <= 0) {
              throw ApiError.badRequest('Valid receivingLineId is required');
            }
            return n;
          })()
        : null;

    const rows = aspectFilterMatchesNothing
      ? []
      : await listReceivingPhotos({
          organizationId: ctx.organizationId,
          receivingId,
          lineId,
          scope: scope === 'po' ? 'po' : 'all',
          photoIntent,
          photoAspects,
        });

    // Surface when this carton was physically scanned/received so the NAS picker
    // can anchor the "PO scan time" sort on the moment the photos were actually
    // taken. We deliberately prefer received_at / the first tracking-scan over
    // created_at: a receiving row can be pre-created (e.g. from a Zoho PO import)
    // long before the package is scanned, so created_at would anchor on a stale
    // time and surface the oldest photos in the folder. ISO/UTC so the client
    // can Date.parse it unambiguously against the NAS file mtimes.
    const cartonRes = await tenantQuery<{ created_at: string | null }>(
      ctx.organizationId as OrgId,
      `SELECT to_char(
                COALESCE(
                  rt.door_received_at,
                  (SELECT MIN(rs.scanned_at) FROM receiving_scans rs WHERE rs.receiving_id = r.id),
                  r.created_at
                ) AT TIME ZONE 'UTC',
                'YYYY-MM-DD"T"HH24:MI:SS"Z"'
              ) AS created_at
         FROM receiving_carton r
         LEFT JOIN receiving_triage rt ON rt.receiving_id = r.id AND rt.organization_id = r.organization_id
        WHERE r.id = $1 AND r.organization_id = $2 LIMIT 1`,
      [receivingId, ctx.organizationId],
    );

    // Resolve the folder the picker should auto-open for THIS operator (their
    // primary station → the org's admin-configured `stationNasPhotoFolders`),
    // plus the active NAS base URL. Shared with GET /api/nas-config. '' folder =
    // open at the NAS root. Best-effort — never let a settings/station hiccup
    // break the photo strip.
    let initialNasFolder = '';
    let nasBaseUrl = '';
    try {
      const orgId = ctx.organizationId as OrgId;
      const [org, folder] = await Promise.all([
        getOrganization(orgId),
        resolveOperatorNasFolder(orgId, ctx.staffId),
      ]);
      initialNasFolder = folder;
      nasBaseUrl = org ? getActiveNasBaseUrl(org.settings) : '';
    } catch {
      initialNasFolder = '';
      nasBaseUrl = '';
    }

    const photos = await Promise.all(
      rows.map(async (row) => ({
        ...mapRow(row),
        photoUrl: await resolvePhotoAccessUrl(row.id, ctx.organizationId, 'full'),
      })),
    );

    return NextResponse.json({
      photos,
      receivingCreatedAt: cartonRes.rows[0]?.created_at ?? null,
      initialNasFolder,
      nasBaseUrl,
    });
  } catch (error) {
    return errorResponse(error, 'GET /api/receiving-photos');
  }
}, { permission: 'receiving.view' });

export const POST = withAuth(async (req: NextRequest, ctx) => {
  try {
    const body = await req.json().catch(() => null);
    if (!body) throw ApiError.badRequest('Invalid JSON body');

    const receivingId = Number(body?.receivingId);
    const receivingLineIdRaw = body?.receivingLineId;
    const receivingLineId =
      receivingLineIdRaw != null && receivingLineIdRaw !== ''
        ? Number(receivingLineIdRaw)
        : null;
    const photoUrl: string = String(body?.photoUrl || '').trim();
    const caption = String(body?.caption || '').trim() || null;
    // Server-trusted actor — body.uploadedBy is ignored.
    const uploadedBy = ctx.staffId;

    if (!Number.isFinite(receivingId) || receivingId <= 0) {
      throw ApiError.badRequest('Valid receivingId is required');
    }
    if (receivingLineId != null && (!Number.isFinite(receivingLineId) || receivingLineId <= 0)) {
      throw ApiError.badRequest('Valid receivingLineId is required when provided');
    }
    if (!photoUrl) {
      throw ApiError.badRequest('photoUrl is required');
    }

    // Origin allowlist: once a NAS base is known for this org, a receiving photo
    // URL must point at it (test or prod) — or the same-origin dev proxy. This is
    // the security boundary now that the route trusts a client-supplied URL
    // instead of uploading bytes itself: it stops arbitrary external URLs from
    // being pinned onto a PO. When NOTHING is configured (no settings slot, no
    // env), we stay permissive so un-migrated orgs keep working.
    const org = await getOrganization(ctx.organizationId as OrgId);
    const allowedBases = org ? getAllNasBaseUrls(org.settings) : [];
    const envBase = (process.env.NEXT_PUBLIC_NAS_PHOTOS_BASE_URL || '').replace(/\/+$/, '');
    if (envBase && !envBase.startsWith('/')) allowedBases.push(envBase);
    const isSameOrigin = photoUrl.startsWith('/'); // e.g. /api/nas-dev (dev proxy)
    const isAllowed =
      allowedBases.length === 0 ||
      isSameOrigin ||
      allowedBases.some((base) => photoUrl === base || photoUrl.startsWith(`${base}/`));
    if (!isAllowed) {
      throw ApiError.badRequest('photoUrl must point at the configured NAS address');
    }

    // Phase C: NAS URL attach is legacy — prefer POST /api/photos/upload (adapter path).
    console.warn(
      '[POST /api/receiving-photos] photoUrl attach is deprecated; use POST /api/photos/upload',
      { receivingId, receivingLineId },
    );

    const entityType = receivingLineId != null ? 'RECEIVING_LINE' : 'RECEIVING';
    const entityId = receivingLineId ?? receivingId;
    const poRef = await resolvePoRef(entityType, entityId);

    // Stage stamp: explicit `photoType` (validated against the stage SoT) or
    // the scope default. `caption` is display text and never becomes
    // photo_type — the old caption fallback let free text stain the stage
    // vocabulary (docs/todo/photo-evidence-stage-sot-plan.md).
    const requestedType = String(body?.photoType || '').trim().toLowerCase() || null;
    if (requestedType) {
      const violation = validateReceivingPhotoWrite({ entityType, photoType: requestedType });
      if (violation) throw ApiError.badRequest(violation);
    }
    const photoType =
      requestedType ??
      (receivingLineId != null ? RECEIVING_PHOTO_ITEM : RECEIVING_PHOTO_PACKAGE);

    // Aspect — the second axis (`@/lib/photos/photo-aspects`). Three of the
    // guided procedure's steps are all `unbox_carton` evidence and are told
    // apart by this alone.
    //
    // Validated against the stage the (entity × photo_type) pair RESOLVES to,
    // never the stage the caller claimed: otherwise a caller that mis-claims
    // the stage also gets to mis-claim the aspect, and the pairing that the
    // `require_one` receive gate depends on stops meaning anything.
    //
    // Absent → null → legal (unclassified evidence). Present-but-unknown →
    // 400, never silently dropped: an aspect is a claim about what the photo
    // shows, and a dropped claim reads to the operator as a recorded one.
    const rawAspect = body?.photoAspect;
    const hasAspect = rawAspect != null && String(rawAspect).trim() !== '';
    let photoAspect: PhotoAspect | null = null;
    if (hasAspect) {
      photoAspect = parsePhotoAspect(String(rawAspect));
      if (!photoAspect) {
        throw ApiError.badRequest(
          `photoAspect '${String(rawAspect)}' is not a known photo aspect`,
        );
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

    let attached;
    try {
      attached = await attachPhotoWithLegacyUrl({
        organizationId: ctx.organizationId,
        staffId: uploadedBy,
        entityType,
        entityId,
        legacyUrl: photoUrl,
        photoType,
        photoAspect,
        poRef,
      });
    } catch (err) {
      if (err instanceof Error && err.message === 'Photo already exists') {
        throw ApiError.conflict('Photo already exists');
      }
      throw err;
    }

    // If this carton/line is under a claim, also link the photo to that claim
    // (best-effort) so a photo taken AFTER the claim was filed still lands under
    // the claim umbrella — not the PO only.
    const claimTicketId = await linkReceivingPhotoToClaim({
      organizationId: ctx.organizationId,
      photoId: attached.id,
      entityType,
      entityId,
    });

    const photo: PhotoRow = {
      id: attached.id,
      receivingId,
      receivingLineId,
      photoUrl: attached.url,
      caption,
      photoType,
      uploadedBy,
      createdAt: new Date().toISOString(),
      // Upload response has no client shutter clock until the client posts one —
      // null here matches the GET mapper's "unknown" sentinel.
      clientCapturedAt: null,
      photoAspect,
      // The dual-link above is the only claim link this path can create, so its
      // result IS the answer — never a hardcoded false the client has to refetch
      // to correct.
      hasClaimEvidence: claimTicketId != null,
      // Nothing on the upload path writes a share-pack link.
      hasInsuranceShare: false,
    };
    await publishReceivingPhotoChanged({
      organizationId: ctx.organizationId as OrgId,
      action: 'insert',
      receivingId,
      receivingLineId,
      photoId: photo.id,
      totalPhotoCount: await countReceivingPhotos(ctx.organizationId, receivingId),
      source: 'receiving-photos.post',
    });

    return NextResponse.json(
      {
        success: true,
        photo: {
          ...photo,
          photoUrl: await resolvePhotoAccessUrl(photo.id, ctx.organizationId, 'full'),
        },
      },
      {
        headers: {
          // ASCII only: an HTTP header value is a ByteString (≤ U+00FF). The em
          // dash that used to sit here threw
          // "Cannot convert argument to a ByteString … value of 8212" while
          // BUILDING this response — so every successful attach 500'd *after*
          // the photo, audit and count had already been written, and the client
          // saw a failure for a photo that was really there.
          Deprecation: 'photoUrl attach - prefer POST /api/photos/upload with multipart bytes',
        },
      },
    );
  } catch (error) {
    return errorResponse(error, 'POST /api/receiving-photos');
  }
}, { permission: 'receiving.upload_photo' });

export const DELETE = withAuth(async (req: NextRequest, ctx) => {
  try {
    const id = Number(new URL(req.url).searchParams.get('id'));
    if (!Number.isFinite(id) || id <= 0) {
      throw ApiError.badRequest('Valid id is required');
    }

    const existingPhoto = await getReceivingPhotoDeleteMeta(id, ctx.organizationId);
    if (!existingPhoto) throw ApiError.notFound('photo', id);

    await deletePhoto(id, ctx.organizationId);

    if (existingPhoto.receivingId) {
      await publishReceivingPhotoChanged({
        organizationId: ctx.organizationId as OrgId,
        action: 'delete',
        receivingId: existingPhoto.receivingId,
        receivingLineId: existingPhoto.receivingLineId,
        photoId: id,
        totalPhotoCount: await countReceivingPhotos(ctx.organizationId, existingPhoto.receivingId),
        source: 'receiving-photos.delete',
      });
    }

    return NextResponse.json({ success: true, id });
  } catch (error) {
    return errorResponse(error, 'DELETE /api/receiving-photos');
  }
}, { permission: 'receiving.upload_photo' });
