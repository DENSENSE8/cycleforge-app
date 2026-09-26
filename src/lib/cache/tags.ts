/** Cache tag registry (Phase 0.7). */
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

  // ── Phase 2 hot-path read wraps (B2–B5) ─────────────────────────────────── Registered now so the tag/namespace SoT is complete before…
  /** `/api/fba/stage-counts` — GROUP BY status over fba_shipment_items (120s poll). */
  fbaStageCounts: 'fba-stage-counts',
  /** Legacy dashboard FBA shipments rollup — route deleted 2026-07-29 (IA row L). */
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
  /** Ecwid repair-service catalog (products + category tree). */
  ecwidRepairCatalog: 'ecwid-repair-catalog',
} as const;

export type CacheNamespace = (typeof CACHE_NS)[keyof typeof CACHE_NS];

/** TTL policy by volatility class (seconds). */
export const CACHE_TTL = {
  reference: 600,
  rollup: 90,
  stationRead: 30,
  seed: 60,
} as const;
