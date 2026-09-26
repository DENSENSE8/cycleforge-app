/** Claim an EXISTING carton photo as door evidence for a procedure step. */

import { withTenantTransaction } from '@/lib/tenancy/db';
import {
  ReceivingPhotoWriteError,
  receivingPhotoTypeForStage,
  receivingStageFromPhotoType,
  remapReceivingPhotoTypeOnStageClaim,
  type ReceivingPhotoStage,
} from '@/lib/receiving/photo-intent';
import {
  isAspectLegalForStage,
  type PhotoAspect,
} from './photo-aspects';

export class PhotoStageClaimError extends Error {
  readonly status: 400 | 404;

  constructor(message: string, status: 400 | 404) {
    super(message);
    this.name = 'PhotoStageClaimError';
    this.status = status;
  }
}

/** Door claim target for this product cut — body still names the stage. */
export const CLAIMABLE_PHOTO_STAGE = 'arrival_package' as const;
type ClaimablePhotoStage = typeof CLAIMABLE_PHOTO_STAGE;

export interface PhotoStageClaimScope {
  entityType: 'RECEIVING' | 'RECEIVING_LINE';
  receivingId: number;
  receivingLineId: number | null;
  photoType: string | null;
  /** Stored `photo_aspect` VERBATIM — see set-photo-aspect for why. */
  rawAspect: string | null;
}

interface ClaimReceivingPhotoStageResult {
  photoId: number;
  receivingId: number;
  receivingLineId: number | null;
  fromStage: ReceivingPhotoStage | null;
  toStage: ClaimablePhotoStage;
  fromPhotoType: string | null;
  toPhotoType: string;
  fromAspect: string | null;
  toAspect: PhotoAspect;
  idempotent: boolean;
}

export interface ClaimReceivingPhotoStageDeps {
  loadScope: (organizationId: string, photoId: number) => Promise<PhotoStageClaimScope | null>;
  updateStageClaim: (input: {
    organizationId: string;
    photoId: number;
    photoType: string;
    aspect: PhotoAspect;
  }) => Promise<void>;
}

async function loadScopeImpl(
  organizationId: string,
  photoId: number,
): Promise<PhotoStageClaimScope | null> {
  return withTenantTransaction(organizationId, async (client) => {
    const res = await client.query<{
      entity_type: string;
      entity_id: string;
      photo_type: string | null;
      photo_aspect: string | null;
      receiving_id_resolved: string | null;
    }>(
      `SELECT
         l.entity_type,
         l.entity_id,
         p.photo_type,
         p.photo_aspect,
         CASE
           WHEN l.entity_type = 'RECEIVING' THEN l.entity_id
           WHEN l.entity_type = 'RECEIVING_LINE' THEN rl.receiving_id
           ELSE NULL
         END AS receiving_id_resolved
         FROM photos p
         JOIN photo_entity_links l
           ON l.photo_id = p.id
          AND l.organization_id = p.organization_id
          AND l.link_role = 'primary'
         LEFT JOIN receiving_line rl
           ON l.entity_type = 'RECEIVING_LINE' AND rl.id = l.entity_id
        WHERE p.id = $1
          AND p.organization_id = $2
          AND l.entity_type IN ('RECEIVING', 'RECEIVING_LINE')`,
      [photoId, organizationId],
    );
    const row = res.rows[0];
    if (!row) return null;
    const entityType = row.entity_type as 'RECEIVING' | 'RECEIVING_LINE';
    const receivingId =
      row.receiving_id_resolved != null ? Number(row.receiving_id_resolved) : null;
    if (receivingId == null || !Number.isFinite(receivingId)) return null;
    return {
      entityType,
      receivingId,
      receivingLineId: entityType === 'RECEIVING_LINE' ? Number(row.entity_id) : null,
      photoType: row.photo_type,
      rawAspect: row.photo_aspect,
    };
  });
}

async function updateStageClaimImpl(input: {
  organizationId: string;
  photoId: number;
  photoType: string;
  aspect: PhotoAspect;
}): Promise<void> {
  await withTenantTransaction(input.organizationId, async (client) => {
    const updated = await client.query(
      `UPDATE photos
          SET photo_type = $3,
              photo_aspect = $4,
              updated_at = NOW()
        WHERE id = $1 AND organization_id = $2`,
      [input.photoId, input.organizationId, input.photoType, input.aspect],
    );
    if (updated.rowCount === 0) {
      throw new PhotoStageClaimError('Photo not found', 404);
    }
  });
}

const defaultDeps: ClaimReceivingPhotoStageDeps = {
  loadScope: loadScopeImpl,
  updateStageClaim: updateStageClaimImpl,
};

export async function claimReceivingPhotoStage(
  input: {
    organizationId: string;
    photoId: number;
    stage: ClaimablePhotoStage;
    aspect: PhotoAspect;
  },
  deps: ClaimReceivingPhotoStageDeps = defaultDeps,
): Promise<ClaimReceivingPhotoStageResult> {
  if (input.stage !== CLAIMABLE_PHOTO_STAGE) {
    throw new PhotoStageClaimError(
      `Stage claim target '${input.stage}' is not supported`,
      400,
    );
  }

  if (!isAspectLegalForStage(input.aspect, input.stage)) {
    throw new PhotoStageClaimError(
      `"${input.aspect}" is not a legal aspect for a ${input.stage} photo`,
      400,
    );
  }

  const current = await deps.loadScope(input.organizationId, input.photoId);
  if (!current) {
    throw new PhotoStageClaimError('Photo not found or not a receiving photo', 404);
  }

  if (current.entityType !== 'RECEIVING') {
    throw new PhotoStageClaimError(
      'Stage claim is same-carton only — line photos must be reassigned first',
      400,
    );
  }

  const fromStage = receivingStageFromPhotoType(current.entityType, current.photoType);

  let remappedType: string | null;
  try {
    remappedType = remapReceivingPhotoTypeOnStageClaim({
      fromStage,
      toStage: input.stage,
    });
  } catch (err) {
    if (err instanceof ReceivingPhotoWriteError) {
      throw new PhotoStageClaimError(err.message, 400);
    }
    throw err;
  }

  const toPhotoType = remappedType ?? receivingPhotoTypeForStage(input.stage);
  // Legacy package rows already resolve to arrival_package but may still carry
  // `receiving` — normalize to the canonical package stamp on write.
  const nextPhotoType =
    fromStage === 'arrival_package' && remappedType === null
      ? receivingPhotoTypeForStage(input.stage)
      : toPhotoType;

  const typeUnchanged =
    String(current.photoType ?? '').trim().toLowerCase() === nextPhotoType;
  const aspectUnchanged = current.rawAspect === input.aspect;

  if (typeUnchanged && aspectUnchanged) {
    return {
      photoId: input.photoId,
      receivingId: current.receivingId,
      receivingLineId: current.receivingLineId,
      fromStage,
      toStage: input.stage,
      fromPhotoType: current.photoType,
      toPhotoType: nextPhotoType,
      fromAspect: current.rawAspect,
      toAspect: input.aspect,
      idempotent: true,
    };
  }

  await deps.updateStageClaim({
    organizationId: input.organizationId,
    photoId: input.photoId,
    photoType: nextPhotoType,
    aspect: input.aspect,
  });

  return {
    photoId: input.photoId,
    receivingId: current.receivingId,
    receivingLineId: current.receivingLineId,
    fromStage,
    toStage: input.stage,
    fromPhotoType: current.photoType,
    toPhotoType: nextPhotoType,
    fromAspect: current.rawAspect,
    toAspect: input.aspect,
    idempotent: false,
  };
}
