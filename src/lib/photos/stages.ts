/**
 * Photo evidence stages — the five-stage insurance spine across stations,
 * and the (entity_type × photo_type) write matrix enforced at the upload /
 * attach waist (`./service.ts`).
 *
 * Composes the receiving stage SoT (`src/lib/receiving/photo-intent.ts`) with
 * the unit-scoped testing / packing types (`./types.ts`). Pure + client-safe:
 * no DB, no server-only imports — journeys, library chrome, and capture UIs
 * all read stage vocabulary from here.
 *
 * Matrix (docs/todo/photo-evidence-chain-INDEX.md):
 *
 *   RECEIVING       → receiving_package | receiving_unbox_carton | receiving (legacy)
 *   RECEIVING_LINE  → receiving_item
 *   SERIAL_UNIT     → testing_photo | packer_photo | prepack
 *   PACKER_LOG      → packer_photo | box_label
 *
 * Every other entity (SKU, SKU_STOCK, BIN_ADJUSTMENT, SHARE_PACK,
 * ZENDESK_TICKET) is deliberately unconstrained — those surfaces carry their
 * own vocabularies, including org-defined custom image types
 * (`photo_image_types`), which have no upload surface on the constrained
 * entities.
 */

import {
  RECEIVING_CARTON_PHOTO_TYPES,
  RECEIVING_LINE_PHOTO_TYPES,
  receivingStageFromPhotoType,
  type ReceivingPhotoStage,
} from '@/lib/receiving/photo-intent';
import {
  PACK_BOX_PHOTO_TYPE,
  PACK_SLIP_PHOTO_TYPE,
  PACKER_BOX_LABEL_PHOTO_TYPE,
  UNIT_PACKING_PHOTO_TYPE,
  UNIT_PREPACK_PHOTO_TYPE,
  UNIT_TESTING_PHOTO_TYPE,
  type PhotoEntityType,
} from './types';

/** Station order of the evidence spine: arrival → unbox → test → pack. */
export const PHOTO_EVIDENCE_STAGES = [
  'arrival_package',
  'unbox_carton',
  'unbox_item',
  'testing',
  'packing',
] as const;

export type PhotoEvidenceStage = (typeof PHOTO_EVIDENCE_STAGES)[number];

/** Display labels per the stage matrix (INDEX). Views render these via {@link photoStageLabel}, never ad-hoc strings. */
const PHOTO_EVIDENCE_STAGE_LABELS: Record<PhotoEvidenceStage, string> = {
  arrival_package: 'Arrival · package',
  unbox_carton: 'Unbox · carton',
  unbox_item: 'Unbox · item',
  testing: 'Testing',
  packing: 'Packing',
};

export function photoStageLabel(stage: PhotoEvidenceStage): string {
  return PHOTO_EVIDENCE_STAGE_LABELS[stage];
}

const WRITE_MATRIX: Partial<Record<PhotoEntityType, readonly string[]>> = {
  RECEIVING: RECEIVING_CARTON_PHOTO_TYPES,
  RECEIVING_LINE: RECEIVING_LINE_PHOTO_TYPES,
  SERIAL_UNIT: [UNIT_TESTING_PHOTO_TYPE, UNIT_PACKING_PHOTO_TYPE, UNIT_PREPACK_PHOTO_TYPE],
  // pack_slip / pack_box are the guided Packer Review two-step capture
  // (`MobilePackerPhotoStudio`). They land on PACKER_LOG exactly like
  // packer_photo and are packing-stage evidence — omitting them here would
  // 400 every guided pack capture at the waist.
  PACKER_LOG: [
    UNIT_PACKING_PHOTO_TYPE,
    PACKER_BOX_LABEL_PHOTO_TYPE,
    PACK_SLIP_PHOTO_TYPE,
    PACK_BOX_PHOTO_TYPE,
  ],
};

/** Allowed photo_type values for an entity, or null when unconstrained. */
export function allowedPhotoTypesFor(entityType: PhotoEntityType): readonly string[] | null {
  return WRITE_MATRIX[entityType] ?? null;
}

/**
 * Validate a photo write against the matrix. Returns an error message for an
 * illegal pair, null when allowed. Constrained entities require an explicit,
 * matching photo_type; unconstrained entities always pass (including null).
 */
export function validatePhotoWrite(input: {
  entityType: PhotoEntityType;
  photoType: string | null | undefined;
}): string | null {
  const allowed = WRITE_MATRIX[input.entityType];
  if (!allowed) return null;
  const t = String(input.photoType ?? '').trim().toLowerCase();
  if (!t) {
    return `photoType is required for ${input.entityType} photos (allowed: ${allowed.join(', ')})`;
  }
  if (!allowed.includes(t)) {
    return `photoType '${t}' is not allowed on ${input.entityType} (allowed: ${allowed.join(', ')})`;
  }
  return null;
}

export class PhotoWriteViolationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PhotoWriteViolationError';
  }
}

/** Throwing form of {@link validatePhotoWrite}. */
export function assertPhotoWrite(input: {
  entityType: PhotoEntityType;
  photoType: string | null | undefined;
}): void {
  const violation = validatePhotoWrite(input);
  if (violation) throw new PhotoWriteViolationError(violation);
}

/**
 * Derive the evidence stage of an existing row from its
 * (entity_type, photo_type) pair, or null when it isn't stage evidence
 * (custom types, SKU reference shots, mis-stamped legacy rows, …).
 */
export function stageFromPhotoType(
  entityType: string,
  photoType: string | null | undefined,
): PhotoEvidenceStage | null {
  const entity = String(entityType ?? '').trim().toUpperCase();
  if (entity === 'RECEIVING' || entity === 'RECEIVING_LINE') {
    return receivingStageFromPhotoType(entity, photoType) as ReceivingPhotoStage | null;
  }
  const t = String(photoType ?? '').trim().toLowerCase();
  if (entity === 'SERIAL_UNIT') {
    if (t === UNIT_TESTING_PHOTO_TYPE) return 'testing';
    if (t === UNIT_PACKING_PHOTO_TYPE || t === UNIT_PREPACK_PHOTO_TYPE || t === 'shipout') {
      return 'packing';
    }
    return null;
  }
  if (entity === 'PACKER_LOG') {
    if (
      t === UNIT_PACKING_PHOTO_TYPE ||
      t === PACKER_BOX_LABEL_PHOTO_TYPE ||
      t === PACK_SLIP_PHOTO_TYPE ||
      t === PACK_BOX_PHOTO_TYPE
    ) {
      return 'packing';
    }
    return null;
  }
  return null;
}
