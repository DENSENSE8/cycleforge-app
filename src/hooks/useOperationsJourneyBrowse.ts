'use client';

import { useMemo } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { mergeJourney, type JourneyEvent } from '@/lib/timeline/journey';
import type { OperationsTimelineUrlState } from '@/components/sidebar/operations/useOperationsTimelineUrlState';
import { operationsJourneyBrowseInfiniteQuery } from '@/lib/queries/operations-journey-queries';

/** Drives the Operations → History BROWSE region: */
export function useOperationsJourneyBrowse(
  url: OperationsTimelineUrlState,
  enabled: boolean,
) {
  const query = useInfiniteQuery({
    ...operationsJourneyBrowseInfiniteQuery(url.filters),
    enabled,
  });

  const events: JourneyEvent[] = useMemo(
    () => query.data?.pages.flatMap((p) => p.events) ?? [],
    [query.data],
  );

  const { items } = useMemo(() => mergeJourney(events), [events]);

  return {
    items,
    eventCount: items.length,
    isLoading: enabled && query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
    fetchNextPage: query.fetchNextPage,
    hasNextPage: query.hasNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
  };
}
