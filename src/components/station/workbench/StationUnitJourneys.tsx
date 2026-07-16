'use client';

/**
 * Station-density unit journeys for {@link WorkspaceTimelineTab}.
 *
 * One {@link TimelineSection} / {@link EventTimeline} feed for the carton —
 * not N Operations-style {@link SerialJourneySection} embeds. Unit identity is
 * the emerald {@link SerialChip} (last-4 via CopyChip SoT) on each row.
 */

import { useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
import { Loader2 } from '@/components/Icons';
import { TimelineSection } from '@/components/ui/TimelineSection';
import { operationsJourneyFocusedQuery } from '@/lib/queries/operations-journey-queries';
import { serialJourneyFilters } from '@/lib/serial/serial-journey';
import { mergeStationUnitJourneys } from './merge-station-unit-journeys';

export function StationUnitJourneys({
  serials,
  loading: serialsLoading = false,
}: {
  serials: string[];
  loading?: boolean;
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

  const loading = serialsLoading || (list.length > 0 && queries.some((q) => q.isLoading));
  const failed = list.length > 0 && queries.every((q) => q.isError);

  const items = useMemo(
    () =>
      mergeStationUnitJourneys(
        list.map((serial, i) => ({
          serial,
          events: queries[i]?.data?.events ?? [],
        })),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- query data identity
    [list, queries.map((q) => q.dataUpdatedAt).join(',')],
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
      emptyMessage="No unit events yet."
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
