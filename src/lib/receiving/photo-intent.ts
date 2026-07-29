/**
 * Receiving photo intent + stage SoT — which surface captured the shot and
 * which entity is allowed to carry it.
 *
 * Stage × entity matrix (docs/todo/photo-evidence-chain-INDEX.md):
 *
 *   arrival_package → Triage / door   → RECEIVING       + 'receiving_package'
 *   unbox_carton    → Unbox header    → RECEIVING       + 'receiving_unbox_carton'
 *   unbox_item      → Unbox line      → RECEIVING_LINE  + 'receiving_item'
 *
 * Identity law: item insurance primary-links the RECEIVING_LINE (the SKU lives
 * on the line) — never a catalog SKU string. Legacy rows used `receiving` as a
 * carton-level alias; filters treat it as a package (arrival) shot.
 *
 * The full five-stage evidence vocabulary (testing / packing included) and the
 * cross-entity write matrix live in `src/lib/photos/stages.ts`, which composes
 * this module. Both are pure and client-safe.
 */

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

/**
 * Stage for a capture-queue upload, from the scope's primary entity plus an
 * optional surface hint. Enforces the identity law in both directions:
 *
 * - a line-scoped shot is ALWAYS `unbox_item` — entity wins, so a stale or
 *   wrong hint can never stamp a carton type onto a RECEIVING_LINE;
 * - a carton-scoped shot can never be `unbox_item` (illegal on RECEIVING per
 *   {@link RECEIVING_CARTON_PHOTO_TYPES}), so that hint falls back to default.
 *
 * The carton default is `unbox_carton`, **not** `arrival_package`. The mobile
 * capture pipeline runs at the unbox bench, and `arrival_package` is the
 * door/triage shot of the box AS IT ARRIVED — the only stage the `require_one`
 * photo policy accepts (`./photo-policy.ts`). A bench that defaults to arrival
 * silently satisfies that gate with a photo taken after the box was opened,
 * which is the exact failure this SoT exists to prevent. Arrival surfaces must
 * pass `'arrival_package'` explicitly.
 */
export function receivingUploadStage(
  receivingLineId: number | null | undefined,
  hint?: ReceivingPhotoStage | null,
): ReceivingPhotoStage {
  if (receivingLineId != null) return 'unbox_item';
  return hint === 'arrival_package' || hint === 'unbox_carton' ? hint : 'unbox_carton';
}

/**
 * Broadened carton-display intent: every RECEIVING-entity photo regardless of
 * capture sub-stage (package/legacy/unbox_carton). Distinct from `unbox_carton`
 * on purpose — the photo-policy gate (`sqlCartonStagePhotoCount`) must keep
 * counting `unbox_carton` strictly (arrival evidence must never satisfy an
 * unbox-carton requirement), so this value is additive and never substituted
 * into that gate's type signature. Use it only for read/display surfaces that
 * want to show a carton's whole evidence set (e.g. the Unbox header pill and
 * carton photo peek) rather than one capture sub-stage.
 */
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

/**
 * Derive the stage of an existing row from its (entity_type, photo_type) pair.
 *
 * Entity wins for lines: anything primary-linked to a RECEIVING_LINE is item
 * evidence (the identity law), even if a reassign moved a package-typed shot
 * onto the line before types were remapped. Untyped legacy carton rows count
 * as arrival evidence. A `receiving_item` stamp on a carton (the pre-SoT
 * desktop mis-stamp) is unclassifiable → null, so stage buckets never show it
 * as package evidence.
 */
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

/**
 * SQL fragment (ANDed into the receiving photo list WHERE) for one intent.
 * Lives beside the constants so the query can never drift from the SoT.
 * Package excludes mis-typed `receiving_item`-on-carton rows; item is
 * entity-only (no `OR photo_type` escape that used to pull carton junk in).
 */
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

/**
 * Validate a receiving-entity photo write. Returns an error message for an
 * illegal (entity_type × photo_type) pair, null when the write is allowed.
 * Only judges RECEIVING / RECEIVING_LINE — other entities are out of scope
 * here (see `src/lib/photos/stages.ts` for the full matrix).
 */
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

/**
 * photo_type remap when a photo's primary link moves between receiving
 * entities (Move-to-another-PO / reassign). Returns the new photo_type, or
 * null when the current stamp is already legal on the destination. Without
 * this, a carton→line move would strand a `receiving_package` row where the
 * item filter (entity-only) shows it but the stage vocabulary can't name it —
 * and a line→carton move would re-create the exact mis-stamp this SoT bans.
 */
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
