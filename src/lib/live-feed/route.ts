/**
 * `/operations/live-feed` — the Live feed. One module owns its path and URL
 * filters so the page, the APIs, the sidebar and the facets read the same
 * names. The page is the direction's Board (one column per lane); `status`
 * and `page` are API-only (one lane's pages, its Copy all). The date range
 * always applies: `from`/`to` default to the warehouse's today. Client-safe.
 */

import { getCurrentPSTDateKey, isDateKey } from '@/utils/date';
import {
  getLiveFeedStatus,
  isLiveFeedChannel,
  isLiveFeedLens,
  isLiveFeedStatusId,
  LIVE_FEED_DEFAULT_LENS,
  liveFeedLensesOf,
  liveFeedStatusInChannel,
  type LiveFeedChannel,
  type LiveFeedLens,
} from '@/lib/live-feed/statuses';
import type { LiveFeedDirection, LiveFeedFilters, LiveFeedStatusFilters } from '@/lib/live-feed/types';

export type { LiveFeedFilters, LiveFeedStatusFilters } from '@/lib/live-feed/types';

export const LIVE_FEED_PATH = '/operations/live-feed';
/** One lane, one server page (a Board column's expand past its cap). */
export const LIVE_FEED_API = '/api/live-feed';
/** Every lane of the direction, one capped column each. */
export const LIVE_FEED_BOARD_API = '/api/live-feed/board';
/** Every tracking number of the lane under the feed's filters (the Copy all), unpaged. */
export const LIVE_FEED_TRACKING_API = '/api/live-feed/tracking';

/** URL param names (the page URL, the API query and the facets read them). */
export const LIVE_FEED_PARAMS = {
  dir: 'dir',
  /** API only. */
  status: 'status',
  channel: 'channel',
  staff: 'staff',
  lens: 'lens',
  from: 'from',
  to: 'to',
  timeFrom: 'timeFrom',
  timeTo: 'timeTo',
  carrier: 'carrier',
  q: 'q',
  /** `1` = open lanes also list what entered them before `from` (lens `entered`). */
  carry: 'carry',
  /** API only. */
  page: 'page',
} as const;

export const LIVE_FEED_DIRECTIONS = ['outbound', 'inbound'] as const satisfies readonly LiveFeedDirection[];
/** Items per server page of one lane. */
export const LIVE_FEED_PAGE_SIZE = 100;

/** Items per Board column (late first); the column's count stays exact and its expand pages the lane. */
export const LIVE_FEED_BOARD_COLUMN_CAP = 50;
/** Top groups (carrier / staffer) per Board column; the rest are counted in `groupsMore`. */
export const LIVE_FEED_BOARD_GROUP_CAP = 3;

export const LIVE_FEED_CARRIER_MAX = 64;
export const LIVE_FEED_QUERY_MAX = 200;

/** `HH:mm`, 24-hour warehouse wall clock. */
export const LIVE_FEED_TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Raw filter values, before normalization — a URL's strings or the API's validated query. */
export type LiveFeedFilterInput = Partial<Record<keyof typeof LIVE_FEED_PARAMS, string | number | boolean | null>>;

/**
 * Raw values → filters. `dir` defaults to outbound; a missing status, or one
 * of the other direction or outside the channel pick, is the Board. A lens
 * the direction does not offer is `entered`. No day = today (`today`, the
 * warehouse day); one day given is a one-day range; a reversed range is
 * swapped (and, on one day, a reversed time span); a malformed day, time or
 * channel is none.
 */
export function normalizeLiveFeedFilters(input: LiveFeedFilterInput, today: string = getCurrentPSTDateKey()): LiveFeedFilters {
  const text = (value: string | number | boolean | null | undefined) => String(value ?? '').trim();
  const dir: LiveFeedDirection = text(input.dir).toLowerCase() === 'inbound' ? 'inbound' : 'outbound';
  const rawChannel = text(input.channel).toLowerCase();
  const channel: LiveFeedChannel | null = isLiveFeedChannel(rawChannel) ? rawChannel : null;
  const rawStatus = text(input.status);
  const status =
    isLiveFeedStatusId(rawStatus) &&
    getLiveFeedStatus(rawStatus).direction === dir &&
    liveFeedStatusInChannel(getLiveFeedStatus(rawStatus), channel)
      ? rawStatus
      : null;
  const rawLens = text(input.lens).toLowerCase();
  const lens: LiveFeedLens = isLiveFeedLens(rawLens) && liveFeedLensesOf(dir).includes(rawLens) ? rawLens : LIVE_FEED_DEFAULT_LENS;
  const rawFrom = text(input.from);
  const rawTo = text(input.to);
  const fromDay = isDateKey(rawFrom) ? rawFrom : null;
  const toDay = isDateKey(rawTo) ? rawTo : null;
  const from = fromDay ?? toDay ?? today;
  const to = toDay ?? fromDay ?? today;
  const reversed = from > to;
  const rawTimeFrom = text(input.timeFrom);
  const rawTimeTo = text(input.timeTo);
  const timeFrom = LIVE_FEED_TIME_RE.test(rawTimeFrom) ? rawTimeFrom : null;
  const timeTo = LIVE_FEED_TIME_RE.test(rawTimeTo) ? rawTimeTo : null;
  const timesReversed = from === to && timeFrom != null && timeTo != null && timeFrom > timeTo;
  const staff = Number(text(input.staff));
  const carrier = text(input.carrier).toUpperCase().slice(0, LIVE_FEED_CARRIER_MAX);
  const q = text(input.q).slice(0, LIVE_FEED_QUERY_MAX);
  const carry = ['1', 'true'].includes(text(input.carry).toLowerCase());
  const page = Number(text(input.page));
  return {
    dir,
    status,
    channel,
    staff: Number.isSafeInteger(staff) && staff > 0 ? staff : null,
    lens,
    from: reversed ? to : from,
    to: reversed ? from : to,
    timeFrom: timesReversed ? timeTo : timeFrom,
    timeTo: timesReversed ? timeFrom : timeTo,
    carrier: carrier || null,
    q: q || null,
    carry,
    page: status != null && Number.isSafeInteger(page) && page > 1 ? page : 1,
  };
}

/** URL → filters. */
export function readLiveFeedFilters(params: { get(name: string): string | null }, today?: string): LiveFeedFilters {
  const input: LiveFeedFilterInput = {};
  for (const [field, name] of Object.entries(LIVE_FEED_PARAMS) as Array<[keyof typeof LIVE_FEED_PARAMS, string]>) {
    input[field] = params.get(name);
  }
  return normalizeLiveFeedFilters(input, today);
}

/** The bare page (or a direction's bare Board): both channels, today by `entered`, nobody. */
export function defaultLiveFeedFilters(dir: LiveFeedDirection = 'outbound', today?: string): LiveFeedFilters {
  return normalizeLiveFeedFilters({ dir }, today);
}

/** Filters → query string. Defaults are omitted except the range, which is always explicit (it always applies). */
export function liveFeedSearchParams(filters: LiveFeedFilters): URLSearchParams {
  const p = LIVE_FEED_PARAMS;
  const params = new URLSearchParams();
  if (filters.dir !== 'outbound') params.set(p.dir, filters.dir);
  if (filters.status) params.set(p.status, filters.status);
  if (filters.channel) params.set(p.channel, filters.channel);
  if (filters.staff != null) params.set(p.staff, String(filters.staff));
  if (filters.lens !== LIVE_FEED_DEFAULT_LENS) params.set(p.lens, filters.lens);
  params.set(p.from, filters.from);
  params.set(p.to, filters.to);
  if (filters.timeFrom) params.set(p.timeFrom, filters.timeFrom);
  if (filters.timeTo) params.set(p.timeTo, filters.timeTo);
  if (filters.carrier) params.set(p.carrier, filters.carrier);
  if (filters.q) params.set(p.q, filters.q);
  if (filters.carry) params.set(p.carry, '1');
  if (filters.status && filters.page > 1) params.set(p.page, String(filters.page));
  return params;
}

function withQuery(path: string, params: URLSearchParams): string {
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}

/** The page: the Board's filters (no lane, no page). */
export function liveFeedHref(filters: LiveFeedFilters): string {
  return withQuery(LIVE_FEED_PATH, liveFeedSearchParams({ ...filters, status: null, page: 1 }));
}

/** One lane's server page. */
export function liveFeedApiHref(filters: LiveFeedStatusFilters): string {
  return withQuery(LIVE_FEED_API, liveFeedSearchParams(filters));
}

/** The Board read: the feed's filters with no lane and no page. */
export function liveFeedBoardHref(filters: LiveFeedFilters): string {
  return withQuery(LIVE_FEED_BOARD_API, liveFeedSearchParams({ ...filters, status: null, page: 1 }));
}

/** The Copy-all read of one lane: the feed's filters with no page. */
export function liveFeedTrackingHref(filters: LiveFeedStatusFilters): string {
  return withQuery(LIVE_FEED_TRACKING_API, liveFeedSearchParams({ ...filters, page: 1 }));
}
