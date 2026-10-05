> **Parent correction (2026-10-05):** the order-details target for shipped orders is this ledger's record slot — `recordDetailsHref` sends shipped orders to `/fulfilled?openOrderId=` (`src/lib/records/record-details.ts:7-9,37`), and `ShippedLedger.tsx:236-300` maps that to `?shipment=` → `useShipmentRecordSlot`. So `use-shipment-record-slot.tsx`, `ResolveShipmentExceptionDialog.tsx` and the parts of `shipped-package-state.ts` the slot uses are **REHOST**, not DELETE; see the main report.

# Phase 1 Scout Report: Fulfillment Sheet (Tree, Delete List, and Reuse Fit)

## 1. Full Component/Hook/Query Tree under `src/app/fulfilled/page.tsx`

### 1.1 Root Page
* **`src/app/fulfilled/page.tsx` (RSC)**
  * Reads `searchParams.shippedFilter` and cookie `SHIPPED_FILTER_COOKIE` (`src/lib/shipping/shipped-feed-config.ts:10`).
  * Calls `seedShippedLedger(shippedFilter)` (`src/lib/queries/shipped-ledger-seed.server.ts:23`).
    * Checks `getCurrentUser()` permission `packing.view` (`src/lib/auth/current-user.ts`).
    * Executes in-process DB fetch `fetchPackerLogRows({ spineOnly: true })` (`src/lib/neon/packer-logs-week.ts`).
    * Dehydrates `QueryClient` with key `shippedFeedQueryKey({ shippedFilter, limit: 100, phase: 'spine' })`.
  * Wraps children in `<HydrationBoundary state={seed.state}>`.
  * Mounts `<ShippedWorkspace initialShippedFilter={seed.shippedFilter} />` (`src/components/outbound/workspaces/ShippedWorkspace.tsx:8`).

### 1.2 Component Tree
```
FulfilledPage (src/app/fulfilled/page.tsx:11)
└── ShippedWorkspace (src/components/outbound/workspaces/ShippedWorkspace.tsx:8)
    └── ShippedLedger (src/components/shipped/ledger/ShippedLedger.tsx:100)
        ├── TriageCardList (src/design-system/components/triage-card-list/TriageCardList.tsx)
        │   ├── Header: RecordActionStrip [bulk copy tracking] (src/design-system/components/record-action-strip/RecordActionStrip.tsx)
        │   ├── Banner: Copy all unmatched Button (ShippedLedger.tsx:373)
        │   ├── Body (density === 'row'):
        │   │   └── ShippedPackageRow (src/components/shipped/ledger/ShippedPackageRow.tsx:30)
        │   │       └── TriageRow (src/design-system/components/triage-card-list/TriageRow.tsx)
        │   │           ├── Photo: marketplaceThumbUrl
        │   │           ├── Facts: packed by, order id chip, condition, price
        │   │           └── Next: carrier status or Resolve
        │   ├── Body (density === 'card'):
        │   │   └── ShippedPackageCard (src/components/shipped/ledger/ShippedPackageCard.tsx:91)
        │   │       └── RecordCard (src/design-system/components/record-card/RecordCard.tsx)
        │   │           ├── Identity: PlatformMark, OrderIdChip, TrackingChip
        │   │           ├── QuickLook / Peek: ShippedCardPeek (dl of 18 facts)
        │   │           └── Next: carrier status / Resolve
        │   └── Record Plane (open package):
        │       └── RecordLedgerSummaryPane (ShippedLedger.tsx:413)
        │       └── useShipmentRecordSlot (src/components/shipped/ledger/use-shipment-record-slot.tsx:189)
        │           ├── useRecordSlot (src/design-system/components/record-ledger/useRecordSlot.ts)
        │           └── ResolveShipmentExceptionDialog (src/components/shipped/ledger/ResolveShipmentExceptionDialog.tsx:37)
```

### 1.3 Hooks, Feeds, and Queries
* **`useShippedTableFilters`** (`src/components/shipped/dashboard-table/useShippedTableFilters.ts:48`):
  * URL parameters read: `shippedSearchField`, `shippedFilter`, `shippedWeekOffset`, `dateFrom`, `dateTo`, `allDates`, `timeFrom`, `timeTo`, `carrier`, `channel`, `cardStatus`, `statusCategory`, `exceptions`, `ostatus`, `staff`, `packedBy`, `pickedBy`, `sort`.
  * Syncs desk search with `useDeskSearch('/fulfilled')` (`src/lib/outbound/desk-search-store.ts`).
  * Persists type filter via `readShippedFilterPreference` / `writeShippedFilterPreference` (`src/utils/dashboard-preferences.ts`).
* **`useShippedTableRecords`** (`src/components/shipped/dashboard-table/useShippedTableRecords.ts:22`):
  * In week-bucket mode: calls `useShippedWeekBuckets` (`src/components/shipped/dashboard-table/useShippedWeekBuckets.ts:43`).
    * Resolves Mon–Sun date slices via `getWeekBucketsForRange`.
    * Calls `useQueries` running `dashboardShippedWeekQuery` (`src/lib/queries/dashboard-queries.ts:291`).
    * Fetches `fetchDashboardPackedRecords` (`src/lib/dashboard-table-data.ts:398`) → `GET /api/packerlogs`.
  * In all-time mode: calls `useQuery(dashboardShippedQuery)` (`src/lib/queries/dashboard-queries.ts:227`) → `GET /api/packerlogs`.
  * Hydration query: collects `salIds` from rows, calls `fetchShippedHydration(salIds)` (`src/lib/dashboard-table-data.ts:479`) → `POST /api/packerlogs/hydrate`.
* **Realtime / Polling**:
  * Ably channel: `safeChannelName(() => getStationChannelName(orgId))` listening to `'activity.logged'` (`ShippedLedger.tsx:112`).
  * On `SHIP_CONFIRM`: invalidates `['dashboard-table', 'shipped']` and `['nav-facets', 'outbound.shipped']`.
  * On `SHIP_CONFIRM_MISS`, `PACK_COMPLETED`, `PACK_SCAN`: invalidates `OPEN_UNMATCHED_SCANS_QUERY_KEY`.
* **Unmatched Scans**:
  * Query: `useQuery({ queryKey: OPEN_UNMATCHED_SCANS_QUERY_KEY, queryFn: fetchOpenUnmatchedScans })` (`src/components/shipped/ledger/unmatched-scans.ts:13`) → `GET /api/orders-exceptions/unmatched`.
* **Sidebar Facets**:
  * Query: `useQuery({ queryKey: ['nav-facets', 'outbound.shipped', search], queryFn: fetchNavFacets })` (`src/lib/nav/context/http-client.ts`) → `GET /api/nav/facets?context=outbound.shipped`.
* **Shipment Record & Exception Resolution**:
  * `useShipmentRecord(openShipmentId)` (`src/lib/shipments/shipment-record-client.ts`) → `GET /api/shipments/[id]`.
  * `searchLinkableOrders(needle)` (`src/lib/shipments/shipment-order-search.ts`) → `GET /api/shipments/order-search?q=`.
  * `useResolveShipmentException` (`src/lib/shipments/shipment-record-client.ts`) → `POST /api/shipments/[id]/resolve-exception`.
  * Legacy `?openOrderId=`: `fetchOrderLinePackageId(orderRowId)` (`src/lib/shipments/shipment-order-search.ts`) → `GET /api/shipments/order-line-package?orderId=`.

### 1.4 Navigation, Routing, and Page Registration
* **Sidebar Page Declaration**: `NAV_PAGE_DECLS.fulfilled` (`src/lib/nav/context/pages.ts:643`) declares items `all`, `online`, `fba`, `sku`, `delivered` binding `SHIPPED_VIEWS` and `SHIPPED_CONTROLS` (`pages.ts:490`).
* **Sidebar Navigation**:
  * `APP_SIDEBAR_NAV`: id `'fulfilled'`, href `SHIPPING_SHIPPED_PATH` (`'/fulfilled'`), requires `'packing.view'` (`src/lib/sidebar-navigation.ts:446`).
  * `SIDEBAR_PAGE_NAV`: id `'fulfilled'`, children mapped from `FULFILLED_VIEWS` (`src/lib/sidebar-navigation.ts:1437`).
  * Permission: `{ prefix: '/fulfilled', permission: 'packing.view' }` (`src/lib/sidebar-navigation.ts:870`).
* **Route Tree**: `src/lib/nav/route-tree.ts` does NOT have a registered route node for `/fulfilled`. It registers vocabulary term `'outbound'` (lines 47, 97). Phase 2 must add `/fulfilled` to `ROUTE_TREE`.
* **Permanent Door**: `src/app/shipping/(desk)/shipped/page.tsx:5` performs permanent Next.js `redirect()` to `/fulfilled`.

---

## 2. Node Classification & Blast Radius

| Node | File Path | Other Importers / Renders | Classification | What Breaks If Deleted / Blast Radius |
|---|---|---|---|---|
| `ShippedWorkspace` | `src/components/outbound/workspaces/ShippedWorkspace.tsx` | None (`src/app/fulfilled/page.tsx:3` only) | **DELETE** | None outside `/fulfilled`. |
| `ShippedLedger` | `src/components/shipped/ledger/ShippedLedger.tsx` | None (`ShippedWorkspace.tsx:5` only) | **DELETE** | `src/design-system/pinned.json:337` cites `ShippedLedger`. Must update pinned.json doc citation. |
| `ShippedPackageRow` | `src/components/shipped/ledger/ShippedPackageRow.tsx` | None (`ShippedLedger.tsx:53` only) | **DELETE** | `pinned.json:337,362` and `docs/design-system/consolidation-ledger.json:593` (in `operational-identity.currentPaths`). Must remove from consolidation ledger. |
| `ShippedPackageCard` | `src/components/shipped/ledger/ShippedPackageCard.tsx` | `ShippedLedger.tsx:52`, `src/lib/triage/views/card-view-adapters.ts:48` | **DELETE** | `card-view-adapters.ts` and `src/lib/triage/views/triage-views.test.ts` will fail unless adapter registration is retired/removed. |
| `use-shipment-record-slot` | `src/components/shipped/ledger/use-shipment-record-slot.tsx` | None (`ShippedLedger.tsx:63` only) | **DELETE** | None. |
| `ResolveShipmentExceptionDialog` | `src/components/shipped/ledger/ResolveShipmentExceptionDialog.tsx` | None (`use-shipment-record-slot.tsx:19` only) | **DELETE** | None. (Shipment detail inspector has its own exception handling). |
| `shipped-card-model.ts` | `src/components/shipped/ledger/shipped-card-model.ts` | `ShippedLedger`, `ShippedPackageCard`, `ShippedPackageRow`, `card-view-adapters.ts`, `src/lib/nav/facets/shipped.ts:53`, `src/lib/shipping/shipped-filter/shipped-filter-sql.ts:20` | **DELETE** (upon facet retirement) | `src/lib/nav/facets/shipped.ts` (`SHIPPED_STATUS_CHIPS`), `shipped-filter-sql.ts`. When `/fulfilled` facet context switches away from `outbound.shipped`, this is dead weight. |
| `shipped-package-state.ts` | `src/components/shipped/ledger/shipped-package-state.ts` | `ShippedLedger`, `ShippedPackageCard`, `ShippedPackageRow`, `shipped-card-model`, `use-shipment-record-slot` | **DELETE** | None outside `src/components/shipped/ledger/`. |
| `unmatched-scans.ts` | `src/components/shipped/ledger/unmatched-scans.ts` | None (`ShippedLedger.tsx:69` only) | **DELETE** | None. Unmatched tracking logic will be answered as a status bucket in the new endpoint. |
| `useShippedTableFilters` | `src/components/shipped/dashboard-table/useShippedTableFilters.ts` | `ShippedLedger.tsx`, `useShippedTableRecords.ts`, `useShippedWeekBuckets.ts` | **DELETE** | `src/lib/nav/context/parity.ts:316-323` references lines in this file in test assertions. Parity manifest must be updated to the new sheet params. |
| `useShippedTableRecords` | `src/components/shipped/dashboard-table/useShippedTableRecords.ts` | None (`ShippedLedger.tsx:33` only) | **DELETE** | None. |
| `useShippedWeekBuckets` | `src/components/shipped/dashboard-table/useShippedWeekBuckets.ts` | None (`useShippedTableRecords.ts:7` only) | **DELETE** | None. |
| `seedShippedLedger` | `src/lib/queries/shipped-ledger-seed.server.ts` | None (`src/app/fulfilled/page.tsx:8` only) | **DELETE** | None. The new sheet pattern does not use a dehydrated packer-log seed. |
| `shipped-feed-config.ts` | `src/lib/shipping/shipped-feed-config.ts` | `src/app/fulfilled/page.tsx:5`, `seedShippedLedger.server.ts:8`, `dashboard-queries.ts:29`, `useShippedTableRecords.ts:8`, `useShippedWeekBuckets.ts:3` | **DELETE** | None once dashboard shipped queries are removed. |
| `dashboardShippedQuery` / `dashboardShippedWeekQuery` | `src/lib/queries/dashboard-queries.ts:227,291` | `useShippedTableRecords.ts`, `useShippedWeekBuckets.ts` | **DELETE** | None. |
| `fetchDashboardPackedRecords` | `src/lib/dashboard-table-data.ts:398` | `src/lib/queries/dashboard-queries.ts:262,323` | **DELETE** | None. |
| `fetchShippedHydration` / `POST /api/packerlogs/hydrate` | `src/lib/dashboard-table-data.ts:479`, `src/app/api/packerlogs/hydrate/route.ts` | `useShippedTableRecords.ts:167` only | **DELETE** | `docs/security/route-permissions.json` lists `/api/packerlogs/hydrate/route.ts`. Removing route requires regenerating/updating manifest. |
| `GET /api/packerlogs` | `src/app/api/packerlogs/route.ts:50` | `fetchDashboardPackedRecords`, `usePackerLogs` (`src/hooks/usePackerLogs.ts:156` in `PackRecentPacksRail.tsx`) | **KEEP-SHARED** | Cannot delete `/api/packerlogs/route.ts`: `POST` (create pack) and `DELETE` (un-pack) are live station routes, and `PackRecentPacksRail` calls `GET`. |
| `GET /api/orders-exceptions/unmatched` | `src/app/api/orders-exceptions/unmatched/route.ts` | `unmatched-scans.ts:13` | **KEEP-SHARED** | Generic exception API endpoint. |
| `OUTBOUND_SHIPPED_VIEW` | `src/lib/triage/views/outbound-shipped.ts` | `card-view-adapters.ts:374`, `triage/views/index.ts:21`, `shipped-desk.ts:3`, `pasted-ref-piles.ts:31` | **REWIRE / RETIRE** | Registered in `TRIAGE_VIEWS`. If retired from `TRIAGE_VIEWS`, remove from `card-view-adapters.ts` and `triage-views.test.ts`. |
| `NAV_PAGE_DECLS.fulfilled` | `src/lib/nav/context/pages.ts:643` | `buildNavContext` (`src/lib/nav/context/build.ts:382`) | **REWIRE** | Rewire `controls` to new fulfilled controls (date axis, window, carrier, packer, sort) and `search` to `url-param`. |
| `sidebar-navigation.ts` (`fulfilled`) | `src/lib/sidebar-navigation.ts:446,1437` | `MasterNav`, `NavSectionList`, `resolveSidebarChild` | **REWIRE** | Rewire children to preset saved views of the new sheet. |
| `/shipping/shipped` redirect | `src/app/shipping/(desk)/shipped/page.tsx` | External bookmarks, printed links | **KEEP-SHARED** | Must remain as permanent 308 redirect to `/fulfilled`. |
| `record-details.ts` | `src/lib/records/record-details.ts:65` | `recordDetailsHref` (`shipped ? SHIPPING_SHIPPED_PATH : SHIPPING_ORDERS_PATH`) | **KEEP-SHARED** | Keeps routing shipped orders to `/fulfilled?openOrderId=...`. |

---

## 3. Order-Details Opener Analysis

### 3.1 How it works today on Shipped triage cards
In `ShippedLedger.tsx`:
1. Clicking a card or pressing `Enter` calls `openRow`, which sets `?shipment=<shipmentId>` in the URL (`SHIPMENT_RECORD_PARAM`).
2. Legacy `?openOrderId=<orders.id>` bookmarks trigger an effect (`ShippedLedger.tsx:237-250`) that runs `fetchOrderLinePackageId(orderRowId)` against `GET /api/shipments/order-line-package?orderId=` to resolve the package and rewrite `?openOrderId=` to `?shipment=`.
3. `useShipmentRecordSlot(openShipmentId)` loads the shipment via `useShipmentRecord` and renders it inside `useRecordSlot` in the ledger's record plane.

### 3.2 How the reference sheet opens records
In `PastedListSheet.tsx` (`src/components/search/pasted-list/PastedListSheet.tsx:168-180`):
1. User presses `Enter`, `O`, or clicks the external link icon in the Number (`ref`) cell (`PastedListGridRow.tsx:94-106`).
2. Calls `openRow(row)`:
   * Saves current scroll position to `window.sessionStorage.setItem(`${layoutKey}:scroll`, JSON.stringify({ at: window.location.search, top }))`.
   * If `entry.recordHref` is present, calls `view.openRecord(entry)`.
3. In `useBulkListView.ts`: `openRecord` calls `recordDetailsNavigation(entry.recordHref, { pathname, search })`.
   * If navigating away to another desk, `recordDetailsNavigation` appends `recordBack=<currentPath+search>` (`RECORD_BACK_PARAM`).
   * When navigating back via `recordBack`, `PastedListSheet.tsx:184-192` restores `scrollRef.current.scrollTop = top` and deletes the sessionStorage key.

### 3.3 Reusability Verdict
**100% Reusable unchanged**:
* Setting `entry.recordHref = recordDetailsHref({ kind: 'order', orderId: Number(row.orderId), shipped: true })` produces `/fulfilled?openOrderId=<id>`.
* When the sheet host detects `?openOrderId=`, it opens the order record details in the standard `DeskRecordPlane` (or `OrderRecordView`).
* When closed, `recordDetailsNavigation` / `RECORD_BACK_PARAM` returns to the sheet, and `PastedListSheet` restores the scroll position.

---

## 4. Reference Fit & Generalization Analysis

### 4.1 Comparison Matrix: `PastedListSheet` / `PurchasesSheet` vs `/fulfilled`

| Concern | `PurchasesSheet` / Inbound | `/fulfilled` Target | Fit / Action Needed |
|---|---|---|---|
| **Sheet container** | `src/components/receiving/purchases/PurchasesSheet.tsx` (39 lines) | `src/components/outbound/fulfilled/FulfilledSheet.tsx` | Pure reuse. Instantiate `PastedListSheet` with `layoutKey="cf:sheet-columns:fulfilled"`. |
| **Data Hook** | `usePurchasesList.ts` (calls `GET /api/nav/purchases`) | `useFulfilledList.ts` (calls `GET /api/nav/fulfilled`) | Direct mirror. Returns `LocatedRecords` shape (`entries`, `buckets`, `status`, `setStatus`). |
| **API Endpoint** | `GET /api/nav/purchases` (`src/app/api/nav/purchases/route.ts`) | `GET /api/nav/fulfilled` (`src/app/api/nav/fulfilled/route.ts`) | Direct mirror. Set-based SQL → shared fact builder in one round trip (`tenantQueryOneTrip`). |
| **Row Schema** | `NavLocateEntry` (`src/lib/nav/context/schema.ts:568`) | `NavLocateEntry` | Identical. |
| **Facts Schema** | `NavLocateFacts` (`src/lib/nav/context/schema.ts:528`) | `NavLocateFacts` | **Additive extension**. Add carrier tracking facts (`carrier`, `service`, `scannedOutAt`, `scannedOutBy`, `lastEventAt`, `lastEventLabel`, `promisedAt`, `movementStatus`). |
| **Status Chips** | `PastedListStatusRow.tsx` over `list.buckets` | `PastedListStatusRow.tsx` over `list.buckets` | 100% generic reuse. |
| **Status Precedence** | `primaryBucketId` (`src/lib/nav/locate/bucket-precedence.ts`) | Outbound shipped precedence | Add `outbound_shipped` precedence entry in `LOCATE_BUCKET_PRECEDENCE`. |
| **Columns** | Defined in `src/components/search/pasted-list/pasted-list-table.ts` | Outbound columns | `PASTED_LIST_COLUMNS` already defines `sku`, `tracking`, `shipBy`, `shipped`, `packer`. Add outbound columns (`orderId`, `carrier`, `channel`, `lastScan`). |
| **Cell Formatting** | `pastedListCellText` (`pasted-list-table.ts:130`) | Outbound cell text | Add branches for outbound facts. |
| **Sidebar Controls** | `PURCHASES_CONTROLS` in `pages.ts:347` | `FULFILLED_CONTROLS` in `pages.ts` | Mirror: Date axis (`shipped` / `delivered` / `ordered` / `ship_by`), date window, carrier, channel, packer, sort. |

### 4.2 Does `outboundFacts()` in `src/lib/nav/locate/outbound.ts` already produce rows shaped as `NavLocateEntry`?
**YES**. In `src/lib/nav/locate/outbound.ts:288-348`:
* `outboundFacts(row, lines)` returns a complete `NavLocateFacts` object with `section: 'outbound'`, `title`, `sku`, `tracking`, `deliveredAt`, `channelStatus` (`orders.status`), `shipBy`, `packedAt`, `shippedAt`, `packer` (`{ id, name }`), `lines`, `duplicates: []`.
* `locateOutboundRefs()` wraps this into `NavLocateEntry` with `ref`, `buckets`, `title`, `detail`, `recordHref` (calling `recordDetailsHref`), and `facts`.
* The fulfilled endpoint will directly reuse and extend `outboundFacts()` with additive carrier movement facts.

---

## 5. In-Flight Overlap Analysis

The parent prompt flagged 93 changed uncommitted files in the working tree. Comparing against our tree and dependencies:

1. **`src/lib/nav/locate/service.ts`**: Touched by locate refactors. Intersects with `InboundLocateDeps` / `readInbound*`. Does not conflict with outbound fulfilled work.
2. **`src/lib/nav/locate/use-bulk-list.ts`**: Touched by bulk list refactors. `PastedListSheet` and `LocatedRecords` depend on this; treat current tree version as authoritative.
3. **`src/lib/outbound/scan-out-client.ts`**: Uncommitted changes in scan-out station. Relevant to dock scan stamps (`SHIP_CONFIRM`), but does not conflict with sheet queries.
4. **`scripts/ship-out-stale-orders.ts`**: Batch script; no runtime overlap with `/fulfilled`.
5. **`src/app/api/nav/purchases/*` and `src/lib/nav/purchases/*`**: Uncommitted reference implementation built 2026-10-05. Serves as the blueprint for `src/app/api/nav/fulfilled/*` and `src/lib/nav/fulfilled/*`.

---

## 6. DELETE LIST Summary for Phase 2

### Files to Delete
1. `src/components/outbound/workspaces/ShippedWorkspace.tsx`
2. `src/components/shipped/ledger/ShippedLedger.tsx`
3. `src/components/shipped/ledger/ShippedPackageRow.tsx`
4. `src/components/shipped/ledger/ShippedPackageCard.tsx`
5. `src/components/shipped/ledger/use-shipment-record-slot.tsx`
6. `src/components/shipped/ledger/ResolveShipmentExceptionDialog.tsx`
7. `src/components/shipped/ledger/shipped-card-model.ts`
8. `src/components/shipped/ledger/shipped-package-state.ts`
9. `src/components/shipped/ledger/unmatched-scans.ts`
10. `src/components/shipped/dashboard-table/useShippedTableFilters.ts`
11. `src/components/shipped/dashboard-table/useShippedTableRecords.ts`
12. `src/components/shipped/dashboard-table/useShippedWeekBuckets.ts`
13. `src/lib/queries/shipped-ledger-seed.server.ts`
14. `src/lib/shipping/shipped-feed-config.ts`
15. `src/app/api/packerlogs/hydrate/route.ts`

### Files to Rewire / Update
1. `src/app/fulfilled/page.tsx`: Rewire to render `FulfilledSheet`.
2. `src/lib/nav/context/pages.ts`: Replace `SHIPPED_CONTROLS` / `SHIPPED_VIEWS` with `FULFILLED_CONTROLS` / `FULFILLED_VIEWS`.
3. `src/lib/nav/context/parity.ts`: Update `fulfilled` param manifest to match new sheet controls.
4. `src/lib/sidebar-navigation.ts`: Rewire `fulfilled` views to the new datasheet presets.
5. `src/lib/triage/views/card-view-adapters.ts`: Remove `OUTBOUND_SHIPPED_VIEW` adapter entry.
6. `src/design-system/pinned.json`: Retire `ShippedLedger (ShippedPackageRow)` citations.
7. `docs/design-system/consolidation-ledger.json`: Retire `ShippedPackageRow.tsx` from `operational-identity.currentPaths`.
8. `docs/security/route-permissions.json`: Update route manifest after removing `/api/packerlogs/hydrate`.