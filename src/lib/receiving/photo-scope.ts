/**
 * Receiving photo SCOPE — one shape every capture surface shares (desktop
 * pills, mobile studio, upload queue, phone-bridge requests) mapping a
 * receiving stage onto the Wave-0 write matrix (`./photo-intent.ts`):
 *
 *   arrival_package → RECEIVING       + receiving_package        (Triage door)
 *   unbox_carton    → RECEIVING       + receiving_unbox_carton   (Unbox header)
 *   unbox_item      → RECEIVING_LINE  + receiving_item           (Unbox line)
 *
 * Pure + client-safe. Composes the stage SoT — never re-derives entity or
 * photo_type mappings here.
 */

import { isAspectLegalForStage, type PhotoAspect } from '@/lib/photos/photo-aspects';
import {
  photoIntentFromStage,
  receivingEntityTypeForStage,
  receivingPhotoTypeForStage,
  RECEIVING_PHOTO_STAGES,
  type ReceivingPhotoListIntent,
  type ReceivingPhotoStage,
} from '@/lib/receiving/photo-intent';

/** Carton-level (RECEIVING-entity) stages — everything but the line stage. */
type ReceivingCartonPhotoStage = Exclude<ReceivingPhotoStage, 'unbox_item'>;

/**
 * Capture-scope identity law (for the surfaces that will call into here):
 * a scope's `sku` / `serial` are display chrome only — the PO · SKU · serial
 * identity rendered next to a camera affordance. They never pick the write
 * target; item evidence links by RECEIVING_LINE id, nothing else.
 *
 * The resolvers below each take the NARROWEST structural subset they actually
 * need rather than one wide scope object, so a caller can't smuggle an unused
 * field into a decision.
 */

interface ReceivingPhotoWriteTarget {
  entityType: 'RECEIVING' | 'RECEIVING_LINE';
  entityId: number;
  photoType: string;
  /**
   * What this shot SHOWS, within the stage (`@/lib/photos/photo-aspects`).
   * `null` when the surface cannot name it — legal, and means *unclassified
   * evidence*. Passed through rather than inferred: an aspect is a claim, and
   * this resolver is not in a position to make one on the caller's behalf.
   */
  aspect: PhotoAspect | null;
}

/** Parse a raw stage string (URL `?stage=`, Ably payload). Unknown → null. */
export function parseReceivingPhotoStage(
  raw: string | null | undefined,
): ReceivingPhotoStage | null {
  const t = String(raw ?? '').trim().toLowerCase();
  return (RECEIVING_PHOTO_STAGES as readonly string[]).includes(t)
    ? (t as ReceivingPhotoStage)
    : null;
}

/**
 * Parse a stage for a CARTON capture surface (mobile carton routes, carton
 * photo pill). Missing/unknown → `unbox_carton`, never `arrival_package`: the
 * mobile capture pipeline overwhelmingly runs at the unbox bench (generic
 * `/m/receiving/...` browse/list/history surfaces, share-to-phone handoffs),
 * so a stage-less request is far more likely to be a post-opening shot than a
 * door shot — mirrors the reasoning in `receivingUploadStage`
 * (`./photo-intent.ts`). Arrival must always be requested explicitly (Triage
 * passes it on every capture surface it owns). `unbox_item` is illegal on a
 * carton surface and coerces to `unbox_carton` (the shot is happening
 * mid-unbox; the carton bucket is the closest legal stage — never re-create
 * the item-on-carton mis-stamp).
 */
export function parseReceivingCartonPhotoStage(
  raw: string | null | undefined,
): ReceivingCartonPhotoStage {
  const stage = parseReceivingPhotoStage(raw);
  if (stage === 'unbox_item') return 'unbox_carton';
  return stage ?? 'unbox_carton';
}

/**
 * Normalize a possibly-partial scope to a coherent stage. The ENTITY wins
 * (identity law): a line id makes it item evidence regardless of the claimed
 * stage; without a line id an `unbox_item` claim degrades to `unbox_carton`
 * (same station, legal carton stamp) and a missing stage defaults to
 * `unbox_carton` — the same safe-default reasoning as
 * {@link parseReceivingCartonPhotoStage}. Never `arrival_package`: that stage
 * must always be threaded explicitly by the one surface (Triage) that owns
 * it, not inherited as a fallback. Lenient by design — used where old queue
 * entries / wire messages without a stage must keep working.
 */
export function effectiveReceivingPhotoStage(scope: {
  stage?: ReceivingPhotoStage | null;
  receivingLineId?: number | null;
}): ReceivingPhotoStage {
  if (scope.receivingLineId != null) return 'unbox_item';
  if (scope.stage === 'unbox_item') return 'unbox_carton';
  return scope.stage ?? 'unbox_carton';
}

/**
 * Strict scope → write-target mapping for NEW capture wiring. Throws on an
 * incoherent scope (stage/entity mismatch) so a mis-wired surface fails in
 * dev + tests instead of writing a stamp the server would 400.
 */
export function resolveReceivingPhotoTarget(scope: {
  receivingId: number;
  receivingLineId?: number | null;
  stage: ReceivingPhotoStage;
  /**
   * Optional. Omitted → `null` (unclassified evidence). An aspect ILLEGAL for
   * the scope's stage throws, like every other incoherence here — this is the
   * strict resolver new capture wiring composes, so a mis-wired surface must
   * fail in dev and tests rather than send a body the server would 400.
   */
  aspect?: PhotoAspect | null;
}): ReceivingPhotoWriteTarget {
  const entityType = receivingEntityTypeForStage(scope.stage);
  const aspect = scope.aspect ?? null;
  if (aspect && !isAspectLegalForStage(aspect, scope.stage)) {
    throw new Error(`photo aspect "${aspect}" is not legal at the ${scope.stage} stage`);
  }
  if (entityType === 'RECEIVING_LINE') {
    const lineId = scope.receivingLineId;
    if (lineId == null || !Number.isFinite(lineId) || lineId <= 0) {
      throw new Error('unbox_item photo scope requires a receivingLineId');
    }
    return {
      entityType,
      entityId: lineId,
      photoType: receivingPhotoTypeForStage(scope.stage),
      aspect,
    };
  }
  if (scope.receivingLineId != null) {
    throw new Error(`${scope.stage} photo scope must not carry a receivingLineId`);
  }
  if (!Number.isFinite(scope.receivingId) || scope.receivingId <= 0) {
    throw new Error('photo scope requires a valid receivingId');
  }
  return {
    entityType,
    entityId: scope.receivingId,
    photoType: receivingPhotoTypeForStage(scope.stage),
    aspect,
  };
}

/** List-filter intent matching a scope's (normalized) stage. */
export function receivingPhotoListIntentForScope(scope: {
  stage?: ReceivingPhotoStage | null;
  receivingLineId?: number | null;
}): Exclude<ReceivingPhotoListIntent, 'all'> {
  return photoIntentFromStage(effectiveReceivingPhotoStage(scope));
}

// ── Phone-bridge request routing ────────────────────────────────────────────

/** Wire shape of a `receiving_photo_request` Ably message (snake_case). */
export interface ReceivingPhotoRequestMessage {
  receiving_id?: number | string;
  receiving_line_id?: number | string | null;
  stage?: string | null;
  /** PO route ref (zoho PO id or number) — routes item captures to the PO item page. */
  po_ref?: string | null;
  tracking?: string | null;
  request_id?: string | null;
  requested_by_staff_id?: number;
}

interface NormalizedReceivingPhotoRequest {
  receivingId: number;
  receivingLineId: number | null;
  stage: ReceivingPhotoStage;
  poRef: string | null;
  requestId: string | null;
}

/**
 * Normalize an incoming phone-bridge request. Every live sender threads an
 * explicit `stage` (the desktop "send to phone" pill always computes one);
 * a stage-less message defaults to `unbox_carton` via
 * {@link effectiveReceivingPhotoStage} — never arrival, which must be
 * requested explicitly. Entity-wins coherence via the same helper. Returns
 * null when the message has no usable receiving id.
 */
export function normalizeReceivingPhotoRequest(
  msg: ReceivingPhotoRequestMessage | null | undefined,
): NormalizedReceivingPhotoRequest | null {
  const receivingId = Number(msg?.receiving_id);
  if (!Number.isFinite(receivingId) || receivingId <= 0) return null;
  const lineRaw = Number(msg?.receiving_line_id);
  const receivingLineId = Number.isFinite(lineRaw) && lineRaw > 0 ? lineRaw : null;
  const stage = effectiveReceivingPhotoStage({
    stage: parseReceivingPhotoStage(msg?.stage),
    receivingLineId,
  });
  return {
    receivingId,
    receivingLineId,
    stage,
    poRef: String(msg?.po_ref ?? '').trim() || null,
    requestId: String(msg?.request_id ?? '').trim() || null,
  };
}

/**
 * Mobile capture route for a normalized request.
 *
 *   arrival_package / unbox_carton → /m/r/{id}/photos?stage=…
 *   unbox_item (line + PO known)   → /m/receiving/po/{po}/item/{line}/photos?stage=unbox_item
 *   unbox_item (PO unknown)        → carton page at unbox_carton — there is no
 *                                    id-based line route, and landing item shots
 *                                    on the carton page must not mis-stamp them
 *                                    as item evidence.
 */
export function mobileCaptureHrefForRequest(req: NormalizedReceivingPhotoRequest): string {
  const qs = (stage: ReceivingPhotoStage) => {
    const params = new URLSearchParams({ stage });
    if (req.requestId) params.set('requestId', req.requestId);
    return `?${params.toString()}`;
  };
  if (req.stage === 'unbox_item' && req.receivingLineId != null && req.poRef) {
    return `/m/receiving/po/${encodeURIComponent(req.poRef)}/item/${req.receivingLineId}/photos${qs('unbox_item')}`;
  }
  const cartonStage: ReceivingCartonPhotoStage =
    req.stage === 'unbox_item' ? 'unbox_carton' : req.stage;
  return `/m/r/${req.receivingId}/photos${qs(cartonStage)}`;
}
