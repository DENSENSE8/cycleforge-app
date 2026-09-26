'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { receivingPhotosQueryKey } from '@/lib/queries/receiving-queries';
import { receivingStageFromPhotoType } from '@/lib/receiving/photo-intent';
import { parsePhotoAspect, type PhotoAspect } from '@/lib/photos/photo-aspects';

interface PhotoRow {
  photoUrl?: string | null;
  /** The STAGE, not display text. */
  caption?: string | null;
  receivingLineId?: number | null;
  /** `photos.photo_aspect` — WHAT the shot shows, within its stage. NULL = unclassified. */
  photoAspect?: string | null;
  /** Server INSERT instant — when this evidence actually landed. */
  createdAt?: string | null;
}

interface PhotosPayload {
  photos?: PhotoRow[];
}

/** Per-stage evidence counts for one carton (+ optionally one line). Not exported
 *  until a caller needs to name it — the hook's return type infers. */
interface ReceivingPhotoStageCounts {
  /** The live payload has arrived, so the zeros below mean "nothing shot" rather than "not loaded yet". */
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
   * Per-aspect counts of door shots (`arrival_package`). The two door steps
   * share that stage and are told apart by aspect alone.
   */
  arrivalAspect: Partial<Record<PhotoAspect, number>>;
  /**
   * Per-aspect counts of the bench's own carton shots (`unbox_carton`). The
   * three carton steps share that stage and are told apart by aspect alone, so
   * a stage count cannot answer them.
   */
  cartonAspect: Partial<Record<PhotoAspect, number>>;
  /** Per-aspect counts on the requested line; empty when no line was requested. */
  itemAspect: Partial<Record<PhotoAspect, number>>;
  /** When each bucket's FIRST shot landed — the instant that bucket's step gate closed, because one photo of the right aspect satisfies it. */
  arrivalFirstAt: string | null;
  itemFirstAt: string | null;
  arrivalAspectFirstAt: Partial<Record<PhotoAspect, string>>;
  cartonAspectFirstAt: Partial<Record<PhotoAspect, string>>;
  itemAspectFirstAt: Partial<Record<PhotoAspect, string>>;
}

const EMPTY_COUNTS: ReceivingPhotoStageCounts = {
  settled: false,
  arrivalPackage: 0,
  unboxCarton: 0,
  item: 0,
  total: 0,
  arrivalAspect: {},
  cartonAspect: {},
  itemAspect: {},
  arrivalFirstAt: null,
  itemFirstAt: null,
  arrivalAspectFirstAt: {},
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

/** The shared carton-photos query. */
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

/** The same carton photos, bucketed by evidence stage — what the capture stack's three photo steps read (`derive-capture-step-states`). */
export function useReceivingPhotoStageCounts(
  receivingId: number | null | undefined,
  receivingLineId?: number | null,
): ReceivingPhotoStageCounts {
  const { valid, data } = useReceivingPhotosQuery(receivingId);
  const lineId = Number(receivingLineId);
  const wantLine = Number.isFinite(lineId) && lineId > 0 ? lineId : null;

  return useMemo(() => {
    // No carton id → the query is disabled and never resolves, so "zero photos" IS the settled answer.
    if (!valid) return { ...EMPTY_COUNTS, settled: true };
    if (!data) return EMPTY_COUNTS;

    const counts: ReceivingPhotoStageCounts = {
      ...EMPTY_COUNTS,
      settled: true,
      arrivalAspect: {},
      cartonAspect: {},
      itemAspect: {},
      arrivalAspectFirstAt: {},
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
        // Door aspect buckets — never into cartonAspect (bench Shipping label
        // must not close from a door shot).
        bump(
          counts.arrivalAspect,
          counts.arrivalAspectFirstAt,
          photo.photoAspect,
          photo.createdAt,
        );
      } else if (stage === 'unbox_carton') {
        counts.unboxCarton += 1;
        // Aspect buckets only for the BENCH stage.
        bump(counts.cartonAspect, counts.cartonAspectFirstAt, photo.photoAspect, photo.createdAt);
      }
    }
    return counts;
  }, [valid, data, wantLine]);
}
