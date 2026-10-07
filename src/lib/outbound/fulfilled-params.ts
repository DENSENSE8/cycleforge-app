/**
 * Fulfillment › Fulfilled (`/fulfilled`) — the URL vocabulary the view's
 * sidebar controls write, its body reads, and its facet counts answer to.
 * Every filter is a URL param, so a view is a bookmarkable, shareable link.
 * The body calls `GET /api/nav/fulfilled` with these mapped onto the API's
 * names (`fulfilledApiParams`); status (`?status=`) narrows the answer
 * client-side so the chips count the whole window. The twin of
 * `src/lib/receiving/purchases-params.ts`.
 */

import { ORDER_DATE_LABEL } from '@/lib/orders/order-dates';
import { GRID_COLUMN_DIR_PARAM, GRID_COLUMN_SORT_PARAM } from '@/lib/tables/grid-column-sort-params';

/**
 * Which date the window reads: when it left the dock, was delivered, was placed, or was due to ship.
 * `ordered` reads Placed, else Imported (`placedElseImportedSql`) — labelled Placed.
 */
export const FULFILLED_AXIS_PARAM = 'axis';
export const FULFILLED_AXES = ['shipped', 'delivered', 'ordered', 'shipBy'] as const;
export type FulfilledAxis = (typeof FULFILLED_AXES)[number];
export const FULFILLED_DEFAULT_AXIS: FulfilledAxis = 'shipped';
export const FULFILLED_AXIS_LABEL: Readonly<Record<FulfilledAxis, string>> = {
  shipped: 'Shipped',
  delivered: 'Delivered',
  ordered: ORDER_DATE_LABEL.placed,
  shipBy: 'Ship-by',
};

/** The window on the axis (PT civil days, inclusive). Neither set = the last {@link FULFILLED_DEFAULT_WINDOW_DAYS} days. */
export const FULFILLED_FROM_PARAM = 'from';
export const FULFILLED_TO_PARAM = 'to';
export const FULFILLED_DEFAULT_WINDOW_DAYS = 90;
export const FULFILLED_DEFAULT_WINDOW_LABEL = 'Last 90 days';

/** Channel (lower-cased `orders.account_source`), carrier (upper-cased `UPS`, `FEDEX`, `USPS`, …), packer (staff id), scan source. */
export const FULFILLED_CHANNEL_PARAM = 'channel';
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

/** The sidebar's Sort row — the house column-sort params, mapped to the API's `sort` / `dir`. */
export const FULFILLED_SORT_PARAM = GRID_COLUMN_SORT_PARAM;
export const FULFILLED_DIR_PARAM = GRID_COLUMN_DIR_PARAM;
export const FULFILLED_SORTS = [
  'shipped',
  'delivered',
  'ordered',
  'shipBy',
  'order',
  'channel',
  'carrier',
  'status',
  'packer',
  'item',
  'lastEvent',
] as const;
export type FulfilledSort = (typeof FULFILLED_SORTS)[number];
export const FULFILLED_DEFAULT_SORT: FulfilledSort = 'shipped';
export const FULFILLED_SORT_LABEL: Readonly<Record<FulfilledSort, string>> = {
  shipped: 'Shipped',
  delivered: 'Delivered',
  ordered: ORDER_DATE_LABEL.placed,
  shipBy: 'Ship-by',
  order: 'Order #',
  channel: 'Platform',
  carrier: 'Carrier',
  status: 'Status',
  packer: 'Packer',
  item: 'Item',
  lastEvent: 'Last event',
};

/** The status chips (a `FULFILLED_BUCKETS` id) — narrows client-side. */
export const FULFILLED_STATUS_PARAM = 'status';

/** Row grain: one row per channel order number (lines combined) or one per order line. A body layout toggle. */
export const FULFILLED_GRAIN_PARAM = 'grain';
export const FULFILLED_GRAINS = ['order', 'line'] as const;
export type FulfilledGrain = (typeof FULFILLED_GRAINS)[number];
export const FULFILLED_DEFAULT_GRAIN: FulfilledGrain = 'order';
export const FULFILLED_GRAIN_LABEL: Readonly<Record<FulfilledGrain, string>> = {
  order: 'Orders',
  line: 'Lines',
};

/**
 * Body layout: the JOURNEY BOARD (default — absent from the URL; one column per
 * bucket under Act now · Watch · Done) or the sheet (`sheet`). A body layout
 * toggle beside the grain. The board always reads order grain and paints no
 * status chip (choosing it drops `status`).
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
 * hide the Untracked column, compact cards, and cards grouped by carrier
 * inside each column. Unset = the default (shown · shown · full · none).
 */
export const FULFILLED_DONE_PARAM = 'done';
export const FULFILLED_UNTRACKED_PARAM = 'untracked';
export const FULFILLED_CARDS_PARAM = 'cards';
export const FULFILLED_GROUP_PARAM = 'group';

/** Packed by me: `mine=me` narrows server-side to the viewer's own packs (the `packer` param, viewer's staff id). */
export const FULFILLED_MINE_PARAM = 'mine';
export const FULFILLED_MINE_VALUE = 'me';

export interface FulfilledBoardDisplay {
  hideDone: boolean;
  hideUntracked: boolean;
  compact: boolean;
  groupByCarrier: boolean;
}

/** The board's display toggles from the URL. */
export function readFulfilledBoardDisplay(url: Pick<URLSearchParams, 'get'>): FulfilledBoardDisplay {
  const is = (param: string, value: string) => url.get(param)?.trim().toLowerCase() === value;
  return {
    hideDone: is(FULFILLED_DONE_PARAM, 'hide'),
    hideUntracked: is(FULFILLED_UNTRACKED_PARAM, 'hide'),
    compact: is(FULFILLED_CARDS_PARAM, 'compact'),
    groupByCarrier: is(FULFILLED_GROUP_PARAM, 'carrier'),
  };
}

/** The view's Find text — order #, tracking (last 8 too), SKU, title, customer; answered server-side. */
export const FULFILLED_FIND_PARAM = 'q';

/** The filters only Fulfilled reads — what its saved views keep beside the sort and status chip. */
export const FULFILLED_ONLY_PARAMS = [
  FULFILLED_AXIS_PARAM,
  FULFILLED_FROM_PARAM,
  FULFILLED_TO_PARAM,
  FULFILLED_CHANNEL_PARAM,
  FULFILLED_CARRIER_PARAM,
  FULFILLED_PACKER_PARAM,
  FULFILLED_SCAN_PARAM,
  FULFILLED_GRAIN_PARAM,
  FULFILLED_LAYOUT_PARAM,
  FULFILLED_MINE_PARAM,
  FULFILLED_DONE_PARAM,
  FULFILLED_UNTRACKED_PARAM,
  FULFILLED_CARDS_PARAM,
  FULFILLED_GROUP_PARAM,
] as const;

/**
 * The page URL (+ the view's Find text) → the `GET /api/nav/fulfilled` query
 * (status and the board's display toggles stay client-side). The board reads
 * order grain whatever `grain` says, so only the sheet sends it. `mine=me`
 * sends the viewer's staff id as `packer` (an explicit Packed by wins), so
 * the list and the sidebar's facet counts narrow alike.
 */
export function fulfilledApiParams(url: Pick<URLSearchParams, 'get'>, find: string, viewerStaffId: number | null = null): URLSearchParams {
  const api = new URLSearchParams();
  const copy: ReadonlyArray<readonly [string, string]> = [
    [FULFILLED_AXIS_PARAM, 'axis'],
    [FULFILLED_FROM_PARAM, 'from'],
    [FULFILLED_TO_PARAM, 'to'],
    [FULFILLED_CHANNEL_PARAM, 'channel'],
    [FULFILLED_CARRIER_PARAM, 'carrier'],
    [FULFILLED_PACKER_PARAM, 'packer'],
    [FULFILLED_SCAN_PARAM, 'scan'],
    [FULFILLED_SORT_PARAM, 'sort'],
    [FULFILLED_DIR_PARAM, 'dir'],
  ];
  for (const [from, to] of copy) {
    const value = url.get(from)?.trim();
    if (value) api.set(to, value);
  }
  if (!api.has('packer') && viewerStaffId != null && url.get(FULFILLED_MINE_PARAM)?.trim() === FULFILLED_MINE_VALUE) {
    api.set('packer', String(viewerStaffId));
  }
  if (readFulfilledLayout(url) === 'sheet') {
    const grain = url.get(FULFILLED_GRAIN_PARAM)?.trim();
    if (grain) api.set('grain', grain);
  }
  if (find.trim()) api.set('q', find.trim());
  return api;
}
