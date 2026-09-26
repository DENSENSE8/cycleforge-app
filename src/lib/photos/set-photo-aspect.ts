/** Classify an EXISTING receiving photo — say what the shot shows, after it was taken. */

import { withTenantTransaction } from '@/lib/tenancy/db';
import {
  isAspectLegalForStage,
  type PhotoAspect,
} from './photo-aspects';
import type { PhotoEvidenceStage } from './stages';
import { receivingStageFromPhotoType } from '@/lib/receiving/photo-intent';

export class PhotoAspectError extends Error {
  readonly status: 400 | 404;

  constructor(message: string, status: 400 | 404) {
    super(message);
    this.name = 'PhotoAspectError';
    this.status = status;
  }
}

// Not exported until a caller needs to NAME them — the route builds the input inline and spreads the result, so exporting would add two…
interface SetPhotoAspectInput {
  organizationId: string;
  photoId: number;
  /**
   * The claim. `null` CLEARS it — this field is required precisely so that
   * "clear" and "don't touch" cannot be spelled the same way.
   */
  aspect: PhotoAspect | null;
}

export interface PhotoAspectScope {
  entityType: 'RECEIVING' | 'RECEIVING_LINE';
  receivingId: number;
  receivingLineId: number | null;
  /** `photos.photo_type` — the stage half of stage × aspect. */
  photoType: string | null;
  /**
   * The stored `photo_aspect` VERBATIM, not parsed. A row carrying a value this
   * build does not recognise must still be clearable, and comparing the parsed
   * form would call that write idempotent and leave the garbage in place.
   */
  rawAspect: string | null;
}

interface SetPhotoAspectResult {
  photoId: number;
  receivingId: number;
  receivingLineId: number | null;
  stage: PhotoEvidenceStage;
  from: string | null;
  to: PhotoAspect | null;
  idempotent: boolean;
}

export interface SetPhotoAspectDeps {
  loadScope: (organizationId: string, photoId: number) => Promise<PhotoAspectScope | null>;
  updateAspect: (input: {
    organizationId: string;
    photoId: number;
    aspect: PhotoAspect | null;
  }) => Promise<void>;
}

async function loadScopeImpl(
  organizationId: string,
  photoId: number,
): Promise<PhotoAspectScope | null> {
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

async function updateAspectImpl(input: {
  organizationId: string;
  photoId: number;
  aspect: PhotoAspect | null;
}): Promise<void> {
  await withTenantTransaction(input.organizationId, async (client) => {
    // Overwrite — NOT COALESCE. A null here is a retraction, and the caller had
    // to name it to send it.
    const updated = await client.query(
      `UPDATE photos
          SET photo_aspect = $3,
              updated_at = NOW()
        WHERE id = $1 AND organization_id = $2`,
      [input.photoId, input.organizationId, input.aspect],
    );
    if (updated.rowCount === 0) {
      throw new PhotoAspectError('Photo not found', 404);
    }
  });
}

const defaultDeps: SetPhotoAspectDeps = {
  loadScope: loadScopeImpl,
  updateAspect: updateAspectImpl,
};

export async function setPhotoAspect(
  input: SetPhotoAspectInput,
  deps: SetPhotoAspectDeps = defaultDeps,
): Promise<SetPhotoAspectResult> {
  const current = await deps.loadScope(input.organizationId, input.photoId);
  if (!current) {
    throw new PhotoAspectError('Photo not found or not a receiving photo', 404);
  }

  // The stage is derived from the row, never sent by the caller — a client that
  // could name the stage could name a legal-looking pair for a photo that is not
  // at that stage, which is the whole control this check is.
  const stage = receivingStageFromPhotoType(current.entityType, current.photoType);
  if (!stage) {
    // A `receiving_item` stamp on a carton (the pre-SoT desktop mis-stamp) has
    // no classifiable stage. Teaching that is better than picking one for it.
    throw new PhotoAspectError(
      'Photo has no classifiable evidence stage — reassign it before naming the shot',
      400,
    );
  }

  if (input.aspect && !isAspectLegalForStage(input.aspect, stage)) {
    throw new PhotoAspectError(
      `"${input.aspect}" is not a legal aspect for a ${stage} photo`,
      400,
    );
  }

  if (current.rawAspect === (input.aspect ?? null)) {
    return {
      photoId: input.photoId,
      receivingId: current.receivingId,
      receivingLineId: current.receivingLineId,
      stage,
      from: current.rawAspect,
      to: input.aspect,
      idempotent: true,
    };
  }

  await deps.updateAspect({
    organizationId: input.organizationId,
    photoId: input.photoId,
    aspect: input.aspect,
  });

  return {
    photoId: input.photoId,
    receivingId: current.receivingId,
    receivingLineId: current.receivingLineId,
    stage,
    from: current.rawAspect,
    to: input.aspect,
    idempotent: false,
  };
}
