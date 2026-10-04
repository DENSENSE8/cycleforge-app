/**
 * THE ROUTE TREE — one source for every URL, nav name and domain word
 * (owner 2026-10-03: "the Design System MCP server would house the exact
 * routing … and vocabulary", plan: docs/routing/ROUTE-TREE-PHASE-1-PLAN.md).
 *
 * Four consumers read this module and nothing else:
 *   1. the app — the path constants and builders below are the only way a
 *      Warehouse-lane URL is written;
 *   2. verify `Routes` — `scripts/route-tree-guard.ts` checks the tree against
 *      the file system, the phone menu and the literal-path baseline;
 *   3. the design MCP — `ds_route`, `ds_vocabulary` and `ds_route_tree` spawn
 *      the same guard, so the answer a session reads cannot disagree with the
 *      gate;
 *   4. session start — `--digest` prints the lane summary every session sees.
 *
 * Phase 1 covers the Warehouse lane on the phone. Every node carries the path
 * it LIVES at today (`path`) and the canonical path it MOVES to (`target`);
 * phase 2 flips the routes and turns the old paths into permanent aliases
 * (printed QR codes carry them — an alias is never deleted).
 *
 * Grow this file; never re-declare a Warehouse path or term anywhere else.
 */

// ── Vocabulary ──────────────────────────────────────────────────────────────

export type TermId =
  | 'warehouse'
  | 'stock'
  | 'room'
  | 'aisle'
  | 'bay'
  | 'level'
  | 'position'
  | 'location'
  | 'rack'
  | 'container'
  | 'lpn'
  | 'location-labels';

export interface VocabularyTerm {
  id: TermId;
  /** The one word the UI paints. */
  label: string;
  plural: string;
  definition: string;
  /** URL segment (collections) or query param (address parts). */
  segment?: string;
  /** Words that must not stand in for this term in nav labels or new UI copy. */
  banned: readonly string[];
  /** Industry names for the same thing — for the reader, never for the UI. */
  industry?: string;
  /** Lane that owns the term's canonical route. */
  owner: LaneId;
  decided: { by: 'owner'; date: string; note?: string };
}

export const VOCABULARY: readonly VocabularyTerm[] = [
  {
    id: 'warehouse',
    label: 'Warehouse',
    plural: 'Warehouse',
    definition: 'The lane for the building and everything stored in it: stock, locations, racks, containers.',
    segment: 'warehouse',
    banned: ['inventory (as a lane name)'],
    industry: 'D365 warehouse · SAP EWM warehouse number',
    owner: 'warehouse',
    decided: { by: 'owner', date: '2026-10-03', note: 'Inventory is renamed Warehouse; the URL tree grows from /m/warehouse.' },
  },
  {
    id: 'stock',
    label: 'Stock',
    plural: 'Stock',
    definition: 'One SKU\'s quantity at one location. "On hand" is the number; a stock row is what Adjust, Move and Photos edit.',
    segment: 'stock',
    banned: ['quant', 'inventory row', 'bin contents'],
    industry: 'SAP quant · D365 on-hand · Zoho stock on hand',
    owner: 'warehouse',
    decided: { by: 'owner', date: '2026-10-03', note: 'Stock is only stock: searchable, editable per location, never a list of empty places.' },
  },
  {
    id: 'room',
    label: 'Room',
    plural: 'Rooms',
    definition: 'The top of the address: a room or area that holds aisles (Room › Aisle › Bay › Level › Position).',
    segment: 'room',
    banned: ['zone', 'area', 'storage type'],
    industry: 'Zoho zone · D365 zone · SAP storage type',
    owner: 'warehouse',
    decided: { by: 'owner', date: '2026-10-03', note: 'Rooms over Zone.' },
  },
  {
    id: 'aisle',
    label: 'Aisle',
    plural: 'Aisles',
    definition: 'Second address part: a row of bays inside a room.',
    segment: 'aisle',
    banned: ['row'],
    industry: 'D365 location-format segment',
    owner: 'warehouse',
    decided: { by: 'owner', date: '2026-10-03' },
  },
  {
    id: 'bay',
    label: 'Bay',
    plural: 'Bays',
    definition: 'Third address part: one section of fixed racking in an aisle (Left / Right by parity).',
    segment: 'bay',
    banned: ['rack (for fixed racking)', 'section'],
    industry: 'D365 location-format segment',
    owner: 'warehouse',
    decided: { by: 'owner', date: '2026-10-03' },
  },
  {
    id: 'level',
    label: 'Level',
    plural: 'Levels',
    definition: 'Fourth address part: the shelf height inside a bay.',
    segment: 'level',
    banned: ['shelf (for fixed racking)'],
    owner: 'warehouse',
    decided: { by: 'owner', date: '2026-10-03', note: '"Shelf" stays only for a movable rack\'s tiers (RK12-3).' },
  },
  {
    id: 'position',
    label: 'Position',
    plural: 'Positions',
    definition: 'Fifth address part: the slot on a level.',
    segment: 'position',
    banned: ['slot', 'spot'],
    owner: 'warehouse',
    decided: { by: 'owner', date: '2026-10-03' },
  },
  {
    id: 'location',
    label: 'Location',
    plural: 'Locations',
    definition: 'Any scannable address stock can sit at: a room-coded place (C0310300), a movable rack shelf (RK12-3) or a free-written place.',
    segment: 'locations',
    banned: ['bin', 'storage bin', 'slot'],
    industry: 'D365 location · SAP storage bin · Zoho bin location',
    owner: 'warehouse',
    decided: { by: 'owner', date: '2026-10-03', note: '`/bin/*` survives only as an alias.' },
  },
  {
    id: 'rack',
    label: 'Rack',
    plural: 'Racks',
    definition: 'A MOVABLE rack (RK12) whose shelves are locations. Fixed racking is bays.',
    segment: 'racks',
    banned: ['bay racking', 'movable (as a label)'],
    owner: 'warehouse',
    decided: { by: 'owner', date: '2026-10-03', note: 'Desktop ?tab=racks is the legacy BAY alias on printed QR codes; never reuse that query value.' },
  },
  {
    id: 'container',
    label: 'Tote',
    plural: 'Containers',
    definition: 'A tote (H-#### handling unit): holds units, moves between locations, is never itself a location.',
    segment: 'containers',
    banned: ['LPN (for a tote)', 'licence-plated box', 'handling unit (in UI copy)'],
    industry: 'SAP handling unit',
    owner: 'warehouse',
    decided: { by: 'owner', date: '2026-10-03', note: 'Totes are containers; LPNs are Receiving\'s.' },
  },
  {
    id: 'lpn',
    label: 'LPN',
    plural: 'LPNs',
    definition: 'License plate number: the R-* plate Receiving puts on an arriving carton.',
    segment: 'lpns',
    banned: ['licence (British spelling)', 'carton (as the record name — pending owner ruling)'],
    industry: 'WMS license plate number',
    owner: 'receiving',
    decided: { by: 'owner', date: '2026-10-03', note: 'LPNs are what Receiving introduced; spelling is "license".' },
  },
  {
    id: 'location-labels',
    label: 'Location labels',
    plural: 'Location labels',
    definition: 'Stickers for a location, a bay or a movable rack. Labels always name their owner; "Labels" alone is banned.',
    segment: 'labels',
    banned: ['labels (unqualified)', 'bin tags'],
    owner: 'warehouse',
    decided: { by: 'owner', date: '2026-10-03', note: 'Labels belong to Locations, not to Stock.' },
  },
] as const;

// ── Tree ────────────────────────────────────────────────────────────────────

export type LaneId = 'warehouse' | 'receiving';

export type RouteNodeKind =
  /** A lane: the menu group, and (target) its landing page. */
  | 'lane'
  /** A list of one kind of thing. */
  | 'collection'
  /** One thing, addressed by an id/code segment. */
  | 'record'
  /** A full-screen job on a collection or record (capture, builder, cleanup). */
  | 'task'
  /** A route kept only so old links land; it forwards to `forwardsTo`. */
  | 'compat';

export type RouteNodeStatus = 'live' | 'planned';

export interface RouteNode {
  id: string;
  parent: string | null;
  kind: RouteNodeKind;
  /** The nav / heading name. Records are named by their data, not here. */
  label: string;
  owns?: TermId;
  /** Where it lives today (Next.js pattern, `[param]` for segments). Null = not built. */
  path: string | null;
  /** Canonical path after phase 2. */
  target: string;
  /** `src/app/...` file serving `path`. */
  page: string | null;
  status: RouteNodeStatus;
  /** Query params the page owns (the slice of the list, never the thing). */
  query?: readonly string[];
  /** Other nodes this one may link to (records only: list pages link inside their own subtree). */
  links?: readonly string[];
  /** What a session should know before touching it. */
  note?: string;
  forwardsTo?: string;
}

export const ROUTE_TREE: readonly RouteNode[] = [
  {
    id: 'warehouse',
    parent: null,
    kind: 'lane',
    label: 'Warehouse',
    owns: 'warehouse',
    path: null,
    target: '/m/warehouse',
    page: null,
    status: 'planned',
    note: 'Today the phone menu group is `inventory` (DOMAIN_GROUPS label "Inventory"). Phase 2 renames the lane to Warehouse on both surfaces; the desktop row now called "Warehouse" must become "Locations" in the same change (nav-name law).',
  },
  {
    id: 'stock',
    parent: 'warehouse',
    kind: 'collection',
    label: 'Stock',
    owns: 'stock',
    path: '/m/stock',
    target: '/m/warehouse/stock',
    page: 'src/app/m/(shell)/stock/page.tsx',
    status: 'live',
    query: ['q', 'room', 'aisle', 'side', 'bay'],
    note: 'Rooms › Aisles › Side › Bays › Locations drill of every place (empty ones say Empty). An aisle opens on two full-height choices split down the middle — Odd bays · Left side | Even bays · Right side (`?side=left|right`, BAY_SIDE_FACE) — then that side\'s bays in number order; never (Left) on every bay, never a grid of bays. Room container nodes are not places. Search lists stocked places. No doors to other things: Labels, Racks and Manage live in the menu.',
  },
  {
    id: 'stock-photos',
    parent: 'stock',
    kind: 'task',
    label: 'Stock photos',
    owns: 'stock',
    path: '/m/stock/[stockId]/photos',
    target: '/m/warehouse/stock/[stockId]/photos',
    page: 'src/app/m/(immersive)/stock/[stockId]/photos/page.tsx',
    status: 'live',
    query: ['sku', 'back'],
  },
  {
    id: 'stock-detail',
    parent: 'stock',
    kind: 'compat',
    label: 'Stock detail',
    path: '/m/stock/detail',
    target: '/m/warehouse/locations/[code]',
    page: 'src/app/m/(shell)/stock/detail/page.tsx',
    status: 'live',
    query: ['open', 'page'],
    forwardsTo: 'location',
    note: 'Old `?open=<location:sku:source>` row links forward to the location record.',
  },
  {
    id: 'locations',
    parent: 'warehouse',
    kind: 'collection',
    label: 'Locations',
    owns: 'location',
    path: null,
    target: '/m/warehouse/locations',
    page: null,
    status: 'planned',
    query: ['room', 'aisle', 'bay', 'status'],
    note: 'Every place, empty ones included; `?status=empty|unassigned` replaces the cleanup page.',
  },
  {
    id: 'location',
    parent: 'locations',
    kind: 'record',
    label: 'Location',
    owns: 'location',
    path: '/m/loc/[code]',
    target: '/m/warehouse/locations/[code]',
    page: 'src/app/m/(shell)/loc/[code]/page.tsx',
    status: 'live',
    query: ['back', 'verified'],
    links: ['location-labels', 'rack', 'container', 'stock'],
    note: 'One record for C0310300, RK12 and RK12-3. Its path chips go UP into the stock drill; its title picker goes sideways.',
  },
  {
    id: 'location-info',
    parent: 'location',
    kind: 'task',
    label: 'Location details',
    owns: 'location',
    path: '/m/loc/[code]/info',
    target: '/m/warehouse/locations/[code]/info',
    page: 'src/app/m/(shell)/loc/[code]/info/page.tsx',
    status: 'live',
  },
  {
    id: 'location-cleanup',
    parent: 'locations',
    kind: 'task',
    label: 'Manage locations',
    owns: 'location',
    path: '/m/stock/locations',
    target: '/m/warehouse/locations',
    page: 'src/app/m/(shell)/stock/locations/page.tsx',
    status: 'live',
    note: 'Rename and clear empty positions (`bin.remove`). Phase 2 folds it into the Locations list as `?status=empty`.',
  },
  {
    id: 'location-labels',
    parent: 'locations',
    kind: 'task',
    label: 'Location labels',
    owns: 'location-labels',
    path: '/m/labels',
    target: '/m/warehouse/locations/labels',
    page: 'src/app/m/(shell)/labels/page.tsx',
    status: 'live',
    query: ['code', 'kind', 'back'],
  },
  {
    id: 'rack-labels',
    parent: 'location-labels',
    kind: 'compat',
    label: 'Rack labels',
    owns: 'location-labels',
    path: '/m/stock/labels',
    target: '/m/warehouse/locations/labels',
    page: 'src/app/m/(shell)/stock/labels/page.tsx',
    status: 'live',
    query: ['rack', 'back'],
    forwardsTo: 'location-labels',
    note: 'A second label builder. Phase 2 merges it into Location labels as `?kind=rack`.',
  },
  {
    id: 'racks',
    parent: 'locations',
    kind: 'collection',
    label: 'Racks',
    owns: 'rack',
    path: '/m/racks',
    target: '/m/warehouse/locations/racks',
    page: 'src/app/m/(shell)/racks/page.tsx',
    status: 'live',
  },
  {
    id: 'rack-new',
    parent: 'racks',
    kind: 'task',
    label: 'New rack',
    owns: 'rack',
    path: '/m/racks/new',
    target: '/m/warehouse/locations/racks/new',
    page: 'src/app/m/(shell)/racks/new/page.tsx',
    status: 'live',
  },
  {
    id: 'rack',
    parent: 'racks',
    kind: 'record',
    label: 'Rack',
    owns: 'rack',
    path: '/m/loc/[code]',
    target: '/m/warehouse/locations/[code]',
    page: 'src/app/m/(shell)/loc/[code]/page.tsx',
    status: 'live',
    note: 'A rack (RK12) is addressed like any location; the location record renders the rack face.',
  },
  {
    id: 'containers',
    parent: 'warehouse',
    kind: 'collection',
    label: 'Containers',
    owns: 'container',
    path: null,
    target: '/m/warehouse/containers',
    page: null,
    status: 'planned',
  },
  {
    id: 'container',
    parent: 'containers',
    kind: 'record',
    label: 'Tote',
    owns: 'container',
    path: '/m/h/[id]',
    target: '/m/warehouse/containers/[code]',
    page: 'src/app/m/(shell)/h/[id]/page.tsx',
    status: 'live',
    links: ['location'],
    note: 'H-#### handling unit = a tote. UI copy says Tote, never LPN.',
  },
];

// ── Paths and builders (the only way to write a Warehouse URL) ─────────────

function livePath(id: string): string {
  const node = ROUTE_TREE.find((n) => n.id === id);
  if (!node?.path) throw new Error(`route-tree: ${id} has no live path`);
  return node.path;
}

/** Static live paths, read once from the tree. */
export const WAREHOUSE_PATHS = {
  stock: livePath('stock'),
  stockDetail: livePath('stock-detail'),
  locationCleanup: livePath('location-cleanup'),
  locationLabels: livePath('location-labels'),
  rackLabels: livePath('rack-labels'),
  racks: livePath('racks'),
  newRack: livePath('rack-new'),
} as const;

function fill(pattern: string, param: string, value: string): string {
  return pattern.replace(`[${param}]`, encodeURIComponent(value));
}

function withQuery(path: string, params?: Record<string, string | null | undefined>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params ?? {})) if (value) query.set(key, value);
  const qs = query.toString();
  return qs ? `${path}?${qs}` : path;
}

/** `/m/loc/<code>` — a location or movable rack record. */
export function locationPath(code: string): string {
  return fill(livePath('location'), 'code', code);
}

/** `/m/loc/<code>/info`. */
export function locationInfoPath(code: string): string {
  return fill(livePath('location-info'), 'code', code);
}

/** `/m/h/<id>` — a tote. */
export function containerPath(id: string | number): string {
  return fill(livePath('container'), 'id', String(id));
}

/** `/m/stock/<stockId>/photos?sku=&back=`. */
export function stockPhotosHref(stockId: string | number, params: { sku?: string | null; back?: string | null }): string {
  return withQuery(fill(livePath('stock-photos'), 'stockId', String(stockId)), params);
}

/** `/m/labels?code=&kind=&back=` — the location / bay sticker builder. */
export function locationLabelsHref(params?: { code?: string | null; kind?: string | null; back?: string | null }): string {
  return withQuery(WAREHOUSE_PATHS.locationLabels, params);
}

/** `/m/stock/labels?rack=&back=` — rack shelf stickers (merges into Location labels in phase 2). */
export function rackLabelsHref(params?: { rack?: string | null; back?: string | null }): string {
  return withQuery(WAREHOUSE_PATHS.rackLabels, params);
}

// ── Lookups (the guard and the MCP read these) ──────────────────────────────

export function routeNode(id: string): RouteNode | undefined {
  return ROUTE_TREE.find((node) => node.id === id);
}

export function routeChildren(id: string | null): RouteNode[] {
  return ROUTE_TREE.filter((node) => node.parent === id);
}

/** Root-first chain of a node and its parents. */
export function routeAncestry(id: string): RouteNode[] {
  const chain: RouteNode[] = [];
  let node = routeNode(id);
  while (node) {
    chain.unshift(node);
    node = node.parent ? routeNode(node.parent) : undefined;
  }
  return chain;
}

function patternRegex(pattern: string): RegExp {
  const escaped = pattern.replace(/[.*+?^${}()|\\]/g, '\\$&').replace(/\\?\[[^\]]+\\?\]/g, '[^/]+');
  return new RegExp(`^${escaped}/?$`);
}

/** The node a concrete pathname belongs to (live path first, then target). Query strings are ignored. */
export function routeForPath(pathname: string): RouteNode | undefined {
  const bare = pathname.split(/[?#]/)[0]!.replace(/\/+$/, '') || '/';
  // Static segments beat dynamic ones (`/m/racks/new` before `/m/loc/[code]`).
  const ranked = [...ROUTE_TREE].sort(
    (a, b) => Number((a.path ?? '').includes('[')) - Number((b.path ?? '').includes('[')),
  );
  return (
    ranked.find((node) => node.path && patternRegex(node.path).test(bare)) ??
    ranked.find((node) => patternRegex(node.target).test(bare))
  );
}

/** The node whose page is this file. */
export function routeForFile(file: string): RouteNode | undefined {
  const rel = file.replace(/^\.\//, '');
  return ROUTE_TREE.find((node) => node.page === rel);
}

/** A word → its term: by id, label, plural, or as a banned synonym (which names the canonical term). */
export function lookupTerm(word: string): { term: VocabularyTerm; via: 'term' | 'banned' } | undefined {
  const w = word.trim().toLowerCase();
  if (!w) return undefined;
  for (const term of VOCABULARY) {
    if ([term.id, term.label, term.plural, term.segment ?? ''].some((v) => v.toLowerCase() === w)) return { term, via: 'term' };
  }
  for (const term of VOCABULARY) {
    if (term.banned.some((b) => b.toLowerCase().split(' (')[0] === w)) return { term, via: 'banned' };
  }
  return undefined;
}
