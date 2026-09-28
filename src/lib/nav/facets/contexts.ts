/**
 * Facet contexts — which views `GET /api/nav/facets` answers
 * (`<pageId>.<sectionItemId>`, or the bare `<pageId>` for a page without
 * section views), and the filter groups each one declares.
 *
 * Pure data, import-free: the nav-context resolver copies `NAV_FACET_GROUPS`
 * verbatim into `NavContext.filters.groups`, and the facets route returns
 * option counts for exactly these group ids/params — one declaration, two
 * readers. Every `param` is a URL param the view's list already reads, so a
 * facet link survives the route's param spec and drives the same predicate.
 *
 * Shipping (page `outbound`) section items are the DESK_VIEWS ids; a station
 * page with no section views uses the bare page id (`pickup`).
 */

export const NAV_FACET_CONTEXTS = [
  'outbound.exceptions',
  'outbound.triage',
  'outbound.pick',
  'outbound.po',
  'outbound.shipped',
  'pickup',
  'imports.runs',
  'imports.rows',
] as const;
export type NavFacetContext = (typeof NAV_FACET_CONTEXTS)[number];

export interface NavFacetGroupDecl {
  id: string;
  label: string;
  /** URL param the group writes (and the list reads). */
  param: string;
  multi: boolean;
}

const STAGE: NavFacetGroupDecl = { id: 'stage', label: 'Stage', param: 'stage', multi: false };
const AGING: NavFacetGroupDecl = { id: 'aging', label: 'Ship by', param: 'aging', multi: false };
const LATE: NavFacetGroupDecl = { id: 'late', label: 'Must ship', param: 'late', multi: false };
const URGENT: NavFacetGroupDecl = { id: 'attention', label: 'Urgent', param: 'attention', multi: false };
const OUT_OF_STOCK: NavFacetGroupDecl = { id: 'ustatus', label: 'Stock', param: 'ustatus', multi: false };
const IMPORT_SOURCE: NavFacetGroupDecl = { id: 'source', label: 'Source', param: 'source', multi: true };

export const NAV_FACET_GROUPS: Readonly<Record<NavFacetContext, readonly NavFacetGroupDecl[]>> = {
  'outbound.exceptions': [{ id: 'category', label: 'Category', param: 'category', multi: false }],
  'outbound.triage': [STAGE, AGING, LATE, URGENT, OUT_OF_STOCK],
  'outbound.pick': [STAGE, AGING, LATE, URGENT, OUT_OF_STOCK],
  'outbound.po': [AGING, LATE, URGENT],
  // The Shipped list's own params (`useShippedTableFilters`), answered in
  // `fetchPackerLogRows`' WHERE — `src/lib/shipping/shipped-filter/shipped-filter-sql.ts`.
  'outbound.shipped': [
    { id: 'type', label: 'Type', param: 'shippedFilter', multi: false },
    { id: 'carrier', label: 'Carrier', param: 'carrier', multi: false },
    { id: 'status', label: 'Tracking status', param: 'statusCategory', multi: false },
    { id: 'exceptions', label: 'Needs attention', param: 'exceptions', multi: false },
  ],
  pickup: [{ id: 'status', label: 'Status', param: 'status', multi: false }],
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
};

/**
 * Permission gating each context — the one its view's own list endpoint
 * requires. `/api/nav/facets` refuses (403) without it, and the resolver omits
 * `filters` for a caller who lacks it.
 */
export const NAV_FACET_PERMISSION: Readonly<Record<NavFacetContext, string>> = {
  'outbound.exceptions': 'orders.view',
  'outbound.triage': 'orders.view',
  'outbound.pick': 'orders.view',
  'outbound.po': 'orders.view',
  'outbound.shipped': 'packing.view',
  pickup: 'walk_in.view',
  'imports.runs': 'orders.view',
  'imports.rows': 'orders.view',
};

export function isNavFacetContext(value: string): value is NavFacetContext {
  return (NAV_FACET_CONTEXTS as readonly string[]).includes(value);
}
