import { queryOptions } from '@tanstack/react-query';
import type { TimelineItem } from './types';
import { unitPhotosToTimeline, type UnitTimelinePhotoRow } from './unit-photos-events';

/**
 * Journey ↔ photo-evidence bridge: the shared React Query factory for
 * `/api/serial-units/[id]/timeline-photos` plus the pure merge that folds a
 * unit's five stage photo rows into an already-merged journey.
 *
 * One mount owns media: a pane that already renders a dedicated photo timeline
 * (`SerialUnitTimelineSection`) beside a journey must NOT also merge photos
 * into that journey — consumers gate via their `withPhotos` prop / by passing
 * no photos. Degrade-not-fail: a failed photo fetch hands `null` here and the
 * journey renders events-only.
 */

/** Canonical cache identity for a unit's timeline photos (shared with the unit detail pane). */
export function unitTimelinePhotosKey(serialUnitId: number) {
  return ['unit-timeline-photos', serialUnitId] as const;
}

interface UnitTimelinePhotosPayload {
  photos: UnitTimelinePhotoRow[];
}

/**
 * Query options for a unit's stage photos. Pass `null`/`undefined` (or an
 * invalid id) to keep the query disabled — the hook-order-safe way for a
 * consumer to gate the photo spine (unknown unit id, `withPhotos={false}`).
 */
export function unitTimelinePhotosQuery(serialUnitId: number | null | undefined) {
  const id = serialUnitId ?? 0;
  return queryOptions({
    queryKey: unitTimelinePhotosKey(id),
    queryFn: async (): Promise<UnitTimelinePhotosPayload> => {
      const res = await fetch(`/api/serial-units/${id}/timeline-photos`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = await res.json();
      return { photos: Array.isArray(body?.photos) ? body.photos : [] };
    },
    enabled: Number.isFinite(id) && id > 0,
    staleTime: 15_000,
  });
}

interface MergeJourneyPhotosOptions {
  /**
   * Optional hard slice of `media` on inserted stage rows. Prefer leaving media
   * full and letting {@link EventTimeline}'s strip apply a display `+N` cap
   * (station journeys). Compact serial journey still opts into this slice.
   */
  mediaLimit?: number;
}

/**
 * Insert a unit's photo stage rows into a merged journey at their stage
 * timestamps (each row = newest photo in its bucket, photos as `media`).
 *
 * Pure + idempotent:
 *   • empty/absent photos → returns `events` unchanged (same reference);
 *   • photo rows whose id already exists in `events` are skipped, so merging
 *     twice (or over a feed that already carries `unit-photos-*` rows) never
 *     duplicates;
 *   • inputs are never mutated; result is sorted newest-first with the same
 *     time-then-id comparator as `mergeJourney`.
 */
export function mergeJourneyWithUnitPhotos(
  events: TimelineItem[],
  photos: UnitTimelinePhotoRow[] | null | undefined,
  opts: MergeJourneyPhotosOptions = {},
): TimelineItem[] {
  if (!photos || photos.length === 0) return events;

  const existing = new Set(events.map((e) => String(e.id)));
  let photoRows = unitPhotosToTimeline(photos).filter((r) => !existing.has(String(r.id)));
  if (photoRows.length === 0) return events;

  const limit = opts.mediaLimit;
  if (limit != null && limit > 0) {
    photoRows = photoRows.map((r) =>
      r.media && r.media.length > limit ? { ...r, media: r.media.slice(0, limit) } : r,
    );
  }

  const merged = [...events, ...photoRows];
  merged.sort((a, b) => {
    const ta = a.at ? new Date(a.at).getTime() : 0;
    const tb = b.at ? new Date(b.at).getTime() : 0;
    if (tb !== ta) return tb - ta;
    return String(b.id).localeCompare(String(a.id));
  });
  return merged;
}
