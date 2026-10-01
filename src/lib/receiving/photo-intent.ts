/** Receiving photo intent + stage SoT — which surface captured the shot and which entity is allowed to carry it. */

export const RECEIVING_PHOTO_PACKAGE = 'receiving_package' as const;
export const RECEIVING_PHOTO_UNBOX_CARTON = 'receiving_unbox_carton' as const;
export const RECEIVING_PHOTO_ITEM = 'receiving_item' as const;

/** Legacy carton-level type written before package/item split. */
export const RECEIVING_PHOTO_LEGACY_PACKAGE = 'receiving' as const;

/** photo_type values allowed on a RECEIVING (carton) primary link. */
export const RECEIVING_CARTON_PHOTO_TYPES = [
  RECEIVING_PHOTO_PACKAGE,
  RECEIVING_PHOTO_UNBOX_CARTON,
  RECEIVING_PHOTO_LEGACY_PACKAGE,
] as const;

/** photo_type values allowed on a RECEIVING_LINE primary link. */
export const RECEIVING_LINE_PHOTO_TYPES = [RECEIVING_PHOTO_ITEM] as const;

/** Inbound evidence stages owned by the receiving flow (matrix above). */
export const RECEIVING_PHOTO_STAGES = ['arrival_package', 'unbox_carton', 'unbox_item'] as const;
export type ReceivingPhotoStage = (typeof RECEIVING_PHOTO_STAGES)[number];

/**
 * Auto-push stage for a tracking scan on a given intake surface.
 * Unbox → per-scan carton native capture; Arrival/triage → guided door package.
 * Never invent a third stage here — item capture is line-driven, not scan-bar.
 */
export function photoStageForScanIntakeSurface(
  surface: 'unbox' | 'triage' | null | undefined,
): Extract<ReceivingPhotoStage, 'unbox_carton' | 'arrival_package'> {
  return surface === 'unbox' ? 'unbox_carton' : 'arrival_package';
}

/**
 * List-filter intent for receiving photo queries (`all` = no stage filter).
 * `carton` = every RECEIVING-entity photo regardless of sub-stage — see
 * {@link RECEIVING_PHOTO_LIST_INTENT_CARTON}.
 */
export type ReceivingPhotoListIntent = 'package' | 'unbox_carton' | 'item' | 'all' | 'carton';

function norm(photoType: string | null | undefined): string {
  return String(photoType ?? '').trim().toLowerCase();
}

export function isPackagePhotoType(photoType: string | null | undefined): boolean {
  const t = norm(photoType);
  return t === RECEIVING_PHOTO_PACKAGE || t === RECEIVING_PHOTO_LEGACY_PACKAGE;
}

export function isUnboxCartonPhotoType(photoType: string | null | undefined): boolean {
  return norm(photoType) === RECEIVING_PHOTO_UNBOX_CARTON;
}

export function isItemPhotoType(photoType: string | null | undefined): boolean {
  return norm(photoType) === RECEIVING_PHOTO_ITEM;
}

/** Any photo_type a RECEIVING (carton) link may legally carry. */
export function isCartonPhotoType(photoType: string | null | undefined): boolean {
  return (RECEIVING_CARTON_PHOTO_TYPES as readonly string[]).includes(norm(photoType));
}

/** Canonical photo_type stamped for a receiving stage. */
export function receivingPhotoTypeForStage(stage: ReceivingPhotoStage): string {
  switch (stage) {
    case 'arrival_package':
      return RECEIVING_PHOTO_PACKAGE;
    case 'unbox_carton':
      return RECEIVING_PHOTO_UNBOX_CARTON;
    case 'unbox_item':
      return RECEIVING_PHOTO_ITEM;
  }
}

/** Entity a receiving stage's evidence primary-links to. */
export function receivingEntityTypeForStage(
  stage: ReceivingPhotoStage,
): 'RECEIVING' | 'RECEIVING_LINE' {
  return stage === 'unbox_item' ? 'RECEIVING_LINE' : 'RECEIVING';
}

/** Stage for a capture-queue upload, from the scope's primary entity plus an optional surface hint. */
export function receivingUploadStage(
  receivingLineId: number | null | undefined,
  hint?: ReceivingPhotoStage | null,
): ReceivingPhotoStage {
  if (receivingLineId != null) return 'unbox_item';
  return hint === 'arrival_package' || hint === 'unbox_carton' ? hint : 'unbox_carton';
}

/** Broadened carton-display intent: */
export const RECEIVING_PHOTO_LIST_INTENT_CARTON = 'carton' as const;

/** List-filter intent for a receiving stage. */
export function photoIntentFromStage(
  stage: ReceivingPhotoStage,
): Exclude<ReceivingPhotoListIntent, 'all'> {
  switch (stage) {
    case 'arrival_package':
      return 'package';
    case 'unbox_carton':
      return 'unbox_carton';
    case 'unbox_item':
      return 'item';
  }
}

/** Derive the stage of an existing row from its (entity_type, photo_type) pair. */
export function receivingStageFromPhotoType(
  entityType: string,
  photoType: string | null | undefined,
): ReceivingPhotoStage | null {
  const entity = String(entityType ?? '').trim().toUpperCase();
  if (entity === 'RECEIVING_LINE') return 'unbox_item';
  if (entity !== 'RECEIVING') return null;
  if (isUnboxCartonPhotoType(photoType)) return 'unbox_carton';
  if (isPackagePhotoType(photoType) || norm(photoType) === '') return 'arrival_package';
  return null;
}

/** SQL fragment (ANDed into the receiving photo list WHERE) for one intent. */
export function receivingPhotoIntentSql(intent: ReceivingPhotoListIntent): string {
  switch (intent) {
    case 'package':
      return ` AND l.entity_type = 'RECEIVING' AND COALESCE(p.photo_type, '') IN ('${RECEIVING_PHOTO_PACKAGE}', '${RECEIVING_PHOTO_LEGACY_PACKAGE}', '')`;
    case 'unbox_carton':
      return ` AND l.entity_type = 'RECEIVING' AND p.photo_type = '${RECEIVING_PHOTO_UNBOX_CARTON}'`;
    case 'carton':
      return ` AND l.entity_type = 'RECEIVING'`;
    case 'item':
      return ` AND l.entity_type = 'RECEIVING_LINE'`;
    case 'all':
      return '';
  }
}

/** Validate a receiving-entity photo write. */
export function validateReceivingPhotoWrite(input: {
  entityType: string;
  photoType: string | null | undefined;
}): string | null {
  const entity = String(input.entityType ?? '').trim().toUpperCase();
  if (entity !== 'RECEIVING' && entity !== 'RECEIVING_LINE') return null;
  const allowed: readonly string[] =
    entity === 'RECEIVING' ? RECEIVING_CARTON_PHOTO_TYPES : RECEIVING_LINE_PHOTO_TYPES;
  const t = norm(input.photoType);
  if (!t) {
    return `photoType is required for ${entity} photos (allowed: ${allowed.join(', ')})`;
  }
  if (!allowed.includes(t)) {
    return `photoType '${t}' is not allowed on ${entity} (allowed: ${allowed.join(', ')})`;
  }
  return null;
}

export class ReceivingPhotoWriteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReceivingPhotoWriteError';
  }
}

/** Throwing form of {@link validateReceivingPhotoWrite}. */
export function assertReceivingPhotoWrite(input: {
  entityType: string;
  photoType: string | null | undefined;
}): void {
  const violation = validateReceivingPhotoWrite(input);
  if (violation) throw new ReceivingPhotoWriteError(violation);
}

/** photo_type remap when a photo's primary link moves between receiving entities (Move-to-another-PO / reassign). */
export function remapReceivingPhotoTypeOnMove(input: {
  fromEntityType: 'RECEIVING' | 'RECEIVING_LINE';
  toEntityType: 'RECEIVING' | 'RECEIVING_LINE';
  photoType: string | null | undefined;
}): string | null {
  if (input.fromEntityType === input.toEntityType) return null;
  if (input.toEntityType === 'RECEIVING_LINE') {
    return isItemPhotoType(input.photoType) ? null : RECEIVING_PHOTO_ITEM;
  }
  return isCartonPhotoType(input.photoType) ? null : RECEIVING_PHOTO_PACKAGE;
}

/** photo_type remap for a same-carton stage claim (bench → door evidence). */
export function remapReceivingPhotoTypeOnStageClaim(input: {
  fromStage: ReceivingPhotoStage | null;
  toStage: ReceivingPhotoStage;
}): string | null {
  if (input.fromStage === null) {
    throw new ReceivingPhotoWriteError(
      'Photo has no classifiable evidence stage — cannot claim for a step',
    );
  }
  if (input.fromStage === 'unbox_item' || input.toStage === 'unbox_item') {
    throw new ReceivingPhotoWriteError(
      'Stage claim cannot move item evidence — use entity reassign',
    );
  }
  if (input.toStage !== 'arrival_package') {
    throw new ReceivingPhotoWriteError(
      `Stage claim target '${input.toStage}' is not supported`,
    );
  }
  if (input.fromStage === 'arrival_package') {
    return null;
  }
  if (input.fromStage === 'unbox_carton') {
    return RECEIVING_PHOTO_PACKAGE;
  }
  throw new ReceivingPhotoWriteError(
    `Cannot claim stage from '${input.fromStage}' to '${input.toStage}'`,
  );
}
