# Slot-table cohort — eval ledger

**SoT:** engine (`CompoundItem`, `useSlotTableLayout`, `materializeTracks`) + every peer in `PRODUCT_TABLES` — **not To-ship alone**.

Run: `pnpm run eval:cohort slot-table`

Pin: `CompoundItem` + `DateRangePickerField` in `src/design-system/pinned.json`

### Paint law

<!-- eval-ledger:auto:paint-law -->
- CompoundItem title: text-text-default idle; hover/focus text-text-info + underline; optional titleHref opens listing.
- openHref subtitle: ExternalLink glyph (never the word Listing, never item # / host path as face); live text-text-info, missing text-text-faint same box; copy = raw item_number.
- STATUS delay line: DateRangePickerField variant=compact when editable (no X, no year, no presets/Apply, click commits one day). Always a face. Write through useOptimisticMutation (useOrderAssignment).
- Toolbar funnel: DataTableFilterMenu always mounts beside SearchField (DATA_TABLE_FILTER_IDLE when a family has no facets). Never FilterRefinementBar, never a hunt-tile strip, never a funnel inside SearchField. Unbox Queue/Viewed/History share ?ukpi= with KPI tiles via useReceivingTableChrome.
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
**pass** — snapshot `docs/eval/cohorts/slot-table/snapshots/2026-09-01-tripwire.log`
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
| warranty | yes | `src/components/warranty/grid/useWarrantyTableLayout.ts` |
| my-day | yes | `src/features/my-day/grid/useMyDayTableLayout.ts` |
<!-- /eval-ledger:auto:peer-matrix -->

## Engine contract

<!-- eval-ledger:auto:engine-contract -->
| Predicate | File | Result |
|---|---|---|
| titleIdleDefault | `src/components/tables/compound/CompoundCells.tsx` | pass |
| titleHoverUnderline | `src/components/tables/compound/CompoundCells.tsx` | pass |
| listingGlyph | `src/components/tables/compound/CompoundCells.tsx` | pass |
| listingAriaOpen | `src/components/tables/compound/CompoundCells.tsx` | pass |
| listingCopyItemNumber | `src/components/tables/compound/CompoundCells.tsx` | pass |
| shipByDateRangeField | `src/components/tables/compound/CompoundCells.tsx` | pass |
| shipByCompactVariant | `src/components/tables/compound/CompoundCells.tsx` | pass |
| dateFieldCompactDecl | `src/design-system/components/DateRangePickerField.tsx` | pass |
| dateFieldNoYearFace | `src/design-system/components/DateRangePickerField.tsx` | pass |
| assignOptimistic | `src/hooks/useOrderAssignment.ts` | pass |
| useSlotTableLayoutExport | `src/components/tables/useSlotTableLayout.ts` | pass |
| materializeTracksExport | `src/lib/tables/materialize-tracks.ts` | pass |
| filterMenuAlwaysMounted | `src/components/tables/DataTable.tsx` | pass |
| filterIdleChrome | `src/components/tables/DataTable.tsx` | pass |
<!-- /eval-ledger:auto:engine-contract -->

## Discover — next gap

<!-- eval-ledger:auto:discover-next -->
**Next mechanical gap:** `hand-grid-export:catalog-link:CATALOG_LINK_GRID_COLUMNS`

- Delete/retarget: `src/features/review/catalog-link/grid/catalog-link-grid-layout.ts` (`CATALOG_LINK_GRID_COLUMNS`)
- Keep: CATALOG_LINK_COMPOUND_COLUMNS (catalogLinkCompoundColumnsFor)
- Do: After any live flat mount is ported or given its own tableId, delete CATALOG_LINK_GRID_COLUMNS and retarget sort/default/descriptor callers at the materialization.

_Snapshot:_ `docs/eval/cohorts/slot-table/snapshots/2026-09-01-discover.json`
<!-- /eval-ledger:auto:discover-next -->

## Discover — DELETE (mechanical)

<!-- eval-ledger:auto:discover-delete -->
| id | pri | tableId | path | why | KEEP | next |
|---|---|---|---|---|---|---|
| `grid-default:incoming:incoming-grid-descriptor` | 1 | incoming | `src/components/station/incoming-grid/incoming-grid-descriptor.ts` | Row/descriptor defaults to the hand INCOMING_GRID_COLUMNS when the caller omits columns — silence re-SoTs the flat model. | **INCOMING_COMPOUND_COLUMNS (incomingCompoundColumnsFor)** | Default columns to the family materialization (or require columns at the call site). Do not keep a GRID fallback. |
| `grid-default:incoming:IncomingGridRow` | 1 | incoming | `src/components/station/incoming-grid/IncomingGridRow.tsx` | Row/descriptor defaults to the hand INCOMING_GRID_COLUMNS when the caller omits columns — silence re-SoTs the flat model. | **INCOMING_COMPOUND_COLUMNS (incomingCompoundColumnsFor)** | Default columns to the family materialization (or require columns at the call site). Do not keep a GRID fallback. |
| `grid-default:receiving:ReceivingGridRow` | 1 | receiving | `src/components/station/receiving-grid/ReceivingGridRow.tsx` | Row/descriptor defaults to the hand RECEIVING_GRID_COLUMNS when the caller omits columns — silence re-SoTs the flat model. | **RECEIVING_COMPOUND_COLUMNS (receivingCompoundColumnsFor)** | Default columns to the family materialization (or require columns at the call site). Do not keep a GRID fallback. |
| `hand-grid-export:catalog-link:CATALOG_LINK_GRID_COLUMNS` | 1 | catalog-link | `src/features/review/catalog-link/grid/catalog-link-grid-layout.ts` | Hand CATALOG_LINK_GRID_COLUMNS is a frozen field-key layout on an engine peer. Dual SoT next to the compound/sheet materialization. | **CATALOG_LINK_COMPOUND_COLUMNS (catalogLinkCompoundColumnsFor)** | After any live flat mount is ported or given its own tableId, delete CATALOG_LINK_GRID_COLUMNS and retarget sort/default/descriptor callers at the materialization. |
| `hand-grid-export:daily:DAILY_GRID_COLUMNS` | 1 | daily | `src/lib/daily-checks/daily-grid-layout.ts` | Hand DAILY_GRID_COLUMNS is a frozen field-key layout on an engine peer. Dual SoT next to the compound/sheet materialization. | **DAILY_COMPOUND_COLUMNS (dailyCompoundColumnsFor)** | After any live flat mount is ported or given its own tableId, delete DAILY_GRID_COLUMNS and retarget sort/default/descriptor callers at the materialization. |
| `hand-grid-export:import-exception:IMPORT_EXCEPTION_GRID_COLUMNS` | 1 | import-exception | `src/features/review/catalog-link/grid/import-exception-grid-layout.ts` | Hand IMPORT_EXCEPTION_GRID_COLUMNS is a frozen field-key layout on an engine peer. Dual SoT next to the compound/sheet materialization. | **IMPORT_EXCEPTION_COMPOUND_COLUMNS (importExceptionCompoundColumnsFor)** | After any live flat mount is ported or given its own tableId, delete IMPORT_EXCEPTION_GRID_COLUMNS and retarget sort/default/descriptor callers at the materialization. |
| `hand-grid-export:incoming:INCOMING_GRID_COLUMNS` | 1 | incoming | `src/lib/receiving/receiving-grid-layout.ts` | Hand INCOMING_GRID_COLUMNS is a frozen field-key layout on an engine peer. Dual SoT next to the compound/sheet materialization. | **INCOMING_COMPOUND_COLUMNS (incomingCompoundColumnsFor)** | After any live flat mount is ported or given its own tableId, delete INCOMING_GRID_COLUMNS and retarget sort/default/descriptor callers at the materialization. |
| `hand-grid-export:receiving:RECEIVING_GRID_COLUMNS` | 1 | receiving | `src/lib/receiving/receiving-grid-layout.ts` | Hand RECEIVING_GRID_COLUMNS is a frozen field-key layout on an engine peer. Dual SoT next to the compound/sheet materialization. | **RECEIVING_COMPOUND_COLUMNS (receivingCompoundColumnsFor)** | After any live flat mount is ported or given its own tableId, delete RECEIVING_GRID_COLUMNS and retarget sort/default/descriptor callers at the materialization. · blocked by `flat-mount:receiving:TestingHistoryList` |
| `hand-grid-export:tasks:TASKS_GRID_COLUMNS` | 1 | tasks | `src/lib/staff-todos/tasks-grid-layout.ts` | Hand TASKS_GRID_COLUMNS is a frozen field-key layout on an engine peer. Dual SoT next to the compound/sheet materialization. | **TASKS_COMPOUND_COLUMNS (tasksCompoundColumnsFor)** | After any live flat mount is ported or given its own tableId, delete TASKS_GRID_COLUMNS and retarget sort/default/descriptor callers at the materialization. |
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
| `hook:repair` | `src/components/repair/repair-grid/useRepairTableLayout.ts` | Engine opt-in for repair. Keep the hook; it is not a second Item cell. |
| `hook:warranty` | `src/components/warranty/grid/useWarrantyTableLayout.ts` | Engine opt-in for warranty. Keep the hook; it is not a second Item cell. |
| `hook:tech-all` | `src/components/tech/all/useTechAllTableLayout.ts` | Engine opt-in for tech-all. Keep the hook; it is not a second Item cell. |
| `hook:tracking-exceptions` | `src/components/tracking-exceptions/grid/useTrackingExceptionsTableLayout.ts` | Engine opt-in for tracking-exceptions. Keep the hook; it is not a second Item cell. |
| `hook:tasks` | `src/features/tasks/grid/useTasksTableLayout.ts` | Engine opt-in for tasks. Keep the hook; it is not a second Item cell. |
| `hook:daily` | `src/features/home/grid/useDailyTableLayout.ts` | Engine opt-in for daily. Keep the hook; it is not a second Item cell. |
| `hook:my-day` | `src/features/my-day/grid/useMyDayTableLayout.ts` | Engine opt-in for my-day. Keep the hook; it is not a second Item cell. |
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
| `catalog:warranty` | `src/lib/tables/field-catalog` | Registered field catalog for warranty. Data only. |
| `catalog:catalog` | `src/lib/tables/field-catalog` | Registered field catalog for catalog. Data only. |
| `catalog:tech-all` | `src/lib/tables/field-catalog` | Registered field catalog for tech-all. Data only. |
| `catalog:unfound` | `src/lib/tables/field-catalog` | Registered field catalog for unfound. Data only. |
| `catalog:repair` | `src/lib/tables/field-catalog` | Registered field catalog for repair. Data only. |
| `catalog:my-day` | `src/lib/tables/field-catalog` | Registered field catalog for my-day. Data only. |
| `catalog:tracking-exceptions` | `src/lib/tables/field-catalog` | Registered field catalog for tracking-exceptions. Data only. |
| `catalog:orders-import` | `src/lib/tables/field-catalog` | Registered field catalog for orders-import. Data only. |
| `materialization:UNITS_SHEET_COLUMNS` | `src/components/inventory/units-grid/units-grid-layout.ts` | UNITS_SHEET_COLUMNS is the product-default materialization (not a hand GRID array). Keep; this is what mounts. |
| `materialization:CSV_IMPORT_STAGING_SHEET_COLUMNS` | `src/components/outbound/orders/import-staging/csv-import-staging-grid-layout.ts` | CSV_IMPORT_STAGING_SHEET_COLUMNS is the product-default materialization (not a hand GRID array). Keep; this is what mounts. |
| `materialization:READY_SHEET_COLUMNS` | `src/components/outbound/ready/grid/ready-grid-layout.ts` | READY_SHEET_COLUMNS is the product-default materialization (not a hand GRID array). Keep; this is what mounts. |
| `materialization:PICKUP_SHEET_COLUMNS` | `src/components/receiving/pickup/grid/pickup-grid-layout.ts` | PICKUP_SHEET_COLUMNS is the product-default materialization (not a hand GRID array). Keep; this is what mounts. |
| `materialization:UNFOUND_SHEET_COLUMNS` | `src/components/receiving/unfound/grid/unfound-grid-layout.ts` | UNFOUND_SHEET_COLUMNS is the product-default materialization (not a hand GRID array). Keep; this is what mounts. |
| `materialization:TRACKING_EXCEPTIONS_SHEET_COLUMNS` | `src/components/tracking-exceptions/grid/tracking-exceptions-grid-layout.ts` | TRACKING_EXCEPTIONS_SHEET_COLUMNS is the product-default materialization (not a hand GRID array). Keep; this is what mounts. |
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
| `flat-mount:receiving:TestingHistoryList` | 9 | receiving | `src/components/tech/TestingHistoryList.tsx` | /test Testing History is a second mount of receiving.browse that still paints the FLAT hand model. Kill-list 07 Wave 3b: this desk owes its own layout id so it does not fight Unbox/History/Testing compound. | **ReceivingGridHost, RECEIVING_TABLE_BINDING, RECEIVING_COMPOUND_COLUMNS, useReceivingTableLayout** | Give Testing History its own tableId + SlotLayout (or mount RECEIVING_COMPOUND_COLUMNS). Then delete RECEIVING_GRID_COLUMNS. |
| `out-of-waist-hand-model:station-history:STATION_HISTORY_COLUMNS` | 9 | — | `src/components/station/station-history-columns.ts` | Bench history is a third engine (LedgerGrid + field-key tracks) outside PRODUCT_TABLES / REGISTERED_BINDINGS. Kill-list 07 §5. | **OrdersQueueTableRow, ORDERS_COMPOUND_COLUMNS, DataTable waist. Do not copy this array onto a product desk.** | Human: register a real binding+catalog for station-history, or delete the host fork. Not a mechanical GRID delete. |
| `table-columns-zombie:support-tickets` | 9 | support-tickets | `src/lib/tables/table-columns.ts` | support-tickets looks like a product queue in TABLE_COLUMNS but is not in PRODUCT_TABLES. | **If this is not joining the waist, empty the bucket to [] (keep the key only if TableId still needs it).** | Human: join PRODUCT_TABLES or empty the bucket. Agents do not invent a tableId. |
<!-- /eval-ledger:auto:discover-judgment -->

## Graph impact matrix (engine symbols)

<!-- eval-ledger:auto:graph-matrix -->
| Symbol | node_key | files_affected | snapshot |
|---|---|---|---|
| CompoundItem | `component:src/components/tables/compound/CompoundCells.tsx:CompoundItem` | 5 | `docs/eval/cohorts/slot-table/snapshots/2026-09-01-impact-CompoundItem.json` |
| CompoundState | `component:src/components/tables/compound/CompoundCells.tsx:CompoundState` | 5 | `docs/eval/cohorts/slot-table/snapshots/2026-09-01-impact-CompoundState.json` |
| useSlotTableLayout | `function:src/components/tables/useSlotTableLayout.ts:useSlotTableLayout` | 8 | `docs/eval/cohorts/slot-table/snapshots/2026-09-01-impact-useSlotTableLayout.json` |
| materializeTracks | `function:src/lib/tables/materialize-tracks.ts:materializeTracks` | 12 | `docs/eval/cohorts/slot-table/snapshots/2026-09-01-impact-materializeTracks.json` |
| getExternalUrlByItemNumber | `function:src/utils/external-item-url.ts:getExternalUrlByItemNumber` | 20 | `docs/eval/cohorts/slot-table/snapshots/2026-09-01-impact-getExternalUrlByItemNumber.json` |
| DateRangePickerField | `component:src/design-system/components/DateRangePickerField.tsx:DateRangePickerField` | 6 | `docs/eval/cohorts/slot-table/snapshots/2026-09-01-impact-DateRangePickerField.json` |
| useOptimisticMutation | `function:src/lib/optimistic/useOptimisticMutation.ts:useOptimisticMutation` | 0 | `docs/eval/cohorts/slot-table/snapshots/2026-09-01-impact-useOptimisticMutation.json` |
| DataTableFilterMenu | `component:src/components/tables/DataTable.tsx:DataTableFilterMenu` | 21 | `docs/eval/cohorts/slot-table/snapshots/2026-09-01-impact-DataTableFilterMenu.json` |
<!-- /eval-ledger:auto:graph-matrix -->

## Design critique

<!-- eval-ledger:auto:design-critique -->
- `src/components/tables/compound/CompoundCells.tsx` — `docs/eval/cohorts/slot-table/snapshots/2026-09-01-critique-CompoundCells.txt`
```
{
  "file": "src/components/tables/compound/CompoundCells.tsx",
  "summary": "2 problems, worst first: 2 arbitrary type size where the typography axis exists",
  "problems": [
    {
```
- `src/design-system/components/DateRangePickerField.tsx` — `docs/eval/cohorts/slot-table/snapshots/2026-09-01-critique-DateRangePickerField.txt`
```
{
  "file": "src/design-system/components/DateRangePickerField.tsx",
  "summary": "1 problem, worst first: 326 lines — past the point reviewers read",
  "problems": [
    {
```
- `src/components/tables/useSlotTableLayout.ts` — `docs/eval/cohorts/slot-table/snapshots/2026-09-01-critique-useSlotTableLayout.txt`
```
{
  "file": "src/components/tables/useSlotTableLayout.ts",
  "summary": "1 problem, worst first: 368 lines — past the point reviewers read",
  "problems": [
    {
```
- `src/utils/external-item-url.ts` — `docs/eval/cohorts/slot-table/snapshots/2026-09-01-critique-external-item-url.txt`
```
{
  "file": "src/utils/external-item-url.ts",
  "summary": "No design-system problems found. That is not a claim the component is GOOD — only that it does not fork or drift.",
  "problems": [],
  "design_system_used": [],
```
- `src/components/tables/DataTable.tsx` — `docs/eval/cohorts/slot-table/snapshots/2026-09-01-critique-DataTable.txt`
```
{
  "file": "src/components/tables/DataTable.tsx",
  "summary": "1 problem, worst first: 1410 lines — past the point reviewers read",
  "problems": [
    {
```
<!-- /eval-ledger:auto:design-critique -->

## Graph impact (shared symbols)

<!-- eval-ledger:auto:graph-impact -->
- **CompoundItem** — 5 files, 7 symbols (`docs/eval/cohorts/slot-table/snapshots/2026-09-01-impact-CompoundItem.json`)
- **CompoundState** — 5 files, 7 symbols (`docs/eval/cohorts/slot-table/snapshots/2026-09-01-impact-CompoundState.json`)
- **useSlotTableLayout** — 8 files, 8 symbols (`docs/eval/cohorts/slot-table/snapshots/2026-09-01-impact-useSlotTableLayout.json`)
- **materializeTracks** — 12 files, 17 symbols (`docs/eval/cohorts/slot-table/snapshots/2026-09-01-impact-materializeTracks.json`)
- **getExternalUrlByItemNumber** — 20 files, 23 symbols (`docs/eval/cohorts/slot-table/snapshots/2026-09-01-impact-getExternalUrlByItemNumber.json`)
- **DateRangePickerField** — 6 files, 8 symbols (`docs/eval/cohorts/slot-table/snapshots/2026-09-01-impact-DateRangePickerField.json`)
- **useOptimisticMutation** — 0 files, 0 symbols (`docs/eval/cohorts/slot-table/snapshots/2026-09-01-impact-useOptimisticMutation.json`)
- **DataTableFilterMenu** — 21 files, 21 symbols (`docs/eval/cohorts/slot-table/snapshots/2026-09-01-impact-DataTableFilterMenu.json`)
<!-- /eval-ledger:auto:graph-impact -->

## Regression tripwires

<!-- eval-ledger:auto:tripwires -->
- `src/lib/tables/slot-table-cohort.test.ts`
- `src/lib/tables/slot-table-discover.test.ts`
<!-- /eval-ledger:auto:tripwires -->

## graph_stats

<!-- eval-ledger:auto:graph-stats -->
- project: `cycleforge-app`
- status: `ready`
- last_built_at: `2026-08-31T22:47:46.121Z`
- nodes: 36519 · edges: 169929 · embedded: 36519
- snapshot: `docs/eval/cohorts/slot-table/snapshots/2026-09-01-graph-stats.json`
<!-- /eval-ledger:auto:graph-stats -->

---

<!-- eval-ledger:auto:last-run -->
_Updated 2026-09-01T08:49:05.957Z · cohort `slot-table` · run id `2026-09-01T08-47-51-608Z`_
<!-- /eval-ledger:auto:last-run -->
