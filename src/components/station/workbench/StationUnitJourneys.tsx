'use client';

/**
 * Station-density unit journeys for {@link WorkspaceTimelineTab}.
 *
 * One {@link TimelineSection} / {@link EventTimeline} feed for the carton —
 * not N Operations-style {@link SerialJourneySection} embeds. Each serial's
 * stage photo rows (arrival / unbox / testing / packing) fold in as collapsed
 * per-stage thumb rows; a failed photo fetch degrades that serial to
 * events-only (never blocks the feed).
 *
 * Station anatomy (`metaTrail` + `refInline`):
 *   1. Primary — event outcome ("Tested — Fail")
 *   2. Secondary — SerialChip last-8 · clock · actor
 * Raw PREV → NEXT machine trails are omitted (duplicate the title dialect).
 *
 * The secondary line is EARNED BY THE CHIPS. A single-unit carton carries no
 * serial chip (nothing to disambiguate — see `mergeStationUnitJourneys`), so
 * those rows collapse to one line with the clock trailing the title. Two-line
 * is the multi-unit shape, not the default.
 */

import { useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
import { Loader2 } from '@/components/Icons';
import { TimelineSection } from '@/components/ui/TimelineSection';
import type { PhotoGalleryInput } from '@/components/shipped/photo-gallery/photo-gallery-utils';
import { operationsJourneyFocusedQuery } from '@/lib/queries/operations-journey-queries';
import { unitTimelinePhotosQuery } from '@/lib/timeline/journey-photos';
import { serialJourneyFilters } from '@/lib/serial/serial-journey';
import { mergeStationUnitJourneys } from './merge-station-unit-journeys';

export function StationUnitJourneys({
  serials,
  loading: serialsLoading = false,
  galleryPhotos,
  galleryMatchIds,
}: {
  serials: string[];
  loading?: boolean;
  /** Optional lightbox override (e.g. full carton/PO receiving photos). */
  galleryPhotos?: PhotoGalleryInput[];
  galleryMatchIds?: Array<number | null | undefined>;
}) {
  const list = useMemo(
    () => [...new Set(serials.map((s) => s.trim()).filter(Boolean))],
    // eslint-disable-next-line react-hooks/exhaustive-deps -- serialize list identity
    [JSON.stringify(serials)],
  );

  const queries = useQueries({
    queries: list.map((sn) => ({
      ...operationsJourneyFocusedQuery(serialJourneyFilters(sn)),
      enabled: sn.length > 0,
    })),
  });

  // Photo spine — per-serial unit ids come from the journey responses' entity
  // summaries (no extra resolve round-trip); unresolved ids keep the query
  // disabled. Shared cache key with the unit detail pane.
  const photoQueries = useQueries({
    queries: list.map((_, i) =>
      unitTimelinePhotosQuery(queries[i]?.data?.entity?.serialUnitIds?.[0] ?? null),
    ),
  });

  const loading = serialsLoading || (list.length > 0 && queries.some((q) => q.isLoading));
  const failed = list.length > 0 && queries.every((q) => q.isError);

  const items = useMemo(
    () =>
      mergeStationUnitJourneys(
        list.map((serial, i) => ({
          serial,
          events: queries[i]?.data?.events ?? [],
          photos: photoQueries[i]?.data?.photos,
        })),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- query data identity
    [
      list,
      queries.map((q) => q.dataUpdatedAt).join(','),
      photoQueries.map((q) => q.dataUpdatedAt).join(','),
    ],
  );

  if (serialsLoading && list.length === 0) {
    return (
      <div className="flex items-center gap-2 px-1 py-4 text-role-caption font-medium text-text-faint">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading serials…
      </div>
    );
  }

  if (!serialsLoading && list.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border-soft bg-surface-canvas px-4 py-6 text-center text-role-caption font-medium text-text-soft">
        No serialized units yet.
      </div>
    );
  }

  if (failed && items.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-rose-200 bg-rose-50 px-4 py-4 text-center text-role-caption text-rose-700">
        Could not load unit journeys.
      </div>
    );
  }

  const count = items.length;

  return (
    <TimelineSection
      title="Unit journeys"
      items={items}
      loading={loading}
      density="compact"
      metaTrail
      refInline
      emptyMessage="No unit events yet."
      galleryPhotos={galleryPhotos}
      galleryMatchIds={galleryMatchIds}
      headerRight={
        !loading && count > 0 ? (
          <span className="tabular-nums">
            {count.toLocaleString()} event{count === 1 ? '' : 's'}
          </span>
        ) : null
      }
      className="border-0 p-0"
    />
  );
}
