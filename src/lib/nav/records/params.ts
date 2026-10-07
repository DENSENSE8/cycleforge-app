/**
 * The Records sheet (`/records`, docs/refactors/records/PROMPT-records-sheet.md
 * §Phase 2) — the URL vocabulary its sidebar controls write, its body reads
 * and its facet counts answer to. Client-safe; the server's read
 * (`GET /api/nav/records`, `src/lib/nav/records/service.ts`) parses the SAME
 * params through {@link readRecordsQuery}, so rows and counts never disagree.
 *
 * One row = one LINE (an `orders` row outbound, a `receiving_line` inbound).
 * Grain (line · order · item number · product) only groups those rows on the
 * client and sets the scope a bulk action applies to; counts are of lines.
 *
 * Every facet has an include param and an exclude param (`x<param>`), the
 * NavFilters include/exclude switch (`NavFacetGroupDecl.excludeParam`).
 */

import { GRID_COLUMN_DIR_PARAM, GRID_COLUMN_SORT_PARAM } from '@/lib/tables/grid-column-sort-params';

type ParamReader = Pick<URLSearchParams, 'get'>;

/** Find (the sidebar NavFind) and the pasted list (`parseRefInParam` shape: the operator's strings, comma-joined). */
export const RECORDS_FIND_PARAM = 'q';
export const RECORDS_REFS_PARAM = 'refs';

/** Grain — how rows group and what a bulk action touches. */
export const RECORDS_GRAIN_PARAM = 'grain';
export const RECORDS_GRAINS = ['line', 'order', 'item', 'product'] as const;
export type RecordsGrain = (typeof RECORDS_GRAINS)[number];
export const RECORDS_DEFAULT_GRAIN: RecordsGrain = 'line';
export const RECORDS_GRAIN_LABEL: Readonly<Record<RecordsGrain, string>> = {
  line: 'Per line',
  order: 'Per order',
  item: 'Per item number',
  product: 'Per product',
};

/** Date axis + window (civil days, PT, inclusive). Neither end set = the last 30 days; a pasted list has no window. */
export const RECORDS_AXIS_PARAM = 'axis';
export const RECORDS_AXES = ['placed', 'imported', 'ship_by', 'shipped', 'delivered'] as const;
export type RecordsAxis = (typeof RECORDS_AXES)[number];
export const RECORDS_DEFAULT_AXIS: RecordsAxis = 'placed';
export const RECORDS_AXIS_LABEL: Readonly<Record<RecordsAxis, string>> = {
  placed: 'Placed',
  imported: 'Imported',
  ship_by: 'Ship by',
  shipped: 'Shipped',
  delivered: 'Delivered',
};
export const RECORDS_FROM_PARAM = 'from';
export const RECORDS_TO_PARAM = 'to';
export const RECORDS_DEFAULT_WINDOW_DAYS = 30;
export const RECORDS_DEFAULT_WINDOW_LABEL = 'Last 30 days';

/** Who did what, when: the event, the staffer (staff id) and its own day window. */
export const RECORDS_EVENT_PARAM = 'event';
export const RECORDS_EVENTS = ['picked', 'packed', 'scanned_out', 'unboxed', 'received', 'imported'] as const;
export type RecordsEvent = (typeof RECORDS_EVENTS)[number];
export const RECORDS_EVENT_LABEL: Readonly<Record<RecordsEvent, string>> = {
  picked: 'Picked',
  packed: 'Packed',
  scanned_out: 'Scanned out',
  unboxed: 'Unboxed',
  received: 'Received',
  imported: 'Imported',
};
export const RECORDS_EVENT_BY_PARAM = 'by';
export const RECORDS_EVENT_FROM_PARAM = 'efrom';
export const RECORDS_EVENT_TO_PARAM = 'eto';

/** Sort — the sidebar's Sort row and the header clicks (the house column-sort params). */
export const RECORDS_SORT_PARAM = GRID_COLUMN_SORT_PARAM;
export const RECORDS_DIR_PARAM = GRID_COLUMN_DIR_PARAM;
/** The views' orders — the sidebar's own words for the ways a list is worked. */
const RECORDS_VIEW_SORTS = ['pasted', 'internal', 'external', 'date', 'staff', 'platform', 'party', 'price', 'overdue'] as const;
/**
 * One sort per remaining column, so every header sorts (operator 2026-10-07).
 * Each reads the same value the column paints; staff columns sort by name.
 */
export const RECORDS_COLUMN_SORTS = [
  'order',
  'tracking',
  'type',
  'item',
  'sku',
  'qty',
  'unit',
  'order_total',
  'placed',
  'imported',
  'ship_by',
  'picked_by',
  'packed_by',
  'scanned_out_by',
  'unboxed_by',
  'received_by',
  'carrier',
  'service',
  'eta',
  'last_event',
] as const;
export type RecordsColumnSort = (typeof RECORDS_COLUMN_SORTS)[number];
export const RECORDS_SORTS = [...RECORDS_VIEW_SORTS, ...RECORDS_COLUMN_SORTS] as const;
export type RecordsSort = (typeof RECORDS_SORTS)[number];
export const RECORDS_SORT_LABEL: Readonly<Record<RecordsSort, string>> = {
  pasted: 'As pasted',
  internal: 'Internal status',
  external: 'External status',
  date: 'Date, newest first',
  staff: 'Staff, A to Z',
  platform: 'Platform, A to Z',
  party: 'Buyer / vendor, A to Z',
  price: 'Price, highest first',
  overdue: 'Most over its time limit first',
  order: 'Order number',
  tracking: 'Tracking',
  type: 'Type',
  item: 'Item, A to Z',
  sku: 'SKU, A to Z',
  qty: 'Quantity, most first',
  unit: 'Unit price, highest first',
  order_total: 'Order total, highest first',
  placed: 'Placed, newest first',
  imported: 'Imported, newest first',
  ship_by: 'Ship by, soonest first',
  picked_by: 'Picked by',
  packed_by: 'Packed by',
  scanned_out_by: 'Scanned out by',
  unboxed_by: 'Unboxed by',
  received_by: 'Received by',
  carrier: 'Carrier',
  service: 'Carrier service',
  eta: 'Estimated delivery, soonest first',
  last_event: 'Last carrier event, newest first',
};
/** Each sort's direction when `dir` is absent. */
export const RECORDS_SORT_DIR: Readonly<Record<RecordsSort, 'asc' | 'desc'>> = {
  pasted: 'asc',
  internal: 'asc',
  external: 'asc',
  date: 'desc',
  staff: 'asc',
  platform: 'asc',
  party: 'asc',
  price: 'desc',
  overdue: 'desc',
  order: 'asc',
  tracking: 'asc',
  type: 'asc',
  item: 'asc',
  sku: 'asc',
  qty: 'desc',
  unit: 'desc',
  order_total: 'desc',
  placed: 'desc',
  imported: 'desc',
  ship_by: 'asc',
  picked_by: 'asc',
  packed_by: 'asc',
  scanned_out_by: 'asc',
  unboxed_by: 'asc',
  received_by: 'asc',
  carrier: 'asc',
  service: 'asc',
  eta: 'asc',
  last_event: 'desc',
};

/** Price bands — the Price facet (include / exclude, counted). Bounds in dollars on the LINE total, [min, max). */
export const RECORDS_PRICE_BANDS = [
  { value: 'p0', label: 'Under $25', min: 0, max: 25 },
  { value: 'p25', label: '$25 – $100', min: 25, max: 100 },
  { value: 'p100', label: '$100 – $500', min: 100, max: 500 },
  { value: 'p500', label: '$500 and up', min: 500, max: null },
  { value: 'none', label: 'No price', min: null, max: null },
] as const;
export type RecordsPriceBand = (typeof RECORDS_PRICE_BANDS)[number]['value'];

/** Flags — the Flags facet. `mine` = assigned to the viewer. */
export const RECORDS_FLAGS = ['late', 'exception', 'no_tracking', 'duplicate', 'has_note', 'mine'] as const;
export type RecordsFlag = (typeof RECORDS_FLAGS)[number];
export const RECORDS_FLAG_LABEL: Readonly<Record<RecordsFlag, string>> = {
  late: 'Late',
  exception: 'Exception',
  no_tracking: 'No tracking',
  duplicate: 'Duplicate',
  has_note: 'Has note',
  mine: 'Assigned to me',
};

export const RECORDS_TYPES = ['outbound', 'inbound'] as const;
export type RecordsType = (typeof RECORDS_TYPES)[number];

/**
 * The counted facets, in sidebar order. `param` includes (comma list, any
 * of), `excludeParam` excludes. Values: type = {@link RECORDS_TYPES};
 * internal = the record-status internal keys (`OUTBOUND_INTERNAL_STATUSES` ∪
 * `INBOUND_INTERNAL_STATUSES`); external = `CARRIER_STATUSES` ∪ `none`;
 * platform = canonical `account_source` (outbound) / inbound source;
 * carrier = upper carrier code; price = {@link RECORDS_PRICE_BANDS};
 * flag = {@link RECORDS_FLAGS}; buyer / vendor / sku = the value itself.
 */
export const RECORDS_FACETS = [
  { id: 'type', label: 'Type', param: 'type', excludeParam: 'xtype', multi: true, inline: true },
  { id: 'internal', label: 'Internal status', param: 'istatus', excludeParam: 'xistatus', multi: true },
  { id: 'external', label: 'External status', param: 'estatus', excludeParam: 'xestatus', multi: true },
  { id: 'platform', label: 'Platform', param: 'platform', excludeParam: 'xplatform', multi: true },
  { id: 'buyer', label: 'Buyer', param: 'buyer', excludeParam: 'xbuyer', multi: true, searchable: true },
  { id: 'vendor', label: 'Vendor / PO', param: 'vendor', excludeParam: 'xvendor', multi: true, searchable: true },
  { id: 'sku', label: 'SKU / product', param: 'sku', excludeParam: 'xsku', multi: true, searchable: true },
  { id: 'carrier', label: 'Carrier', param: 'carrier', excludeParam: 'xcarrier', multi: true },
  { id: 'price', label: 'Price', param: 'price', excludeParam: 'xprice', multi: true },
  { id: 'flag', label: 'Flags', param: 'flag', excludeParam: 'xflag', multi: true, inline: true },
] as const;
export type RecordsFacetId = (typeof RECORDS_FACETS)[number]['id'];

/** The parsed query — what the server's builder runs and what the client sends. */
export interface RecordsQuery {
  find: string;
  /** The operator's pasted strings, in paste order (`parseRefInParam(...).refs`); empty = Query mode. */
  refs: readonly string[];
  axis: RecordsAxis;
  /** `YYYY-MM-DD` or null; both null and no refs = the default window. */
  from: string | null;
  to: string | null;
  event: RecordsEvent | null;
  eventBy: number | null;
  eventFrom: string | null;
  eventTo: string | null;
  sort: RecordsSort;
  dir: 'asc' | 'desc';
  include: Readonly<Partial<Record<RecordsFacetId, readonly string[]>>>;
  exclude: Readonly<Partial<Record<RecordsFacetId, readonly string[]>>>;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

function list(raw: string | null | undefined): string[] {
  return String(raw ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

function day(raw: string | null | undefined): string | null {
  const value = String(raw ?? '').trim();
  return DAY.test(value) ? value : null;
}

function oneOf<T extends string>(values: readonly T[], raw: string | null | undefined, fallback: T): T {
  const value = String(raw ?? '').trim();
  return (values as readonly string[]).includes(value) ? (value as T) : fallback;
}

/**
 * The page URL → the query. Unknown values read as the default (never a
 * 400): a stale bookmark still opens. `refs` is the RAW pasted strings; the
 * caller parses them with `parseRefList` (the paste cap and splitter).
 */
export function readRecordsQuery(url: ParamReader, refs: readonly string[] = []): RecordsQuery {
  const pasted = refs.length > 0;
  const sort = oneOf(RECORDS_SORTS, url.get(RECORDS_SORT_PARAM), pasted ? 'pasted' : 'date');
  const rawDir = url.get(RECORDS_DIR_PARAM)?.trim();
  const include: Partial<Record<RecordsFacetId, string[]>> = {};
  const exclude: Partial<Record<RecordsFacetId, string[]>> = {};
  for (const facet of RECORDS_FACETS) {
    const kept = list(url.get(facet.param));
    const dropped = list(url.get(facet.excludeParam));
    if (kept.length) include[facet.id] = kept;
    if (dropped.length) exclude[facet.id] = dropped;
  }
  const by = Number(url.get(RECORDS_EVENT_BY_PARAM));
  const rawEvent = url.get(RECORDS_EVENT_PARAM)?.trim();
  return {
    find: url.get(RECORDS_FIND_PARAM)?.trim() ?? '',
    refs,
    axis: oneOf(RECORDS_AXES, url.get(RECORDS_AXIS_PARAM), RECORDS_DEFAULT_AXIS),
    from: day(url.get(RECORDS_FROM_PARAM)),
    to: day(url.get(RECORDS_TO_PARAM)),
    event: rawEvent && (RECORDS_EVENTS as readonly string[]).includes(rawEvent) ? (rawEvent as RecordsEvent) : null,
    eventBy: Number.isInteger(by) && by > 0 ? by : null,
    eventFrom: day(url.get(RECORDS_EVENT_FROM_PARAM)),
    eventTo: day(url.get(RECORDS_EVENT_TO_PARAM)),
    sort,
    dir: rawDir === 'asc' || rawDir === 'desc' ? rawDir : RECORDS_SORT_DIR[sort],
    include,
    exclude,
  };
}

/** Every param the sheet reads — what its saved views keep and what NavFilters' Reset clears (with the facets). */
export const RECORDS_PARAMS = [
  RECORDS_GRAIN_PARAM,
  RECORDS_AXIS_PARAM,
  RECORDS_FROM_PARAM,
  RECORDS_TO_PARAM,
  RECORDS_EVENT_PARAM,
  RECORDS_EVENT_BY_PARAM,
  RECORDS_EVENT_FROM_PARAM,
  RECORDS_EVENT_TO_PARAM,
  ...RECORDS_FACETS.flatMap((facet) => [facet.param, facet.excludeParam]),
] as const;

/**
 * The page URL → the `GET /api/nav/records` query: every param the read
 * parses ({@link RECORDS_PARAMS} minus grain, which only groups on the
 * client), plus Find, the pasted refs and the sort. Blank values are dropped.
 * The sheet's fetch and the sidebar's facet read (`src/lib/nav/facets/records.ts`)
 * send the same query, so rows and counts never disagree.
 */
export function recordsApiParams(url: ParamReader): URLSearchParams {
  const api = new URLSearchParams();
  for (const name of [...RECORDS_PARAMS, RECORDS_FIND_PARAM, RECORDS_REFS_PARAM, RECORDS_SORT_PARAM, RECORDS_DIR_PARAM]) {
    if (name === RECORDS_GRAIN_PARAM) continue;
    const value = url.get(name)?.trim();
    if (value) api.set(name, value);
  }
  return api;
}

/** Rows one read returns at most; `total` says how many matched. Sized to hold a 6-month window (6,655 lines on 2026-10-06). */
export const RECORDS_ROW_LIMIT = 10000;
