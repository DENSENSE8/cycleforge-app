'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { receivingPhotosQueryKey } from '@/lib/queries/receiving-queries';
import { receivingStageFromPhotoType } from '@/lib/receiving/photo-intent';

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
}

const EMPTY_COUNTS: ReceivingPhotoStageCounts = {
  settled: false,
  arrivalPackage: 0,
  unboxCarton: 0,
  item: 0,
  total: 0,
};

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

/**
 * Live per-carton photo count.
 *
 * Falls back to `fallbackCount` (the row snapshot) only until the live query
 * hydrates or when the carton id is unknown (pre-carton stub). Once the live
 * payload is present it is authoritative — a genuine 0 (all photos deleted)
 * correctly reads as Photos-not-done.
 */
export function useReceivingPhotoCount(
  receivingId: number | null | undefined,
  fallbackCount = 0,
): number {
  const { valid, data } = useReceivingPhotosQuery(receivingId);

  if (!valid || !data) return Math.max(0, fallbackCount);
  return (data.photos ?? []).filter((p) => !!p.photoUrl?.trim()).length;
}

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

    const counts = { ...EMPTY_COUNTS, settled: true };
    for (const photo of data.photos ?? []) {
      if (!photo.photoUrl?.trim()) continue;
      counts.total += 1;

      const onLine = Number(photo.receivingLineId ?? 0) > 0;
      if (onLine) {
        // Item evidence primary-links the RECEIVING_LINE, so a line's item
        // photos are exactly the rows carrying its id.
        if (wantLine != null && Number(photo.receivingLineId) === wantLine) counts.item += 1;
        continue;
      }

      const stage = receivingStageFromPhotoType('RECEIVING', photo.caption);
      if (stage === 'arrival_package') counts.arrivalPackage += 1;
      else if (stage === 'unbox_carton') counts.unboxCarton += 1;
    }
    return counts;
  }, [valid, data, wantLine]);
}
