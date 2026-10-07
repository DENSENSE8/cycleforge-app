/**
 * Receiving › Purchasing (`/purchasing`) — the URL vocabulary
 * the view's sidebar controls write, its body reads, and its facet counts
 * answer to. Every filter is a URL param, so a view is a bookmarkable,
 * shareable link. The body calls `GET /api/nav/purchases` with these mapped
 * onto the API's names (`purchasesApiParams`); status (`?recon=`) narrows the
 * answer client-side so the chips count the whole window.
 */

import { RECON_PARAM } from '@/lib/receiving/reconcile';
import { GRID_COLUMN_DIR_PARAM, GRID_COLUMN_SORT_PARAM } from '@/lib/tables/grid-column-sort-params';

/** Which date the window reads: when it was ordered, delivered or unboxed. */
export const PURCHASES_AXIS_PARAM = 'axis';
export const PURCHASES_AXES = ['ordered', 'delivered', 'unboxed'] as const;
export type PurchasesAxis = (typeof PURCHASES_AXES)[number];
export const PURCHASES_DEFAULT_AXIS: PurchasesAxis = 'ordered';
export const PURCHASES_AXIS_LABEL: Readonly<Record<PurchasesAxis, string>> = {
  ordered: 'Ordered',
  delivered: 'Delivered',
  unboxed: 'Unboxed',
};

/** The window on the axis (civil days, inclusive). Neither set = the last 90 days. */
export const PURCHASES_FROM_PARAM = 'from';
export const PURCHASES_TO_PARAM = 'to';
export const PURCHASES_DEFAULT_WINDOW_LABEL = 'Last 90 days';

/** Purchasing source (`INBOUND_SOURCE_OPTIONS` values), vendor name, who unboxed (staff id). */
export const PURCHASES_SOURCE_PARAM = 'source';
export const PURCHASES_VENDOR_PARAM = 'vendor';
export const PURCHASES_UNBOXED_BY_PARAM = 'unboxedBy';

/** The sidebar's Sort row and the sheet's header clicks — the house column-sort params, mapped to the API's `sort` / `dir`. */
export const PURCHASES_SORT_PARAM = GRID_COLUMN_SORT_PARAM;
export const PURCHASES_DIR_PARAM = GRID_COLUMN_DIR_PARAM;
export const PURCHASES_SORTS = ['ordered', 'imported', 'delivered', 'unboxed', 'waiting', 'po', 'vendor', 'product', 'status', 'units'] as const;
export type PurchasesSort = (typeof PURCHASES_SORTS)[number];
export const PURCHASES_DEFAULT_SORT: PurchasesSort = 'ordered';
/** Each sort's direction when `dir` is absent — the server's order and the header's arrow read the same one. */
export const PURCHASES_SORT_DIR: Readonly<Record<PurchasesSort, 'asc' | 'desc'>> = {
  ordered: 'desc',
  imported: 'desc',
  delivered: 'desc',
  unboxed: 'desc',
  waiting: 'asc',
  po: 'asc',
  vendor: 'asc',
  product: 'asc',
  status: 'asc',
  units: 'desc',
};

/** The page URL's sort → the one the query runs (an unknown value is the default) and its direction. */
export function readPurchasesSort(url: Pick<URLSearchParams, 'get'>): { sort: PurchasesSort; dir: 'asc' | 'desc' } {
  const raw = url.get(PURCHASES_SORT_PARAM)?.trim() ?? '';
  const sort = (PURCHASES_SORTS as readonly string[]).includes(raw) ? (raw as PurchasesSort) : PURCHASES_DEFAULT_SORT;
  const dir = url.get(PURCHASES_DIR_PARAM)?.trim();
  return { sort, dir: dir === 'asc' || dir === 'desc' ? dir : PURCHASES_SORT_DIR[sort] };
}

/** The status chips (a bucket id) — the Incoming pasted list's own param. */
export const PURCHASES_STATUS_PARAM = RECON_PARAM;

/** The filters only Purchasing reads — what its saved views keep beside the sort and status chip. */
export const PURCHASES_ONLY_PARAMS = [
  PURCHASES_AXIS_PARAM,
  PURCHASES_FROM_PARAM,
  PURCHASES_TO_PARAM,
  PURCHASES_SOURCE_PARAM,
  PURCHASES_VENDOR_PARAM,
  PURCHASES_UNBOXED_BY_PARAM,
] as const;

/** The page URL (+ the view's Find text) → the `GET /api/nav/purchases` query (status stays client-side). */
export function purchasesApiParams(url: Pick<URLSearchParams, 'get'>, find: string): URLSearchParams {
  const api = new URLSearchParams();
  const copy: ReadonlyArray<readonly [string, string]> = [
    [PURCHASES_AXIS_PARAM, 'axis'],
    [PURCHASES_FROM_PARAM, 'from'],
    [PURCHASES_TO_PARAM, 'to'],
    [PURCHASES_SOURCE_PARAM, 'source'],
    [PURCHASES_VENDOR_PARAM, 'vendor'],
    [PURCHASES_UNBOXED_BY_PARAM, 'unboxedBy'],
  ];
  for (const [from, to] of copy) {
    const value = url.get(from)?.trim();
    if (value) api.set(to, value);
  }
  // The sort the header paints — a stale / foreign `colsort` reads as the default, never a 400.
  const { sort, dir } = readPurchasesSort(url);
  api.set('sort', sort);
  api.set('dir', dir);
  if (find.trim()) api.set('find', find.trim());
  return api;
}
