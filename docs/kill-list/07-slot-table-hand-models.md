# Slot-table kill list — hand column models, not the desks

**Status:** verified 2026-08-30 against the working tree on `main` · **Wave 1 EXECUTED 2026-08-30** (see the wave section for what landed and the one deviation)  
**Plan of record:** [`docs/todo/slot-based-metadata-table-PLAN.md`](../todo/slot-based-metadata-table-PLAN.md) §15  
**This ship:** To-ship only (`tableId: orders`). Pickup, Receiving, customers wait.

This file is the deletion directory for that plan. Desks stay. **Layout-as-React dies.**

---

## Why this class of code has to die

The slot plan’s vocabulary explicitly forbids three things:

1. **“Tested column component”** — a React track whose key *is* a field (`tested`, `packed`, `scanned_out`, `tester`, `testedAt`). Org A cannot unbind it; Org B cannot bind Packed without a deploy. That is a single-tenant layout baked into product code.
2. **“Pickup-specific DataTable fork”** — a second column array that is “the pickup table.” Pickup is a **catalog + default layout**, not a second table product.
3. **“Customer grid that doesn’t share slots”** — a CRM table with its own chrome. Customers (when they exist) get the same skeleton.

A hand `*_GRID_COLUMNS` array is all three at once: it names tracks in field-id language, it is family-specific, and it cannot be captured as `organizations.settings.tableLayouts[tableId]`. `materializeTracks` is the replacement: track keys are slot indices (`identity`, `status:1…10`, `subtitle:1…5`); the catalog is the bindable vocabulary; the layout document is what org/staff/saved-view write.

**What is not on this list:** `DataTable`, `NonlinearTableHost`, `LedgerGrid`, `SearchField`, `REGISTERED_BINDINGS` / `PRODUCT_TABLES` entries, family row feeds, `displayType` cells (`CompoundStageStep` already takes catalog verbs + facts). Those are the engine. Killing them would be tearing down the SoT the plan is building.

---

## Verified 2026-08-30 (commands, not intent)

| Check | Result |
|---|---|
| `PRODUCT_TABLES` | **20** `tableId`s in [`table-catalog.ts`](../../src/lib/tables/table-catalog.ts) |
| `REGISTERED_BINDINGS` | **21** bindings (Orders is two: `fulfillment.default` + `fulfillment.tested`) |
| Field catalogs | **only** [`field-catalog/orders.ts`](../../src/lib/tables/field-catalog/orders.ts). No pickup/receiving/… catalogs. |
| `export const *_GRID_COLUMNS` / `*_COMPOUND_COLUMNS` / `ORDERS_QUEUE_COLUMNS` | **20** hand models still in `src/` (listed below) + kiosk `CART_COMPOUND_COLUMNS` |
| `fields={` passed into `DataTable` | **only** `useOrdersSpreadsheet` (orders). 19 descriptors still declare `fieldsMenu: true` with no picker data. |
| `data-col="tested"` / `key: 'tested'` on a grid | **Ready** still has a forever Tested track ([`ready-grid-layout.ts:110`](../../src/components/outbound/ready/grid/ready-grid-layout.ts)) and paints `data-col="tested"`. |
| `useGridColumnVisibility` | Hook file is gone. **Comments and `TABLE_COLUMNS` still describe per-staff hide-by-field-id.** |
| Hosts that skip `DataTable` | `StationListTable` → `<LedgerGrid>`; `StationHistoryTable` wraps it; `TechTable` / `PackerTable` mount that. |
| Review · Pairing / Packing | **Not extra tables.** Both mount `OrdersGridHost` (same Orders binding). They die when the Orders hand model dies. |

---

## Never kill

| Keep | Why it lives |
|---|---|
| `DataTable.tsx` | One display. The Fields `+` popover is plan §9, not a Sheets toolbar. |
| `NonlinearTableHost` / `LedgerGrid` | Virtualization + header. |
| `SearchField` | Find field. |
| Binding waist (`REGISTERED_BINDINGS`, definition shell: `tableId`, capabilities, `testId`) | Enumeration of collections. Layout is not this object. |
| Family feeds + `CompoundStageStep` / slot cells | Data + `displayType` paint. |
| `ordersCompoundColumnsFor` → `materializeTracks` + `ORDERS_FIELD_CATALOG` + `useOrdersTableLayout` | The replacement, already mounted on To-ship compound. |

---

## Wave 1 — this ship (`orders`) — **EXECUTED 2026-08-30**

Plan phases 1–2. After this wave there is **one** Orders binding. `queueMode` (fulfillment / staged / shipped / labels) stays row-chrome only — it is not a definition axis.

**As landed:** one binding (`ORDERS_DEFAULT_TABLE_BINDING`, canonical columns = `ORDERS_COMPOUND_COLUMNS`; the definition schema learned the materialized slot-track fields); tested definition/descriptor/mode/switch deleted, `?ustatus=TESTED` stays row narrowing (`useToShipStatusFilter` deleted with it); `TABLE_COLUMNS.orders` + the station twins (`shipped`/`tech`/`testing`/`packer`) emptied (`fba: []` precedent — the KEYS feed the zod `tableId` enum, so deleting them crashes module load); `orders-queue-column-defs.ts` + its test deleted (survivor blocks rehomed to `helpers.tested-raw.test.ts` and `use-grid-surface-directive.test.ts`); retired symbols ledgered in `retired-symbols.test.ts`. **One deviation from §1's sketch:** the benches were a LIVE mount, not a comment — `StationHistoryTable` painted `ORDERS_QUEUE_COLUMNS` directly — so the flat array moved to bench-owned `src/components/station/station-history-columns.ts` (`STATION_HISTORY_COLUMNS`) rather than dying outright; it and the flat cell registry in `OrdersQueueTableRow` go with the station-history kill (§5). Frozen offsets in that registry now derive from the mounted model (`gridFrozenLeft(columns, …)`), never a static list.

### 1. `ORDERS_QUEUE_COLUMNS`

**Where:** [`src/lib/dashboard-order-row-layout.ts`](../../src/lib/dashboard-order-row-layout.ts)  
**Still the `columns:` on both Orders `TableDefinition`s.**

**Kill:** the forever named tracks `tester`, `testedAt`, `packer`, `packedAt`, `packStation`, `qty`, `condition` (and any sibling that is a catalog fact, not a slot). Identity/select/title/`_fill` are absorbed by `materializeTracks`, not preserved as a second list.

**Why:** This array *is* the “Tested column component.” Those keys are field names. An org cannot unbind Tested or bind Packed without shipping a new array. The compound mount already materializes from `SlotLayout`; the definition still points at this static list — two SoTs for one desk. The static list will win the next “add a column” PR and the catalog will lie.

### 2. `ORDERS_QUEUE_TESTED_COLUMNS` + `ORDERS_TESTED_TABLE_BINDING` + `fulfillment.tested`

**Where:** same layout file (alias of default); [`orders-table-definition.ts`](../../src/components/dashboard/orders-queue/orders-table-definition.ts); [`orders-queue-descriptor.ts`](../../src/components/dashboard/orders-queue/orders-queue-descriptor.ts) `makeOrdersGridDescriptorTested`; [`orders-queue-column-defs.ts`](../../src/components/dashboard/orders-queue/orders-queue-column-defs.ts) still documents “tester + testedAt after Product”; [`useOrdersSpreadsheet.tsx`](../../src/components/dashboard/orders-queue/useOrdersSpreadsheet.tsx) still switches `columnMode` to `'fulfillment.tested'`.

**Kill:** the second definition, the second descriptor, the mode union, the column-defs branch, the spreadsheet switch.

**Why:** Layout encoded as a **second product table**. `?tested` / TESTED lane swapping column models is exactly “a hard-coded tested track,” wearing a binding id. Slot layout already answers “show tester + tested-at”: bind `orders.tested` into `status:1`. A second `TableSurfaceBinding` for the same `tableId` is how the fork survived the one-table rebuild.

### 3. `TABLE_COLUMNS.orders` (and hide-by-`hideKey`)

**Where:** [`src/lib/tables/table-columns.ts`](../../src/lib/tables/table-columns.ts) — `orders: [META_STATUS, META_QTY, META_CONDITION, …]` plus parallel buckets `shipped`, `tech`, `testing`, `packer`.

**Kill on Orders opt-in:** the `orders` (and station-twin) entries that list hideable **field** keys. Width prefs stay, re-keyed to slot ids (`status:1`), per plan §13.

**Why:** A **third** column registry. Grid layouts declare tracks; `TableDefinition.columns` declares tracks; `TABLE_COLUMNS` declares which keys a staffer may hide, in `meta`/`chip` language from the pre-grid row primitives. Org layout cannot see it. Per-staff hide-by-field-id is the deleted `useGridColumnVisibility` feature living in a hashmap. Slots replace “hide Tester” with “unbind `orders.tested`.”

---

## Wave 2 — universal proof (`pickup`) — **EXECUTED 2026-08-30**

Plan phase 3. Second family, same engine. Org layout on pickup must not write `tableLayouts.orders`.

**As landed:** `PICKUP_FIELD_CATALOG` + `PICKUP_PRODUCT_LAYOUT` (sheet morph;
`pickup.order` identity, `date · status` in the status band — visual parity
with the hand model's core view; sku/qty/cond/price/customer are unbound
catalog facts, the old `tier: 'optional'` ship-hidden set) ·
`pickupSheetColumnsFor` materializes over a 3-track structural skeleton
(`select · title · order`), the FIRST live consumer of the materializer's
sheet path · the layout-hook engine was extracted to the shared
`useSlotTableLayout` (orders and pickup are now config objects on one
cascade/RMW/org-capture implementation — the "adoption is a config, not a
fork" proof) · `slotCatalogFor('pickup')` serves; morph gate `['sheet']` ·
Fields + popover live on `/pickup` (band headings parameterized — a sheet's
subtitle bindings are "Detail columns", not "Under the title") ·
`?colsort=` keys are mounted track keys resolving to the bound field's fact ·
`TABLE_COLUMNS.pickup` emptied · five retired symbols ledgered. Sort of the
old flat keys and hand-tuned widths (sku 7rem→5.5, date 5.5→7, price
5→7+end) now ride the display-type geometry — the doctrine's price for
family-agnostic tracks.

### 4. `PICKUP_GRID_COLUMNS`

**Where:** [`pickup-grid-layout.ts`](../../src/components/receiving/pickup/grid/pickup-grid-layout.ts)  
**Host:** `PickupWorkspace` → `DataTable` + `PICKUP_TABLE_BINDING` (keep the binding).

**Kill:** the static column array. Add `src/lib/tables/field-catalog/pickup.ts` + product `SlotLayout` (plan §7.2). Kill `TABLE_COLUMNS.pickup` the same day.

**Why:** Pickup is named in the plan as the “scope to any table” milestone. Leaving `PICKUP_GRID_COLUMNS` means pickup can never capture “Status + Phone” as org layout without another React column. That is the pickup-specific DataTable fork, even though the host is already `DataTable`.

---

## Wave 3 — remaining `PRODUCT_TABLES`

Plan phase 5. Same why for every row: **the hand array is a frozen layout.** It cannot be org-captured, cannot share the slot skeleton, and `fieldsMenu: true` on the descriptor is a lie until a catalog exists (only Orders passes `fields` today). Big-bang before Phase 3 is a non-goal — they stay until opted in, then the array listed here is deleted, not wrapped.

| tableId | Label | Host | Kill | Why this family, specifically |
|---|---|---|---|---|
| `receiving` | Unbox · History · Testing | `ReceivingGridHost` / `ReceivingLinesTable` | `RECEIVING_GRID_COLUMNS` / `RECEIVING_COMPOUND_COLUMNS` in [`receiving-grid-layout.ts`](../../src/lib/receiving/receiving-grid-layout.ts); `TABLE_COLUMNS.receiving` | The compound golden. Still a forever track list (title, stage, platform, …). Plan §7.4 is a **port into slots**, not a licence to keep a private skeleton. If Receiving stays a hand model, every later family copies it and the engine is optional. |
| `incoming` | Incoming POs | Same `ReceivingLinesTable`, other model | `INCOMING_GRID_COLUMNS` / `INCOMING_COMPOUND_COLUMNS`; `TABLE_COLUMNS.incoming` **and** `incoming_embed` | A second column model on the same component so Incoming and History do not share prefs. That is two layouts in code. Slots: two `tableId`s, two `SlotLayout`s, one cell map. `incoming_embed` is a third hide-bucket for the same columns — prefs fork, not a product table. |
| `daily` | Daily checks | `HomeDailyMode` | `DAILY_GRID_COLUMNS` / `DAILY_COMPOUND_COLUMNS` | Checklist painted as a unique grid. It is still an information table; org “what we check on the shift board” is layout, not a new column file. |
| `tasks` | My tasks | `TasksWorkbench` | `TASKS_GRID_COLUMNS` / `TASKS_COMPOUND_COLUMNS` | Personal `staff_todos`. Sibling of daily (different store) — same slots, different catalog. |
| `catalog-link` | Review · Listing match | `ReviewCatalogLinkTable` | `CATALOG_LINK_*` in [`catalog-link-grid-layout.ts`](../../src/features/review/catalog-link/grid/catalog-link-grid-layout.ts) | Review queue with a private compound model. Matching chores are facts; the strip is slots. |
| `import-exception` | Review · Missing item number | Sibling `DataTable` on the same page | `IMPORT_EXCEPTION_*` | Second store, second hand model, one page. Two catalogs, two layouts — not two engines. |
| `inventory-units` | Inventory units | `UnitsWorkspaceView` | `UNITS_GRID_COLUMNS` | Unit browse tracks (serial, SKU, location) as forever keys. Bind into identity/status/subtitle; do not grow another units-only header. |
| `orders-import` | Order import staging | `CsvImportStagingHost` | `CSV_IMPORT_STAGING_GRID_COLUMNS` | Own prefs bucket on purpose (hiding a staging column must not densify live To-ship). That is a **separate `tableId`**, which slots already give you. The hand array is still a frozen layout for that id. |
| `ready` | Recently tested units | `ReadyQueueTable` | `READY_GRID_COLUMNS` — especially `{ key: 'tested', … }` and `data-col="tested"` in [`ready-grid/cells`](../../src/components/outbound/ready/grid/cells/index.tsx) | **The forbidden pattern, live, off To-ship.** A Tested column whose key is `tested`. Wave 1 on Orders is pointless if Ready keeps teaching the next agent to add `key: 'tested'`. |
| `catalog` | Products catalog | `ProductsCatalogWorkspace` | `CATALOG_GRID_COLUMNS`; `TABLE_COLUMNS.catalog` | Product browse. SKU/inventory/channels are catalog fields, not a second grid product. |
| `unfound` | Unfound queue | `UnfoundQueueTable` | `UNFOUND_GRID_COLUMNS` | Absence-of-a-line queue. Ticket/notes are subtitle/status facts; the row is not a third editor grid (in-cell already off). |
| `repair` | Repair queue | `RepairTable` | `REPAIR_GRID_COLUMNS`; `TABLE_COLUMNS.repair` | Walk-in/repair facts (customer, phone, ticket) belong in a catalog so an org can put phone in subtitle:2 without a deploy. |
| `tech-all` | Tech · All | `TechAllTriageTable` | `TECH_ALL_GRID_COLUMNS` | Strip over several stores. Still one information table; status slots are the strip, not a private All-only column file. |
| `tracking-exceptions` | Tracking exceptions | `TrackingExceptionsTable` | `TRACKING_EXCEPTIONS_GRID_COLUMNS` | Exception facts (carrier, age, last scan) are bindable; a frozen exception grid cannot be tenant-captured. |
| `bins` | Warehouse bins | `BinsTable` | `BINS_GRID_COLUMNS` | Location/occupancy facts. Same skeleton as every other browse table. |
| `warranty` | Warranty claims | `WarrantyClaimsTable` | `WARRANTY_GRID_COLUMNS`; `TABLE_COLUMNS.warranty` | Claim/serial/status. Structural action track stays a capability, not an org column. |
| `my-day` | Home · Today | `MyDayWorkspace` | `MY_DAY_GRID_COLUMNS` | Today’s work orders. Derived fields; layout is which facts show, not a Home-only spreadsheet. `fieldsMenu: true` here is leftover column-display lip copy. |
| `fba` | Amazon Prep board | `FbaBoardTable` | ~~`FBA_BOARD_GRID_COLUMNS`~~ **EXECUTED 2026-08-30** (operator order — fork removed early, out of wave order): `FBA_FIELD_CATALOG` + `FBA_PRODUCT_LAYOUT` (sheet; `asin` identity, structural `select · asin · title · details` skeleton), `fbaSheetColumnsFor` materialization, shared `useSlotTableLayout` config, `fieldsMenu: true` with the + popover live. The desk's Ready/Plan/Shipped bottom strip was **cleaned up entirely** — modes are dataset-swap options at the head of the ONE filter control on every body (the `caged` precedent), `?fbaMode` contract unchanged. Still open here: the Shipped body is a hand list (not binding-backed) and Ready keeps `READY_GRID_COLUMNS` + the forbidden `tested` track — both remain Wave-3 debt. | Was the last surface to reach LedgerGrid without a definition. Board ≠ a second engine. |

---

## Out of `PRODUCT_TABLES` — second display, same disease

### 5. Station history stack

**Where:** `StationListTable` mounts `<LedgerGrid>` with a `columnHeader` **node**. `StationHistoryTable` wraps it. `TechTable` / `PackerTable` mount that. Family `station-history` is in `TABLE_ENTITY_FAMILIES` and **absent** from `PRODUCT_TABLES` / `REGISTERED_BINDINGS`. [`station-history-capabilities.ts`](../../src/components/station/station-history-capabilities.ts) still says benches resolve `ORDERS_QUEUE_COLUMNS` through `useGridColumnVisibility` with `tableId` `'tech' | 'packer'`. `TABLE_COLUMNS` still has `tech`, `testing`, `packer`, `shipped`.

**Kill:** the host fork **or** register a real binding + catalog. Kill the stale `useGridColumnVisibility` comments and the extra `TABLE_COLUMNS` buckets that exist only to hide field keys on a list that never joined the waist.

**Why:** A table that is not in the product catalog cannot get org `tableLayouts`. It still draws Orders row chrome (`OrdersQueueTableRow`) with a private shell. That is a third engine: DataTable for PRODUCT_TABLES, StationListTable for benches, slots for neither. History lists are information tables; they take the waist or they stop pretending to be a spreadsheet.

### 6. Kiosk cart — `CART_COMPOUND_COLUMNS`

**Where:** [`src/lib/kiosk/cart-grid-layout.ts`](../../src/lib/kiosk/cart-grid-layout.ts)

**Kill:** at kiosk opt-in, not Wave 1.

**Why:** Another hand compound model. Not a floor desk. Leaving it is fine until kiosk is in scope; copying it as a pattern for “small tables don’t need slots” is how the fork returns.

---

## Not a kill

| Thing | Why it is not on the list |
|---|---|
| Customers | Not a table yet (plan §7.3). Adding them is catalog + feed + default layout. |
| `ReviewPairingTable` / `ReviewPackingTable` | `OrdersGridHost` consumers. Same `orders` tableId. No separate column file. |
| `CompoundStageStep` | Already parameterized (`labels` + `facts`). Keep; feed it from `FieldDef`, never `if (fieldId === 'orders.tested')`. |
| `ORDERS_COMPOUND_COLUMNS` | Product-default **materialization** (e2e SoT). Keep until Wave 1 static `ORDERS_QUEUE_*` is gone; then it is just `ordersCompoundColumnsFor(ORDERS_PRODUCT_LAYOUT)`. |

---

## Post-execution verification (operator verdict, 2026-08-30)

Wave 1 audited against the tree and **verified done**: doc marked executed ✓,
`ORDERS_QUEUE_COLUMNS` retired (bench-owned `STATION_HISTORY_COLUMNS` is the
noted deviation) ✓, one Orders binding + retired-symbols guard ✓,
`orders-queue-column-defs` absent ✓, `TABLE_COLUMNS.orders` + station twins
emptied ✓, `ORDERS_COMPOUND_COLUMNS` is the materializer's product default ✓,
orders is the only catalog and the only `fields` passer ✓. Unit suite green
(108 across slot + layout + orders + compound + retired symbols).

Still open, correctly out of that ship: Waves 2–3 hand models, the station
history fork (§5), and **Ready's forever `key: 'tested'` — the main living
contradiction of the "no forever Tested track" law outside To-ship** (Wave 3;
see the table row above).

## Counts (re-verified 2026-08-30, post-Wave-1)

| Bucket | N |
|---|---|
| Product tables / registered bindings | **20 / 20** |
| `export const *_GRID_COLUMNS` / `*_COMPOUND_COLUMNS` lines in `src/` | **27** across **20** files (GRID+COMPOUND pairs on receiving/incoming/daily/tasks, kiosk cart, the bench-owned station copy, and the Orders **materialization** — the last is the replacement, not a hand array) |
| Orders bindings today | **1** (Wave 1 executed 2026-08-30; the flat array now lives bench-side as `STATION_HISTORY_COLUMNS`) |
| Field catalogs today | **1** (orders) |
| Hand grid/compound arrays in `src/` | **21** (20 product-family + kiosk cart) |
| `fieldsMenu: true` with no `fields` prop | **18** product descriptors + station-history (lie; do not build pickers on top of hand arrays) |
| Forever `tested` track still painted | **1** (Ready) |
| Out-of-waist hosts | **StationListTable** (+ History/Tech/Packer wrappers) |

Grep the bare symbol (`-w`) before deleting. `ORDERS_QUEUE_COLUMNS` is imported by the definition, sort tests, station-history comments, and grid templates — Wave 1 cuts the **named forever tracks** and the second binding, not the file on the first try.
