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

import {
  isPackageStage,
  PACKAGE_STAGE_SORTS,
  PACKAGE_STAGES,
  type PackageSort,
  type PackageStage,
} from '@/lib/live-feed/stages';

export const LIVE_FEED_PATH = '/operations/live-feed';
export const LIVE_FEED_MOBILE_PATH = '/m/live-feed';
/** Counts plus the first page of every stage. */
export const LIVE_FEED_BOARD_API = '/api/live-feed/board';
/** One stage, one page (a column's "load more"). */
export const LIVE_FEED_LANE_API = '/api/live-feed/lane';
/** Packages by find text (`q`) or by order row ids (`ids`) — inside the board's scope. */
export const LIVE_FEED_PACKAGES_API = '/api/live-feed/packages';
/** Flag cards with a reason (`POST`) / clear (`DELETE`) — `live_feed_flags`. */
export const LIVE_FEED_FLAGS_API = '/api/live-feed/flags';
/** Remove unlinked cards from the list (`POST`) / put back (`DELETE`) — `live_feed_dismissals`. */
export const LIVE_FEED_DISMISSALS_API = '/api/live-feed/dismissals';
/** Pair an unlinked card to an order (backfill). */
export const LIVE_FEED_PAIR_API = '/api/live-feed/pair';

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
  /** Facets: the documents an order still owes — `label`, `slip`, `paperwork` (`LIVE_FEED_DOCS_OWED`). Order cards only. */
  docs: 'docs',
  /** Facets: active flag reasons (`live_feed_flags`, `LIVE_FEED_FLAG_REASONS`). */
  flag: 'flag',
  /** Column order, non-defaults only: `to_pick:latest,scanned_out:oldest` (`PACKAGE_STAGE_SORTS`). */
  sort: 'sort',
  /** API only. */
  stage: 'stage',
  /** API only. */
  offset: 'offset',
  /** API only: comma-separated order row ids. */
  ids: 'ids',
} as const;

/** Cards per stage page. */
export const LIVE_FEED_PAGE_SIZE = 25;

/** A document an order can still owe — the docs popover's three tabs. */
export const LIVE_FEED_DOCS_OWED = ['label', 'slip', 'paperwork'] as const;
export type LiveFeedDocOwed = (typeof LIVE_FEED_DOCS_OWED)[number];

export const LIVE_FEED_DOCS_OWED_LABEL: Record<LiveFeedDocOwed, string> = {
  label: 'Owes shipping label',
  slip: 'Owes packing slip',
  paperwork: 'Owes product paperwork',
};

/** The board's record filters — the sidebar's carrier / channel / documents / flag facets and staff control (the phone's "Mine") — and each column's chosen order. */
export interface LiveFeedFilters {
  carriers: string[] | null;
  channels: string[] | null;
  /** Owes any of these documents (OR). */
  docs: LiveFeedDocOwed[] | null;
  /** Holds any of these active flag reasons (OR). */
  flags: string[] | null;
  staffId: number | null;
  /** Columns whose order is NOT their default; `resolvePackageSorts` fills the rest. */
  sorts: Partial<Record<PackageStage, PackageSort>> | null;
}

interface ParamReader {
  get(name: string): string | null;
}

/** A card id: an `orders.id` (positive) or an unlinked scan-out's synthetic id (negative, `load.ts`). */
const isCardId = (id: number): boolean => Number.isSafeInteger(id) && id !== 0;

export function readLiveFeedOpen(params: ParamReader): number | null {
  const id = Number(params.get(LIVE_FEED_PARAMS.open));
  return isCardId(id) ? id : null;
}

export function readLiveFeedStage(params: ParamReader): PackageStage | null {
  const raw = params.get(LIVE_FEED_PARAMS.stage);
  return isPackageStage(raw) ? raw : null;
}

function readKeys(params: ParamReader, name: string, normalize: (value: string) => string): string[] | null {
  const keys = [...new Set((params.get(name) ?? '').split(',').map((value) => normalize(value.trim())).filter(Boolean))];
  return keys.length > 0 ? keys : null;
}

/** `to_pick:latest,…` → the valid non-default choices (a column's default is never written). */
function readSorts(params: ParamReader): Partial<Record<PackageStage, PackageSort>> | null {
  const sorts: Partial<Record<PackageStage, PackageSort>> = {};
  for (const pair of (params.get(LIVE_FEED_PARAMS.sort) ?? '').split(',')) {
    const [stage, sort] = pair.trim().split(':');
    if (!isPackageStage(stage)) continue;
    const choices = PACKAGE_STAGE_SORTS[stage];
    if (choices.includes(sort as PackageSort) && sort !== choices[0]) sorts[stage] = sort as PackageSort;
  }
  return Object.keys(sorts).length > 0 ? sorts : null;
}

export function readLiveFeedFilters(params: ParamReader): LiveFeedFilters {
  const staff = Number(params.get(LIVE_FEED_PARAMS.staff));
  const docs = readKeys(params, LIVE_FEED_PARAMS.docs, (value) => value.toLowerCase())?.filter((value): value is LiveFeedDocOwed =>
    (LIVE_FEED_DOCS_OWED as readonly string[]).includes(value),
  );
  const flags = readKeys(params, LIVE_FEED_PARAMS.flag, (value) => value.toLowerCase())?.filter((value) => /^[a-z][a-z0-9_]{1,39}$/.test(value));
  return {
    carriers: readKeys(params, LIVE_FEED_PARAMS.carrier, (value) => value.toUpperCase()),
    channels: readKeys(params, LIVE_FEED_PARAMS.channel, (value) => value.toLowerCase()),
    docs: docs?.length ? docs : null,
    flags: flags?.length ? flags : null,
    staffId: Number.isInteger(staff) && staff > 0 ? staff : null,
    sorts: readSorts(params),
  };
}

/** The column orders as the `sort` param value, pipeline order, defaults dropped; `null` when every column is on its default. */
export function liveFeedSortParam(sorts: Partial<Record<PackageStage, PackageSort>> | null): string | null {
  const pairs = PACKAGE_STAGES.flatMap((stage) => {
    const sort = sorts?.[stage];
    return sort && sort !== PACKAGE_STAGE_SORTS[stage][0] && PACKAGE_STAGE_SORTS[stage].includes(sort) ? [`${stage}:${sort}`] : [];
  });
  return pairs.length > 0 ? pairs.join(',') : null;
}

/** The filters as API query params (empty filters and default orders stay off). */
export function liveFeedFilterParams(filters: LiveFeedFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.carriers) params.set(LIVE_FEED_PARAMS.carrier, filters.carriers.join(','));
  if (filters.channels) params.set(LIVE_FEED_PARAMS.channel, filters.channels.join(','));
  if (filters.docs) params.set(LIVE_FEED_PARAMS.docs, filters.docs.join(','));
  if (filters.flags) params.set(LIVE_FEED_PARAMS.flag, filters.flags.join(','));
  if (filters.staffId != null) params.set(LIVE_FEED_PARAMS.staff, String(filters.staffId));
  const sort = liveFeedSortParam(filters.sorts);
  if (sort) params.set(LIVE_FEED_PARAMS.sort, sort);
  return params;
}

export function readLiveFeedIds(params: ParamReader): number[] {
  return [
    ...new Set(
      (params.get(LIVE_FEED_PARAMS.ids) ?? '')
        .split(',')
        .map(Number)
        .filter(isCardId),
    ),
  ].slice(0, 50);
}
