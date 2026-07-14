/**
 * Cache tag registry (Phase 0.7).
 *
 * A typed catalog of the cache tag names in use, mirroring `src/queries/keys.ts`
 * for the client. Tag *values* here are the bare names; the cache layer
 * org-scopes them (`cache_tags:v2:{tag}:{orgId}`). Centralizing the strings
 * prevents the "stringly-typed invalidation silently stops matching" class of bug.
 *
 * Every cached read declares its tags from here; every writer invalidates via
 * `invalidateCacheTags(orgId, [CACHE_TAGS.x])` at the route chokepoint.
 */
export const CACHE_TAGS = {
  // ── Orders / fulfillment ──────────────────────────────────────────────────
  orders: 'orders',
  ordersNext: 'orders-next',
  shipped: 'shipped',
  packingLogs: 'packing-logs',

  // ── Receiving ─────────────────────────────────────────────────────────────
  receivingLines: 'receiving-lines',
  receivingLogs: 'receiving-logs',
  pendingUnboxing: 'pending-unboxing',

  // ── Tech / repair ─────────────────────────────────────────────────────────
  techLogs: 'tech-logs',
  repairService: 'repair-service',

  // ── Staff ─────────────────────────────────────────────────────────────────
  staff: 'staff',
  /** Per-staff overrides (name/role/added-removed perms/mobile cfg) — the auth
   *  hot-path read. Purged on staff PATCH so a permission revocation is immediate. */
  staffOverrides: 'staff-overrides',

  // ── Reference data (Phase 1 targets) ──────────────────────────────────────
  skuCatalog: 'sku-catalog',
  skuStock: 'sku-stock',
  productManuals: 'product-manuals',
  fbaFnskus: 'fba-fnskus',
  skuKitParts: 'sku-kit-parts',
  qcChecks: 'qc-checks',
  reasonCodes: 'reason-codes',
  /** Per-org platform/account/type catalog (org-catalog.ts L1 Map + Redis L2). */
  catalog: 'org-catalog',

  // ── Station read models (Phase 2 targets) ─────────────────────────────────
  orderDetail: 'order-detail',
  fbaBoard: 'fba-board',
  fbaToday: 'fba-today',
  fbaStageCounts: 'fba-stage-counts',
  poByRef: 'po-by-ref',
} as const;

export type CacheTag = (typeof CACHE_TAGS)[keyof typeof CACHE_TAGS];

/**
 * Cache namespaces (the `ns` argument). Kept alongside the tags so the
 * per-namespace kill-switch allowlist (REDIS_CACHE_NS) references stable names.
 */
export const CACHE_NS = {
  titleBySku: 'title-by-sku',
  skuStock: 'sku-stock',
  manual: 'manual',
  fnskuCatalog: 'fnsku-catalog',
  skuKit: 'sku-kit',
  skuQc: 'sku-qc',
  skuByGtin: 'sku-by-gtin',
  reasons: 'reasons',
  orderDetail: 'order-detail',
  fbaToday: 'fba-today',
  fbaBoard: 'fba-board',
  packPolicy: 'pack-policy',
  poByRef: 'po-by-ref',
  staffOverrides: 'staff-ovr',
  opsDashboard: 'ops-dashboard',
  catalog: 'catalog',
  /** Per-viewer receiving sidebar-rail first-paint seed (localStorage → Redis).
   *  Seed-only: written client-side from the rows a rail just rendered, read to
   *  paint the next reload before the authoritative query resolves. */
  receivingRail: 'receiving-rail',

  // ── Phase 2 hot-path read wraps (B2–B5) ───────────────────────────────────
  // Registered now so the tag/namespace SoT is complete before the reads are
  // wired. Each read model these name is currently uncached; when a read is
  // wrapped in `getOrSet`, add its namespace to the prod REDIS_CACHE_NS allowlist
  // if that env is in use. The tags they carry (receivingLines / fbaStageCounts /
  // fbaBoard / fbaToday / skuCatalog) are ALREADY invalidated by existing writers.
  /** `/api/fba/stage-counts` — GROUP BY status over fba_shipment_items (120s poll). */
  fbaStageCounts: 'fba-stage-counts',
  /** `/api/dashboard/fba-shipments` — shipments rollup (60s poll). */
  fbaDashboard: 'fba-dashboard',
  /** `/api/sku-catalog/search` — reference catalog search (debounced per-keystroke). */
  skuCatalogSearch: 'sku-catalog-search',
  /** `/api/receiving-lines/incoming/summary` — receiving KPI aggregate (30s poll). */
  receivingIncomingSummary: 'receiving-incoming-summary',
  /** `/api/receiving-lines/incoming/details` — per-line drill (60s poll per drawer). */
  receivingIncomingDetails: 'receiving-incoming-details',
  /** `/api/receiving-lines/counts` — GROUP BY day counts (60s poll). */
  receivingLinesCounts: 'receiving-lines-counts',
  /** `/api/receiving-lines/incoming/delivered-*` lanes (60s poll each). */
  receivingIncomingLanes: 'receiving-incoming-lanes',
} as const;

export type CacheNamespace = (typeof CACHE_NS)[keyof typeof CACHE_NS];

/**
 * TTL policy by volatility class (seconds). Pick the class, not an ad-hoc number,
 * when passing `ttlSeconds` to `getOrSet`/`setCachedJson`. These mirror the values
 * already in use (org-catalog 300s, reason-codes 600s, ops-dashboard 45s,
 * order-detail 20s, rail-snapshot 60s) — keep new callers inside the band.
 *
 *   reference   300–600s : stable lookups (catalog, manuals, reason codes, FNSKU)
 *   rollup       45–120s : dashboard/analytics aggregates (ops, kpi, fba dashboard)
 *   stationRead  15–60s  : live station read models (orders-next, receiving-incoming,
 *                          stage-counts, order-detail, inventory-events)
 *   seed             60s : first-paint seeds reconciled by the authoritative query
 *                          (receiving-rail) — seed-only, no tag invalidation
 */
export const CACHE_TTL = {
  reference: 600,
  rollup: 90,
  stationRead: 30,
  seed: 60,
} as const;
