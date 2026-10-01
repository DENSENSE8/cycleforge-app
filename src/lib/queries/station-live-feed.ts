import { infiniteQueryOptions } from '@tanstack/react-query';
import {
  DEFAULT_STATION_FEED_FILTERS,
  STATION_FEED_DEFAULT_LIMIT,
  STATION_FEED_JOBS,
  STATION_FEED_OUTCOMES,
  STATION_FEED_SORTS,
  type StationFeedFilters,
  type StationFeedJob,
  type StationFeedOutcome,
  type StationFeedResponse,
  type StationFeedSort,
} from '@/lib/station-feed/types';

interface SearchReader {
  get(name: string): string | null;
  getAll?(name: string): string[];
}

function values(params: SearchReader, name: string): string[] {
  const repeated = params.getAll?.(name) ?? [];
  const source = repeated.length > 0 ? repeated : [params.get(name) ?? ''];
  return [...new Set(source.flatMap((value) => value.split(',')).map((value) => value.trim()).filter(Boolean))];
}

function enums<T extends string>(params: SearchReader, name: string, allowed: readonly T[]): T[] {
  return values(params, name).filter((value): value is T => allowed.includes(value as T));
}

function dateValue(value: string | null): string | null {
  const trimmed = String(value ?? '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : null;
}

/** URL-addressable filters only; pagination and realtime watermarks never enter cache identity. */
export function readStationLiveFilters(params: SearchReader): StationFeedFilters {
  const sort = enums<StationFeedSort>(params, 'sort', STATION_FEED_SORTS)[0] ?? DEFAULT_STATION_FEED_FILTERS.sort;
  return {
    staffIds: [],
    jobs: enums<StationFeedJob>(params, 'job', STATION_FEED_JOBS),
    outcomes: enums<StationFeedOutcome>(params, 'outcome', STATION_FEED_OUTCOMES),
    from: dateValue(params.get('from')),
    to: dateValue(params.get('to')),
    sort,
  };
}

function appendFilters(search: URLSearchParams, filters: StationFeedFilters): void {
  // Personal history never sends a staff id. The server binds the session.
  if (filters.jobs.length > 0) search.set('job', filters.jobs.join(','));
  if (filters.outcomes.length > 0) search.set('outcome', filters.outcomes.join(','));
  if (filters.from) search.set('from', filters.from);
  if (filters.to) search.set('to', filters.to);
  if (filters.sort !== 'newest') search.set('sort', filters.sort);
}

export function stationLiveFeedQueryKey(filters: StationFeedFilters) {
  const search = new URLSearchParams();
  appendFilters(search, filters);
  return ['station-live-feed', search.toString()] as const;
}

export interface StationLiveFetchPosition {
  before?: string | null;
  afterSalId?: number | null;
  afterOpsEventId?: number | null;
  afterMobileScanId?: number | null;
  limit?: number;
  /** Catch-up reads oldest-first even when the painted feed is newest-first. */
  sortOverride?: StationFeedSort;
}

export async function fetchStationLiveFeed(
  filters: StationFeedFilters,
  position: StationLiveFetchPosition = {},
): Promise<StationFeedResponse> {
  const search = new URLSearchParams();
  appendFilters(search, { ...filters, sort: position.sortOverride ?? filters.sort });
  search.set('limit', String(position.limit ?? STATION_FEED_DEFAULT_LIMIT));
  if (position.before) search.set('before', position.before);
  if (position.afterSalId != null) search.set('afterSalId', String(position.afterSalId));
  if (position.afterOpsEventId != null) search.set('afterOpsEventId', String(position.afterOpsEventId));
  if (position.afterMobileScanId != null) search.set('afterMobileScanId', String(position.afterMobileScanId));
  const response = await fetch(`/api/stations/live?${search}`, { cache: 'no-store', credentials: 'same-origin' });
  const body = await response.json().catch(() => null) as StationFeedResponse | { error?: string } | null;
  if (!response.ok || !body || !('items' in body)) {
    throw new Error(body && 'error' in body && body.error ? body.error : `Live feed failed (${response.status})`);
  }
  return body;
}

export function stationLiveFeedInfiniteQuery(filters: StationFeedFilters) {
  return infiniteQueryOptions({
    queryKey: stationLiveFeedQueryKey(filters),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => fetchStationLiveFeed(filters, { before: pageParam }),
    getNextPageParam: (lastPage) => lastPage.nextBefore ?? undefined,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });
}
