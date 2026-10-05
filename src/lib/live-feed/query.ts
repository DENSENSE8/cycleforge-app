/** The Live feed's client reads (TanStack Query). Client-safe. */

import { infiniteQueryOptions, queryOptions } from '@tanstack/react-query';
import {
  LIVE_FEED_BOARD_API,
  LIVE_FEED_LANE_API,
  LIVE_FEED_PACKAGES_API,
  LIVE_FEED_PAGE_SIZE,
  LIVE_FEED_PARAMS,
  liveFeedFilterParams,
  type LiveFeedFilters,
} from '@/lib/live-feed/route';
import type { PackageStage } from '@/lib/live-feed/stages';
import type { PackageBoard, PackageCard, PackageLanePage } from '@/lib/live-feed/types';

/** Broad prefix — a realtime event or a tag write refreshes every feed read at once. */
export const LIVE_FEED_QUERY_ROOT = ['live-feed'] as const;

async function fetchJson<T>(href: string, signal: AbortSignal): Promise<T> {
  const res = await fetch(href, { signal, cache: 'no-store' });
  if (!res.ok) throw new Error(`Live feed request failed (${res.status})`);
  return (await res.json()) as T;
}

/**
 * The board's key — the page seeds it on the server. Today is the server's,
 * so the key carries no day; it carries the sidebar filters' query string.
 */
export function liveFeedBoardQueryKey(filters: LiveFeedFilters) {
  return [...LIVE_FEED_QUERY_ROOT, 'board', liveFeedFilterParams(filters).toString()] as const;
}

/** Counts plus every stage's first page, the pace, carrier loads, pickups and facets. */
export function liveFeedBoardQuery(filters: LiveFeedFilters) {
  const query = liveFeedFilterParams(filters).toString();
  return queryOptions({
    queryKey: liveFeedBoardQueryKey(filters),
    queryFn: ({ signal }) => fetchJson<PackageBoard>(query ? `${LIVE_FEED_BOARD_API}?${query}` : LIVE_FEED_BOARD_API, signal),
    staleTime: 15_000,
    placeholderData: (previous) => previous,
  });
}

/** A stage's pages AFTER the board's first one — fetched only when the column asks for more. */
export function liveFeedLaneQuery(stage: PackageStage, filters: LiveFeedFilters) {
  const filterQuery = liveFeedFilterParams(filters).toString();
  return infiniteQueryOptions({
    queryKey: [...LIVE_FEED_QUERY_ROOT, 'lane', stage, filterQuery] as const,
    queryFn: ({ signal, pageParam }) => {
      const params = liveFeedFilterParams(filters);
      params.set(LIVE_FEED_PARAMS.stage, stage);
      params.set(LIVE_FEED_PARAMS.offset, String(pageParam));
      return fetchJson<PackageLanePage>(`${LIVE_FEED_LANE_API}?${params}`, signal);
    },
    initialPageParam: LIVE_FEED_PAGE_SIZE,
    getNextPageParam: (last) => (last.hasMore ? last.offset + LIVE_FEED_PAGE_SIZE : undefined),
    staleTime: 15_000,
  });
}

/** Find: the board's packages a scan / typed text names (tracking, order number, SKU). */
export function liveFeedFindQuery(q: string) {
  return queryOptions({
    queryKey: [...LIVE_FEED_QUERY_ROOT, 'find', q] as const,
    queryFn: ({ signal }) =>
      fetchJson<{ packages: PackageCard[] }>(`${LIVE_FEED_PACKAGES_API}?${new URLSearchParams({ [LIVE_FEED_PARAMS.q]: q })}`, signal),
    enabled: q.trim().length >= 3,
    staleTime: 15_000,
  });
}

/** Packages by order row id — a deep link or a box mate that is not on a loaded page. */
export function liveFeedPackagesQuery(ids: readonly number[]) {
  const key = [...ids].sort((a, b) => a - b).join(',');
  return queryOptions({
    queryKey: [...LIVE_FEED_QUERY_ROOT, 'packages', key] as const,
    queryFn: ({ signal }) =>
      fetchJson<{ packages: PackageCard[] }>(`${LIVE_FEED_PACKAGES_API}?${new URLSearchParams({ [LIVE_FEED_PARAMS.ids]: key })}`, signal),
    enabled: ids.length > 0,
    staleTime: 15_000,
  });
}
