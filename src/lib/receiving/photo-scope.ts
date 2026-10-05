/** Receiving photo SCOPE — one shape every capture surface shares (desktop pills, mobile studio, upload queue, phone-bridge requests)… */

import { isAspectLegalForStage, type PhotoAspect } from '@/lib/photos/photo-aspects';
import {
  photoIntentFromStage,
  receivingEntityTypeForStage,
  receivingPhotoTypeForStage,
  RECEIVING_PHOTO_STAGES,
  type ReceivingPhotoListIntent,
  type ReceivingPhotoStage,
} from '@/lib/receiving/photo-intent';

/** Arrival guided camera steps — legal aspects of `arrival_package` only. */
export type ArrivalGuidedStep = 'shipping_label' | 'box_exterior';

/**
 * Parse `?step=` for the arrival guided studio. Unknown → `shipping_label`
 * (start of the door shot list). No fallback into bench aspects.
 */
export function parseArrivalGuidedStep(
  raw: string | null | undefined,
): ArrivalGuidedStep {
  const t = String(raw ?? '').trim().toLowerCase();
  return t === 'box_exterior' ? 'box_exterior' : 'shipping_label';
}

/** Carton-level (RECEIVING-entity) stages — everything but the line stage. */
type ReceivingCartonPhotoStage = Exclude<ReceivingPhotoStage, 'unbox_item'>;

/** Capture-scope identity law (for the surfaces that will call into here): */

interface ReceivingPhotoWriteTarget {
  entityType: 'RECEIVING' | 'RECEIVING_LINE';
  entityId: number;
  photoType: string;
  /** What this shot SHOWS, within the stage (`@/lib/photos/photo-aspects`). */
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

/** Parse a stage for a CARTON capture surface (mobile carton routes, carton photo pill). */
export function parseReceivingCartonPhotoStage(
  raw: string | null | undefined,
): ReceivingCartonPhotoStage {
  const stage = parseReceivingPhotoStage(raw);
  if (stage === 'unbox_item') return 'unbox_carton';
  return stage ?? 'unbox_carton';
}

/** Normalize a possibly-partial scope to a coherent stage. */
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
  /** Optional. Omitted → `null` (unclassified evidence). */
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

/**
 * Wire shape of a `receiving_photo_taken` Ably message (snake_case).
 * Phone → desk on `phone:{staffId}`: absolute in-flight shutter count so the
 * desk PhotoPeek can show placeholders before uploads commit. Not server truth.
 */
export interface ReceivingPhotoTakenMessage {
  receiving_id: number;
  receiving_line_id?: number | null;
  /** Absolute queued+uploading count for `receiving_id` (failed excluded). */
  in_flight: number;
  request_id?: string | null;
}

interface NormalizedReceivingPhotoRequest {
  receivingId: number;
  receivingLineId: number | null;
  stage: ReceivingPhotoStage;
  poRef: string | null;
  requestId: string | null;
}

/** The only implicit landing page after an Unbox photo capture. */
export const MOBILE_UNBOX_PHOTO_FEED_HREF = '/m/receiving';

/**
 * Resolve the post-capture route. Record/list screens are opt-in via an
 * explicit `back`; a bare camera deep link always returns to the photo feed.
 */
export function mobileUnboxPhotoReturnHref(back: string | null | undefined): string {
  return String(back ?? '').trim() || MOBILE_UNBOX_PHOTO_FEED_HREF;
}

/** Normalize an incoming phone-bridge request. */
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

/** Mobile capture route for a normalized request. */
export function mobileCaptureHrefForRequest(req: NormalizedReceivingPhotoRequest): string {
  const qs = (stage: ReceivingPhotoStage) => {
    const params = new URLSearchParams({ stage });
    if (req.requestId) params.set('requestId', req.requestId);
    // Door/Triage requests open the arrival guided studio (shipping label →
    // box), then hand off to Platform classify.
    if (stage === 'arrival_package') {
      params.set('guided', '1');
      // After label→box, land on Arrival Platform classify (same path as
      // `mobileArrivalClassifyHref` — inlined to avoid a photo-scope ↔
      // arrival-mobile-flow import cycle).
      params.set(
        'back',
        `/m/scan?rid=${req.receivingId}&step=platform`,
      );
    } else {
      // Unbox requests originate from the photo feed / station bridge. Never
      // let a missing query parameter fall through to the carton rows screen.
      params.set('back', MOBILE_UNBOX_PHOTO_FEED_HREF);
    }
    return `?${params.toString()}`;
  };
  if (req.stage === 'unbox_item' && req.receivingLineId != null && req.poRef) {
    return `/m/receiving/po/${encodeURIComponent(req.poRef)}/item/${req.receivingLineId}/photos${qs('unbox_item')}`;
  }
  const cartonStage: ReceivingCartonPhotoStage =
    req.stage === 'unbox_item' ? 'unbox_carton' : req.stage;
  return `/m/r/${req.receivingId}/photos${qs(cartonStage)}`;
}
