/**
 * Fulfillment › Fulfilled (`/fulfilled`) — the URL vocabulary the view's
 * sidebar controls write, its body reads, and its facet counts answer to.
 * Every filter is a URL param, so a view is a bookmarkable, shareable link.
 * Where Fulfilled asks what Records asks — Find, Sort, the date axis, the
 * platform, the carrier, the row grain — it uses the Records param and its
 * values (`src/lib/nav/records/params.ts`); the rest (packer, scan source,
 * the zoomed bucket, the board's toggles) is its own. A link written before
 * the collapse reads through {@link fulfilledLegacySearch}.
 */

import {
  RECORDS_AXIS_LABEL,
  RECORDS_AXIS_PARAM,
  RECORDS_DIR_PARAM,
  RECORDS_FIND_PARAM,
  RECORDS_FROM_PARAM,
  RECORDS_GRAIN_PARAM,
  RECORDS_SORTS,
  RECORDS_SORT_PARAM,
  RECORDS_TO_PARAM,
  type RecordsGrain,
  type RecordsSort,
} from '@/lib/nav/records/params';

/** Which date the window reads (the Records axes a shipped order has): when it left the dock, was delivered, was placed, or was due to ship. */
export const FULFILLED_AXIS_PARAM = RECORDS_AXIS_PARAM;
export const FULFILLED_AXES = ['shipped', 'delivered', 'placed', 'ship_by'] as const;
export type FulfilledAxis = (typeof FULFILLED_AXES)[number];
export const FULFILLED_DEFAULT_AXIS: FulfilledAxis = 'shipped';
export const FULFILLED_AXIS_LABEL: Readonly<Record<FulfilledAxis, string>> = {
  shipped: RECORDS_AXIS_LABEL.shipped,
  delivered: RECORDS_AXIS_LABEL.delivered,
  placed: RECORDS_AXIS_LABEL.placed,
  ship_by: RECORDS_AXIS_LABEL.ship_by,
};

/** The window on the axis (PT civil days, inclusive). Neither set = the last {@link FULFILLED_DEFAULT_WINDOW_DAYS} days. */
export const FULFILLED_FROM_PARAM = RECORDS_FROM_PARAM;
export const FULFILLED_TO_PARAM = RECORDS_TO_PARAM;
export const FULFILLED_DEFAULT_WINDOW_DAYS = 90;
export const FULFILLED_DEFAULT_WINDOW_LABEL = 'Last 90 days';

/** Platform (canonical `orders.account_source`) and carrier (upper-cased `UPS`, `FEDEX`, `USPS`, …) — the Records facets' params; packer (staff id) and scan source are Fulfilled's. */
export const FULFILLED_PLATFORM_PARAM = 'platform';
export const FULFILLED_CARRIER_PARAM = 'carrier';
export const FULFILLED_PACKER_PARAM = 'packer';
export const FULFILLED_SCAN_PARAM = 'scan';

/** How the order left the dock: a live scan-out, a backdated (backfill) one, or never scanned out (the channel says shipped). */
export const FULFILLED_SCANS = ['live', 'backfill', 'none'] as const;
export type FulfilledScan = (typeof FULFILLED_SCANS)[number];
export const FULFILLED_SCAN_LABEL: Readonly<Record<FulfilledScan, string>> = {
  live: 'Live',
  backfill: 'Backfill',
  none: 'Not scanned',
};

/** Sort — the Records sorts a shipped line can answer (no paste order, no inbound steps). */
export const FULFILLED_SORT_PARAM = RECORDS_SORT_PARAM;
export const FULFILLED_DIR_PARAM = RECORDS_DIR_PARAM;
const NOT_FULFILLED: Readonly<Partial<Record<RecordsSort, true>>> = { pasted: true, type: true, unboxed_by: true, received_by: true };
export const FULFILLED_SORTS = RECORDS_SORTS.filter((sort) => !NOT_FULFILLED[sort]);
/** The window's own date, newest first; a zoomed bucket reads worst first (`overdue`). */
export const FULFILLED_DEFAULT_SORT: RecordsSort = 'date';
export const FULFILLED_ZOOM_SORT: RecordsSort = 'overdue';

/** Row grain — the Records grain; Fulfilled reads orders unless told otherwise. */
export const FULFILLED_GRAIN_PARAM = RECORDS_GRAIN_PARAM;
export const FULFILLED_DEFAULT_GRAIN: RecordsGrain = 'order';

/**
 * Body layout: the JOURNEY BOARD (default — absent from the URL; one column per
 * bucket under Act now · Watch · Done) or the Records sheet (`sheet`).
 */
export const FULFILLED_LAYOUT_PARAM = 'layout';
export const FULFILLED_LAYOUTS = ['board', 'sheet'] as const;
export type FulfilledLayout = (typeof FULFILLED_LAYOUTS)[number];
export const FULFILLED_DEFAULT_LAYOUT: FulfilledLayout = 'board';
export const FULFILLED_LAYOUT_LABEL: Readonly<Record<FulfilledLayout, string>> = {
  board: 'Board',
  sheet: 'Sheet',
};

/** The page's layout: `sheet` when the URL says so, else the board. */
export function readFulfilledLayout(url: Pick<URLSearchParams, 'get'>): FulfilledLayout {
  return url.get(FULFILLED_LAYOUT_PARAM)?.trim().toLowerCase() === 'sheet' ? 'sheet' : FULFILLED_DEFAULT_LAYOUT;
}

/**
 * The board's display toggles (operator 2026-10-06) — sidebar rows, read by
 * the board alone, never sent to the API: hide the Done section's columns,
 * and cards grouped by carrier inside each column. Unset = the default
 * (shown · none).
 */
export const FULFILLED_DONE_PARAM = 'done';
export const FULFILLED_GROUP_PARAM = 'group';

/** Packed by me: `mine=me` narrows server-side to the viewer's own packs (the `packer` param, viewer's staff id). */
export const FULFILLED_MINE_PARAM = 'mine';
export const FULFILLED_MINE_VALUE = 'me';

export interface FulfilledBoardDisplay {
  hideDone: boolean;
  groupByCarrier: boolean;
}

/** The board's display toggles from the URL. */
export function readFulfilledBoardDisplay(url: Pick<URLSearchParams, 'get'>): FulfilledBoardDisplay {
  const is = (param: string, value: string) => url.get(param)?.trim().toLowerCase() === value;
  return {
    hideDone: is(FULFILLED_DONE_PARAM, 'hide'),
    groupByCarrier: is(FULFILLED_GROUP_PARAM, 'carrier'),
  };
}

/**
 * The one journey bucket the desk is narrowed to (`?col=<bucket>`, operator
 * 2026-10-06): a board column zoomed into, a sidebar view (Returned, Late, …)
 * or any other bucket picked in the Journey facet (the check-in family).
 * It paints as the Records sheet over that bucket's orders; absent = the
 * layout's own face.
 */
export const FULFILLED_COLUMN_PARAM = 'col';

/** The view's Find text — order #, tracking (last 8 too), SKU, title, customer; answered server-side. */
export const FULFILLED_FIND_PARAM = RECORDS_FIND_PARAM;

/** The filters only Fulfilled reads — what its saved views keep beside the sort. */
export const FULFILLED_ONLY_PARAMS = [
  FULFILLED_AXIS_PARAM,
  FULFILLED_FROM_PARAM,
  FULFILLED_TO_PARAM,
  FULFILLED_PLATFORM_PARAM,
  FULFILLED_CARRIER_PARAM,
  FULFILLED_PACKER_PARAM,
  FULFILLED_SCAN_PARAM,
  FULFILLED_GRAIN_PARAM,
  FULFILLED_LAYOUT_PARAM,
  FULFILLED_MINE_PARAM,
  FULFILLED_DONE_PARAM,
  FULFILLED_GROUP_PARAM,
  FULFILLED_COLUMN_PARAM,
] as const;

/**
 * The page URL (+ the view's Find text) → the `GET /api/nav/fulfilled` query
 * (the bucket, grain and the board's display toggles stay client-side: the
 * board and its zoom read one answer). A bucket with no sort named reads
 * worst first ({@link FULFILLED_ZOOM_SORT}) — the order the sheet's header
 * shows. `mine=me` sends the viewer's staff id as `packer` (an explicit
 * Packed by wins), so the list and the sidebar's facet counts narrow alike.
 */
export function fulfilledApiParams(url: Pick<URLSearchParams, 'get'>, find: string, viewerStaffId: number | null = null): URLSearchParams {
  const api = new URLSearchParams();
  for (const name of [
    FULFILLED_AXIS_PARAM,
    FULFILLED_FROM_PARAM,
    FULFILLED_TO_PARAM,
    FULFILLED_PLATFORM_PARAM,
    FULFILLED_CARRIER_PARAM,
    FULFILLED_PACKER_PARAM,
    FULFILLED_SCAN_PARAM,
  ]) {
    const value = url.get(name)?.trim();
    if (value) api.set(name, value);
  }
  if (!api.has(FULFILLED_PACKER_PARAM) && viewerStaffId != null && url.get(FULFILLED_MINE_PARAM)?.trim() === FULFILLED_MINE_VALUE) {
    api.set(FULFILLED_PACKER_PARAM, String(viewerStaffId));
  }
  // The API names its order `sort` / `dir` (`NavFulfilledQuery`).
  const sort = url.get(FULFILLED_SORT_PARAM)?.trim() || (url.get(FULFILLED_COLUMN_PARAM)?.trim() ? FULFILLED_ZOOM_SORT : '');
  const dir = url.get(FULFILLED_DIR_PARAM)?.trim();
  if (sort) api.set('sort', sort);
  if (dir) api.set('dir', dir);
  if (find.trim()) api.set(FULFILLED_FIND_PARAM, find.trim());
  return api;
}
