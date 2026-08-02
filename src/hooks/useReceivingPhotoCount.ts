'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { receivingPhotosQueryKey } from '@/lib/queries/receiving-queries';
import { receivingStageFromPhotoType } from '@/lib/receiving/photo-intent';
import { parsePhotoAspect, type PhotoAspect } from '@/lib/photos/photo-aspects';

interface PhotoRow {
  photoUrl?: string | null;
  /**
   * The STAGE, not display text. `listReceivingPhotos` selects
   * `p.photo_type AS caption` (`photos/queries/receiving-list.ts:52`), so this
   * field carries the photo_type on the read path — which is why the server's
   * receive gate reads exactly the same field (`photo-policy.ts:138`). The POST
   * handler's "caption is display text, never photo_type" note is about the
   * WRITE direction. Do not "fix" this to a display caption.
   */
  caption?: string | null;
  receivingLineId?: number | null;
  /** `photos.photo_aspect` — WHAT the shot shows, within its stage. NULL = unclassified. */
  photoAspect?: string | null;
  /**
   * Server INSERT instant — when this evidence actually landed.
   *
   * NOT `clientCapturedAt`: that is the tablet's shutter wall clock and is not
   * server-attested, so a drifted device yields a wrong-but-plausible time and a
   * concealed-damage dispute turns on which of the two you read. The receipt
   * read model makes the same call for the same reason.
   */
  createdAt?: string | null;
}

interface PhotosPayload {
  photos?: PhotoRow[];
}

/** Per-stage evidence counts for one carton (+ optionally one line). Not exported
 *  until a caller needs to name it — the hook's return type infers. */
interface ReceivingPhotoStageCounts {
  /**
   * The live payload has arrived, so the zeros below mean "nothing shot" rather
   * than "not loaded yet". A stack that treats un-hydrated zeros as evidence
   * paints a confident wrong active step for one beat and then jumps — callers
   * gate on this instead of rendering optimistically.
   */
  settled: boolean;
  /** Door / Triage shot — the stage the `require_one` receive gate counts. */
  arrivalPackage: number;
  /** The bench's own carton capture (opened box + packing material). */
  unboxCarton: number;
  /** `unbox_item` on the requested line; 0 when no line was requested. */
  item: number;
  /** Every photo on the carton, whatever the stage. */
  total: number;
  /**
   * Per-aspect counts of the bench's own carton shots (`unbox_carton`). The
   * three carton steps share that stage and are told apart by aspect alone, so
   * a stage count cannot answer them.
   */
  cartonAspect: Partial<Record<PhotoAspect, number>>;
  /** Per-aspect counts on the requested line; empty when no line was requested. */
  itemAspect: Partial<Record<PhotoAspect, number>>;
  /**
   * When each bucket's FIRST shot landed — the instant that bucket's step gate
   * closed, because one photo of the right aspect satisfies it.
   *
   * FIRST, not last: a step is done the moment its evidence exists, and a
   * re-shoot half an hour later did not make it done again. (The `item_photos`
   * gate spans several aspects, so its closing instant is the LAST of these
   * per-aspect firsts — that fold belongs to the gate's owner, not here.)
   */
  arrivalFirstAt: string | null;
  itemFirstAt: string | null;
  cartonAspectFirstAt: Partial<Record<PhotoAspect, string>>;
  itemAspectFirstAt: Partial<Record<PhotoAspect, string>>;
}

const EMPTY_COUNTS: ReceivingPhotoStageCounts = {
  settled: false,
  arrivalPackage: 0,
  unboxCarton: 0,
  item: 0,
  total: 0,
  cartonAspect: {},
  itemAspect: {},
  arrivalFirstAt: null,
  itemFirstAt: null,
  cartonAspectFirstAt: {},
  itemAspectFirstAt: {},
};

/** The earlier of two instants, tolerating a missing or unparseable one. */
function earlier(a: string | null | undefined, b: string | null | undefined): string | null {
  if (!a) return b ?? null;
  if (!b) return a;
  const ta = Date.parse(a);
  const tb = Date.parse(b);
  if (!Number.isFinite(ta)) return b;
  if (!Number.isFinite(tb)) return a;
  return tb < ta ? b : a;
}

/**
 * The shared carton-photos query. One cache entry per carton, shared by the
 * camera ×N badge (`ReceivingPhotoButton`), the progress stepper's Photos gate,
 * and the capture stack's per-stage steps — so no two of them can disagree
 * about what has been shot.
 *
 * Why a live query and not `row.photo_count`: that denormalized per-line
 * snapshot gets clobbered back to 0 whenever an unrelated mutation (e.g. a
 * Condition update) re-patches or refetches the line, which flipped the Photos
 * step back to "active" with 6 photos plainly on the carton. This cache is keyed
 * on the carton and untouched by those mutations.
 */
function useReceivingPhotosQuery(receivingId: number | null | undefined) {
  const id = Number(receivingId);
  const valid = Number.isFinite(id) && id > 0;

  const { data } = useQuery<PhotosPayload>({
    queryKey: receivingPhotosQueryKey(valid ? id : 0),
    queryFn: async () => {
      const res = await fetch(`/api/receiving-photos?receivingId=${id}`, {
        cache: 'no-store',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    enabled: valid,
    staleTime: 10_000,
  });

  return { valid, data };
}

// REMOVED 2026-08-02 — `useReceivingPhotoCount`, the flat per-carton total.
//
// Its last consumer was LineEditPanel's `activeStep` memo, a second pointer
// derivation deleted with the notes auto-focus it drove. A flat total cannot
// answer the question the bench actually asks — WHICH evidence is missing —
// which is why every live consumer reads `useReceivingPhotoStageCounts` below
// and buckets through the stage SoT instead. Resurrecting a total here would
// re-open the gap the stage split closed.

/**
 * The same carton photos, bucketed by evidence stage — what the capture stack's
 * three photo steps read (`derive-capture-step-states`).
 *
 * Buckets through the stage SoT (`receivingStageFromPhotoType`), the same
 * resolver the server-side receive gate uses (`photo-policy.ts`), so a photo
 * lands in the same bucket on both sides of the wire. Never re-derive the
 * entity/photo_type mapping here.
 *
 * Counts are 0 until the live payload arrives. There is deliberately no
 * fallback: `row.photo_count` is a single total with no stage breakdown, so
 * splitting it across stages would be an invention — an un-shot arrival step
 * reading "done" is exactly the failure the stage split exists to prevent.
 */
export function useReceivingPhotoStageCounts(
  receivingId: number | null | undefined,
  receivingLineId?: number | null,
): ReceivingPhotoStageCounts {
  const { valid, data } = useReceivingPhotosQuery(receivingId);
  const lineId = Number(receivingLineId);
  const wantLine = Number.isFinite(lineId) && lineId > 0 ? lineId : null;

  return useMemo(() => {
    // No carton id → the query is disabled and never resolves, so "zero photos"
    // IS the settled answer. Reporting unsettled here left a consumer that gates
    // on `settled` (the capture stack) in a permanent loading state on any row
    // that reaches it before its carton id hydrates.
    if (!valid) return { ...EMPTY_COUNTS, settled: true };
    if (!data) return EMPTY_COUNTS;

    const counts: ReceivingPhotoStageCounts = {
      ...EMPTY_COUNTS,
      settled: true,
      cartonAspect: {},
      itemAspect: {},
      cartonAspectFirstAt: {},
      itemAspectFirstAt: {},
    };
    // An UNKNOWN aspect string is dropped, never bucketed — same rule as the
    // server-side counts. A row whose aspect this build does not recognise is
    // unclassified evidence, not evidence of the nearest thing.
    const bump = (
      into: Partial<Record<PhotoAspect, number>>,
      firstAt: Partial<Record<PhotoAspect, string>>,
      raw: string | null | undefined,
      at: string | null | undefined,
    ) => {
      const aspect = parsePhotoAspect(raw);
      if (!aspect) return;
      into[aspect] = (into[aspect] ?? 0) + 1;
      const next = earlier(firstAt[aspect], at);
      if (next) firstAt[aspect] = next;
    };

    for (const photo of data.photos ?? []) {
      if (!photo.photoUrl?.trim()) continue;
      counts.total += 1;

      const onLine = Number(photo.receivingLineId ?? 0) > 0;
      if (onLine) {
        // Item evidence primary-links the RECEIVING_LINE, so a line's item
        // photos are exactly the rows carrying its id.
        if (wantLine != null && Number(photo.receivingLineId) === wantLine) {
          counts.item += 1;
          counts.itemFirstAt = earlier(counts.itemFirstAt, photo.createdAt);
          bump(counts.itemAspect, counts.itemAspectFirstAt, photo.photoAspect, photo.createdAt);
        }
        continue;
      }

      const stage = receivingStageFromPhotoType('RECEIVING', photo.caption);
      if (stage === 'arrival_package') {
        counts.arrivalPackage += 1;
        counts.arrivalFirstAt = earlier(counts.arrivalFirstAt, photo.createdAt);
      } else if (stage === 'unbox_carton') {
        counts.unboxCarton += 1;
        // Aspect buckets only for the BENCH stage. An arrival shot may legally
        // carry `shipping_label`, and letting it into this bucket would satisfy
        // the bench's shipping-label step from a door photo — the same
        // stage-confusion the arrival split exists to prevent, one axis down.
        bump(counts.cartonAspect, counts.cartonAspectFirstAt, photo.photoAspect, photo.createdAt);
      }
    }
    return counts;
  }, [valid, data, wantLine]);
}
