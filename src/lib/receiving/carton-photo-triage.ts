/** Carton photo triage model — the read surface's buckets, lanes, and claim readiness, derived from the photo SoTs. */

import type { PhotoAspect } from '@/lib/photos/photo-aspects';
import { parsePhotoAspect, photoAspectLabel } from '@/lib/photos/photo-aspects';
import type { PhotoEvidenceStage } from '@/lib/photos/stages';
import { receivingStageFromPhotoType } from '@/lib/receiving/photo-intent';

/** What the operator picks between at the top of the triage surface. */
export type CartonPhotoLane = 'exact' | 'investigative';

/**
 * The Exact drill. `box` folds arrival + unbox-carton because both answer
 * "what did the outside look like"; the stage stays on the row for the label.
 */
export type CartonPhotoBucket = 'box' | 'item';

/** Why a row is in the Investigative lane. A row can carry more than one. */
export type CartonPhotoTrailReason = 'claim' | 'share' | 'unclassified';

/** The shape this model needs off `/api/receiving-photos`. */
export interface CartonPhotoInput {
  id?: number | null;
  photoUrl: string;
  /** Legacy alias of `photoType` — read only as a fallback. */
  caption?: string | null;
  photoType?: string | null;
  photoAspect?: string | null;
  receivingLineId?: number | null;
  createdAt?: string | null;
  clientCapturedAt?: string | null;
  hasClaimEvidence?: boolean;
  hasInsuranceShare?: boolean;
}

export interface CartonPhotoTriageRow {
  /** Stable list key. Falls back to the URL for rows read without a numeric id. */
  key: string;
  url: string;
  /** `photos.id`, for resolving the immutable thumbnail route on a contact-sheet tile (`resolvePhotoThumbUrl`). */
  photoId: number | null;
  stage: PhotoEvidenceStage | null;
  bucket: CartonPhotoBucket | null;
  aspect: PhotoAspect | null;
  receivingLineId: number | null;
  createdAt: string | null;
  clientCapturedAt: string | null;
  hasClaimEvidence: boolean;
  hasInsuranceShare: boolean;
  /** Empty ⇒ the row is not in the Investigative lane. */
  trailReasons: CartonPhotoTrailReason[];
}

/** One line of the claim-readiness checklist. */
export type CartonClaimReadinessState = 'present' | 'unclassified' | 'missing';

export interface CartonClaimReadinessLine {
  key: 'shipping_label' | 'box_exterior' | 'item';
  label: string;
  state: CartonClaimReadinessState;
}

export interface CartonPhotoTriageModel {
  /** The Exact lane, in capture order. */
  all: CartonPhotoTriageRow[];
  box: CartonPhotoTriageRow[];
  item: CartonPhotoTriageRow[];
  /** Chip subset — rows linked to a filed claim. */
  claim: CartonPhotoTriageRow[];
  investigative: CartonPhotoTriageRow[];
  counts: {
    all: number;
    box: number;
    item: number;
    claim: number;
    investigative: number;
  };
  readiness: CartonClaimReadinessLine[];
  /**
   * True when nothing on this carton carries an aspect, so the checklist is
   * reporting classification coverage rather than evidence coverage. Surfaces
   * use it to explain the `unclassified` rows instead of leaving them cryptic.
   */
  aspectsUnwritten: boolean;
}

function bucketForStage(stage: PhotoEvidenceStage | null): CartonPhotoBucket | null {
  if (stage === 'arrival_package' || stage === 'unbox_carton') return 'box';
  if (stage === 'unbox_item') return 'item';
  return null;
}

/** Human label for a bucket — never typed at a call site. */
export function cartonPhotoBucketLabel(bucket: CartonPhotoBucket): string {
  return bucket === 'box' ? 'Box' : 'Item';
}

export function cartonPhotoLaneLabel(lane: CartonPhotoLane): string {
  return lane === 'exact' ? 'Exact photo' : 'Investigative';
}

const TRAIL_REASON_LABELS: Record<CartonPhotoTrailReason, string> = {
  claim: 'Claim evidence',
  share: 'Share pack',
  unclassified: 'Unclassified stage',
};

export function cartonPhotoTrailReasonLabel(reason: CartonPhotoTrailReason): string {
  return TRAIL_REASON_LABELS[reason];
}

function toRow(input: CartonPhotoInput): CartonPhotoTriageRow {
  const receivingLineId =
    input.receivingLineId != null && Number.isFinite(Number(input.receivingLineId))
      ? Number(input.receivingLineId)
      : null;
  // Entity wins for lines (the identity law); `caption` is the legacy alias that
  // still carries photo_type on surfaces which have not moved to `photoType`.
  const entityType = receivingLineId != null ? 'RECEIVING_LINE' : 'RECEIVING';
  const stage = receivingStageFromPhotoType(entityType, input.photoType ?? input.caption);
  const hasClaimEvidence = input.hasClaimEvidence === true;
  const hasInsuranceShare = input.hasInsuranceShare === true;

  const trailReasons: CartonPhotoTrailReason[] = [];
  if (hasClaimEvidence) trailReasons.push('claim');
  if (hasInsuranceShare) trailReasons.push('share');
  // A row the stage vocabulary cannot name (the pre-SoT `receiving_item`-on-carton
  // mis-stamp) is invisible in every Exact bucket, so the wider lane is the only
  // place it can be seen at all. Dropping it would hide real evidence.
  if (stage == null) trailReasons.push('unclassified');

  const photoId =
    input.id != null && Number.isFinite(Number(input.id)) && Number(input.id) > 0
      ? Number(input.id)
      : null;

  return {
    key: photoId != null ? `p-${photoId}` : `u-${input.photoUrl}`,
    url: input.photoUrl,
    photoId,
    stage,
    bucket: bucketForStage(stage),
    aspect: parsePhotoAspect(input.photoAspect),
    receivingLineId,
    createdAt: input.createdAt ?? null,
    clientCapturedAt: input.clientCapturedAt ?? null,
    hasClaimEvidence,
    hasInsuranceShare,
    trailReasons,
  };
}

/** Claim readiness against the carrier three-shot minimum (exterior · item + internal packaging · shipping-label close-up). */
function deriveReadiness(
  box: CartonPhotoTriageRow[],
  item: CartonPhotoTriageRow[],
): { readiness: CartonClaimReadinessLine[]; aspectsUnwritten: boolean } {
  const boxAspects = box.map((r) => r.aspect).filter((a): a is PhotoAspect => a != null);
  const anyAspectOnCarton =
    boxAspects.length > 0 || item.some((r) => r.aspect != null);

  const aspectLine = (aspect: Extract<PhotoAspect, 'shipping_label' | 'box_exterior'>) => {
    if (boxAspects.includes(aspect)) return 'present' as const;
    if (box.length === 0) return 'missing' as const;
    return boxAspects.length > 0 ? ('missing' as const) : ('unclassified' as const);
  };

  return {
    aspectsUnwritten: !anyAspectOnCarton,
    readiness: [
      {
        key: 'shipping_label',
        label: photoAspectLabel('shipping_label'),
        state: aspectLine('shipping_label'),
      },
      {
        key: 'box_exterior',
        label: photoAspectLabel('box_exterior'),
        state: aspectLine('box_exterior'),
      },
      {
        key: 'item',
        label: 'Item shot',
        state: item.length > 0 ? 'present' : 'missing',
      },
    ],
  };
}

/**
 * Bucket one carton's photos. Input order is preserved (the list route returns
 * capture order), because "the order they were taken" is the evidence timeline
 * and re-sorting it would be a claim this model has no basis to make.
 */
export function buildCartonPhotoTriage(
  rows: readonly CartonPhotoInput[] | null | undefined,
): CartonPhotoTriageModel {
  const all = (rows ?? []).filter((r) => !!r.photoUrl?.trim()).map(toRow);
  const box = all.filter((r) => r.bucket === 'box');
  const item = all.filter((r) => r.bucket === 'item');
  const claim = all.filter((r) => r.hasClaimEvidence);
  const investigative = all.filter((r) => r.trailReasons.length > 0);
  const { readiness, aspectsUnwritten } = deriveReadiness(box, item);

  return {
    all,
    box,
    item,
    claim,
    investigative,
    counts: {
      all: all.length,
      box: box.length,
      item: item.length,
      claim: claim.length,
      investigative: investigative.length,
    },
    readiness,
    aspectsUnwritten,
  };
}

/** Rows for one Exact drill selection. `null` = All. */
export function cartonPhotoBucketRows(
  model: CartonPhotoTriageModel,
  bucket: CartonPhotoBucket | 'claim' | null,
): CartonPhotoTriageRow[] {
  if (bucket === 'box') return model.box;
  if (bucket === 'item') return model.item;
  if (bucket === 'claim') return model.claim;
  return model.all;
}
