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
| `receiving` | Unbox · History · Testing | `ReceivingGridHost` / `ReceivingLinesTable` | ~~`RECEIVING_COMPOUND_COLUMNS`~~ **EXECUTED 2026-08-31**; ~~`TABLE_COLUMNS.receiving`~~ **emptied 2026-08-31** (wave 3f — its stated consumer `useIsColumnHidden` did not exist). Still open: `RECEIVING_GRID_COLUMNS`, the FLAT model, now passed EXPLICITLY by `/test`'s `TestingHistoryList` instead of inherited from the definition by silence — it owes its own layout id | The compound golden. Still a forever track list (title, stage, platform, …). Plan §7.4 is a **port into slots**, not a licence to keep a private skeleton. If Receiving stays a hand model, every later family copies it and the engine is optional. |
| `incoming` | Incoming POs | Same `ReceivingLinesTable`, other model | ~~`INCOMING_COMPOUND_COLUMNS`~~ **EXECUTED 2026-08-31**; ~~`TABLE_COLUMNS.incoming` / `incoming_embed`~~ and ~~the flat definition default~~ **closed 2026-08-31** (wave 3f). `INCOMING_GRID_COLUMNS` survives only as the row/header fallback default | A second column model on the same component so Incoming and History do not share prefs. That is two layouts in code. Slots: two `tableId`s, two `SlotLayout`s, one cell map. `incoming_embed` is a third hide-bucket for the same columns — prefs fork, not a product table. |
| `daily` | Daily checks | `HomeDailyMode` | ~~`DAILY_COMPOUND_COLUMNS`~~ **EXECUTED 2026-08-31** (`DAILY_FIELD_CATALOG`, 4 facts). Still open: `DAILY_GRID_COLUMNS` (unmounted flat model) | Checklist painted as a unique grid. It is still an information table; org “what we check on the shift board” is layout, not a new column file. |
| `tasks` | My tasks | `TasksWorkbench` | ~~`TASKS_COMPOUND_COLUMNS`~~ **EXECUTED 2026-08-31** (`TASKS_FIELD_CATALOG`, 6 facts). Still open: `TASKS_GRID_COLUMNS` (unmounted flat model) | Personal `staff_todos`. Sibling of daily (different store) — same slots, different catalog. |
| `catalog-link` | Review · Listing match | `ReviewCatalogLinkTable` | ~~`CATALOG_LINK_COMPOUND_COLUMNS`~~ **EXECUTED 2026-08-31** (`CATALOG_LINK_FIELD_CATALOG`, 6 facts). Still open: the flat `CATALOG_LINK_GRID_COLUMNS` | Review queue with a private compound model. Matching chores are facts; the strip is slots. |
| `import-exception` | Review · Missing item number | Sibling `DataTable` on the same page | ~~`IMPORT_EXCEPTION_COMPOUND_COLUMNS`~~ **EXECUTED 2026-08-31** (`IMPORT_EXCEPTION_FIELD_CATALOG`, 7 facts). Still open: the flat `IMPORT_EXCEPTION_GRID_COLUMNS` | Second store, second hand model, one page. Two catalogs, two layouts — not two engines. |
| `inventory-units` | Inventory units | `UnitsWorkspaceView` | ~~`UNITS_GRID_COLUMNS`~~ **EXECUTED 2026-08-31** (wave 1.4) | Unit browse tracks (serial, SKU, location) as forever keys. Bind into identity/status/subtitle; do not grow another units-only header. |
| `orders-import` | Order import staging | `CsvImportStagingHost` | ~~`CSV_IMPORT_STAGING_GRID_COLUMNS`~~ **EXECUTED 2026-08-31** (wave 1.4) | Own prefs bucket on purpose (hiding a staging column must not densify live To-ship). That is a **separate `tableId`**, which slots already give you. The hand array is still a frozen layout for that id. |
| `ready` | Recently tested units | `ReadyQueueTable` | ~~`READY_GRID_COLUMNS`~~ **EXECUTED 2026-08-31** (seller-table-program wave 1.1 — see below) | **The forbidden pattern, live, off To-ship.** A Tested column whose key is `tested`. Wave 1 on Orders is pointless if Ready keeps teaching the next agent to add `key: 'tested'`. |
| `catalog` | Products catalog | `ProductsCatalogWorkspace` | ~~`CATALOG_GRID_COLUMNS`; `TABLE_COLUMNS.catalog`~~ **EXECUTED 2026-08-31** (wave 1.4) | Product browse. SKU/inventory/channels are catalog fields, not a second grid product. |
| `unfound` | Unfound queue | `UnfoundQueueTable` | ~~`UNFOUND_GRID_COLUMNS`~~ **EXECUTED 2026-08-31** (wave 1.4) | Absence-of-a-line queue. Ticket/notes are subtitle/status facts; the row is not a third editor grid (in-cell already off). |
| `repair` | Repair queue | `RepairTable` | ~~`REPAIR_GRID_COLUMNS`; `TABLE_COLUMNS.repair`~~ **EXECUTED 2026-08-31** (wave 1.4) | Walk-in/repair facts (customer, phone, ticket) belong in a catalog so an org can put phone in subtitle:2 without a deploy. |
| `tech-all` | Tech · All | `TechAllTriageTable` | ~~`TECH_ALL_GRID_COLUMNS`~~ **EXECUTED 2026-08-31** (wave 1.4) | Strip over several stores. Still one information table; status slots are the strip, not a private All-only column file. |
| `tracking-exceptions` | Tracking exceptions | `TrackingExceptionsTable` | ~~`TRACKING_EXCEPTIONS_GRID_COLUMNS`~~ **EXECUTED 2026-08-31** (wave 1.4) | Exception facts (carrier, age, last scan) are bindable; a frozen exception grid cannot be tenant-captured. |
| `bins` | Warehouse bins | `BinsTable` | ~~`BINS_GRID_COLUMNS`~~ **EXECUTED 2026-08-31** (wave 1.4) | Location/occupancy facts. Same skeleton as every other browse table. |
| `warranty` | Warranty claims | `WarrantyClaimsTable` | ~~`WARRANTY_GRID_COLUMNS`; `TABLE_COLUMNS.warranty`~~ **EXECUTED 2026-08-31** (wave 1.4) | Claim/serial/status. Structural action track stays a capability, not an org column. |
| `my-day` | Home · Today | `MyDayWorkspace` | ~~`MY_DAY_GRID_COLUMNS`~~ **EXECUTED 2026-08-31** (wave 1.4) | Today’s work orders. Derived fields; layout is which facts show, not a Home-only spreadsheet. `fieldsMenu: true` here is leftover column-display lip copy. |
| `fba` | Amazon Prep board | `FbaBoardTable` | ~~`FBA_BOARD_GRID_COLUMNS`~~ **EXECUTED 2026-08-30** (operator order — fork removed early, out of wave order): `FBA_FIELD_CATALOG` + `FBA_PRODUCT_LAYOUT` (sheet; `asin` identity, structural `select · asin · title · details` skeleton), `fbaSheetColumnsFor` materialization, shared `useSlotTableLayout` config, `fieldsMenu: true` with the + popover live. The desk's Ready/Plan/Shipped bottom strip was **cleaned up entirely** — modes are dataset-swap options at the head of the ONE filter control on every body (the `caged` precedent), `?fbaMode` contract unchanged. Still open here: the Shipped body is a hand list (not binding-backed) and Ready keeps `READY_GRID_COLUMNS` + the forbidden `tested` track — both remain Wave-3 debt. | Was the last surface to reach LedgerGrid without a definition. Board ≠ a second engine. |

---

## Wave 3a — `ready` — **EXECUTED 2026-08-31**

Plan of record: [`docs/todo/seller-table-program-PLAN.md`](../todo/seller-table-program-PLAN.md) §03,
wave 1.1. First of the Wave-3 ports, chosen first **not for size**: `READY_GRID_COLUMNS`
was the last live `{ key: 'tested', … }` track in `src/`, and it painted
`data-col="tested"` — the forbidden pattern teaching every next agent to copy it.

**As landed:** `READY_FIELD_CATALOG` + `READY_PRODUCT_LAYOUT` (sheet morph;
`ready.unit` identity — the unit handle the Product cell paints as its
identifier trail; `verdict · destination · cond · tested` in the status band,
which is the retired hand model's CORE view, byte-for-byte scan order) ·
`reasons` and `velocity` (the old `tier: 'optional'` ship-hidden pair) are now
UNBOUND catalog facts an org can bind · `readySheetColumnsFor` materializes over
a 3-track structural skeleton (`select · title · action`), with **both** bands
anchored on `title` so the Stage-FBA `action` track stays last however many
facts are bound · `useReadyTableLayout` is the fourth CONFIG on the shared
`useSlotTableLayout` · `slotCatalogFor('ready')` serves, morph gate `['sheet']` ·
Fields + popover live on the Ready desk (`fieldsMenu: true` is now honest —
before the port it was `true` over nothing) · the cell registry switches on the
bound FIELD ID, not a column key, with a resolved-text default so a new fact
needs a resolver case and never a new column file · pure label functions
(`readyVerdictLabel` / `readyFallbackStateLabel` / `readyHitTitle`) moved to the
`ready-resolve.ts` leaf so the row comparator stops importing a `'use client'`
module to sort · `?colsort=` keys are mounted track keys resolving to the bound
field's fact, and the "a chip list has no single value to order by" rule moved
from the `reasons` COLUMN to the `ready.reasons` FACT so a rebind carries it ·
`TABLE_COLUMNS.ready` emptied (`fba: []` precedent — the KEYS feed the zod
`tableId` enum) · four retired symbols ledgered.

**Geometry drift, the doctrine's price:** Destination (7rem hand-tuned) and
Tested (6.5rem) now ride the `tag` / `date` display-type geometry, and the
hand model's `gridLabel: 'Dest'` abbreviation is gone — the catalog label is one
word for both the header and the Fields picker.

---

## Wave 3b — `receiving` (compound mount) — **EXECUTED 2026-08-31**

Plan of record: [`docs/todo/seller-table-program-PLAN.md`](../todo/seller-table-program-PLAN.md) §03,
wave 1.3. **The compound golden** — Unbox, History and Testing all mount one
compound row, so leaving this family a hand model would have every later family
copy it and make the engine optional.

**As landed:** `RECEIVING_FIELD_CATALOG` (8 facts: order · status · qty · price ·
condition · location · tracking · serial) + `RECEIVING_PRODUCT_LAYOUT`
(**compound** morph, `receiving.order` identity, **empty** status band) ·
`receivingCompoundColumnsFor` materializes over the shared `COMPOUND_TRACKS`
skeleton, so with the product default the mounted array is byte-for-byte what
the desk painted before the port — the parity the `unbox-compound-columns` and
`compound-row-model` guards already pin · `useReceivingTableLayout` is the FIFTH
config on the shared `useSlotTableLayout` and the first compound port after
Orders · `slotCatalogFor('receiving')` serves, morph gate `['compound']` ·
`ReceivingGridHost` grew a `fields` passthrough, so the toolbar `+` popover on
Unbox / History / Testing finally has a catalog behind the `fieldsMenu: true` it
has been declaring · `receivingSlotValuesFor` resolves one value per bound slot
into the shared `CompoundRowView.slots`, keyed by TRACK key, so a rebind
re-points the cell with no adapter change.

**Two facts deliberately refused, in writing** (see the catalog docblock): the
**activity stamp** (the flat `date` track) is not a row property — which instant
a row reports depends on the rail's activity axis (Unbox `unboxed_at`, History
`scanned_at`, Testing `tested_at`), and threading the axis into the pure
`(row, fieldId)` resolver contract for one field would fork the contract every
family shares; and the **Zoho sync chip**, which derives from several columns
plus the connected-provider capability that its own cell already owns.

**Still open on this family.** `RECEIVING_GRID_COLUMNS` — the FLAT spreadsheet
model — survives, because `/test`'s `TestingHistoryList` mounts it (it passes no
`columns`, so it takes the definition's canonical list). That is a SECOND MOUNT
of one definition, and porting it needs its own layout id so the two desks do
not fight over one document. Opt-in is per-MOUNT (the same ruling that
unregistered `fba`), so `receiving` is registered compound-only and
`TABLE_COLUMNS.receiving` stays until the flat mount is ported.

---

## Wave 3c — `incoming` — **EXECUTED 2026-08-31**

Plan of record: [`docs/todo/seller-table-program-PLAN.md`](../todo/seller-table-program-PLAN.md) §03,
wave 1.3. This is the row this file described as "a second column model on the
same component so Incoming and History do not share prefs — two layouts in
code", and the answer it prescribed: **two tableIds, two `SlotLayout`s, one cell
map.** That is now literally what ships.

**As landed:** `INCOMING_FIELD_CATALOG` (7 facts: order · expected · qty ·
status · platform · tracking · condition) + `INCOMING_PRODUCT_LAYOUT`
(**compound**, `incoming.order` identity, **empty** status band — byte-for-byte
parity with what the Incoming rails paint today) · `incomingCompoundColumnsFor`
materializes over the same shared `COMPOUND_TRACKS` skeleton Receiving and
Orders use · `useIncomingTableLayout` is the SIXTH config on
`useSlotTableLayout` · `slotCatalogFor('incoming')` serves, morph gate
`['compound']` · both Incoming mounts in `ReceivingLinesTable` (the docked embed
and the full sheet) take the materialization and the Fields picker.

**The interesting half is the resolver split.** Incoming and Receiving carry the
SAME `ReceivingLineRow` through the SAME compound cells, so one resolver was the
obvious move and is the wrong one: `receiving.status` answers what the WAREHOUSE
has done (`workflow_status`), `incoming.status` answers what the CARRIER has
done (`delivery_state`) — two true answers to two different questions about one
row. `ReceivingCompoundCells`' adapter routes by the `linePhase` it already
branches on for the state pill, so a binding from the other family resolves to
nothing rather than painting a lane-dependent lie. A unit test pins that the two
catalogs share no field id, and another pins that one row resolves the two
statuses differently.

**Refused in writing:** `age` (a duration derived against now — not a row
property, it moves without the row, and the compound state cell already reports
lateness from the same number, so a bound column would be a second author) and
the Zoho receipt chip (same derivation argument as `receiving.zoho`; on the
default lane it is also constant by construction).

**Still open on this family.** `INCOMING_GRID_COLUMNS` — the flat model — is
unmounted but still the registered definition's canonical list and the
row/header default, and `TABLE_COLUMNS.incoming` / `incoming_embed` serve it.
Those die with the flat-definition sweep, not with this port.

---

## Wave 3d — `daily` · `tasks` · `catalog-link` · `import-exception` — **EXECUTED 2026-08-31**

Plan of record: [`docs/todo/seller-table-program-PLAN.md`](../todo/seller-table-program-PLAN.md) §03,
wave 1.3. Four compound families on the recipe receiving and incoming proved,
which completes wave 1.3 and takes the slot engine to **ten** opted-in tables.

Each one landed the same six pieces — catalog, resolver, registry entry,
`*CompoundColumnsFor` materialization over the shared `COMPOUND_TRACKS`,
`use*TableLayout` config on `useSlotTableLayout`, and slot values threaded into
the shared `CompoundRowView` — with an **empty default status band**, so every
desk paints byte-for-byte what it painted before while the whole vocabulary
becomes bindable. `fieldsMenu: true` is honest on all four for the first time.

| family | facts | its own vocabulary, because |
|---|---|---|
| `daily` | 4 (item · status · team · marked) | the org's shift checklist, with a roster behind every row |
| `tasks` | 6 (task · status · kind · station · resets · checked) | a staffer's own list — a different store answering a different question |
| `catalog-link` | 6 (item # · source · sku · orders · first · last) | a listing that has no catalog SKU |
| `import-exception` | 7 (order · source · tracking · sheet row · seen · first · last) | a sheet row that never became an order |

Unit tests pin that daily/tasks share no field id and that catalog-link and
import-exception share none either — the two pairs that look alike, mount the
same cells, and are the exact cases this file warned would fork.

**Two refusals worth carrying forward.** `tasks` names no lateness fact: whether
a recurring task is behind depends on the clock, and the surface deliberately
passes ONE `nowMs` to every row so two rows in a paint cannot disagree about
what day it is — a bound column would be a second author with a worse clock.
Both review queues name no `status`: they are the OPEN queues, so a status
column would paint one identical value on 100% of rows, the same
constant-by-construction argument that kept `incoming.zoho` out.

**Still open on all four.** Their FLAT models (`DAILY_GRID_COLUMNS`,
`TASKS_GRID_COLUMNS`, `CATALOG_LINK_GRID_COLUMNS`,
`IMPORT_EXCEPTION_GRID_COLUMNS`) survive as the registered definitions'
canonical lists and the row/header defaults. Nothing mounts them; they die with
the flat-definition sweep, not with these ports.

---

## Wave 3e — the ten SHEET families — **EXECUTED 2026-08-31**

Plan of record: [`docs/todo/seller-table-program-PLAN.md`](../todo/seller-table-program-PLAN.md) §03,
wave 1.4. This closes Wave 3 and, with it, **every family in this file's table**.
The slot engine now serves **twenty** tableIds.

`inventory-units` · `catalog` · `unfound` · `repair` · `tech-all` ·
`tracking-exceptions` · `bins` · `warranty` · `my-day` · `orders-import`.

Each landed the same seven pieces — catalog, resolver, registry entry,
`*SheetColumnsFor` materialization over a structural skeleton, `use*TableLayout`
config, cells switched onto the bound FIELD ID, and the `TABLE_COLUMNS` bucket
emptied to `[]` (the `fba: []` precedent — the keys feed the zod `TableId` enum)
— plus four retired symbols apiece in `retired-symbols.test.ts`.

**Family rules that had been living inside a column array, now riding the FACT**
(so a rebind carries them, which a key-keyed rule cannot):

* `bins.status` is a COMPOSITE of four flags → never sortable.
* `tech-all.urgency` is a RANK, lower = do first → opens **ascending**, against
  the house default for a number.
* `unfound` ascends on **every** track including its date: the oldest uncleared
  row is the one that needs a human, and newest-first would bury it.
* `repair` does not ride `?colsort=` at all — it shares `?sort=`/`?dir=` with a
  chrome dropdown, and `repair-display-sort.ts` keeps that vocabulary local so a
  bookmarked URL cannot change meaning. A mounted track maps ONTO one of its
  words and never mints a new one; a fact with no word is simply unsortable.
  (Its two private helpers were renamed off `*GridSort*`, which shadowed the
  retired display symbols and read as the column model's answer.)

**Structural, not catalog** — the same law across four families: Ready's
Stage-FBA link, Warranty's ticket button, Unfound's Push control,
tracking-exceptions' retry/edit, and staging's Ready/Action-required triage
state. A row-scoped control must never be something a staffer can hide and then
wonder where it went. Where the control's SUBJECT is a row fact, the fact is
bindable and the control is not — `warranty.ticket` and `unfound.checked` are
both in their catalogs.

**One geometry change, with its reason.** Staging hung its sole `1fr` on the
`customer` track. `customer` is a FACT, so it is now sized by its display type,
and a sheet with no flex track leaves its slack unallocated — the trailing
`_fill` takes it, which is the house law every other family already follows.

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


---

## Wave 3f — the canonical models, and the dead headers they caused — **EXECUTED 2026-08-31**

Wave 1.3 moved six families' MOUNTS onto the compound materialization and left
their **canonical** models — `binding.columns` / `definition.columns` — pointing
at the flat hand arrays. An audit of the tree, not of the ledger, found it.

That second source of truth was not inert. Each family derived its `?colsort=`
vocabulary from the flat array:

```
DAILY_GRID_SORTABLE_KEYS = DAILY_GRID_COLUMNS.filter(…).map(c => c.key)
  → task · status · team · marked

mounted tracks (DAILY_COMPOUND_COLUMNS)
  → select · thumb · fulfillment · item · state · amount · actions · _fill
```

`useUrlColumnSort`'s `isColumn` therefore rejected every key the header could
emit, and **clicking a column header did nothing on all six desks**. This is the
same bug `utils/queue-display-sort.ts` documents for To-Ship one wave earlier —
its `COMPOUND_TRACK_SORT_KEYS` exists for exactly this, and none of the six got
the equivalent.

**What landed**

* **Definitions + bindings repointed** to `*_COMPOUND_COLUMNS` on all six.
  `TestingHistoryList` — the one surface still painting the flat model — now
  passes `RECEIVING_GRID_COLUMNS` **explicitly**, converting a silent fallback
  into a declared second mount.
* **A track→fact map per family**, the `COMPOUND_TRACK_SORT_KEYS` shape:
  `item` → the title fact, `fulfillment` → the identity fact, `amount` → money
  where the flat model already sorted it. Refused in writing, with the reason:
  `state` on **receiving** (`compareReceivingGridRows` has no `status` arm, and
  the flat model never sorted the stage either — Incoming's twin DOES map it,
  because it has a real `statusRank`), and `fulfillment` / `amount` on **daily**
  and **tasks** (a checklist row has no order and no price).
* **Sortability moved onto the bound FACT**, and daily/tasks descriptors now
  pass `isSortable` so a header stops OFFERING a sort the desk cannot perform.
* **`catalog-link` / `import-exception`** were half-patched — track keys had been
  appended to the flat key list without a fact map, so `item` was missing (a
  dead header whose comparator arm already existed) and the `type` lookup
  returned `undefined` for every compound track, sorting dates as text. Both
  vocabularies are kept alive on purpose: the flat words are what live bookmarks
  carry, the track keys are what the mounted header emits.
* **Seven prefs buckets emptied** — `receiving · incoming · incoming_embed ·
  daily · tasks · catalog-link · import-exception`. `TABLE_COLUMNS.receiving`
  had been kept on the stated grounds that `RowMetaColumns` "asks
  `useIsColumnHidden('rest')`"; **there is no `useIsColumnHidden`** anywhere in
  `src`. The prose was defending a consumer that had already been deleted. The
  now-unused `META_*` / `CHIP_*` specs went with them.
* **A guard that can catch it.** The drift check compared `binding.columns` to
  `definition.columns` — the same reference — so it passed while the desks
  painted something else. `table-definition-registry.guard.test.ts` now also
  asserts that a slot-opted **compound** family declares compound tracks;
  verified red against the pre-fix tree with a message that names the fix.
* **`incoming-grid-layout.test.ts`** pinned "receiving has a serial track,
  incoming does not" against the two prefs buckets. Both are `[]` now, so it
  pins the two FIELD CATALOGS instead — and additionally that they share no
  field id, since one row answers two different questions.
