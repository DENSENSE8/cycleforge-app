# Current sidebar / tab / triage API inventory (scouted 2026-09-26)

Source: scout `SidebarContractInventory`. File:line refs are as of this date; re-verify before editing.

# Contextual Master-Nav Backend Handoff Investigation

## 1. Per-Route Context Panels & Station Surfaces

Mounted by `src/components/sidebar/SidebarContextPanel.tsx` (via `getSidebarRouteKey(pathname)`) inside `src/components/sidebar/ContextPanelLayout.tsx`:

### 1. `routeKey === 'dashboard'` → `DashboardOrdersContextPanel` (`src/components/sidebar/DashboardOrdersContextPanel.tsx:34`)
- **Shows**:
  - `domain === 'inbound'`: `DashboardRecentsPanel` — recent detail stacks (orders/cartons) opened from search/palette.
  - `domain === 'sales'`: `WalkInHistorySidebar` — station deep-links ("New sale", "Local pickup", "Repair intake"); returns `null` for `?mode=repairs` (table-only).
  - Outbound fallback: `OrderIngestRail` (when `?new=true` intake overlay is open).
- **Feeding Hooks/Queries/APIs**:
  - `useRecentDetailStacks()` (`src/lib/detail-stacks/history-store.ts`) reads localStorage key `cycleforge:detail-stacks:history:v1`.
  - `useDashboardSearchController()` reads URL `?new=`, `?open=`.
- **URL Params Written / Read**:
  - Read: `?mode=`, `?new=`, `?openOrderId=`.
  - Written: Handoff buttons navigate to `/counter`, `/pickup`, `/repair?new=true` via `walkInStationHref`.

### 2. `routeKey === 'operations'` → `OperationsSidebarPanel` (`src/components/sidebar/OperationsSidebarPanel.tsx:64`)
- **Shows**:
  - `mode === 'live'`: KPI tiles (Scans today, Tested today, FBA scans, Repair queue) + SearchBar + Live Activity Feed (last 24 events).
  - `mode === 'insights'`: Ops Assistant capabilities + quick-prompt suggestion cards.
  - `mode === 'signals'`: HorizontalButtonSlider (`signalsView`: timeline vs browse) + Time window dropdown (`?window=`) + Signal kind dropdown (`?signalKind=`) + notes search bar (`?q=`).
  - `mode === 'history'`: SearchBar ("Paste order, serial, or tracking…") + Dimension slider (`?dim=order|carton|unit|tracking`) + `HistoryBrowseFilters`.
  - `mode === 'reconciliation'`: Static teaching copy ("Reconcile: Serial↔order binding risks").
  - `mode === 'checks'`: Static teaching copy ("Checks: Daily list roster").
  - `mode === 'goals'`: `<GoalsSidebarPanel />`.
  - `mode === 'staff'`: `<StaffScheduleSidebarPanel />`.
  - `mode === 'logs'`: `<LogsSidebarPanel />`.
- **Feeding Hooks/Queries/APIs**:
  - `useQuery({ queryKey: OPERATIONS_QUERY_KEY })` (`src/features/operations/components/operations-dashboard-logic.ts`): reads cache populated by workspace `GET /api/dashboard/operations`. Response keys: `{ summary: { all, tested, fba, repair }, activityFeed: Array<{ id, summary, type, source, actor_name }> }`.
  - `useOperationsTimelineUrlState()`: reads/writes URL state.
- **URL Params Written**:
  - Signals: `?signalsView=`, `?window=`, `?signalKind=`, `?q=`, `?signalId=`.
  - History: `?entity=`, `?dim=`, `?grain=`, `?q=`, `?staffId=`.

### 3. `routeKey === 'studio'` → `StudioSidebarPanel` (`src/components/sidebar/StudioSidebarPanel.tsx:55`)
- **Shows**: View dropdown combining Lens (Build, Procedure, Static, Live, Flow, People, Gaps) and Zoom (L0 Map, L1 Flow, L2 Station); node Library palette; diagnostics / issues rail.
- **Feeding Hooks/Queries/APIs**: `useStudioWorkspace()` (`src/components/studio/StudioWorkspaceContext.tsx`).
- **URL Params Written**: `?lens=`, `?z=`.

### 4. `routeKey === 'support'` → `SupportSidebarPanel` (`src/components/sidebar/SupportSidebarPanel.tsx:16`)
- **Shows**: `SupportTicketsRecentRail` — recently opened tickets dock (`History · N`), status/priority facet filters, search field. Note: Non-ticket modes (`voicemail`, `calls`, `warranty`, `issues`, `orders`) declare `railless: true` in `isRaillessSurface` and render no context column.
- **Feeding Hooks/Queries/APIs**:
  - `useRecentTickets()` (`src/hooks/useRecentTickets.ts`) reads localStorage `cycleforge:support:recent-tickets:v1`.
  - `useSupportTicketParam()` reads/writes URL `?ticket=`.
- **URL Params Written**: `?ticket=<ticketId>`, `?mode=`.

### 5. `routeKey === 'ai-chat'` → `AiChatSidebarPanel` (`src/components/sidebar/AiChatSidebarPanel.tsx:29`)
- **Shows**: Capabilities cards (Orders & Shipping, Staff & FBA & Inventory, Repairs & Receiving, Bose Service Manuals), example prompt buttons, "New chat" button.
- **Feeding Hooks/Queries/APIs**: None (static capabilities; emits client window events `ai-chat-prompt` and `ai-chat-new`).
- **URL Params Written**: None.

### 6. `routeKey === 'settings'` → Roles / Access Pickers (`src/components/sidebar/SidebarContextPanel.tsx:55`)
- **Path `/settings/roles`**: `RolesSidebarPanel` (`src/components/admin/RolesSidebarPanel.tsx:39`)
  - **Shows**: Drag-and-drop sortable list of roles, "+ Create role" modal button.
  - **Feeding API**: `GET /api/admin/roles` (Credentials include, `cache: 'no-store'`). Response: `{ roles: RoleRow[] }` where `RoleRow = { id, key, label, color, position, is_system, member_count }`. Mutations: `PATCH /api/admin/roles/order` (`{ orderedIds: number[] }`).
  - **URL Params Written**: `?roleId=<id>`.
- **Path `/settings/access`**: `AccessSidebarPanel` (`src/components/admin/AccessSidebarPanel.tsx:64`)
  - **Shows**: Search bar (`?search=`), status filter buttons (`?accessStatus=all|active|invited|disabled`), stat pills, staff row list, "+ Add staff" button.
  - **Feeding API**: `GET /api/admin/staff`. Response: `{ staff: StaffRow[] }` where `StaffRow = { id, name, role, status, active, employee_id, employee_code, has_pin, passkey_count, last_login_at }`. Mutations: `PATCH /api/admin/staff/order`.
  - **URL Params Written**: `?search=`, `?accessStatus=`, `?staffId=`.

### 7. `routeKey === 'audit-log'` → `AuditLogSidebarPanel` (`src/components/sidebar/AuditLogSidebarPanel.tsx:24`)
- **Shows**: Section search bar + Audit Filters dropdown (refinements: date/staff). Child section pickers:
  - `trace`: `TraceSerialPicker` — recently traced serials (localStorage `audit-log:trace-recents:v1`), submits to `?serial=`.
  - `receiving`: `ReceivingPOPicker` — debounced PO list. Fed by `GET /api/audit-log/receiving?q=<query>&limit=50`. Response: `{ success: boolean, items: POSummary[] }`. Writes `?po=<po>`.
  - `packing`: `PackingTrackingPicker` — tracking numbers list. Fed by `GET /api/audit-log/packing?q=&limit=50&day=&start=&end=&staffId=`. Response: `{ success: true, items: TrackingSummary[] }`. Writes `?tracking=`.
  - `tech`: `TechSessionPicker` — Fed by `GET /api/audit-log/tech`. Response: `{ success: true, items: TechSummary[] }`. Writes `?session=`.
  - `sku`: `SkuPicker` — Fed by `GET /api/audit-log/sku`. Response: `{ success: true, items: SkuSummary[] }`. Writes `?sku=`.
- **URL Params Written**: `?serial=`, `?po=`, `?tracking=`, `?session=`, `?sku=`.

### 8. `routeKey === 'receiving'` → `ReceivingSidebarPanel` (`src/components/sidebar/ReceivingSidebarPanel.tsx:66`)
- **Shows** (governed by mode via `useReceivingMode`):
  - **Unbox** (`/unbox`): `UnboxScanBand` (active carton, tracking/PO/handle scan bar) + `ReceivingReturnBanner` + `ReceivingFeedRail` (`feed="unboxRecent"`). Shows last unboxed cartons, status dot, item count, and time.
  - **Triage / Arrival** (`/triage`): `TriageScanBand` + `ArrivalBatchCaptureStrip` + `ReceivingFeedRail` (`feed="triageCombined"`, via `ReceivingRailBody`). Every Arrival scan writes through `showOnArrivalRail`.
  - **Local Pickup** (`/pickup`): `PickupScanBand` + `PickupSidebarRail` (order groups, customer, line counts) + `PickupRailFilters`.
  - **Repair** (`/repair`): Declared `railless: true` (rail-less since 2026-09-16; intake host moved to main stage).
- **Feeding Hooks/Queries/APIs**:
  - First paint: the Unbox shell seed (`ShellQuerySeed`, first hydration only); the React Query cache under the rail key is the only rail row store.
  - Authoritative lines: `GET /api/receiving-lines?view=unboxRecent&staff=<staffId>&limit=50` (or `view=triage`, `view=scanned`). Response: `{ success: true, receiving_lines: ReceivingLineRow[], total: number }`.
  - Local pickup rail: `queryKey: ['local-pickup-orders-rail']` fed by `GET /api/local-pickup/orders`.
  - Tracking scan resolver: `useTrackingScan` orchestration calling `/api/scan/resolve` and internal router `routeScan()`.
- **URL Params Written**: `?mode=`, `?view=`, `?tab=`, `?triq=`, `?id=` (line id), `?receivingId=` (carton id), `?sel=`.

### 9. `routeKey === 'fba'` → `FbaSidebarPanel` (`src/components/fba/sidebar/FbaSidebar.tsx:16`)
- **Shows**:
  - `fbaMode === 'catalog'`: `<FbaCatalogSidebarPanel />` (FNSKU catalog search and filter).
  - Normal modes (`plan`, `combine`, `shipped`): `FbaWorkspaceScanField` (FNSKU scanner) + `FbaCombineRailBody` / `FbaPlanRailBody` (active plans, tracking groups, unallocated buckets).
- **Feeding Hooks/Queries/APIs**:
  - `fetch(fbaPaths.activeWithDetails())` → `GET /api/fba/active-with-details` (`{ active: FbaPlan[], shipped: FbaShipment[] }`).
  - `fetch('/api/fba/stage-counts')` → `GET /api/fba/stage-counts` (`{ counts: Record<string, number> }`).
- **URL Params Written**: `?fbaMode=plan|combine|shipped|catalog`, `?fnsku=`, `?search=`.

### 10. `routeKey === 'sourcing'` → `SourcingSidebarPanel` (`src/components/sidebar/SourcingSidebarPanel.tsx:50`)
- **Shows**: SearchBar + HorizontalButtonSlider per mode:
  - `mode === 'scout'`: search field + `?by=model|serial`.
  - `mode === 'suppliers'`: search field + `?type=all|ebay_seller|distributor|salvage|oem`.
  - `mode === 'queue'`: `?status=live|resolved|dismissed`.
  - `mode === 'watchlist'`: `?status=all|watching|ordered|imported`.
  - `mode === 'models'`: `<BoseModelsSidebarPanel />`.
  - `mode === 'compatibility'`: `<CompatibilitySidebarPanel />`.
- **Feeding Hooks/Queries/APIs**: Pure URL-state writer; data tables in main pane read params and fetch `/api/sourcing/*`.
- **URL Params Written**: `?q=`, `?by=`, `?type=`, `?status=`.

### 11. `routeKey === 'products'` → `ProductsSidebarPanel` (`src/components/sidebar/ProductsSidebarPanel.tsx:44`)
- **Shows**:
  - `view === 'labels'`: `ProductLabelsRecentRail` — recently printed unit labels list with facets (`LabelPrintRailFilters`). Fed by `GET /api/labels/recent?limit=12` (`{ success: true, items: LabelPrintFeedItem[] }`). Writes `?historyId=`.
  - `view === 'manuals'`: `LibraryBrowser` — folder tree browser for manuals.
  - `view === 'pairing'`: `PairingUnmatchedSection` + `PairingQueueList` + Sort slider (`?sort=volume|confidence|count|title`).
  - Default (Catalog): SKU search bar (`?q=`) + SKU list via `useSkuCatalogSearch()`. Selection via `useProductsSkuIdParam()` writes `?skuId=`.
- **URL Params Written**: `?q=`, `?sort=`, `?skuId=`, `?historyId=`, `?view=`.

### 12. `routeKey === 'walk-in'` → `WalkInSidebarPanel` (`src/components/sidebar/WalkInSidebarPanel.tsx:14`)
- **Shows**: `<WalkInHistorySidebar />` (same as Dashboard sales). Deep-links to `/counter`, `/pickup`, `/repair?new=true`.

### 13. `routeKey === 'tech'` → `TechSidebarPanel` (`src/components/sidebar/TechSidebarPanel.tsx:21`)
- **Shows** (governed by `view` param):
  - `view === 'testing'`: `TestingSidebarPanel` — `TestingScanBar` + `TestingRecentRail` (feed: `testingRecent`, `GET /api/receiving-lines?view=testing_opened`) + `ReceivingRecentRailFilters`.
  - Default / `view !== 'testing'`: `ShippingSidebarPanel` (Ready to Pack) — `ShippingScanBand` + `ShippingStaffScanHistoryRail` (last 25 tech scans) + `StationHistoryRailFilters`.
- **Feeding Hooks/Queries/APIs**:
  - `TestingRecentRail`: `GET /api/receiving-lines?view=testing_opened&staff=<staffId>&limit=50`.
  - `ShippingStaffScanHistoryRail`: `useTechLogs()` calling `GET /api/picking/desk/logs?techId=<id>&limit=100&q=`.
- **URL Params Written**: `?view=testing`, `?ship=urgent`, `?staffId=`.

### 14. `routeKey === 'packer'` → `PackerSidebarPanel` (`src/components/sidebar/PackerSidebarPanel.tsx:14`)
- **Shows**: `PackScanColumn` (packer scan bar) + `PackRecentPacksRail` (last 25 packed orders for current week) + SearchField + `StationHistoryRailFilters`.
- **Feeding Hooks/Queries/APIs**: `usePackerLogs()` calling `GET /api/packerlogs?packerId=<id>&limit=1000`. Response: array of `PackerRecord`.
- **URL Params Written**: `?packMode=standard|fragile|multi`.

### 15. `routeKey === 'review'` → `ReviewSidebarPanel` (`src/components/sidebar/review/ReviewSidebarPanel.tsx:33`)
- **Shows**: `StaffFilterButton` (when mode is `packer` or `pairing`) + static teaching prompt card (`REVIEW_RAIL_EMPTY_STATE[mode]`).
- **Feeding Hooks/Queries/APIs**: None directly in rail.
- **URL Params Written**: `?staff=`.

---

## 2. In-Page Tab Desks (`DeskPageChrome` / `SIDEBAR_PAGE_NAV` Children)

Evaluated via `hasDeskPageChrome(page) = Boolean(page.deskChrome) && (page.children?.length ?? 0) > 1` (`src/lib/sidebar-navigation.ts:2212`):

| Page ID | Label | Canonical Path | Railless | Children Count | Children IDs, Labels & Targets | `resolveChild` Logic Summary |
|---|---|---|---|---|---|---|
| `sales` | Sales | `/dashboard?mode=sales` | No | 4 | 1. `counter`: 'Counter' (`/counter`)<br>2. `sales`: 'Sales Board' (`/dashboard?mode=sales`)<br>3. `pickup`: 'Local Pickup' (`/dashboard?mode=pickup`)<br>4. `repairs`: 'Repair Service' (`/dashboard?mode=repairs`) | `pathname.startsWith('/counter')` → `'counter'`; `mode === 'pickup'` → `'pickup'`; `mode === 'repairs'` → `'repairs'`; default `'sales'`. |
| `operations` | Operations | `/operations` | No | 11 | 1. `live`: 'Live' (`/operations`)<br>2. `checks`: 'Checks' (`?mode=checks`)<br>3. `packing-review`: 'Packing Review' (`/review`)<br>4. `insights`: 'Insights' (`?mode=insights`)<br>5. `history`: 'History' (`?mode=history`)<br>6. `signals`: 'Signals' (`?mode=signals`)<br>7. `reconciliation`: 'Reconcile' (`?mode=reconciliation`)<br>8. `goals`: 'Goals' (`?mode=goals`)<br>9. `quality`: 'Quality' (`?mode=quality`)<br>10. `staff`: 'People' (`?mode=staff`)<br>11. `sync`: 'Sync' (`?mode=sync`)<br>12. `logs`: 'Logs' (`?mode=logs`) | If `pathname.startsWith('/review')`: returns `null` if mode is `pairing` or `catalog-link`, else `'packing-review'`. Matches `?mode=` against children ids, defaulting to `'live'`. |
| `reports` | Reports | `/reports` | No | 4 | 1. `staff-day`: 'Staff day' (`/reports`)<br>2. `utilization`: 'Bin Utilization' (`?tab=utilization`)<br>3. `velocity`: 'Velocity (30d)' (`?tab=velocity`)<br>4. `dead-stock`: 'Dead Stock' (`?tab=dead`) | Matches `?tab=`: `'utilization'` → `'utilization'`, `'velocity'` → `'velocity'`, `'dead'` → `'dead-stock'`, default `'staff-day'`. |
| `incoming` | Deliveries | `/incoming` | Yes | 2 | 1. `pipeline`: 'On the way' (`/incoming`)<br>2. `docked`: 'History' (`/incoming?lane=docked`) | Returns `null` if `pathname !== '/incoming'`. Otherwise `parseInboundLane(params.get('lane')) === 'docked' ? 'docked' : 'pipeline'`. |
| `sourcing` | Sourcing | `/sourcing` | No | 7 | 1. `queue`: 'Queue' (`/sourcing`)<br>2. `scout`: 'Scout' (`?mode=scout`)<br>3. `watchlist`: 'Watchlist' (`?mode=watchlist`)<br>4. `searches`: 'Searches' (`?mode=searches`)<br>5. `suppliers`: 'Suppliers' (`?mode=suppliers`)<br>6. `models`: 'Models' (`?mode=models`)<br>7. `compatibility`: 'Compatibility' (`?mode=compatibility`) | Matches `?mode=`: `scout`/`lookup` → `'scout'`, `watchlist` → `'watchlist'`, `searches` → `'searches'`, `suppliers` → `'suppliers'`, `models` → `'models'`, `compatibility` → `'compatibility'`, default `'queue'`. |
| `outbound` | Shipping | `/shipping/orders` | Yes | 4 | 1. `exceptions`: 'Exceptions' (`/shipping/exceptions`)<br>2. `shortage`: 'Picking' (`/shipping/shortage`)<br>3. `orders`: 'To ship' (`/shipping/orders`)<br>4. `shipped`: 'Shipped' (`/shipping/shipped`) | Returns `null` for `/review`, `/shipping/labels`, FBA paths, or `?context=support`. Matches `/shipping/shipped` → `'shipped'`, `/shipping/shortage` → `'shortage'`, `/shipping/exceptions` → `'exceptions'`, default `'orders'`. |
| `products` | Products | `/products` | No | 4 | 1. `manuals`: 'Manuals' (`/products`)<br>2. `labels`: 'SKU Barcodes' (`?view=labels`)<br>3. `pairing`: 'Pairing' (`?view=pairing`)<br>4. `qc`: 'QC Checklist' (`?view=qc`) | If `/review` and `?mode=pairing` → `'pairing'`. Otherwise delegates to `parseProductsView(params.get('view'))`. |
| `inventory` | Inventory | `/inventory` | Yes | 11 | 1. `stock`: 'Stock' (`/inventory/stock`)<br>2. `sku-exceptions`: 'SKU Exceptions' (`/inventory/sku-exceptions`)<br>3. `ledger`: 'Ledger' (`/inventory`)<br>4. `triage`: 'Tracking Exceptions' (`/inventory/triage`)<br>5. `pulse`: 'Pulse' (`/inventory/pulse`)<br>6. `graph`: 'Graph' (`/inventory/graph`)<br>7. `replenish`: 'Replenish' (`/inventory?section=replenish`)<br>8. `locations`: 'Locations' (`/inventory/locations`)<br>9. `reason-codes`: 'Reason Codes' (`/inventory/reason-codes`)<br>10. `favorites`: 'Quick Picks' (`/inventory/favorites`)<br>11. `health`: 'Health' (`/inventory/health`) | Matches sub-paths: `/locations` (or `/warehouse`) → `'locations'`, `/stock` → `'stock'`, `/sku-exceptions` → `'sku-exceptions'`, `/graph`, `/triage`, `/pulse`, `/reason-codes`, `/favorites`, `/health`. Returns `null` for unlit ops routes. `?section=replenish` → `'replenish'`. Default `'ledger'`. |
| `support` | Support | `/support` | Yes* (except tickets) | 5 | 1. `tickets`: 'Tickets' (`/support`)<br>2. `voicemail`: 'Voicemail' (`?mode=voicemail`)<br>3. `calls`: 'Calls' (`?mode=calls`)<br>4. `warranty`: 'Warranty' (`?mode=warranty`)<br>5. `issues`: 'Issues' (`?mode=issues`) | Matches `?mode=`: `'voicemail'`, `'calls'`, `'warranty'`, `'issues'`, default `'tickets'`. |

*Note: `home` has `deskChrome: true` but 0 children (single agenda table).*

---

## 3. Existing Triage / Identification APIs

| API Endpoint | Method | Params | Auth & Permission | Tenant Scoping Helper | Response Shape Keys | Cache / Latency Notes |
|---|---|---|---|---|---|---|
| `/api/scan/resolve` | `GET`, `POST` | `input` (query/body), `device` (optional body) | `withAuth(..., { permission: 'sku_stock.view' })` | `tenantQuery(ctx.organizationId, ...)` | `{ ok, kind, source, raw, url?, ais?, entity?, redirectTo?, matches: OrderMatch[], matchOutcome: 'single'\|'multi'\|'none', mobileRoute }` | Sub-50ms; uses Upstash `CACHE_NS.skuByGtin` (1800s). Fire-and-forget telemetry via `mobile_scan_events`. |
| `/api/orders/lookup/[orderId]` | `GET` | `orderId` (path: order_id or integer PK), `by=id` | `withAuth(..., { permission: 'orders.view' })` | `tenantQuery(orgId, ...)`, `findOrderByTrackingKey(..., pool, orgId)` | `{ ok: true, order: OrderLookupRecord, activity: ActivityRow[] }` | Upstash cache `CACHE_NS.orderDetail` with 20s TTL tagged `orders, techLogs, orderDetail`. |
| `/api/global-search` (Hybrid Search / ⌘K) | `GET` | `q` or `search`, `limit` (1-50, default 20), `axis`, `surface` (`palette`\|`search-page`) | `withAuth(...)` (logged-in session) | `findRecords(ctx.organizationId, query, { limit, axis })` calling `hybridSearch` + `tenantQuery` | `{ rows: SearchHit[], count, query, relaxed, effectiveQuery, usedSemantic }` | Upstash cache 60s partitioned by org (`api:global-search:v5:${org}`). Header `'x-cache': 'HIT'\|'MISS'`. Logs to `query_logs`. |
| `/api/receiving-lines` | `GET` | `view`, `sort`, `staff`, `id`, `receivingId`, `q`, `limit` (default 50), `offset`, `include=serials` | `withAuth(..., { permission: 'receiving.view' })` | `tenantQuery`, `withTenantConnection`, `withTenantTransaction` | `{ success: true, receiving_lines: ReceivingLineRow[], total: number }` | Rejects testing views on receiving endpoint via `isTestingApiView`. |
| `/api/picking/desk/logs` | `GET` | `techId` ('all' or ID), `weekStart`, `weekEnd`, `q`, `limit` (default 500), `offset` | `withAuth(..., { permission: 'tech.view' })` | `tenantQuery` with `orgId` | Array of `TechRecord` (`[{ id, scan_ref, created_at, action_type, station, condition, notes, staff_id, staff_name, order_id }]`) | Upstash cache `'api:tech-logs-v3'`: 60s TTL for live scope, 3600s for historical. Search drops limit to scan full week up to 5000 rows. |
| `/api/packerlogs` | `GET`, `POST` | GET: `packerId`, `testedBy`, `staff`, `shippedFilter`, `q`, `phase=spine`, `limit`, `offset`, `weekStart`, `weekEnd` | GET: `packing.view`; POST: `packing.complete_order` | `fetchPackerLogRows({ organizationId: ctx.organizationId, ... })`, `withTenantTransaction` | Array of `PackerRecord`: `[{ id, shipping_tracking_number, scan_ref, tracking_type, packed_by, packer_name, created_at, ... }]` | Cache-Control: `private, max-age=${cacheTTL}, stale-while-revalidate=30`, Header `'x-cache': 'HIT'\|'MISS'`. |
| `/api/labels/recent` | `GET` | `limit` (1-200, default 50), `staffId` ('all' or ID) | `withAuth(..., { permission: 'print.label' })` | `tenantQuery(ctx.organizationId, ...)` | `{ success: true, items: RecentRow[] }` | Queries `station_activity_logs` where `activity_type = 'LABEL_PRINTED'`. |
| `/api/saved-views` | `GET`, `POST` | GET: `surface` (from `GENERIC_SAVED_VIEW_SURFACES`) | `withAuth(..., { permission: 'dashboard.view' })` | `listSavedViews(ctx.organizationId, ctx.staffId, surface)` | GET: `{ success: true, views: SavedViewRow[] }`; POST: `{ success: true, view: SavedViewRow }` | Scoped by `organization_id` AND `(staff_id = $staffId OR is_shared = true)`. Filter JSON capped at 8192 chars. |
| `/api/orders/queue-counts` | `GET` | `staff` (optional staff ID) | `withAuth(..., { permission: 'orders.view' })` | `tenantQuery(ctx.organizationId, ...)`, `countOpenPlacementsByLocation` | `{ total, byStage: { all, tested, pending, packed }, urgent, mustShip, shippedToday, combos, packPlacement, paperworkIncomplete }` | Upstash cache 60s. Never throws 500; returns 200 with `{ degraded: true, error: 'queue_counts_unavailable' }` on DB error. |
| `/api/orders/desk-counts` | `GET` | None | `withAuth(..., { permission: 'orders.view' })` | `getDeskCounts(orgId)` using `tenantQuery` and `countOrderExceptions` | `{ exceptions, po, pick, triage, shippedToday }` | Upstash cache 60s tagged `['orders']`. Bundles 5 counts into 1 round-trip. |
| `/api/orders/exceptions` | `GET` | `orderId` (single), `scope` ('actionable'\|'all'), `category`, `q`, `limit` | `withAuth(..., { permission: 'orders.view' })` | `listOrderExceptions(orgId, ...)` | Single: `{ ok: true, exception: row }`; List: `{ ok: true, scope, count, exceptions: row[] }` | Direct query on `orders_exceptions` view / table. |

---

## 4. Nav Registries & Contracts

### `SIDEBAR_PAGE_NAV` (`src/lib/sidebar-navigation.ts:1140-2035`)
- Pure data structure of `SidebarPageNav[]`:
  - Fields: `id`, `label`, `href`, `icon`, `kind` (`'top' | 'main' | 'station' | 'domain'`), `domainGroup` (`'inbound' | 'fulfillment' | 'inventory' | 'catalog' | 'sales' | 'support'`), `stationGroup` (`'floor'`), `stationSubgroup`, `requires`, `railless`, `deskChrome`, `children`, `resolveChild`.
  - Child fields: `id`, `label`, `icon`, `requires`, `to(): { pathname: string; params: Record<string, string | null> }`.
  - Invariant: `resolveChild(apply(to(child))) === child.id` enforced by `src/lib/sidebar-navigation.test.ts`.

### `lanes.ts` (`src/lib/nav/lanes.ts`)
- Defines `DomainGroupId = 'inbound' | 'catalog' | 'inventory' | 'fulfillment' | 'sales' | 'support'`.
- `DOMAIN_GROUPS`: Maps each lane to label & icon.
- `LANE_MOBILE_FIRST`: Enforces mobile-first gate (`'ported' | 'desk-only' | 'hidden'`).

### Route Registry (`src/lib/routing/registry.ts`)
- Combines `RECEIVING_ROUTE_PARAMS`, `OUTBOUND_ROUTE_PARAMS`, and `QUERY_MODE_ROUTE_PARAMS`.
- `routeParamsFor(pathname)`: Scans specs longest-prefix-first to return `RouteParamsSpec`.

### Route Params & Hygiene (`src/lib/routing/route-params.ts`, `useSurfaceParamHygiene.ts`)
- Defines param schemas via Zod transforms: `paramEnum`, `paramEnumUpper`, `paramRoundTrip`, `paramCanonical`, `paramPositiveInt`, `paramDateKey`, `paramText`.
- `useSurfaceParamHygiene()`: Runs on route mount/navigation. Parses active query parameters against `spec.params`; any param not explicitly declared by the surface is stripped via `router.replace` without remounting, preventing cross-surface parameter leakage.

---

## 5. API Route Test Conventions & Authed Probes

### Unit Test Conventions
- **Framework**: Native `node:test` + `node:assert/strict` executed via `tsx` or `node --import tsx --import ./scripts/register-server-only-shim.cjs --test <file>`.
- **Fakes & Stubs**: Database operations mock `tenantQuery`, `pool.query`, or inject a `Deps` interface (e.g. `FindRecordsDeps` in `src/lib/search/find-records.test.ts`, `HybridSearchDeps` in `src/lib/search/hybrid-retrieval.test.ts`).
- **Server-Only Shim**: Scripts require `./scripts/register-server-only-shim.cjs` to bypass Next.js `import 'server-only'` guard in Node test environments.
- **Route Guard Audits**: `tsx scripts/audit-route-auth.ts --check` statically scans every `src/app/api/**/route.ts` to enforce `withAuth` and valid permissions.

### Authed Probes & Scripts against `:3050`
1. **Lighthouse Session Mint**: `scripts/lighthouse-mint-session.mjs`
   - Hits `http://localhost:3050/api/auth/staff-picker` with header `x-tenant-slug: usav`.
   - Hits `POST http://localhost:3050/api/auth/signin` with `{ staffId, deviceKind: 'personal' }` (requires `AUTH_PINLESS_SIGNIN=true`).
   - Extracts and writes the switchboard session cookie `cf_sid=...`.
2. **Endpoint Smoke Probes**: `scripts/test-endpoints.js`
   - Executes systematic GET/POST requests against `http://localhost:3050` via `--base http://localhost:3050`.
   - Validates response HTTP status codes, JSON shapes, and timing.

---

## 6. Redundant Left-Column & Tab-Strip Components (Removal Candidates)

Once the contextual master sidebar lands, the following components and scaffolding can be retired:

1. **Second Left-Column Host & Resize Framework**:
   - `src/components/sidebar/ContextPanelLayout.tsx`: The entire second-column container (`data-context-panel`, `HorizontalEdgeResizeHandle`, resize persistence `CONTEXT_PANEL_RESIZE`).
   - `src/components/sidebar/context-panel-column.ts`, `context-panel-collapse-context.tsx`, `context-panel-toggle-hotkey.ts`.
   - `src/components/sidebar/tech/left-dock-toggle.tsx`: `LeftDockCollapseStrip`, `CollapseStripScanCell`, `CollapseStripMruPins`.
   - `src/components/sidebar/useIsRaillessSurface.ts` & `src/lib/sidebar-navigation.ts:isRaillessSurface`: Obsoleted when the master nav itself becomes the single context panel.
2. **In-Page Desk Chrome Tab Strips**:
   - `src/design-system/components/DeskPageChrome.tsx`: Specifically the `tabs={decorated}` row and `tabsLead`.
   - `src/components/desk/useDeskPageChromeTabs.ts`: Nav-to-tabs adapter that turns `SIDEBAR_PAGE_NAV.children` into horizontal desk tabs.
   - `src/components/desk/DeskPageLayout.tsx`: In-page tab layout wrapper.
   - `src/components/layout/HeaderPageSwitcher.tsx`: Duplicate L2 switcher in the global header.
3. **Thin / Presentational Wrapper Sidebar Panels**:
   - `src/components/sidebar/review/ReviewSidebarPanel.tsx`: Houses only an empty teaching card and staff filter button.
   - `src/components/sidebar/AiChatSidebarPanel.tsx`: Houses only static cards and prompt suggestions.
   - `src/components/sidebar/WalkInSidebarPanel.tsx` & `src/components/walk-in/WalkInHistorySidebar.tsx`: Static deep-link buttons.
   - `src/components/sidebar/OperationsSidebarPanel.tsx`: Reconciliation and Checks static informational text cards.
