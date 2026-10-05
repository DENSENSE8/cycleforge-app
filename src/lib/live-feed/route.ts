/**
 * `/operations/live-feed` (desk) and `/m/live-feed` (phone) — the outbound
 * package triage board. One module owns the paths and the URL params so the
 * page, the APIs and the phone read the same names.
 *
 * The board is live and always reads TODAY (owner 2026-10-05: the Day / Week
 * window is retired): the open stages list everything still in the building,
 * Scanned out is what left today, and an open package that entered its stage
 * before today reads "from earlier". The server owns the day, so a board left
 * open past midnight rolls over on its next refresh. Client-safe.
 */

import { isPackageStage, type PackageStage } from '@/lib/live-feed/stages';

export const LIVE_FEED_PATH = '/operations/live-feed';
export const LIVE_FEED_MOBILE_PATH = '/m/live-feed';
/** Counts plus the first page of every stage. */
export const LIVE_FEED_BOARD_API = '/api/live-feed/board';
/** One stage, one page (a column's "load more"). */
export const LIVE_FEED_LANE_API = '/api/live-feed/lane';
/** Packages by find text (`q`) or by order row ids (`ids`) — inside the board's scope. */
export const LIVE_FEED_PACKAGES_API = '/api/live-feed/packages';

export const LIVE_FEED_PARAMS = {
  /** The open package's order row id. */
  open: 'open',
  /** Find: tracking, order number or SKU (the sidebar's NavFind on a desk). */
  q: 'q',
  /** Facets (comma-separated, NavFilters' multi encoding): `UPPER(BTRIM(carrier))` keys. */
  carrier: 'carrier',
  /** Facets: `LOWER(BTRIM(account_source))` keys. */
  channel: 'channel',
  /** Only packages this staffer is assigned to, picked or packed (`staff.id`). */
  staff: 'staff',
  /** API only. */
  stage: 'stage',
  /** API only. */
  offset: 'offset',
  /** API only: comma-separated order row ids. */
  ids: 'ids',
} as const;

/** Cards per stage page. */
export const LIVE_FEED_PAGE_SIZE = 25;

/** The board's record filters — the sidebar's carrier / channel facets and staff control (the phone's "Mine"). */
export interface LiveFeedFilters {
  carriers: string[] | null;
  channels: string[] | null;
  staffId: number | null;
}

interface ParamReader {
  get(name: string): string | null;
}

export function readLiveFeedOpen(params: ParamReader): number | null {
  const id = Number(params.get(LIVE_FEED_PARAMS.open));
  return Number.isInteger(id) && id > 0 ? id : null;
}

export function readLiveFeedStage(params: ParamReader): PackageStage | null {
  const raw = params.get(LIVE_FEED_PARAMS.stage);
  return isPackageStage(raw) ? raw : null;
}

function readKeys(params: ParamReader, name: string, normalize: (value: string) => string): string[] | null {
  const keys = [...new Set((params.get(name) ?? '').split(',').map((value) => normalize(value.trim())).filter(Boolean))];
  return keys.length > 0 ? keys : null;
}

export function readLiveFeedFilters(params: ParamReader): LiveFeedFilters {
  const staff = Number(params.get(LIVE_FEED_PARAMS.staff));
  return {
    carriers: readKeys(params, LIVE_FEED_PARAMS.carrier, (value) => value.toUpperCase()),
    channels: readKeys(params, LIVE_FEED_PARAMS.channel, (value) => value.toLowerCase()),
    staffId: Number.isInteger(staff) && staff > 0 ? staff : null,
  };
}

/** The filters as API query params (empty filters stay off). */
export function liveFeedFilterParams(filters: LiveFeedFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.carriers) params.set(LIVE_FEED_PARAMS.carrier, filters.carriers.join(','));
  if (filters.channels) params.set(LIVE_FEED_PARAMS.channel, filters.channels.join(','));
  if (filters.staffId != null) params.set(LIVE_FEED_PARAMS.staff, String(filters.staffId));
  return params;
}

export function readLiveFeedIds(params: ParamReader): number[] {
  return [
    ...new Set(
      (params.get(LIVE_FEED_PARAMS.ids) ?? '')
        .split(',')
        .map(Number)
        .filter((id) => Number.isInteger(id) && id > 0),
    ),
  ].slice(0, 50);
}
