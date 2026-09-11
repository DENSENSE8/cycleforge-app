# Slot-table cohort — eval ledger

**SoT:** engine (`CompoundItem`, `useSlotTableLayout`, `materializeTracks`) + every peer in `PRODUCT_TABLES` — **not To-ship alone**.

Run: `pnpm run eval:cohort slot-table`

Pin: `CompoundItem` + `DateRangePickerField` in `src/design-system/pinned.json`

### Paint law

<!-- eval-ledger:auto:paint-law -->
- CompoundItem title: text-text-default idle; hover/focus text-text-info + underline; optional titleHref opens listing.
- openHref subtitle: ExternalLink glyph (never the word Listing, never item # / host path as face); live text-text-info, missing text-text-faint same box; copy = raw item_number.
- STATUS delay line: DateRangePickerField variant=compact when editable (no X, no year, no presets/Apply, click commits one day). Always a face. Write through useOptimisticMutation (useOrderAssignment). Form compact mounts keep the default calendar.
- Toolbar funnel: DataTableFilterMenu always mounts beside SearchField (DATA_TABLE_FILTER_IDLE when a family has no facets). Job verbs (`actions`) paint immediately after the funnel — search · filter · actions · sort · views · date. Never FilterRefinementBar, never a hunt-tile strip, never a funnel inside SearchField. Unbox Queue/Viewed/History share ?ukpi= with KPI tiles via useReceivingTableChrome.
- Multi-line fold parent: select check sits in the top COMPOUND_TWO_LINE_CLASS track (same pt-1 16px face as every leaf, aligned with the order-id chip). Fold chevron sits in the bottom track, same 16px column, aligned with "2 boxes". Shared with CompoundCell. Never flex-col justify-center the stack. Engine: SlotTableGroupParentRow — To-ship QueueGroupRow and Unbox ReceivingGridGroupRow both mount it. Operator 2026-09-10.
- Compound leaf select gutter: when view.detail is present, paint COMPOUND_TWO_LINE_CLASS (check top, detail chevron bottom, data-row-detail — not data-group-fold). Chevron expands a second COMPOUND_ROW_PX detail band (serial / location / view unit) under the leaf — never grow the 48px CompoundItem cell, never a third CompoundFulfillment chip. Parent multi-line fold chevron stays cardinality-only. Mobile /m uses BottomSheet with the same facts. Virtualizer first-paint uses compoundRowDetailEstimatePx (48 vs 96) + measureElement. Operator 2026-09-11.
- Engine paint for every PRODUCT_TABLES peer — not To-ship alone.
<!-- /eval-ledger:auto:paint-law -->

---

## Locked wins

- Title idle `text-text-default`; accent + underline on hover/focus
- Listing subtitle: ExternalLink glyph (never the word Listing / item # face); copy = item #
- Layout hooks wrap `useSlotTableLayout`
- Ship-by delay: `DateRangePickerField variant="compact"` (no X, no year, click commits; `useOptimisticMutation`)
- Tripwire: `src/lib/tables/slot-table-cohort.test.ts`

## Operator verdict

_Human edits after tunnel walks across desks. Agents do not invent this._

- **Status:** initial scaffold — awaiting first operator walk
- **Approved:**
- **Changes:**
- **Do not regress:**

## Open gaps

_Agents: do not invent gaps. Pick **one unblocked** row from Discover → DELETE (priority 1 first). After the kill, remove that id from `SLOT_TABLE_KNOWN_DEBT` (ratchet down). Never delete a KEEP row. Judgment stays human._

1. _(machine queue is Discover → next / DELETE below)_

---

## Machine gates

<!-- eval-ledger:auto:machine-gates -->
_Skipped verify (--skip-verify)._
<!-- /eval-ledger:auto:machine-gates -->

## Tripwire result

<!-- eval-ledger:auto:tripwire-result -->
**FAIL** — snapshot `docs/eval/cohorts/slot-table/snapshots/2026-09-11-tripwire.log`
```
▶ slot-table cohort (SoT = engine + PRODUCT_TABLES)
  ✔ peers are exactly PRODUCT_TABLES ids (no hand list) (1.363208ms)
  ✔ every engine layout hook file exists and imports useSlotTableLayout (0.808265ms)
  ✔ engine peers are a subset of PRODUCT_TABLES (opt-in map) (0.189258ms)
  ✔ CompoundItem title hover actions satisfy paint contract (1.281805ms)
  ✔ no new *GridRow.tsx — To-ship sheet sync must not add a second table (59.620698ms)
  ✔ To-ship Google Sheet sync paints UnshippedTable, not CsvImportStagingGridRow (0.295069ms)
  ✔ engine seam files export the shared hooks (imported, not grepped) (112.255661ms)
  ✔ compact DateRangePickerField is the ship-by surface (0.324859ms)
  ✔ ship-by writes through useOptimisticMutation (0.165832ms)
  ✔ paint law constants document cohort scope (not To-ship alone) (1.788477ms)
  ✔ person face never paints Staff #id — engine + resolvers (0.420357ms)
  ✔ graph + critique surfaces include compact ship-by (0.096149ms)
  ✔ DataTable always mounts the filter funnel (0.286978ms)
  ✔ shared skeleton has no ⋮ and no Amount track (copy on chips, money under the title) (0.324275ms)
  ✔ every graphSymbol maps to an existing KEEP engine file (0.681065ms)
```
<!-- /eval-ledger:auto:tripwire-result -->

## Peer matrix (PRODUCT_TABLES × engine opt-in)

<!-- eval-ledger:auto:peer-matrix -->
| tableId | on_engine | layout_hook |
|---|---|---|
| receiving | yes | `src/components/station/receiving-grid/useReceivingTableLayout.ts` |
| incoming | yes | `src/components/station/incoming-grid/useIncomingTableLayout.ts` |
| orders | yes | `src/components/dashboard/orders-queue/useOrdersTableLayout.ts` |
| daily | yes | `src/features/home/grid/useDailyTableLayout.ts` |
| tasks | yes | `src/features/tasks/grid/useTasksTableLayout.ts` |
| catalog-link | yes | `src/features/review/catalog-link/grid/useCatalogLinkTableLayout.ts` |
| import-exception | yes | `src/features/review/catalog-link/grid/useImportExceptionTableLayout.ts` |
| inventory-units | yes | `src/components/inventory/units-grid/useUnitsTableLayout.ts` |
| orders-import | yes | `src/components/outbound/orders/import-staging/useOrdersImportTableLayout.ts` |
| ready | yes | `src/components/outbound/ready/grid/useReadyTableLayout.ts` |
| catalog | yes | `src/components/products/catalog/catalog-grid/useCatalogTableLayout.ts` |
| pickup | yes | `src/components/receiving/pickup/grid/usePickupTableLayout.ts` |
| unfound | yes | `src/components/receiving/unfound/grid/useUnfoundTableLayout.ts` |
| repair | yes | `src/components/repair/repair-grid/useRepairTableLayout.ts` |
| tech-all | yes | `src/components/tech/all/useTechAllTableLayout.ts` |
| tracking-exceptions | yes | `src/components/tracking-exceptions/grid/useTrackingExceptionsTableLayout.ts` |
| bins | yes | `src/components/warehouse/bins-grid/useBinsTableLayout.ts` |
| inventory-events | yes | `src/components/inventory/events-grid/useInventoryEventsTableLayout.ts` |
| warranty | yes | `src/components/warranty/grid/useWarrantyTableLayout.ts` |
| my-day | yes | `src/features/my-day/grid/useMyDayTableLayout.ts` |
| kiosk-devices | yes | `src/components/settings/kiosk-devices/useKioskDevicesTableLayout.ts` |
| kiosk-slot-events | yes | `src/components/settings/kiosk-slot-events/useKioskSlotEventsTableLayout.ts` |
| walk-in-sales | — | — |
<!-- /eval-ledger:auto:peer-matrix -->

## Engine contract

<!-- eval-ledger:auto:engine-contract -->
| Predicate | File | Result |
|---|---|---|
| titleIdleDefault | `src/components/tables/compound/ProductTitleLink.tsx` | pass |
| titleHoverUnderline | `src/components/tables/compound/ProductTitleLink.tsx` | pass |
| titleItemNumberActions | `src/components/tables/compound/CompoundCells.tsx` | pass |
| editItemNumber | `src/components/tables/compound/CompoundCells.tsx` | pass |
| listingAriaOpen | `src/components/tables/compound/CompoundCells.tsx` | pass |
| listingCopyItemNumber | `src/components/tables/compound/CompoundCells.tsx` | pass |
| shipByDateRangeField | `src/components/tables/compound/CompoundCells.tsx` | pass |
| shipByCompactVariant | `src/components/tables/compound/CompoundCells.tsx` | pass |
| datesCellOrderHash | `src/components/tables/compound/CompoundCells.tsx` | pass |
| datesCellShipByClock | `src/components/tables/compound/CompoundCells.tsx` | pass |
| datesHoverLabel | `src/components/tables/compound/CompoundCells.tsx` | pass |
| datesClickCursor | `src/components/tables/compound/CompoundCells.tsx` | pass |
| dateFieldCompactDecl | `src/design-system/components/DateRangePickerField.tsx` | pass |
| dateFieldNoYearFace | `src/design-system/components/DateRangePickerField.tsx` | pass |
| assignOptimistic | `src/hooks/useOrderAssignment.ts` | pass |
| filterMenuAlwaysMounted | `src/components/tables/DataTable.tsx` | pass |
| filterIdleChrome | `src/components/tables/DataTable.tsx` | pass |
| toolbarActionsLeft | `src/components/tables/DataTable.tsx` | pass |
| stageAssignPopover | `src/components/tables/compound/CompoundCells.tsx` | pass |
| stageAssignLock | `src/components/tables/compound/CompoundCells.tsx` | pass |
| stageAssignTrigger | `src/components/tables/compound/CompoundCells.tsx` | pass |
| compoundRowForwardsStageAssigns | `src/components/tables/compound/CompoundRow.tsx` | pass |
| stageAssignListHeight | `src/design-system/components/AssigneeCombobox.tsx` | pass |
| stageAssignLaneFilter | `src/components/tables/compound/StageStaffAssignPopover.tsx` | pass |
| stageAssignAllStaff | `src/design-system/components/AssigneeCombobox.tsx` | pass |
| stageAssignRosterSwitch | `src/design-system/components/AssigneeCombobox.tsx` | pass |
| lineQtyPin | `src/components/tables/compound/CompoundCells.tsx` | pass |
| lineQtyEnsure | `src/lib/tables/slot-table-line-qty.ts` | pass |
| lineMoneyPin | `src/lib/tables/slot-table-line-money.ts` | pass |
| lineMoneyEnsure | `src/lib/tables/slot-table-line-money.ts` | pass |
| compoundSkeletonNoActions | `src/components/tables/compound/compound-columns.ts` | pass |
| compoundSkeletonNoAmount | `src/components/tables/compound/compound-columns.ts` | pass |
| datesGridLabelDates | `src/components/tables/compound/compound-columns.ts` | pass |
| datesDueHover | `src/components/tables/compound/compound-row-model.ts` | pass |
| datesStartHover | `src/components/tables/compound/compound-row-model.ts` | pass |
| datesStartedHoverField | `src/components/tables/compound/compound-row-model.ts` | pass |
| incomingPriceField | `src/lib/tables/field-catalog/incoming.ts` | pass |
| receivingPriceField | `src/lib/tables/field-catalog/receiving.ts` | pass |
| groupParentSelectStack | `src/components/tables/compound/SlotTableGroupParentRow.tsx` | pass |
| leafDetailSelectStack | `src/components/tables/compound/CompoundGridCell.tsx` | pass |
| leafDetailBand | `src/components/tables/compound/CompoundRowDetailBand.tsx` | pass |
| compoundTwoLineClass | `src/components/tables/compound/CompoundCell.tsx` | pass |
| headerActionRow | `src/design-system/components/grid/LedgerGrid.tsx` | pass |
| headerActionRowGuest | `src/design-system/components/grid/LedgerGrid.tsx` | pass |
<!-- /eval-ledger:auto:engine-contract -->

## Discover — next gap

<!-- eval-ledger:auto:discover-next -->
**Next mechanical gap:** `hand-grid-export:import-exception:IMPORT_EXCEPTION_GRID_COLUMNS`

- Delete/retarget: `src/features/review/catalog-link/grid/import-exception-grid-layout.ts` (`IMPORT_EXCEPTION_GRID_COLUMNS`)
- Keep: IMPORT_EXCEPTION_COMPOUND_COLUMNS (importExceptionCompoundColumnsFor)
- Do: After any live flat mount is ported or given its own tableId, delete IMPORT_EXCEPTION_GRID_COLUMNS and retarget sort/default/descriptor callers at the materialization.

_Snapshot:_ `docs/eval/cohorts/slot-table/snapshots/2026-09-11-discover.json`
<!-- /eval-ledger:auto:discover-next -->

## Discover — DELETE (mechanical)

<!-- eval-ledger:auto:discover-delete -->
| id | pri | tableId | path | why | KEEP | next |
|---|---|---|---|---|---|---|
| `grid-default:incoming:incoming-grid-descriptor` | 1 | incoming | `src/components/station/incoming-grid/incoming-grid-descriptor.ts` | Row/descriptor defaults to the hand INCOMING_GRID_COLUMNS when the caller omits columns — silence re-SoTs the flat model. | **INCOMING_COMPOUND_COLUMNS (incomingCompoundColumnsFor)** | Default columns to the family materialization (or require columns at the call site). Do not keep a GRID fallback. |
| `grid-default:incoming:IncomingGridRow` | 1 | incoming | `src/components/station/incoming-grid/IncomingGridRow.tsx` | Row/descriptor defaults to the hand INCOMING_GRID_COLUMNS when the caller omits columns — silence re-SoTs the flat model. | **INCOMING_COMPOUND_COLUMNS (incomingCompoundColumnsFor)** | Default columns to the family materialization (or require columns at the call site). Do not keep a GRID fallback. |
| `grid-default:receiving:ReceivingGridRow` | 1 | receiving | `src/components/station/receiving-grid/ReceivingGridRow.tsx` | Row/descriptor defaults to the hand RECEIVING_GRID_COLUMNS when the caller omits columns — silence re-SoTs the flat model. | **RECEIVING_COMPOUND_COLUMNS (receivingCompoundColumnsFor)** | Default columns to the family materialization (or require columns at the call site). Do not keep a GRID fallback. |
| `hand-grid-export:import-exception:IMPORT_EXCEPTION_GRID_COLUMNS` | 1 | import-exception | `src/features/review/catalog-link/grid/import-exception-grid-layout.ts` | Hand IMPORT_EXCEPTION_GRID_COLUMNS is a frozen field-key layout on an engine peer. Dual SoT next to the compound/sheet materialization. | **IMPORT_EXCEPTION_COMPOUND_COLUMNS (importExceptionCompoundColumnsFor)** | After any live flat mount is ported or given its own tableId, delete IMPORT_EXCEPTION_GRID_COLUMNS and retarget sort/default/descriptor callers at the materialization. |
| `hand-grid-export:incoming:INCOMING_GRID_COLUMNS` | 1 | incoming | `src/lib/receiving/receiving-grid-layout.ts` | Hand INCOMING_GRID_COLUMNS is a frozen field-key layout on an engine peer. Dual SoT next to the compound/sheet materialization. | **INCOMING_COMPOUND_COLUMNS (incomingCompoundColumnsFor)** | After any live flat mount is ported or given its own tableId, delete INCOMING_GRID_COLUMNS and retarget sort/default/descriptor callers at the materialization. |
| `hand-grid-export:receiving:RECEIVING_GRID_COLUMNS` | 1 | receiving | `src/lib/receiving/receiving-grid-layout.ts` | Hand RECEIVING_GRID_COLUMNS is a frozen field-key layout on an engine peer. Dual SoT next to the compound/sheet materialization. | **RECEIVING_COMPOUND_COLUMNS (receivingCompoundColumnsFor)** | After any live flat mount is ported or given its own tableId, delete RECEIVING_GRID_COLUMNS and retarget sort/default/descriptor callers at the materialization. |
| `hand-grid-export:tasks:TASKS_GRID_COLUMNS` | 1 | tasks | `src/lib/staff-todos/tasks-grid-layout.ts` | Hand TASKS_GRID_COLUMNS is a frozen field-key layout on an engine peer. Dual SoT next to the compound/sheet materialization. | **TASKS_COMPOUND_COLUMNS (tasksCompoundColumnsFor)** | After any live flat mount is ported or given its own tableId, delete TASKS_GRID_COLUMNS and retarget sort/default/descriptor callers at the materialization. |
| `peer-not-on-engine:walk-in-sales` | 1 | walk-in-sales | `src/lib/tables/slot-table-cohort.ts` | walk-in-sales is in PRODUCT_TABLES but has no useSlotTableLayout hook in SLOT_TABLE_ENGINE_LAYOUT_HOOKS. | **PRODUCT_TABLES row + REGISTERED_BINDINGS entry** | Add a use*TableLayout config wrapping useSlotTableLayout and append SLOT_TABLE_ENGINE_LAYOUT_HOOKS. |
<!-- /eval-ledger:auto:discover-delete -->

## Discover — KEEP

<!-- eval-ledger:auto:discover-keep -->
| id | path | keep because |
|---|---|---|
| `engine:CompoundItem` | `src/components/tables/compound/CompoundCells.tsx` | One Item cell for every PRODUCT_TABLES peer. Title/listing paint lives here. |
| `engine:CompoundStageStep` | `src/components/tables/compound/CompoundCells.tsx` | Parameterized stage paint. Feed from FieldDef — never if (fieldId === …). |
| `engine:useSlotTableLayout` | `src/components/tables/useSlotTableLayout.ts` | Shared cascade. Family hooks are config, not forks. |
| `engine:materializeTracks` | `src/lib/tables/materialize-tracks.ts` | Track keys are slot indices. Replacement for hand GRID arrays. |
| `engine:DataTable` | `src/components/tables/DataTable.tsx` | One display. Kill-list never-kill. |
| `engine:DataTableFilterMenu` | `src/components/tables/DataTable.tsx` | Toolbar funnel always mounts beside SearchField. Idle chrome when a family has no facets. Not FilterRefinementBar. |
| `engine:NonlinearTableHost` | `src/components/tables/NonlinearTableHost.tsx` | Virtualization host. Kill-list never-kill. |
| `engine:LedgerGrid` | `src/design-system/components/grid/LedgerGrid.tsx` | Grid primitive. Kill-list never-kill. |
| `engine:SearchField` | `src/design-system/primitives/SearchField.tsx` | Find field. Kill-list never-kill. |
| `engine:REGISTERED_BINDINGS` | `src/components/tables/registered-bindings.ts` | Offering waist. Layout is not this object. |
| `engine:PRODUCT_TABLES` | `src/lib/tables/table-catalog.ts` | Server-safe catalog. Parity-tested against bindings. |
| `engine:SLOT_LAYOUT_TABLES` | `src/lib/tables/org-table-layouts.ts` | Opt-in registry for org layouts. Grow one entry per family; never delete a mounted one. |
| `engine:TABLE_COLUMNS-keys` | `src/lib/tables/table-columns.ts` | Keys feed TableId. Empty buckets for slot peers; do not delete keys. |
| `engine:getExternalUrlByItemNumber` | `src/utils/external-item-url.ts` | Listing URL util. CompoundItem consumes this; desk forks must not paint host paths. |
| `engine:DateRangePickerField` | `src/design-system/components/DateRangePickerField.tsx` | STATUS ship-by / inline civil date. variant=compact in the cell (no X, no year, click commits). variant=range is the filter. Do not hand-roll type=date. |
| `engine:CompoundRowDetailBand` | `src/components/tables/compound/CompoundRowDetailBand.tsx` | Leaf detail band under the 48px product row (serial / location / view unit). data-compound-row-detail. Never grow CompoundItem. Not FilterRefinementBar. |
| `engine:CompoundState` | `src/components/tables/compound/CompoundCells.tsx` | STATUS column. Editable delay mounts DateRangePickerField variant=compact. |
| `engine:CART_COMPOUND_COLUMNS` | `src/lib/kiosk/cart-grid-layout.ts` | Kiosk uses compoundColumnsFor (shared skeleton), not a field-key GRID. Keep until kiosk is in PRODUCT_TABLES — do not copy as “small tables skip slots”. |
| `hook:orders` | `src/components/dashboard/orders-queue/useOrdersTableLayout.ts` | Engine opt-in for orders. Keep the hook; it is not a second Item cell. |
| `hook:orders-import` | `src/components/outbound/orders/import-staging/useOrdersImportTableLayout.ts` | Engine opt-in for orders-import. Keep the hook; it is not a second Item cell. |
| `hook:receiving` | `src/components/station/receiving-grid/useReceivingTableLayout.ts` | Engine opt-in for receiving. Keep the hook; it is not a second Item cell. |
| `hook:incoming` | `src/components/station/incoming-grid/useIncomingTableLayout.ts` | Engine opt-in for incoming. Keep the hook; it is not a second Item cell. |
| `hook:ready` | `src/components/outbound/ready/grid/useReadyTableLayout.ts` | Engine opt-in for ready. Keep the hook; it is not a second Item cell. |
| `hook:pickup` | `src/components/receiving/pickup/grid/usePickupTableLayout.ts` | Engine opt-in for pickup. Keep the hook; it is not a second Item cell. |
| `hook:unfound` | `src/components/receiving/unfound/grid/useUnfoundTableLayout.ts` | Engine opt-in for unfound. Keep the hook; it is not a second Item cell. |
| `hook:catalog-link` | `src/features/review/catalog-link/grid/useCatalogLinkTableLayout.ts` | Engine opt-in for catalog-link. Keep the hook; it is not a second Item cell. |
| `hook:import-exception` | `src/features/review/catalog-link/grid/useImportExceptionTableLayout.ts` | Engine opt-in for import-exception. Keep the hook; it is not a second Item cell. |
| `hook:inventory-units` | `src/components/inventory/units-grid/useUnitsTableLayout.ts` | Engine opt-in for inventory-units. Keep the hook; it is not a second Item cell. |
| `hook:catalog` | `src/components/products/catalog/catalog-grid/useCatalogTableLayout.ts` | Engine opt-in for catalog. Keep the hook; it is not a second Item cell. |
| `hook:bins` | `src/components/warehouse/bins-grid/useBinsTableLayout.ts` | Engine opt-in for bins. Keep the hook; it is not a second Item cell. |
| `hook:inventory-events` | `src/components/inventory/events-grid/useInventoryEventsTableLayout.ts` | Engine opt-in for inventory-events. Keep the hook; it is not a second Item cell. |
| `hook:repair` | `src/components/repair/repair-grid/useRepairTableLayout.ts` | Engine opt-in for repair. Keep the hook; it is not a second Item cell. |
| `hook:warranty` | `src/components/warranty/grid/useWarrantyTableLayout.ts` | Engine opt-in for warranty. Keep the hook; it is not a second Item cell. |
| `hook:tech-all` | `src/components/tech/all/useTechAllTableLayout.ts` | Engine opt-in for tech-all. Keep the hook; it is not a second Item cell. |
| `hook:tracking-exceptions` | `src/components/tracking-exceptions/grid/useTrackingExceptionsTableLayout.ts` | Engine opt-in for tracking-exceptions. Keep the hook; it is not a second Item cell. |
| `hook:tasks` | `src/features/tasks/grid/useTasksTableLayout.ts` | Engine opt-in for tasks. Keep the hook; it is not a second Item cell. |
| `hook:daily` | `src/features/home/grid/useDailyTableLayout.ts` | Engine opt-in for daily. Keep the hook; it is not a second Item cell. |
| `hook:my-day` | `src/features/my-day/grid/useMyDayTableLayout.ts` | Engine opt-in for my-day. Keep the hook; it is not a second Item cell. |
| `hook:kiosk-devices` | `src/components/settings/kiosk-devices/useKioskDevicesTableLayout.ts` | Engine opt-in for kiosk-devices. Keep the hook; it is not a second Item cell. |
| `hook:kiosk-slot-events` | `src/components/settings/kiosk-slot-events/useKioskSlotEventsTableLayout.ts` | Engine opt-in for kiosk-slot-events. Keep the hook; it is not a second Item cell. |
| `catalog:orders` | `src/lib/tables/field-catalog` | Registered field catalog for orders. Data only. |
| `catalog:pickup` | `src/lib/tables/field-catalog` | Registered field catalog for pickup. Data only. |
| `catalog:ready` | `src/lib/tables/field-catalog` | Registered field catalog for ready. Data only. |
| `catalog:receiving` | `src/lib/tables/field-catalog` | Registered field catalog for receiving. Data only. |
| `catalog:incoming` | `src/lib/tables/field-catalog` | Registered field catalog for incoming. Data only. |
| `catalog:daily` | `src/lib/tables/field-catalog` | Registered field catalog for daily. Data only. |
| `catalog:tasks` | `src/lib/tables/field-catalog` | Registered field catalog for tasks. Data only. |
| `catalog:catalog-link` | `src/lib/tables/field-catalog` | Registered field catalog for catalog-link. Data only. |
| `catalog:import-exception` | `src/lib/tables/field-catalog` | Registered field catalog for import-exception. Data only. |
| `catalog:inventory-units` | `src/lib/tables/field-catalog` | Registered field catalog for inventory-units. Data only. |
| `catalog:bins` | `src/lib/tables/field-catalog` | Registered field catalog for bins. Data only. |
| `catalog:inventory-events` | `src/lib/tables/field-catalog` | Registered field catalog for inventory-events. Data only. |
| `catalog:warranty` | `src/lib/tables/field-catalog` | Registered field catalog for warranty. Data only. |
| `catalog:catalog` | `src/lib/tables/field-catalog` | Registered field catalog for catalog. Data only. |
| `catalog:tech-all` | `src/lib/tables/field-catalog` | Registered field catalog for tech-all. Data only. |
| `catalog:unfound` | `src/lib/tables/field-catalog` | Registered field catalog for unfound. Data only. |
| `catalog:repair` | `src/lib/tables/field-catalog` | Registered field catalog for repair. Data only. |
| `catalog:my-day` | `src/lib/tables/field-catalog` | Registered field catalog for my-day. Data only. |
| `catalog:tracking-exceptions` | `src/lib/tables/field-catalog` | Registered field catalog for tracking-exceptions. Data only. |
| `catalog:orders-import` | `src/lib/tables/field-catalog` | Registered field catalog for orders-import. Data only. |
| `catalog:kiosk-devices` | `src/lib/tables/field-catalog` | Registered field catalog for kiosk-devices. Data only. |
| `catalog:kiosk-slot-events` | `src/lib/tables/field-catalog` | Registered field catalog for kiosk-slot-events. Data only. |
| `catalog:walk-in-sales` | `src/lib/tables/field-catalog` | Registered field catalog for walk-in-sales. Data only. |
| `materialization:INVENTORY_EVENTS_COMPOUND_COLUMNS` | `src/components/inventory/events-grid/inventory-events-grid-layout.ts` | INVENTORY_EVENTS_COMPOUND_COLUMNS is the product-default materialization (not a hand GRID array). Keep; this is what mounts. |
| `materialization:UNITS_SHEET_COLUMNS` | `src/components/inventory/units-grid/units-grid-layout.ts` | UNITS_SHEET_COLUMNS is the product-default materialization (not a hand GRID array). Keep; this is what mounts. |
| `materialization:CSV_IMPORT_STAGING_SHEET_COLUMNS` | `src/components/outbound/orders/import-staging/csv-import-staging-grid-layout.ts` | CSV_IMPORT_STAGING_SHEET_COLUMNS is the product-default materialization (not a hand GRID array). Keep; this is what mounts. |
| `materialization:READY_SHEET_COLUMNS` | `src/components/outbound/ready/grid/ready-grid-layout.ts` | READY_SHEET_COLUMNS is the product-default materialization (not a hand GRID array). Keep; this is what mounts. |
| `materialization:PICKUP_SHEET_COLUMNS` | `src/components/receiving/pickup/grid/pickup-grid-layout.ts` | PICKUP_SHEET_COLUMNS is the product-default materialization (not a hand GRID array). Keep; this is what mounts. |
| `materialization:UNFOUND_SHEET_COLUMNS` | `src/components/receiving/unfound/grid/unfound-grid-layout.ts` | UNFOUND_SHEET_COLUMNS is the product-default materialization (not a hand GRID array). Keep; this is what mounts. |
| `materialization:KIOSKDEVICES_COMPOUND_COLUMNS` | `src/components/settings/kiosk-devices/kiosk-devices-grid-layout.ts` | KIOSKDEVICES_COMPOUND_COLUMNS is the product-default materialization (not a hand GRID array). Keep; this is what mounts. |
| `materialization:KIOSKSLOTEVENTS_COMPOUND_COLUMNS` | `src/components/settings/kiosk-slot-events/kiosk-slot-events-grid-layout.ts` | KIOSKSLOTEVENTS_COMPOUND_COLUMNS is the product-default materialization (not a hand GRID array). Keep; this is what mounts. |
| `materialization:TRACKING_EXCEPTIONS_SHEET_COLUMNS` | `src/components/tracking-exceptions/grid/tracking-exceptions-grid-layout.ts` | TRACKING_EXCEPTIONS_SHEET_COLUMNS is the product-default materialization (not a hand GRID array). Keep; this is what mounts. |
| `materialization:WALKINSALES_COMPOUND_COLUMNS` | `src/components/walk-in/grid/walk-in-sales-grid-layout.ts` | WALKINSALES_COMPOUND_COLUMNS is the product-default materialization (not a hand GRID array). Keep; this is what mounts. |
| `materialization:BINS_SHEET_COLUMNS` | `src/components/warehouse/bins-grid/bins-grid-layout.ts` | BINS_SHEET_COLUMNS is the product-default materialization (not a hand GRID array). Keep; this is what mounts. |
| `materialization:WARRANTY_SHEET_COLUMNS` | `src/components/warranty/grid/warranty-grid-layout.ts` | WARRANTY_SHEET_COLUMNS is the product-default materialization (not a hand GRID array). Keep; this is what mounts. |
| `materialization:CATALOG_LINK_COMPOUND_COLUMNS` | `src/features/review/catalog-link/grid/catalog-link-grid-layout.ts` | CATALOG_LINK_COMPOUND_COLUMNS is the product-default materialization (not a hand GRID array). Keep; this is what mounts. |
| `materialization:IMPORT_EXCEPTION_COMPOUND_COLUMNS` | `src/features/review/catalog-link/grid/import-exception-grid-layout.ts` | IMPORT_EXCEPTION_COMPOUND_COLUMNS is the product-default materialization (not a hand GRID array). Keep; this is what mounts. |
| `materialization:DAILY_COMPOUND_COLUMNS` | `src/lib/daily-checks/daily-grid-layout.ts` | DAILY_COMPOUND_COLUMNS is the product-default materialization (not a hand GRID array). Keep; this is what mounts. |
| `materialization:ORDERS_COMPOUND_COLUMNS` | `src/lib/dashboard-order-row-layout.ts` | ORDERS_COMPOUND_COLUMNS is the product-default materialization (not a hand GRID array). Keep; this is what mounts. |
| `materialization:CART_COMPOUND_COLUMNS` | `src/lib/kiosk/cart-grid-layout.ts` | CART_COMPOUND_COLUMNS is the product-default materialization (not a hand GRID array). Keep; this is what mounts. |
| `materialization:MY_DAY_SHEET_COLUMNS` | `src/lib/my-day/my-day-grid-layout.ts` | MY_DAY_SHEET_COLUMNS is the product-default materialization (not a hand GRID array). Keep; this is what mounts. |
| `materialization:CATALOG_SHEET_COLUMNS` | `src/lib/products/catalog-grid-layout.ts` | CATALOG_SHEET_COLUMNS is the product-default materialization (not a hand GRID array). Keep; this is what mounts. |
| `materialization:RECEIVING_COMPOUND_COLUMNS` | `src/lib/receiving/receiving-grid-layout.ts` | RECEIVING_COMPOUND_COLUMNS is the product-default materialization (not a hand GRID array). Keep; this is what mounts. |
| `materialization:INCOMING_COMPOUND_COLUMNS` | `src/lib/receiving/receiving-grid-layout.ts` | INCOMING_COMPOUND_COLUMNS is the product-default materialization (not a hand GRID array). Keep; this is what mounts. |
| `materialization:REPAIR_SHEET_COLUMNS` | `src/lib/repair/repair-grid-layout.ts` | REPAIR_SHEET_COLUMNS is the product-default materialization (not a hand GRID array). Keep; this is what mounts. |
| `materialization:TASKS_COMPOUND_COLUMNS` | `src/lib/staff-todos/tasks-grid-layout.ts` | TASKS_COMPOUND_COLUMNS is the product-default materialization (not a hand GRID array). Keep; this is what mounts. |
| `materialization:TECH_ALL_SHEET_COLUMNS` | `src/lib/tech/tech-all-grid-layout.ts` | TECH_ALL_SHEET_COLUMNS is the product-default materialization (not a hand GRID array). Keep; this is what mounts. |
<!-- /eval-ledger:auto:discover-keep -->

## Discover — JUDGMENT (human)

<!-- eval-ledger:auto:discover-judgment -->
| id | pri | tableId | path | why | KEEP | next |
|---|---|---|---|---|---|---|
| `catalog-orphan:fba:FBA_FIELD_CATALOG` | 9 | fba | `src/lib/tables/field-catalog/fba.ts` | Field catalog exists but is not in SLOT_LAYOUT_TABLES. FBA is the known case: board torn out, catalog kept for rebuild (operator 2026-08-31). | **FBA_FIELD_CATALOG + resolve module — do not delete. Re-add one SLOT_LAYOUT_TABLES line when the mount returns.** | Human: remount the desk, then register. Do not register an unmounted table (layouts would save into a void). |
| `out-of-waist-hand-model:station-history:STATION_HISTORY_COLUMNS` | 9 | — | `src/components/station/station-history-columns.ts` | Bench history is a third engine (LedgerGrid + field-key tracks) outside PRODUCT_TABLES / REGISTERED_BINDINGS. Kill-list 07 §5. | **OrdersQueueTableRow, ORDERS_COMPOUND_COLUMNS, DataTable waist. Do not copy this array onto a product desk.** | Human: register a real binding+catalog for station-history, or delete the host fork. Not a mechanical GRID delete. |
| `table-columns-zombie:support-tickets` | 9 | support-tickets | `src/lib/tables/table-columns.ts` | support-tickets looks like a product queue in TABLE_COLUMNS but is not in PRODUCT_TABLES. | **If this is not joining the waist, empty the bucket to [] (keep the key only if TableId still needs it).** | Human: join PRODUCT_TABLES or empty the bucket. Agents do not invent a tableId. |
<!-- /eval-ledger:auto:discover-judgment -->

## Graph impact matrix (engine symbols)

<!-- eval-ledger:auto:graph-matrix -->
| Symbol | node_key | files_affected | snapshot |
|---|---|---|---|
| CompoundItem | `component:src/components/tables/compound/CompoundCells.tsx:CompoundItem` | 6 | `docs/eval/cohorts/slot-table/snapshots/2026-09-11-impact-CompoundItem.json` |
| CompoundState | `component:src/components/tables/compound/CompoundCells.tsx:CompoundState` | 6 | `docs/eval/cohorts/slot-table/snapshots/2026-09-11-impact-CompoundState.json` |
| useSlotTableLayout | `function:src/components/tables/useSlotTableLayout.ts:useSlotTableLayout` | 58 | `docs/eval/cohorts/slot-table/snapshots/2026-09-11-impact-useSlotTableLayout.json` |
| materializeTracks | `function:src/lib/tables/materialize-tracks.ts:materializeTracks` | 81 | `docs/eval/cohorts/slot-table/snapshots/2026-09-11-impact-materializeTracks.json` |
| getExternalUrlByItemNumber | `function:src/utils/external-item-url.ts:getExternalUrlByItemNumber` | 26 | `docs/eval/cohorts/slot-table/snapshots/2026-09-11-impact-getExternalUrlByItemNumber.json` |
| DateRangePickerField | `component:src/design-system/components/DateRangePickerField.tsx:DateRangePickerField` | 18 | `docs/eval/cohorts/slot-table/snapshots/2026-09-11-impact-DateRangePickerField.json` |
| useOptimisticMutation | `function:src/lib/optimistic/useOptimisticMutation.ts:useOptimisticMutation` | 12 | `docs/eval/cohorts/slot-table/snapshots/2026-09-11-impact-useOptimisticMutation.json` |
| DataTableFilterMenu | `component:src/components/tables/DataTable.tsx:DataTableFilterMenu` | 37 | `docs/eval/cohorts/slot-table/snapshots/2026-09-11-impact-DataTableFilterMenu.json` |
| queueSortForColumnKey | `function:src/utils/queue-display-sort.ts:queueSortForColumnKey` | 8 | `docs/eval/cohorts/slot-table/snapshots/2026-09-11-impact-queueSortForColumnKey.json` |
| LedgerGridColumnHeader | `component:src/design-system/components/grid/LedgerGridColumnHeader.tsx:LedgerGridColumnHeader` | 35 | `docs/eval/cohorts/slot-table/snapshots/2026-09-11-impact-LedgerGridColumnHeader.json` |
| isSlotTableChromeTrack | `function:src/lib/tables/slot-table-header-sort.ts:isSlotTableChromeTrack` | 27 | `docs/eval/cohorts/slot-table/snapshots/2026-09-11-impact-isSlotTableChromeTrack.json` |
| AssigneeCombobox | `component:src/design-system/components/AssigneeCombobox.tsx:AssigneeCombobox` | 3 | `docs/eval/cohorts/slot-table/snapshots/2026-09-11-impact-AssigneeCombobox.json` |
| ensureLineQtySubtitle | `function:src/lib/tables/slot-table-line-qty.ts:ensureLineQtySubtitle` | 8 | `docs/eval/cohorts/slot-table/snapshots/2026-09-11-impact-ensureLineQtySubtitle.json` |
| pinLineQtyFirst | `function:src/lib/tables/slot-table-line-qty.ts:pinLineQtyFirst` | 8 | `docs/eval/cohorts/slot-table/snapshots/2026-09-11-impact-pinLineQtyFirst.json` |
| ensureLineMoneySubtitle | `function:src/lib/tables/slot-table-line-money.ts:ensureLineMoneySubtitle` | 8 | `docs/eval/cohorts/slot-table/snapshots/2026-09-11-impact-ensureLineMoneySubtitle.json` |
| pinLineMoneyAfterQty | `function:src/lib/tables/slot-table-line-money.ts:pinLineMoneyAfterQty` | 9 | `docs/eval/cohorts/slot-table/snapshots/2026-09-11-impact-pinLineMoneyAfterQty.json` |
| ordersCompoundColumnsFor | `function:src/lib/dashboard-order-row-layout.ts:ordersCompoundColumnsFor` | 19 | `docs/eval/cohorts/slot-table/snapshots/2026-09-11-impact-ordersCompoundColumnsFor.json` |
| COMPOUND_COLUMN_KEYS | `variable:src/components/tables/compound/compound-columns.ts:COMPOUND_COLUMN_KEYS` | 0 | `docs/eval/cohorts/slot-table/snapshots/2026-09-11-impact-COMPOUND_COLUMN_KEYS.json` |
| MorphingRowActionMenu | `component:src/components/outbound/orders/to-ship/MorphingRowActionMenu.tsx:MorphingRowActionMenu` | 4 | `docs/eval/cohorts/slot-table/snapshots/2026-09-11-impact-MorphingRowActionMenu.json` |
<!-- /eval-ledger:auto:graph-matrix -->

## Design critique

<!-- eval-ledger:auto:design-critique -->
- `src/components/tables/compound/CompoundCells.tsx` — `docs/eval/cohorts/slot-table/snapshots/2026-09-11-critique-CompoundCells.txt`
```
{
  "file": "src/components/tables/compound/CompoundCells.tsx",
  "summary": "2 problems, worst first: 3 arbitrary type size where the typography axis exists",
  "problems": [
    {
```
- `src/components/tables/compound/CompoundRow.tsx` — `docs/eval/cohorts/slot-table/snapshots/2026-09-11-critique-CompoundRow.txt`
```
{
  "file": "src/components/tables/compound/CompoundRow.tsx",
  "summary": "2 problems, worst first: 1 inline style object where the token axis exists",
  "problems": [
    {
```
- `src/components/tables/compound/StageStaffAssignPopover.tsx` — `docs/eval/cohorts/slot-table/snapshots/2026-09-11-critique-StageStaffAssignPopover.txt`
```
{
  "file": "src/components/tables/compound/StageStaffAssignPopover.tsx",
  "summary": "No design-system problems found. That is not a claim the component is GOOD — only that it does not fork or drift.",
  "problems": [],
  "design_system_used": [
```
- `src/design-system/components/AssigneeCombobox.tsx` — `docs/eval/cohorts/slot-table/snapshots/2026-09-11-critique-AssigneeCombobox.txt`
```
{
  "file": "src/design-system/components/AssigneeCombobox.tsx",
  "summary": "No design-system problems found. That is not a claim the component is GOOD — only that it does not fork or drift.",
  "problems": [],
  "design_system_used": [
```
- `src/components/tables/compound/CompoundStaffRosterButton.tsx` — `docs/eval/cohorts/slot-table/snapshots/2026-09-11-critique-CompoundStaffRosterButton.txt`
```
{
  "file": "src/components/tables/compound/CompoundStaffRosterButton.tsx",
  "summary": "No design-system problems found. That is not a claim the component is GOOD — only that it does not fork or drift.",
  "problems": [],
  "design_system_used": [
```
- `src/design-system/components/DateRangePickerField.tsx` — `docs/eval/cohorts/slot-table/snapshots/2026-09-11-critique-DateRangePickerField.txt`
```
{
  "file": "src/design-system/components/DateRangePickerField.tsx",
  "summary": "1 problem, worst first: 373 lines — past the point reviewers read",
  "problems": [
    {
```
- `src/components/tables/useSlotTableLayout.ts` — `docs/eval/cohorts/slot-table/snapshots/2026-09-11-critique-useSlotTableLayout.txt`
```
{
  "file": "src/components/tables/useSlotTableLayout.ts",
  "summary": "1 problem, worst first: 388 lines — past the point reviewers read",
  "problems": [
    {
```
- `src/utils/external-item-url.ts` — `docs/eval/cohorts/slot-table/snapshots/2026-09-11-critique-external-item-url.txt`
```
{
  "file": "src/utils/external-item-url.ts",
  "summary": "No design-system problems found. That is not a claim the component is GOOD — only that it does not fork or drift.",
  "problems": [],
  "design_system_used": [],
```
- `src/components/tables/DataTable.tsx` — `docs/eval/cohorts/slot-table/snapshots/2026-09-11-critique-DataTable.txt`
```
{
  "file": "src/components/tables/DataTable.tsx",
  "summary": "1 problem, worst first: 1820 lines — past the point reviewers read",
  "problems": [
    {
```
- `src/design-system/components/grid/LedgerGridColumnHeader.tsx` — `docs/eval/cohorts/slot-table/snapshots/2026-09-11-critique-LedgerGridColumnHeader.txt`
```
{
  "file": "src/design-system/components/grid/LedgerGridColumnHeader.tsx",
  "summary": "2 problems, worst first: 2 inline style object where the token axis exists",
  "problems": [
    {
```
- `src/components/tables/compound/CompoundCell.tsx` — `docs/eval/cohorts/slot-table/snapshots/2026-09-11-critique-CompoundCell.txt`
```
{
  "file": "src/components/tables/compound/CompoundCell.tsx",
  "summary": "No design-system problems found. That is not a claim the component is GOOD — only that it does not fork or drift.",
  "problems": [],
  "design_system_used": [],
```
- `src/components/tables/compound/CompoundGridCell.tsx` — `docs/eval/cohorts/slot-table/snapshots/2026-09-11-critique-CompoundGridCell.txt`
```
{
  "file": "src/components/tables/compound/CompoundGridCell.tsx",
  "summary": "1 problem, worst first: 467 lines — past the point reviewers read",
  "problems": [
    {
```
- `src/components/tables/compound/CompoundRowDetailBand.tsx` — `docs/eval/cohorts/slot-table/snapshots/2026-09-11-critique-CompoundRowDetailBand.txt`
```
{
  "file": "src/components/tables/compound/CompoundRowDetailBand.tsx",
  "summary": "1 problem, worst first: 1 inline style object where the token axis exists",
  "problems": [
    {
```
- `src/components/tables/compound/SlotTableGroupParentRow.tsx` — `docs/eval/cohorts/slot-table/snapshots/2026-09-11-critique-SlotTableGroupParentRow.txt`
```
{
  "file": "src/components/tables/compound/SlotTableGroupParentRow.tsx",
  "summary": "2 problems, worst first: 1 inline style object where the token axis exists",
  "problems": [
    {
```
- `src/components/outbound/orders/to-ship/MorphingRowActionMenu.tsx` — `docs/eval/cohorts/slot-table/snapshots/2026-09-11-critique-MorphingRowActionMenu.txt`
```
{
  "file": "src/components/outbound/orders/to-ship/MorphingRowActionMenu.tsx",
  "summary": "2 problems, worst first: a raw <input> where the system has TextField",
  "problems": [
    {
```
- `src/design-system/components/grid/LedgerGrid.tsx` — `docs/eval/cohorts/slot-table/snapshots/2026-09-11-critique-LedgerGrid.txt`
```
{
  "file": "src/design-system/components/grid/LedgerGrid.tsx",
  "summary": "1 problem, worst first: 572 lines — past the point reviewers read",
  "problems": [
    {
```
<!-- /eval-ledger:auto:design-critique -->

## Graph impact (shared symbols)

<!-- eval-ledger:auto:graph-impact -->
- **CompoundItem** — 6 files, 9 symbols (`docs/eval/cohorts/slot-table/snapshots/2026-09-11-impact-CompoundItem.json`)
- **CompoundState** — 6 files, 9 symbols (`docs/eval/cohorts/slot-table/snapshots/2026-09-11-impact-CompoundState.json`)
- **useSlotTableLayout** — 58 files, 58 symbols (`docs/eval/cohorts/slot-table/snapshots/2026-09-11-impact-useSlotTableLayout.json`)
- **materializeTracks** — 81 files, 111 symbols (`docs/eval/cohorts/slot-table/snapshots/2026-09-11-impact-materializeTracks.json`)
- **getExternalUrlByItemNumber** — 26 files, 29 symbols (`docs/eval/cohorts/slot-table/snapshots/2026-09-11-impact-getExternalUrlByItemNumber.json`)
- **DateRangePickerField** — 18 files, 22 symbols (`docs/eval/cohorts/slot-table/snapshots/2026-09-11-impact-DateRangePickerField.json`)
- **useOptimisticMutation** — 12 files, 12 symbols (`docs/eval/cohorts/slot-table/snapshots/2026-09-11-impact-useOptimisticMutation.json`)
- **DataTableFilterMenu** — 37 files, 37 symbols (`docs/eval/cohorts/slot-table/snapshots/2026-09-11-impact-DataTableFilterMenu.json`)
- **queueSortForColumnKey** — 8 files, 8 symbols (`docs/eval/cohorts/slot-table/snapshots/2026-09-11-impact-queueSortForColumnKey.json`)
- **LedgerGridColumnHeader** — 35 files, 35 symbols (`docs/eval/cohorts/slot-table/snapshots/2026-09-11-impact-LedgerGridColumnHeader.json`)
- **isSlotTableChromeTrack** — 27 files, 43 symbols (`docs/eval/cohorts/slot-table/snapshots/2026-09-11-impact-isSlotTableChromeTrack.json`)
- **AssigneeCombobox** — 3 files, 3 symbols (`docs/eval/cohorts/slot-table/snapshots/2026-09-11-impact-AssigneeCombobox.json`)
- **ensureLineQtySubtitle** — 8 files, 8 symbols (`docs/eval/cohorts/slot-table/snapshots/2026-09-11-impact-ensureLineQtySubtitle.json`)
- **pinLineQtyFirst** — 8 files, 8 symbols (`docs/eval/cohorts/slot-table/snapshots/2026-09-11-impact-pinLineQtyFirst.json`)
- **ensureLineMoneySubtitle** — 8 files, 8 symbols (`docs/eval/cohorts/slot-table/snapshots/2026-09-11-impact-ensureLineMoneySubtitle.json`)
- **pinLineMoneyAfterQty** — 9 files, 9 symbols (`docs/eval/cohorts/slot-table/snapshots/2026-09-11-impact-pinLineMoneyAfterQty.json`)
- **ordersCompoundColumnsFor** — 19 files, 21 symbols (`docs/eval/cohorts/slot-table/snapshots/2026-09-11-impact-ordersCompoundColumnsFor.json`)
- **COMPOUND_COLUMN_KEYS** — 0 files, 0 symbols (`docs/eval/cohorts/slot-table/snapshots/2026-09-11-impact-COMPOUND_COLUMN_KEYS.json`)
- **MorphingRowActionMenu** — 4 files, 6 symbols (`docs/eval/cohorts/slot-table/snapshots/2026-09-11-impact-MorphingRowActionMenu.json`)
<!-- /eval-ledger:auto:graph-impact -->

## Regression tripwires

<!-- eval-ledger:auto:tripwires -->
- `src/lib/tables/slot-table-cohort.test.ts`
- `src/lib/tables/slot-table-line-qty.test.ts`
- `src/lib/tables/slot-table-line-money.test.ts`
- `src/lib/tables/slot-table-session-laws.test.ts`
- `src/lib/tables/slot-table-discover.test.ts`
- `src/lib/tables/table-engine-law.test.ts`
<!-- /eval-ledger:auto:tripwires -->

## graph_stats

<!-- eval-ledger:auto:graph-stats -->
- project: `cycleforge-app`
- status: `ready`
- last_built_at: `2026-09-06T22:48:33.312Z`
- nodes: 41038 · edges: 191462 · embedded: 41038
- snapshot: `docs/eval/cohorts/slot-table/snapshots/2026-09-11-graph-stats.json`
<!-- /eval-ledger:auto:graph-stats -->

---

<!-- eval-ledger:auto:last-run -->
_Updated 2026-09-11T22:54:59.802Z · cohort `slot-table` · run id `2026-09-11T22-53-20-728Z`_
<!-- /eval-ledger:auto:last-run -->
