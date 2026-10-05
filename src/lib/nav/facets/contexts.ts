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
 * FBM's `outbound` context only owns Allocate filters. Exceptions are always
 * filtered inside the global `/exceptions` page.
 */

import { EXCEPTION_KIND_PERMISSION } from '@/lib/exceptions/permissions';
import { exceptionKindsOf } from '@/lib/exceptions/types';
import { DOCKED_FLAG_PARAM } from '@/lib/receiving/inbound-lane';
import { REPAIR_STATUS_CHIP_PARAM } from '@/lib/repair/repair-status-chips';
import { SUPPORT_LIST_VIEWS } from '@/lib/support/list/support-list';

/**
 * The Support workspace (`/support`): one context per sidebar view — Queue
 * (`support.queue`, no `?view=`) and each SUPPORT_LIST_VIEWS id — answered by
 * the list's own predicates (`src/lib/nav/facets/support.ts`).
 */
const SUPPORT_FACET_CONTEXTS = ['support.queue', ...SUPPORT_LIST_VIEWS.map((view) => `support.${view}` as const)] as const;
type SupportFacetContextId = (typeof SUPPORT_FACET_CONTEXTS)[number];

/**
 * The repair desk (`RepairCardList`): `/repair`'s channel views and Sales ›
 * Repair service's — answered by the list's own statement (`src/lib/nav/facets/repair.ts`).
 */
export const REPAIR_FACET_CONTEXTS = [
  'repair.all',
  'repair.shipped-in',
  'repair.dropped-off',
  'sales.repairs-all',
  'sales.repairs-shipped-in',
  'sales.repairs-dropped-off',
] as const;
export type RepairFacetContextId = (typeof REPAIR_FACET_CONTEXTS)[number];

export const NAV_FACET_CONTEXTS = [
  'stations-live',
  // The Live feed (`/operations/live-feed`): the outbound package board, one context (`live-feed.ts`).
  'live-feed',
  'outbound.orders',
  'outbound.shipped',
  'pickup',
  'stock.all',
  'inventory.racks',
  'imports.runs',
  'imports.rows',
  'incoming.pipeline',
  'incoming.docked',
  'incoming.unboxed',
  // The Unbox station (`/unbox`): one context for every `?unboxview=` tab (`unbox.ts`).
  'receive',
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
  ...SUPPORT_FACET_CONTEXTS,
  ...REPAIR_FACET_CONTEXTS,
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
/** The Support list's facets — `parseSupportListFilter` reads each as a comma list. */
const SUPPORT_GROUPS: readonly NavFacetGroupDecl[] = [
  { id: 'platform', label: 'Platform', param: 'platform', multi: true },
  { id: 'account', label: 'Account', param: 'account', multi: true },
  { id: 'assignee', label: 'Assignee', param: 'assignee', multi: true },
];
/** The repair desk's stages (`?repairStatus=`, `REPAIR_QUEUE_VIEW.chips.param`): the list's client cut, any-of. */
const REPAIR_GROUPS: readonly NavFacetGroupDecl[] = [{ id: 'repairStatus', label: 'Stage', param: REPAIR_STATUS_CHIP_PARAM, multi: true }];
/** Unboxed cartons' attention pills (`?dflag=`, any-of) — `UnboxedReceiptsLedger`'s cut (`unbox.ts`). */
const UNBOXED_STATUS: NavFacetGroupDecl = { id: 'status', label: 'Status', param: DOCKED_FLAG_PARAM, multi: true, inline: true };

export const NAV_FACET_GROUPS: Readonly<Record<NavFacetContext, readonly NavFacetGroupDecl[]>> = {
  'stations-live': [
    { id: 'job', label: 'Job', param: 'job', multi: true },
    { id: 'outcome', label: 'Outcome', param: 'outcome', multi: true },
  ],
  // The board's own params (`LIVE_FEED_PARAMS`, `readLiveFeedFilters`): comma lists of carrier / channel keys.
  'live-feed': [
    { id: 'carrier', label: 'Carrier', param: 'carrier', multi: true },
    { id: 'channel', label: 'Channel', param: 'channel', multi: true },
  ],
  'stock.all': [
    { id: 'room', label: 'Room', param: 'room', multi: false },
    { id: 'aisle', label: 'Aisle', param: 'aisle', multi: true, inline: true },
    { id: 'health', label: 'Stock health', param: 'status', multi: true },
  ],
  // Inventory › Locations › Racks: the room each rack stands in (`?room=<room location id>`, `inventory-racks.ts`).
  'inventory.racks': [{ id: 'room', label: 'Room', param: 'room', multi: false }],
  // Inbound › Inbound: the delivery-state walk (`?state=`, `incoming-pipeline.ts`) — the body's status chips, moved here.
  'incoming.pipeline': [{ id: 'state', label: 'Delivery status', param: 'state', multi: false, inline: true }],
  // Inbound › Docked: the list's status cut (`?dflag=`, `INCOMING_DOCKED_VIEW.chips`, `incoming-docked.ts`) — the body's chips, moved here.
  'incoming.docked': [{ id: 'status', label: 'Status', param: DOCKED_FLAG_PARAM, multi: true, inline: true }],
  // Inbound › Unboxed and the Unbox station: the body's attention pills,
  // declared once for the shared collection (`unbox.ts`).
  'incoming.unboxed': [UNBOXED_STATUS],
  receive: [UNBOXED_STATUS],
  'outbound.orders': [STAGE, AGING, LATE, URGENT, OUT_OF_STOCK],
  // The Shipped list's own params (`useShippedTableFilters`), answered in
  // `fetchPackerLogRows`' WHERE — `src/lib/shipping/shipped-filter/shipped-filter-sql.ts`.
  'outbound.shipped': [
    { id: 'type', label: 'Type', param: 'shippedFilter', multi: false },
    { id: 'channel', label: 'Channel', param: 'channel', multi: true },
    { id: 'carrier', label: 'Carrier', param: 'carrier', multi: false },
    { id: 'status', label: 'Tracking status', param: 'statusCategory', multi: false },
    { id: 'exceptions', label: 'Needs attention', param: 'exceptions', multi: false },
    // The list's own client cut (`OUTBOUND_SHIPPED_VIEW.chips.param`, OR across picks).
    { id: 'packageStatus', label: 'Package status', param: 'cardStatus', multi: true },
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
  ...(Object.fromEntries(SUPPORT_FACET_CONTEXTS.map((context) => [context, SUPPORT_GROUPS])) as Record<SupportFacetContextId, readonly NavFacetGroupDecl[]>),
  ...(Object.fromEntries(REPAIR_FACET_CONTEXTS.map((context) => [context, REPAIR_GROUPS])) as Record<RepairFacetContextId, readonly NavFacetGroupDecl[]>),
};

/**
 * Permission gating each context — the one its view's own list endpoint
 * requires (a list = ANY of them: bare `exceptions` answers for whichever
 * kinds the caller may see). `/api/nav/facets` refuses (403) without it, and
 * the resolver omits `filters` for a caller who lacks it.
 */
export const NAV_FACET_PERMISSION: Readonly<Record<NavFacetContext, string | readonly string[]>> = {
  'stations-live': 'operations.view',
  // The board's own read (`LIVE_FEED_PERMISSION`).
  'live-feed': 'packing.view',
  'outbound.orders': 'orders.view',
  'stock.all': 'sku_stock.view',
  'inventory.racks': 'sku_stock.view',
  'outbound.shipped': 'packing.view',
  pickup: 'walk_in.view',
  'imports.runs': 'orders.view',
  'imports.rows': 'orders.view',
  // The lane's own read (`GET /api/receiving-lines?view=incoming`).
  'incoming.pipeline': 'receiving.view',
  // The list's own read (`GET /api/receiving-lines?view=scanned`).
  'incoming.docked': 'receiving.view',
  // The lists' own read (`GET /api/receiving-lines`).
  'incoming.unboxed': 'receiving.view',
  receive: 'receiving.view',
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
  // The list's own read (`GET /api/support/list`).
  ...(Object.fromEntries(SUPPORT_FACET_CONTEXTS.map((context) => [context, 'support.thread.view'])) as Record<SupportFacetContextId, string>),
  // The list's own read (`GET /api/repair-service`).
  ...(Object.fromEntries(REPAIR_FACET_CONTEXTS.map((context) => [context, 'repair.view'])) as Record<RepairFacetContextId, string>),
};

/** May a caller holding `permissions` read `context`'s counts? */
export function mayReadNavFacet(permissions: ReadonlySet<string>, context: NavFacetContext): boolean {
  const required = NAV_FACET_PERMISSION[context];
  return typeof required === 'string' ? permissions.has(required) : required.some((p) => permissions.has(p));
}

export function isNavFacetContext(value: string): value is NavFacetContext {
  return (NAV_FACET_CONTEXTS as readonly string[]).includes(value);
}
