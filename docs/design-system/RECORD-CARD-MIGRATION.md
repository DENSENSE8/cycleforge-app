# RecordCard migration ledger

Run ledger for `HANDOFF-record-card-foundation.md`. One row per table mount; updated at the end of every
wave. Verdicts: **port** (→ `TriageCardList`), **keep-sheet** (columns are the job; `DataTable` stays),
**floor** (industrial ledger, Ctrl/⌘+Shift+F).

## Owner decisions

- 2026-09-27 — keep-sheet list confirmed as listed in the Wave 0 table.
- 2026-09-27 — Law 5 selection bar replaces BRIEF §13 "one checked → card drop-down": selection
  verbs live only in the bar (same verbs, same order for 1 or N); single-card verbs only in fixed card
  spots (⋮, identity ↗, stage chips).
- 2026-09-27 — **Outbound first, one page at a time.** Lock the root display (the e-commerce order
  card) before any other family. Order: foundation lock on To ship → Exceptions → PO paired → Pick
  list → Shipped. Each page is its own wave and needs owner sign-off on its screenshots before the
  next page starts. Non-outbound families wait until all five outbound pages are signed off.
- 2026-09-27 — **Multi-line display language locked** (BRIEF §13, last ruling): no Pick / QC / Pack
  on the card face; lead line + "+N items" disclosure; unfolded lines are columns in the fixed fact
  order qty · condition · stock · SKU · bin · price; Details only at the end of the lead facts row.
  This is the root display `RecordCard` extracts in O1.

## Wave 0 — inventory (2026-09-27)

### Persisted layouts in the dev DB (Neon, `.env` `DATABASE_URL`)

| Store | Rows | Keys |
|---|---|---|
| `saved_views` | **0** | — |
| `staff_preferences.prefs.tableLayouts` | 1 row, empty map | — |
| `organizations.settings.tableLayouts` | 1 org (`…0001`) | `orders` |

Consequence: the only persisted layout a port can break today is the org `orders` layout. Saved-view
verification per wave = create one on the route, reload, confirm it applies.

### Mounts

`<DataTable` appears in 35 files (+1 test comment). All are backed by a `REGISTERED_BINDINGS` entry;
`orders-index` is `SLOT_LAYOUT_TABLES`-only (To-ship index sheet via `useOrdersTableLayout`).

| # | Route | Mount (file) | Family / layout id | Morph | Operator job | Mobile twin | Verdict |
|---|---|---|---|---|---|---|---|
| 1 | `/shipping/orders`, `/pack`, `/packer`, `/tech`, `/test` (shipping view) | `unshipped/UnshippedTable.tsx` → `OrderCardList` | `orders` / `orders` | compound | To-ship triage: pick, pack, ship, OOS, urgent | `/m/orders` (`/m/work`), `/m/pick`, `/m/pack` | **port** (reference; Wave 2) |
| 2 | `/shipping/orders` floor face, `/shipping/shortage` (forced `ledger`) | `outbound/orders/OutboundOrdersLedger.tsx` | `orders` / `orders` | compound | Industrial record ledger | `/m/orders` | **floor** on `/shipping/orders`; **port** `/shipping/shortage` (drop forced `ledger`) |
| 3 | `/shipping/exceptions` | `outbound/orders/exceptions/OrderExceptionsWorkbench.tsx` → `OutboundOrdersLedger mode="exceptions"` | `orders` / `orders` | compound | Held orders: paste item #, resolve, delete | `/m/exceptions` | **port** |
| 4 | `/shipping/shipped` | `outbound/workspaces/ShippedWorkspace.tsx` → `ShippedLedger` (RecordLedger) | `orders` | — | Shipped order lookup | — | **port** |
| 5 | `/shipping/orders?import` | `outbound/orders/CsvImportStagingHost.tsx` | `orders-import` | sheet | CSV staging before ingest | — | **keep-sheet** |
| 6 | `/shipping/fba` | `outbound/ready/ReadyQueueTable.tsx` | `ready` | sheet | Read-only allocation history of tested units | — | **keep-sheet** |
| 7 | `/review` (packer, default) | `features/review/ReviewPackingTable.tsx` | `orders` / `orders` | compound | Packing review queue | — | **port** |
| 8 | `/review?mode=pairing` | `features/review/pairing/ReviewPairingTable.tsx` | `orders` / `orders` | compound | Serial/SKU pairing queue | `/m/pair/[code]` (partial) | **port** |
| 9 | `/review?mode=catalog-link` (missing item #) | `features/review/catalog-link/ReviewCatalogLinkTable.tsx:264` | `import-exception` | compound | Link sheet rows to catalog | — | **port** |
| 10 | `/review?mode=catalog-link` | `…/ReviewCatalogLinkTable.tsx:363` | `catalog-link` | compound | Match listings to catalog | — | **port** |
| 11 | `/receiving`, `/receiving/history`, `/unbox` table | `station/receiving-grid/useReceivingSpreadsheet.tsx` via `ReceivingLinesTable` | `receiving` / `receiving` | compound | Receiving line queue, open into record plane | `/m/receiving/po/[poId]` | **port** |
| 12 | `/tech`, `/test` (testing view) | same, via `tech/TestingHistoryList.tsx` | `receiving` / `testing` | compound | Tested-unit history | `/m/qc/line/[id]` | **port** (with #11) |
| 13 | `/receiving` incoming / docked | `receiving/incoming/IncomingDeliveriesLedger.tsx` → `IncomingDeliveryCardList`; `DockedReceiptsLedger` | `receiving` | — | Inbound deliveries — **second hand-rolled card list** | `/m/receiving/*` | **port** (absorb `IncomingDeliveryCardList` into the foundation) |
| 14 | `/unbox?unboxview=all`, `/test|/tech?testTab=all`, `?ship=all` | `tech/all/TechAllTriageTable.tsx` | `tech-all` | sheet | Cross-station line triage | — | **port** |
| 15 | `/pickup` | `receiving/pickup/PickupWorkspace.tsx` | `pickup` | sheet | LCPU pickup orders by status lane | — | **port** |
| 16 | `/pack`, `/packer`, `/tech`, `/test` history | `station/StationHistoryTable.tsx` | `packer` / `tech` | compound | Bench activity history by week/day | — | **keep-sheet** |
| 17 | `/inventory/units`; `/inventory?states=…` (by-filter); SKU page recent units | `inventory/UnitsWorkspaceView.tsx`, `inventory/ByFilterResultList.tsx`, `SkuDetailTables.tsx#SkuRecentUnitsTable` | `units` / `inventory-units` | sheet | Find and open a serial unit | `/m/u/[id]` (detail only) | **port** (Wave 3) |
| 18 | `/inventory/locations?tab=bins` | `warehouse/BinsTable.tsx` | `bins` / `bins` | sheet | Bin overview, multi-select → bulk bar | `/m/loc/[code]`, `/m/bin/[barcode]` | **port** (Wave 3 stress family) |
| 19 | `/inventory/health/sku/[sku]` bins | `SkuDetailTables.tsx#SkuBinsTable` | `sku-bins` | compound | Where this SKU sits | — | **port** (Wave 3) |
| 20 | `/inventory/health/sku/[sku]` ledger | `SkuDetailTables.tsx#SkuLedgerTable` | `sku-ledger` | compound | Signed-quantity ledger | — | **keep-sheet** |
| 21 | `/inventory/health/sku/[sku]` allocations | `SkuDetailTables.tsx#SkuAllocationsTable` | `sku-allocations` (`unit-allocations` catalog) | compound | Open allocations, open unit | — | **keep-sheet** (sub-ledger on detail) |
| 22 | `/inventory/health/sku/[sku]` events | `SkuDetailTables.tsx#SkuEventsTable` | `inventory-events` | compound | Event log | — | **keep-sheet** |
| 23 | `/inventory` (default pulse) | `inventory/PulseView.tsx` | `inventory-events` | compound | Live event feed | — | **keep-sheet** |
| 24 | `/inventory/pulse?open=` | `inventory/PulseWorkspace.tsx` | `inventory-events` | compound | Per-unit event log | — | **keep-sheet** |
| 25 | `/inventory/events` | `app/inventory/events/EventsExplorerTable.tsx` | `inventory-events` | compound | Event explorer | — | **keep-sheet** |
| 26 | `/inventory/health` recent events | `_inventory-admin/InventoryAdminTables.tsx:59` | `inventory-events` | compound | Last 50 events | — | **keep-sheet** |
| 27 | `/inventory/health` drift alerts | `_inventory-admin/InventoryAdminTables.tsx:31` | `admin-drift-alerts` | compound | Open drift alerts → open SKU | — | **port** |
| 28 | `/inventory/health` sku drift | `_inventory-admin/InventoryAdminTables.tsx:48` | `admin-sku-drift` | compound | Numeric counter diff | — | **keep-sheet** |
| 29 | `/inventory?unit=` | `inventory/ByUnitView.tsx:301` | `unit-allocations` | compound | Unit allocation history | — | **keep-sheet** |
| 30 | `/inventory?unit=` | `inventory/ByUnitView.tsx:314` | `unit-tsn-links` | compound | Unit TSN links | — | **keep-sheet** |
| 31 | `/inventory/holds` | `app/inventory/holds/HeldUnitsTable.tsx` | `admin-holds` | compound | Release held units | — | **port** |
| 32 | `/inventory/bulk-allocate` | `app/inventory/bulk-allocate/AllocationCandidatesTable.tsx` | `admin-bulk-allocate` | compound | Allocate orders with stocked units | — | **port** |
| 33 | `/inventory/cycle-counts` | `app/inventory/cycle-counts/CycleCountsTableSection.tsx` | `cycle-counts` | compound | Open a count campaign | — | **port** |
| 34 | `/inventory/cycle-counts/[id]` | `…/[id]/CycleCountLinesTable.tsx` | `cycle-count-lines` | compound | Count, approve, reject lines | — | **port** |
| 35 | `/inventory/returns` | `app/inventory/returns/RecentReturnsTable.tsx` | `admin-returns` | compound | Recent returned units → open | — | **port** |
| 36 | `/inventory/stock` | `inventory/StockLedger` (RecordLedger) | — | — | Stock by location/room | — | **keep-sheet** |
| 37 | `/inventory?section=replenish` | `replenish/ReplenishmentNeedTable` (RecordLedger) | — | — | Replenishment need by SKU | — | **keep-sheet** |
| 38 | `/repair`, `/dashboard?mode=repairs` | `repair/RepairTable.tsx` | `repair` | sheet | Repair service queue | `/m/rs/[id]` (detail only) | **port** |
| 39 | `/support?mode=warranty` | `warranty/WarrantyClaimsTable.tsx` | `warranty` | sheet | Warranty claims queue | — | **port** |
| 40 | `/tracking-exceptions` | `tracking-exceptions/TrackingExceptionsTable.tsx` | `tracking-exceptions` | sheet | Resolve failed tracking numbers | — | **port** |
| 41 | `/dashboard?mode=sales|pickup` | `walk-in/SalesHistoryTable.tsx` | `walk-in-sales` | compound | Completed walk-in sales → open repair/pickup | — | **port** |
| 42 | `/search?q=` | `search/SearchResultsSurface.tsx` | `search-hits` | compound | Cross-entity hits → open | — | **port** |
| 43 | `/` (home) | `features/home/DailyAgenda.tsx` (RecordLedger) | `daily` (binding unused) | — | Shift checklist | `/m/home` | **port** |
| 44 | `/reports?tab=utilization|velocity|dead|tasks|staff|packer` | `app/reports/page.tsx` (6 mounts) | `report-*` | compound | Reports | — | **keep-sheet** |
| 45 | `/settings/audit` | `app/settings/audit/AuditLogTable.tsx` | `audit-log` | compound | Audit log | — | **keep-sheet** |
| 46 | `/settings/staff` | `app/settings/staff/StaffTable.tsx` | `staff-directory` | compound | Team directory / auth policy | — | **keep-sheet** |
| 47 | `/settings/devices` | `settings/sections/KioskDevicesSection.tsx:338` | `kiosk-devices` | compound | Device admin | — | **keep-sheet** |
| 48 | `/settings/devices` history | `…/KioskDevicesSection.tsx:343` | `kiosk-slot-events` | compound | Slot event log | — | **keep-sheet** |
| 49 | `/settings/sessions` | `settings/sections/SessionsSection.tsx` | `auth-sessions` | compound | Revoke sessions | — | **keep-sheet** |
| 50 | `/sourcing?mode=compatibility` | `admin/sourcing/CompatibilityManagementTab.tsx` | `part-compatibility` | compound | Compatibility edges | — | **keep-sheet** |

### Registry entries with zero consumers (Wave N deletion candidates)

| Layout id | Binding | Note |
|---|---|---|
| `daily` | `DAILY_TABLE_BINDING` | Home paints `DailyAgenda` (RecordLedger); port #43 may revive it as the card layout |
| `tasks` | `TASKS_TABLE_BINDING` | No page mounts it |
| `my-day` | `MY_DAY_TABLE_BINDING` | `useMyDayFeed` feeds `InboxQueueLinks` only |
| `catalog` | `CATALOG_TABLE_BINDING` | `useCatalogTableLayout.ts` itself unimported |
| `unfound` | `UNFOUND_TABLE_BINDING` | `useUnfoundTableLayout.ts` itself unimported |
| `fba` | — | `field-catalog/fba.ts` in neither registry |
| — | `SkuExceptionsLedger` | component with zero mounts |

The handoff's expected Wave 4 order named my-day, catalog/products and tasks: **none has a live table
mount**, so there is nothing to port there — porting them means building a page, which is out of scope.

### Non-table grids (out of scope unless noted)

`StationListTable.tsx` (raw `LedgerGrid` under station pipelines), `WarehouseMap.tsx` (bin map),
`app/inventory/throughput` (heatmap), `IncomingReturnsImportStagingHost` (CSV preview), markdown
tables, receipt HTML. AI artifacts (`InlineArtifact.tsx`, `renderers.tsx`, `ReportArtifact.tsx`,
`PaymentArtifact.tsx`) → Wave N+1.

### Wave order (owner 2026-09-27: outbound first, page by page)

The five outbound desk views are `DESK_VIEWS` in `src/lib/outbound/desk-views.ts`.

| Wave | Page | Route | Today (observed at `:3050`) | Ledger rows | Gate |
|---|---|---|---|---|---|
| O1 | **Root lock on To ship** | `/shipping/orders` | `OrderCardList` (reference card) | #1 | Extract `RecordCard` / `TriageCardList` / action registry out of `OrderCard*`; **zero visual change** except the approved selection bar. Before/after screenshots at 3 widths. Owner signs off the root. |
| O2 | Exceptions | `/shipping/exceptions` | `OutboundOrdersLedger mode="exceptions"` | #3 | Exception reason = top-right status; verbs paste item # / resolve / delete in the registry. Owner sign-off. |
| O3 | PO paired | `/shipping/shortage?pair=po` | `UnshippedTable ledger` → `OutboundOrdersLedger mode="pending"` | #2 (shortage) | Drop the forced `ledger`; PO / coverage as status. Owner sign-off. |
| O4 | Pick list | `/shipping/orders?queue=pick` | same `OrderCardList` as To ship, `queue=pick` lens | #1 | Pick-stage emphasis only through layout ids. Owner sign-off. |
| O5 | Shipped | `/shipping/shipped` | `ShippedLedger` (RecordLedger) | #4 | Carrier / tracking as status, shipped time far right, read-mostly verbs. Owner sign-off. |

Floor (⌘/Ctrl+Shift+F on To ship) keeps `OutboundOrdersLedger` throughout. After O5, remaining
families follow in this order, still one page per wave: review packing/pairing (#7, #8) → inventory
units/bins/sku-bins (#17–#19) → receiving/inbound (#11–#15, absorb `IncomingDeliveryCardList`) →
inventory admin queues (#27, #31–#35) → support (#38–#40) → catalog matching (#9, #10) → walk-in
and search (#41, #42) → home daily (#43) → retire orphans/unused infra → AI chat artifacts.

Inbound, inventory, sales and products continue from `HANDOFF-record-card-families.md` (one
anatomy, a page-specific card per page; pattern card signed off before each page's code). Proof
tool for every wave: `scripts/dom-equivalence.mjs` (capture before / after, compare).

### O1 progress (2026-09-27)

Proof method (now `scripts/dom-equivalence.mjs`) captured a normalized DOM (tags, sorted
classes, text, aria, data-*) of every card on `/shipping/orders` at 1500 px, the multi-line card
unfolded and with the quick look open, and the select bar — before any extraction, then after each step.

| Step | Landed | Result |
|---|---|---|
| Card face (multi-line language, no stage chips, bar order count → per-page → sort → Floor → ⤢) | `OrderCard.tsx`, `OrderCardSelectBar` → `TriageSelectBar` | Owner rulings; screenshots at 1500 / 1100 / 760 |
| `Collapse` / `CollapseItem` + ESLint height guard; 22 sites migrated, height presets deleted | `design-system/components/Collapse.tsx`, `eslint.config.mjs` | Quick-look close ends at its settled height (105 px, no post-unmount step); guard count 0 |
| `RecordCard` (anatomy) + `record-fact.tsx` (shared fact faces) + `record-card-types.ts`; `OrderCard` is now the orders adapter | `design-system/components/record-card/` | Card DOM identical (36/36 cards, unfolded, quick look) |
| List state hooks (`useTriageUrlState`, `useTriagePageMode`, `useKeptScroll`, `useHeldNewRecords`, `useTriagePageKeys`) | `design-system/components/triage-card-list/triage-list-state.ts` | Storage keys and URL params unchanged (`cf:order-cards:*`, `cardStatus`, `page`) |
| `TriageSelectBar` (noun + test-id prefix) | `triage-card-list/TriageSelectBar.tsx` | Bar DOM identical apart from other sessions' toolbar-corner token and the sidebar-state Find slot |
| `TriageListBody` (held pill, sections, empty/loading, load more, Scroll-mode sentinel, kept scroll, shadow), `TriageSectionHeader`, `TriageAllClear` | `triage-card-list/TriageListBody.tsx` | Sections, hairlines, shadow, kept scroll across reload verified at `:3050` |

**Not landed yet in O1:** the per-family action registry and the Law 5 selection bar (verbs at 1 and
N checked, disabled-with-reason, the checked-card drop-down removed). Open key conflicts to settle
there (from the O1 map): `x` is Scan out today but Law 5 wants X = check; `o` (out of stock vs
condition), `r` (create rule vs resolve), `a` (assign vs assign-pick), `f` (Find vs flag), `i`
(more info vs download photos). Paste and Resolve act on the lead only → scope `single`.

### Dev red observed 2026-09-27 (not owned by this run)

- ~~`/api/orders` 500 on `work_type_enum: "PICK"`~~ — cleared once the QC/Pick session applied
  `2026-09-27_work_type_pick.sql`.
- Hydration mismatch on every `/shipping/orders` load: `ShippingDeskLayout` → `DeskPageChrome` `<h1>`
  renders "Shipping" on the server and "To ship" on the client.
- Intermittent dev-build breaks from other sessions' in-flight edits (`AmbientLayer.tsx` parse error,
  `presentFindDossier` missing export in `SearchReceivingDossier.tsx`).

Mobile: no port above changes a `/m/*` surface; twins are dedicated phone flows.
