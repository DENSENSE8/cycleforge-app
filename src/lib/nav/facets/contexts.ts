/**
 * Facet contexts — which views `GET /api/nav/facets` answers
 * (`<pageId>.<sectionItemId>`, or the bare `<pageId>` for a page without
 * section views), and the filter groups each one declares.
 *
 * Pure data (its imports are the Exceptions kind vocabulary): the
 * nav-context resolver copies `NAV_FACET_GROUPS` verbatim into
 * `NavContext.filters.groups`, and the facets route returns
 * option counts for exactly these group ids/params — one declaration, two
 * readers. Every `param` is a URL param the view's list already reads, so a
 * facet link survives the route's param spec and drives the same predicate.
 *
 * Shipping (page `outbound`) section items are the DESK_VIEWS ids; a station
 * page with no section views uses the bare page id (`pickup`).
 */

import { EXCEPTION_KIND_PERMISSION } from '@/lib/exceptions/permissions';
import { exceptionKindsOf } from '@/lib/exceptions/types';
import { LIVE_FEED_DIRECTION_PERMISSION, type LiveFeedDirection } from '@/lib/live-feed/statuses';

/**
 * The Live feed (`/operations/live-feed`): one context per sidebar view —
 * a direction's Board (`live-feed.outbound` / `live-feed.inbound`) —
 * answered by `src/lib/nav/facets/live-feed.ts`.
 */
export const LIVE_FEED_FACET_PAGE = 'live-feed';
export type LiveFeedFacetContext = `${typeof LIVE_FEED_FACET_PAGE}.${LiveFeedDirection}`;

export const NAV_FACET_CONTEXTS = [
  'stations-live',
  'outbound.exceptions',
  'outbound.triage',
  'outbound.shipped',
  'pickup',
  'inventory.stock',
  'imports.runs',
  'imports.rows',
  // The Exceptions hub (`/exceptions`): one context per kind plus the whole
  // hub; totals are the hub list's (`src/lib/nav/facets/exceptions.ts`).
  'exceptions',
  'exceptions.fulfillment',
  'exceptions.inventory',
  'exceptions.receiving',
  'exceptions.fbm',
  'exceptions.labels',
  'exceptions.paperwork',
  'exceptions.unmatched',
  'exceptions.pairs',
  'exceptions.bins',
  'exceptions.tracking',
  'exceptions.claim',
  'exceptions.short',
  'exceptions.unfound',
  // The Live feed's direction views; totals, Channel and Carrier counts are
  // the feed's own statement (`src/lib/nav/facets/live-feed.ts`).
  'live-feed.outbound',
  'live-feed.inbound',
] as const;
export type NavFacetContext = (typeof NAV_FACET_CONTEXTS)[number];

export interface NavFacetGroupDecl {
  id: string;
  label: string;
  /** URL param the group writes (and the list reads). */
  param: string;
  multi: boolean;
  /**
   * Render the options INLINE, always open, instead of a collapsed row the
   * operator must click first — for short, ordered option sets (aisles 1–4)
   * the extra click hides the walk the list is ordered by (owner 2026-09-30).
   */
  inline?: boolean;
}

const STAGE: NavFacetGroupDecl = { id: 'stage', label: 'Stage', param: 'stage', multi: false };
const AGING: NavFacetGroupDecl = { id: 'aging', label: 'Ship by', param: 'aging', multi: false };
const LATE: NavFacetGroupDecl = { id: 'late', label: 'Must ship', param: 'late', multi: false };
const URGENT: NavFacetGroupDecl = { id: 'attention', label: 'Urgent', param: 'attention', multi: false };
const OUT_OF_STOCK: NavFacetGroupDecl = { id: 'ustatus', label: 'Stock', param: 'ustatus', multi: false };
const IMPORT_SOURCE: NavFacetGroupDecl = { id: 'source', label: 'Source', param: 'source', multi: true };
/** The Live feed's `?carrier=` (outbound), counted by the feed's own statement. */
const LIVE_FEED_CARRIER: NavFacetGroupDecl = { id: 'carrier', label: 'Carrier', param: 'carrier', multi: false };
/** The Live feed's `?channel=` (both directions; unset = both), counted by the feed's own statement. */
const LIVE_FEED_CHANNEL: NavFacetGroupDecl = { id: 'channel', label: 'Channel', param: 'channel', multi: false };

export const NAV_FACET_GROUPS: Readonly<Record<NavFacetContext, readonly NavFacetGroupDecl[]>> = {
  'stations-live': [
    { id: 'job', label: 'Job', param: 'job', multi: true },
    { id: 'outcome', label: 'Outcome', param: 'outcome', multi: true },
  ],
  // FBM › Exceptions is the hub list locked to Fulfillment — counts only.
  'outbound.exceptions': [],
  'inventory.stock': [
    { id: 'room', label: 'Room', param: 'room', multi: false },
    { id: 'aisle', label: 'Aisle', param: 'aisle', multi: true, inline: true },
  ],
  'outbound.triage': [STAGE, AGING, LATE, URGENT, OUT_OF_STOCK],
  // The Shipped list's own params (`useShippedTableFilters`), answered in
  // `fetchPackerLogRows`' WHERE — `src/lib/shipping/shipped-filter/shipped-filter-sql.ts`.
  'outbound.shipped': [
    { id: 'type', label: 'Type', param: 'shippedFilter', multi: false },
    { id: 'channel', label: 'Channel', param: 'channel', multi: true },
    { id: 'carrier', label: 'Carrier', param: 'carrier', multi: false },
    { id: 'status', label: 'Tracking status', param: 'statusCategory', multi: false },
    { id: 'exceptions', label: 'Needs attention', param: 'exceptions', multi: false },
  ],
  pickup: [
    { id: 'status', label: 'Order status', param: 'status', multi: false },
    { id: 'qc', label: 'Quality control', param: 'qc', multi: false },
    { id: 'triage', label: 'Triage', param: 'triage', multi: false },
    { id: 'label', label: 'QC label', param: 'label', multi: false },
    { id: 'ticket', label: 'Ticket', param: 'ticket', multi: false },
    { id: 'vendor', label: 'Seller', param: 'vendor', multi: false },
  ],
  // The import record's lists (`/api/imports/runs|rows`, `src/lib/imports/params.ts`):
  // source · platform · account · outcome are multi-value, comma-joined (a
  // run's source is any step it ran); a run's status is one value.
  'imports.runs': [{ id: 'status', label: 'Status', param: 'status', multi: false }, IMPORT_SOURCE],
  'imports.rows': [
    IMPORT_SOURCE,
    { id: 'platform', label: 'Platform', param: 'platform', multi: true },
    { id: 'account', label: 'Account', param: 'account', multi: true },
    { id: 'outcome', label: 'Outcome', param: 'outcome', multi: true },
  ],
  // Counts only — the hub's kind / domain rows ARE its filters.
  exceptions: [],
  'exceptions.fulfillment': [],
  'exceptions.inventory': [],
  'exceptions.receiving': [],
  'exceptions.fbm': [],
  'exceptions.labels': [],
  'exceptions.paperwork': [],
  'exceptions.unmatched': [],
  'exceptions.pairs': [],
  'exceptions.bins': [],
  'exceptions.tracking': [],
  'exceptions.claim': [],
  'exceptions.short': [],
  'exceptions.unfound': [],
  'live-feed.outbound': [LIVE_FEED_CHANNEL, LIVE_FEED_CARRIER],
  'live-feed.inbound': [LIVE_FEED_CHANNEL],
};

/**
 * Permission gating each context — the one its view's own list endpoint
 * requires (a list = ANY of them: bare `exceptions` answers for whichever
 * kinds the caller may see). `/api/nav/facets` refuses (403) without it, and
 * the resolver omits `filters` for a caller who lacks it.
 */
export const NAV_FACET_PERMISSION: Readonly<Record<NavFacetContext, string | readonly string[]>> = {
  'stations-live': 'operations.view',
  'outbound.exceptions': [...new Set(exceptionKindsOf('fulfillment').map((kind) => EXCEPTION_KIND_PERMISSION[kind]))],
  'outbound.triage': 'orders.view',
  'inventory.stock': 'sku_stock.view',
  'outbound.shipped': 'packing.view',
  pickup: 'walk_in.view',
  'imports.runs': 'orders.view',
  'imports.rows': 'orders.view',
  exceptions: [...new Set(Object.values(EXCEPTION_KIND_PERMISSION))],
  'exceptions.fulfillment': [...new Set(exceptionKindsOf('fulfillment').map((kind) => EXCEPTION_KIND_PERMISSION[kind]))],
  'exceptions.inventory': [...new Set(exceptionKindsOf('inventory').map((kind) => EXCEPTION_KIND_PERMISSION[kind]))],
  'exceptions.receiving': [...new Set(exceptionKindsOf('receiving').map((kind) => EXCEPTION_KIND_PERMISSION[kind]))],
  'exceptions.fbm': EXCEPTION_KIND_PERMISSION.fbm,
  'exceptions.labels': EXCEPTION_KIND_PERMISSION.labels,
  'exceptions.paperwork': EXCEPTION_KIND_PERMISSION.paperwork,
  'exceptions.unmatched': EXCEPTION_KIND_PERMISSION.unmatched,
  'exceptions.pairs': EXCEPTION_KIND_PERMISSION.pairs,
  'exceptions.bins': EXCEPTION_KIND_PERMISSION.bins,
  'exceptions.tracking': EXCEPTION_KIND_PERMISSION.tracking,
  'exceptions.claim': EXCEPTION_KIND_PERMISSION.claim,
  'exceptions.short': EXCEPTION_KIND_PERMISSION.short,
  'exceptions.unfound': EXCEPTION_KIND_PERMISSION.unfound,
  'live-feed.outbound': LIVE_FEED_DIRECTION_PERMISSION.outbound,
  'live-feed.inbound': LIVE_FEED_DIRECTION_PERMISSION.inbound,
};

/** May a caller holding `permissions` read `context`'s counts? */
export function mayReadNavFacet(permissions: ReadonlySet<string>, context: NavFacetContext): boolean {
  const required = NAV_FACET_PERMISSION[context];
  return typeof required === 'string' ? permissions.has(required) : required.some((p) => permissions.has(p));
}

export function isNavFacetContext(value: string): value is NavFacetContext {
  return (NAV_FACET_CONTEXTS as readonly string[]).includes(value);
}
