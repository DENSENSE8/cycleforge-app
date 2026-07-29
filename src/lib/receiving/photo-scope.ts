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
 * photo pill). Missing/unknown → `arrival_package` (the legacy default —
 * in-flight messages and old links keep their old stamp). `unbox_item` is
 * illegal on a carton surface and coerces to `unbox_carton` (the shot is
 * happening mid-unbox; the carton bucket is the closest legal stage — never
 * re-create the item-on-carton mis-stamp).
 */
export function parseReceivingCartonPhotoStage(
  raw: string | null | undefined,
): ReceivingCartonPhotoStage {
  const stage = parseReceivingPhotoStage(raw);
  if (stage === 'unbox_item') return 'unbox_carton';
  return stage ?? 'arrival_package';
}

/**
 * Normalize a possibly-partial scope to a coherent stage. The ENTITY wins
 * (identity law): a line id makes it item evidence regardless of the claimed
 * stage; without a line id an `unbox_item` claim degrades to `unbox_carton`
 * (same station, legal carton stamp) and a missing stage means the legacy
 * arrival capture. Lenient by design — used where old queue entries / wire
 * messages without a stage must keep working.
 */
export function effectiveReceivingPhotoStage(scope: {
  stage?: ReceivingPhotoStage | null;
  receivingLineId?: number | null;
}): ReceivingPhotoStage {
  if (scope.receivingLineId != null) return 'unbox_item';
  if (scope.stage === 'unbox_item') return 'unbox_carton';
  return scope.stage ?? 'arrival_package';
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
}): ReceivingPhotoWriteTarget {
  const entityType = receivingEntityTypeForStage(scope.stage);
  if (entityType === 'RECEIVING_LINE') {
    const lineId = scope.receivingLineId;
    if (lineId == null || !Number.isFinite(lineId) || lineId <= 0) {
      throw new Error('unbox_item photo scope requires a receivingLineId');
    }
    return { entityType, entityId: lineId, photoType: receivingPhotoTypeForStage(scope.stage) };
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
 * Normalize an incoming phone-bridge request. Backward compatible: legacy
 * messages without `stage` are arrival (door) captures. Entity-wins coherence
 * via {@link effectiveReceivingPhotoStage}. Returns null when the message has
 * no usable receiving id.
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
