import { queryOptions } from '@tanstack/react-query';
import {
  LIVE_FEED_BOARD_API,
  LIVE_FEED_TRACKING_API,
  liveFeedApiHref,
  liveFeedBoardHref,
  liveFeedSearchParams,
  liveFeedTrackingHref,
} from '@/lib/live-feed/route';
import type {
  LiveFeedBoard,
  LiveFeedFilters,
  LiveFeedPage,
  LiveFeedStatusFilters,
  LiveFeedTracking,
} from '@/lib/live-feed/types';

/** Broad prefix — realtime invalidates every feed read (lists, Board, Copy all) at once. */
export const LIVE_FEED_QUERY_ROOT = ['live-feed'] as const;

/** A status list's filters as their canonical query string — one key per distinct read, the same string the API takes. */
export function liveFeedQueryKey(filters: LiveFeedStatusFilters) {
  return [...LIVE_FEED_QUERY_ROOT, liveFeedSearchParams(filters).toString()] as const;
}

/** The Board's key: its filters without status / page. */
export function liveFeedBoardQueryKey(filters: LiveFeedFilters) {
  return [...LIVE_FEED_QUERY_ROOT, LIVE_FEED_BOARD_API, liveFeedBoardHref(filters)] as const;
}

async function fetchJson<T>(href: string, what: string, signal: AbortSignal): Promise<T> {
  const res = await fetch(href, { signal, cache: 'no-store' });
  if (!res.ok) throw new Error(`${what} failed (${res.status})`);
  return (await res.json()) as T;
}

/** One status, one server page. */
export function liveFeedQuery(filters: LiveFeedStatusFilters) {
  return queryOptions({
    queryKey: liveFeedQueryKey(filters),
    queryFn: ({ signal }) => fetchJson<LiveFeedPage>(liveFeedApiHref(filters), 'Live feed', signal),
    staleTime: 15_000,
    placeholderData: (previous) => previous,
  });
}

/** Every status of the direction (and channel), one capped column each. */
export function liveFeedBoardQuery(filters: LiveFeedFilters) {
  return queryOptions({
    queryKey: liveFeedBoardQueryKey(filters),
    queryFn: ({ signal }) => fetchJson<LiveFeedBoard>(liveFeedBoardHref(filters), 'Live feed board', signal),
    staleTime: 15_000,
    placeholderData: (previous) => previous,
  });
}

/** Every tracking number of one status under the filters (unpaged) — a list's or a Board column's Copy all. */
export function liveFeedTrackingQuery(filters: LiveFeedStatusFilters) {
  const href = liveFeedTrackingHref(filters);
  return queryOptions({
    queryKey: [...LIVE_FEED_QUERY_ROOT, LIVE_FEED_TRACKING_API, href] as const,
    queryFn: ({ signal }) => fetchJson<LiveFeedTracking>(href, 'Live feed tracking', signal),
    staleTime: 15_000,
  });
}
