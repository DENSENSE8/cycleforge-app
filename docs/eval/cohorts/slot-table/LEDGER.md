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
- Every painted DATA column header is click-to-sort (family isSortable + comparator + URL fact map). The toolbar sort menu lists those same facts (`queueColumnSortOptions`) plus View composites / pins — a header-click sort (Pick, Status, Image) must be a selectable row, not trigger-only. Chrome only: select, actions/action, _fill. Image/thumb is DATA. Dead headers (click does nothing) are a fail — map the track, do not set sortable:false on a labeled fact. Operator 2026-09-01.
- Pending stage_event cells (empty dashed mark or assigned-unstamped) open AssigneeCombobox via StageStaffAssignPopover. Assign mode lists this lane only (name-click assigns). All staff (CommandInput trailing) is roster mode: Pick shows Picker, Packed shows Packer, far-right All staff shows both. Stamped steps stay read-only. Hosts arm CompoundStageAssign by catalog field id; CompoundRow forwards stageAssigns so every PRODUCT_TABLES peer that binds a stage track gets the same combo. Bulk assign stays the column-foot person icon. Operator 2026-09-01.
- Engine paint for every PRODUCT_TABLES peer — not To-ship alone.
<!-- /eval-ledger:auto:paint-law -->

---

## Locked wins

- Title idle `text-text-default`; accent + underline on hover/focus
- Listing subtitle: ExternalLink glyph (never the word Listing / item # face); copy = item #
- Layout hooks wrap `useSlotTableLayout`
- Ship-by delay: `DateRangePickerField variant="compact"` (no X, no year, click commits; `useOptimisticMutation`)
- Header click-to-sort every DATA track (chrome only: select / actions / `_fill`)
- Pending `stage_event` empty/assigned mark is the staff combo (`StageStaffAssignPopover`)
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
_Skipped verify (--skip-verify). Run `pnpm run eval:station slot-table` for full gate._
<!-- /eval-ledger:auto:machine-gates -->

## Tripwire result

<!-- eval-ledger:auto:tripwire-result -->
**pass** — snapshot `docs/eval/cohorts/slot-table/snapshots/2026-09-02-tripwire.log`
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
| sessions | yes | `src/features/reports/sessions/useSessionsTableLayout.ts` |
| catalog-link | yes | `src/features/review/catalog-link/grid/useCatalogLinkTableLayout.ts` |
| import-exception | yes | `src/features/review/catalog-link/grid/useImportExceptionTableLayout.ts` |
| inventory-units | yes | `src/components/inventory/units-grid/useUnitsTableLayout.ts` |
| orders-import | yes | `src/components/outbound/orders/import-staging/useOrdersImportTableLayout.ts` |
| shortage-coverage-import | yes | `src/components/outbound/orders/shortage-coverage-staging/useShortageCoverageImportTableLayout.ts` |
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
| titleIdleDefault | `src/components/tables/compound/ProductTitleLink.tsx` | pass |
| titleHoverUnderline | `src/components/tables/compound/ProductTitleLink.tsx` | pass |
| titleItemNumberActions | `src/components/tables/compound/CompoundCells.tsx` | pass |
| editItemNumber | `src/components/tables/compound/CompoundCells.tsx` | pass |
| listingAriaOpen | `src/components/tables/compound/CompoundCells.tsx` | pass |
| listingCopyItemNumber | `src/components/tables/compound/CompoundCells.tsx` | pass |
| shipByDateRangeField | `src/components/tables/compound/CompoundCells.tsx` | pass |
| shipByCompactVariant | `src/components/tables/compound/CompoundCells.tsx` | pass |
| dateFieldCompactDecl | `src/design-system/components/DateRangePickerField.tsx` | pass |
| dateFieldNoYearFace | `src/design-system/components/DateRangePickerField.tsx` | pass |
| assignOptimistic | `src/hooks/useOrderAssignment.ts` | pass |
| filterMenuAlwaysMounted | `src/components/tables/DataTable.tsx` | pass |
| filterIdleChrome | `src/components/tables/DataTable.tsx` | pass |
| stageAssignPopover | `src/components/tables/compound/CompoundCells.tsx` | pass |
| stageAssignLock | `src/components/tables/compound/CompoundCells.tsx` | pass |
| stageAssignTrigger | `src/components/tables/compound/CompoundCells.tsx` | pass |
| compoundRowForwardsStageAssigns | `src/components/tables/compound/CompoundRow.tsx` | pass |
| stageAssignListHeight | `src/design-system/components/AssigneeCombobox.tsx` | pass |
| stageAssignLaneFilter | `src/components/tables/compound/StageStaffAssignPopover.tsx` | pass |
| stageAssignAllStaff | `src/design-system/components/AssigneeCombobox.tsx` | pass |
| stageAssignRosterSwitch | `src/design-system/components/AssigneeCombobox.tsx` | pass |
<!-- /eval-ledger:auto:engine-contract -->

## Discover — next gap

<!-- eval-ledger:auto:discover-next -->
_No unblocked mechanical deletes._

_Snapshot:_ `docs/eval/cohorts/slot-table/snapshots/2026-09-02-discover.json`
<!-- /eval-ledger:auto:discover-next -->

## Discover — DELETE (mechanical)

<!-- eval-ledger:auto:discover-delete -->
_No mechanical deletes. Dual-SoT hand models are gone._
<!-- /eval-ledger:auto:discover-delete -->

## Discover — KEEP

<!-- eval-ledger:auto:discover-keep -->
| id | path | keep because |
|---|---|---|
| `engine:CompoundItem` | `src/components/tables/compound/CompoundCells.tsx` | One Item cell for every PRODUCT_TABLES peer. Listing hover menu lives here; title face is ProductTitleLink. |
| `engine:ProductTitleLink` | `src/components/tables/compound/ProductTitleLink.tsx` | Shared title listing face. Idle text-text-default; hover/focus text-text-info + underline. Do not fork per desk. |
| `engine:CompoundStageStep` | `src/components/tables/compound/CompoundCells.tsx` | Parameterized stage paint. Empty/pending mark is the staff combo (StageStaffAssignPopover); stamped stays read-only. Feed from FieldDef — never if (fieldId === …). |
| `engine:useSlotTableLayout` | `src/components/tables/useSlotTableLayout.ts` | Shared cascade. Family hooks are config, not forks. |
| `engine:materializeTracks` | `src/lib/tables/materialize-tracks.ts` | Track keys are slot indices. Replacement for hand GRID arrays. |
| `engine:DataTable` | `src/components/tables/DataTable.tsx` | One display. Kill-list never-kill. |
| `engine:DataTableFilterMenu` | `src/components/tables/DataTable.tsx` | Toolbar funnel always mounts beside SearchField. Idle chrome when a family has no facets. Not FilterRefinementBar. |
| `engine:slot-table-header-sort` | `src/lib/tables/slot-table-header-sort.ts` | Header click-to-sort law. Chrome keys only; every painted DATA track sorts. Do not delete to silence a dead header. |
| `engine:queueSortForColumnKey` | `src/utils/queue-display-sort.ts` | Orders/To-ship/Shipped track→fact sort bridge. Compound header keys are tracks; ?sort= is facts. Impact this, not one desk row. |
| `engine:LedgerGridColumnHeader` | `src/design-system/components/grid/LedgerGridColumnHeader.tsx` | The one header click surface. isSortable(key) is the offer; a labeled data track that returns false is a dead header. |
| `engine:NonlinearTableHost` | `src/components/tables/NonlinearTableHost.tsx` | Virtualization host. Kill-list never-kill. |
| `engine:LedgerGrid` | `src/design-system/components/grid/LedgerGrid.tsx` | Grid primitive. Kill-list never-kill. |
| `engine:SearchField` | `src/design-system/primitives/SearchField.tsx` | Find field. Kill-list never-kill. |
| `engine:REGISTERED_BINDINGS` | `src/components/tables/registered-bindings.ts` | Offering waist. Layout is not this object. |
| `engine:PRODUCT_TABLES` | `src/lib/tables/table-catalog.ts` | Server-safe catalog. Parity-tested against bindings. |
| `engine:SLOT_LAYOUT_TABLES` | `src/lib/tables/org-table-layouts.ts` | Opt-in registry for org layouts. Grow one entry per family; never delete a mounted one. |
| `engine:TABLE_COLUMNS-keys` | `src/lib/tables/table-columns.ts` | Keys feed TableId. Empty buckets for slot peers; do not delete keys. |
| `engine:getExternalUrlByItemNumber` | `src/utils/external-item-url.ts` | Listing URL util. CompoundItem consumes this; desk forks must not paint host paths. |
| `engine:DateRangePickerField` | `src/design-system/components/DateRangePickerField.tsx` | STATUS ship-by / inline civil date. variant=compact in the cell (no X, no year, click commits). variant=range is the filter. Do not hand-roll type=date. |
| `engine:useOptimisticMutation` | `src/lib/optimistic/useOptimisticMutation.ts` | Ship-by / in-cell writes go through this hook (useOrderAssignment). Do not replace with a silent fetch. |
| `engine:CompoundState` | `src/components/tables/compound/CompoundCells.tsx` | STATUS column. Editable delay mounts DateRangePickerField variant=compact. |
| `engine:CART_COMPOUND_COLUMNS` | `src/lib/kiosk/cart-grid-layout.ts` | Kiosk cart is a transient DataTable binding. Its compound columns come from compoundColumnsFor, so the surface shares the canonical grid skeleton without pretending session rows are a staff PRODUCT_TABLES desk. |
| `hook:orders` | `src/components/dashboard/orders-queue/useOrdersTableLayout.ts` | Engine opt-in for orders. Keep the hook; it is not a second Item cell. |
| `hook:orders-import` | `src/components/outbound/orders/import-staging/useOrdersImportTableLayout.ts` | Engine opt-in for orders-import. Keep the hook; it is not a second Item cell. |
| `hook:shortage-coverage-import` | `src/components/outbound/orders/shortage-coverage-staging/useShortageCoverageImportTableLayout.ts` | Engine opt-in for shortage-coverage-import. Keep the hook; it is not a second Item cell. |
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
| `hook:sessions` | `src/features/reports/sessions/useSessionsTableLayout.ts` | Engine opt-in for sessions. Keep the hook; it is not a second Item cell. |
| `hook:daily` | `src/features/home/grid/useDailyTableLayout.ts` | Engine opt-in for daily. Keep the hook; it is not a second Item cell. |
| `hook:my-day` | `src/features/my-day/grid/useMyDayTableLayout.ts` | Engine opt-in for my-day. Keep the hook; it is not a second Item cell. |
| `catalog:orders` | `src/lib/tables/field-catalog` | Registered field catalog for orders. Data only. |
| `catalog:pickup` | `src/lib/tables/field-catalog` | Registered field catalog for pickup. Data only. |
| `catalog:ready` | `src/lib/tables/field-catalog` | Registered field catalog for ready. Data only. |
| `catalog:receiving` | `src/lib/tables/field-catalog` | Registered field catalog for receiving. Data only. |
| `catalog:incoming` | `src/lib/tables/field-catalog` | Registered field catalog for incoming. Data only. |
| `catalog:daily` | `src/lib/tables/field-catalog` | Registered field catalog for daily. Data only. |
| `catalog:tasks` | `src/lib/tables/field-catalog` | Registered field catalog for tasks. Data only. |
| `catalog:sessions` | `src/lib/tables/field-catalog` | Registered field catalog for sessions. Data only. |
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
| `catalog:shortage-coverage-import` | `src/lib/tables/field-catalog` | Registered field catalog for shortage-coverage-import. Data only. |
| `materialization:UNITS_SHEET_COLUMNS` | `src/components/inventory/units-grid/units-grid-layout.ts` | UNITS_SHEET_COLUMNS is the product-default materialization (not a hand GRID array). Keep; this is what mounts. |
| `materialization:CSV_IMPORT_STAGING_SHEET_COLUMNS` | `src/components/outbound/orders/import-staging/csv-import-staging-grid-layout.ts` | CSV_IMPORT_STAGING_SHEET_COLUMNS is the product-default materialization (not a hand GRID array). Keep; this is what mounts. |
| `materialization:SHORTAGE_COVERAGE_STAGING_SHEET_COLUMNS` | `src/components/outbound/orders/shortage-coverage-staging/shortage-coverage-staging-grid-layout.ts` | SHORTAGE_COVERAGE_STAGING_SHEET_COLUMNS is the product-default materialization (not a hand GRID array). Keep; this is what mounts. |
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
| `materialization:SESSIONS_COMPOUND_COLUMNS` | `src/lib/sessions/sessions-grid-layout.ts` | SESSIONS_COMPOUND_COLUMNS is the product-default materialization (not a hand GRID array). Keep; this is what mounts. |
| `materialization:TASKS_COMPOUND_COLUMNS` | `src/lib/staff-todos/tasks-grid-layout.ts` | TASKS_COMPOUND_COLUMNS is the product-default materialization (not a hand GRID array). Keep; this is what mounts. |
| `materialization:TECH_ALL_SHEET_COLUMNS` | `src/lib/tech/tech-all-grid-layout.ts` | TECH_ALL_SHEET_COLUMNS is the product-default materialization (not a hand GRID array). Keep; this is what mounts. |
<!-- /eval-ledger:auto:discover-keep -->

## Discover — JUDGMENT (human)

<!-- eval-ledger:auto:discover-judgment -->
| id | pri | tableId | path | why | KEEP | next |
|---|---|---|---|---|---|---|
| `catalog-orphan:fba:FBA_FIELD_CATALOG` | 9 | fba | `src/lib/tables/field-catalog/fba.ts` | Field catalog exists but is not in SLOT_LAYOUT_TABLES. FBA is the known case: board torn out, catalog kept for rebuild (operator 2026-08-31). | **FBA_FIELD_CATALOG + resolve module — do not delete. Re-add one SLOT_LAYOUT_TABLES line when the mount returns.** | Human: remount the desk, then register. Do not register an unmounted table (layouts would save into a void). |
| `table-columns-zombie:support-tickets` | 9 | support-tickets | `src/lib/tables/table-columns.ts` | support-tickets looks like a product queue in TABLE_COLUMNS but is not in PRODUCT_TABLES. | **If this is not joining the waist, empty the bucket to [] (keep the key only if TableId still needs it).** | Human: join PRODUCT_TABLES or empty the bucket. Agents do not invent a tableId. |
<!-- /eval-ledger:auto:discover-judgment -->

## Graph impact matrix (engine symbols)

<!-- eval-ledger:auto:graph-matrix -->
| Symbol | node_key | files_affected | snapshot |
|---|---|---|---|
| CompoundItem | `component:src/components/tables/compound/CompoundCells.tsx:CompoundItem` | 6 | `docs/eval/cohorts/slot-table/snapshots/2026-09-02-impact-CompoundItem.json` |
| CompoundState | `component:src/components/tables/compound/CompoundCells.tsx:CompoundState` | 6 | `docs/eval/cohorts/slot-table/snapshots/2026-09-02-impact-CompoundState.json` |
| useSlotTableLayout | `function:src/components/tables/useSlotTableLayout.ts:useSlotTableLayout` | 40 | `docs/eval/cohorts/slot-table/snapshots/2026-09-02-impact-useSlotTableLayout.json` |
| materializeTracks | `function:src/lib/tables/materialize-tracks.ts:materializeTracks` | 60 | `docs/eval/cohorts/slot-table/snapshots/2026-09-02-impact-materializeTracks.json` |
| getExternalUrlByItemNumber | `function:src/utils/external-item-url.ts:getExternalUrlByItemNumber` | 25 | `docs/eval/cohorts/slot-table/snapshots/2026-09-02-impact-getExternalUrlByItemNumber.json` |
| DateRangePickerField | `component:src/design-system/components/DateRangePickerField.tsx:DateRangePickerField` | 9 | `docs/eval/cohorts/slot-table/snapshots/2026-09-02-impact-DateRangePickerField.json` |
| useOptimisticMutation | `function:src/lib/optimistic/useOptimisticMutation.ts:useOptimisticMutation` | 11 | `docs/eval/cohorts/slot-table/snapshots/2026-09-02-impact-useOptimisticMutation.json` |
| DataTableFilterMenu | `component:src/components/tables/DataTable.tsx:DataTableFilterMenu` | 24 | `docs/eval/cohorts/slot-table/snapshots/2026-09-02-impact-DataTableFilterMenu.json` |
| queueSortForColumnKey | `function:src/utils/queue-display-sort.ts:queueSortForColumnKey` | 7 | `docs/eval/cohorts/slot-table/snapshots/2026-09-02-impact-queueSortForColumnKey.json` |
| LedgerGridColumnHeader | `component:src/design-system/components/grid/LedgerGridColumnHeader.tsx:LedgerGridColumnHeader` | 24 | `docs/eval/cohorts/slot-table/snapshots/2026-09-02-impact-LedgerGridColumnHeader.json` |
| isSlotTableChromeTrack | `function:src/lib/tables/slot-table-header-sort.ts:isSlotTableChromeTrack` | 15 | `docs/eval/cohorts/slot-table/snapshots/2026-09-02-impact-isSlotTableChromeTrack.json` |
| AssigneeCombobox | `component:src/design-system/components/AssigneeCombobox.tsx:AssigneeCombobox` | 3 | `docs/eval/cohorts/slot-table/snapshots/2026-09-02-impact-AssigneeCombobox.json` |
<!-- /eval-ledger:auto:graph-matrix -->

## Design critique

<!-- eval-ledger:auto:design-critique -->
- `src/components/tables/compound/CompoundCells.tsx` — snapshot `docs/eval/cohorts/slot-table/snapshots/2026-09-02-critique-CompoundCells.txt`
```
{
  "file": "src/components/tables/compound/CompoundCells.tsx",
  "summary": "2 problems, worst first: 3 arbitrary type size where the typography axis exists",
  "problems": [
    {
      "severity": "drifts-from-tokens",
```
- `src/components/tables/compound/CompoundRow.tsx` — snapshot `docs/eval/cohorts/slot-table/snapshots/2026-09-02-critique-CompoundRow.txt`
```
{
  "file": "src/components/tables/compound/CompoundRow.tsx",
  "summary": "No design-system problems found. That is not a claim the component is GOOD — only that it does not fork or drift.",
  "problems": [],
  "design_system_used": [],
  "metrics": {
```
- `src/components/tables/compound/StageStaffAssignPopover.tsx` — snapshot `docs/eval/cohorts/slot-table/snapshots/2026-09-02-critique-StageStaffAssignPopover.txt`
```
{
  "file": "src/components/tables/compound/StageStaffAssignPopover.tsx",
  "summary": "No design-system problems found. That is not a claim the component is GOOD — only that it does not fork or drift.",
  "problems": [],
  "design_system_used": [
    "AssigneeCombobox"
```
- `src/design-system/components/AssigneeCombobox.tsx` — snapshot `docs/eval/cohorts/slot-table/snapshots/2026-09-02-critique-AssigneeCombobox.txt`
```
{
  "file": "src/design-system/components/AssigneeCombobox.tsx",
  "summary": "No design-system problems found. That is not a claim the component is GOOD — only that it does not fork or drift.",
  "problems": [],
  "design_system_used": [
    "IconButton",
```
- `src/components/tables/compound/CompoundStaffRosterButton.tsx` — snapshot `docs/eval/cohorts/slot-table/snapshots/2026-09-02-critique-CompoundStaffRosterButton.txt`
```
{
  "file": "src/components/tables/compound/CompoundStaffRosterButton.tsx",
  "summary": "No design-system problems found. That is not a claim the component is GOOD — only that it does not fork or drift.",
  "problems": [],
  "design_system_used": [
    "IconButton"
```
- `src/design-system/components/DateRangePickerField.tsx` — snapshot `docs/eval/cohorts/slot-table/snapshots/2026-09-02-critique-DateRangePickerField.txt`
```
{
  "file": "src/design-system/components/DateRangePickerField.tsx",
  "summary": "1 problem, worst first: 326 lines — past the point reviewers read",
  "problems": [
    {
      "severity": "size",
```
- `src/components/tables/useSlotTableLayout.ts` — snapshot `docs/eval/cohorts/slot-table/snapshots/2026-09-02-critique-useSlotTableLayout.txt`
```
{
  "file": "src/components/tables/useSlotTableLayout.ts",
  "summary": "1 problem, worst first: 368 lines — past the point reviewers read",
  "problems": [
    {
      "severity": "size",
```
- `src/utils/external-item-url.ts` — snapshot `docs/eval/cohorts/slot-table/snapshots/2026-09-02-critique-external-item-url.txt`
```
{
  "file": "src/utils/external-item-url.ts",
  "summary": "No design-system problems found. That is not a claim the component is GOOD — only that it does not fork or drift.",
  "problems": [],
  "design_system_used": [],
  "metrics": {
```
- `src/components/tables/DataTable.tsx` — snapshot `docs/eval/cohorts/slot-table/snapshots/2026-09-02-critique-DataTable.txt`
```
{
  "file": "src/components/tables/DataTable.tsx",
  "summary": "1 problem, worst first: 1701 lines — past the point reviewers read",
  "problems": [
    {
      "severity": "size",
```
- `src/design-system/components/grid/LedgerGridColumnHeader.tsx` — snapshot `docs/eval/cohorts/slot-table/snapshots/2026-09-02-critique-LedgerGridColumnHeader.txt`
```
{
  "file": "src/design-system/components/grid/LedgerGridColumnHeader.tsx",
  "summary": "2 problems, worst first: 2 inline style object where the token axis exists",
  "problems": [
    {
      "severity": "drifts-from-tokens",
```
<!-- /eval-ledger:auto:design-critique -->

## Graph impact (shared symbols)

<!-- eval-ledger:auto:graph-impact -->
- **CompoundItem** — 6 files, 9 symbols (`docs/eval/cohorts/slot-table/snapshots/2026-09-02-impact-CompoundItem.json`)
- **CompoundState** — 6 files, 9 symbols (`docs/eval/cohorts/slot-table/snapshots/2026-09-02-impact-CompoundState.json`)
- **useSlotTableLayout** — 40 files, 40 symbols (`docs/eval/cohorts/slot-table/snapshots/2026-09-02-impact-useSlotTableLayout.json`)
- **materializeTracks** — 60 files, 81 symbols (`docs/eval/cohorts/slot-table/snapshots/2026-09-02-impact-materializeTracks.json`)
- **getExternalUrlByItemNumber** — 25 files, 28 symbols (`docs/eval/cohorts/slot-table/snapshots/2026-09-02-impact-getExternalUrlByItemNumber.json`)
- **DateRangePickerField** — 9 files, 11 symbols (`docs/eval/cohorts/slot-table/snapshots/2026-09-02-impact-DateRangePickerField.json`)
- **useOptimisticMutation** — 11 files, 11 symbols (`docs/eval/cohorts/slot-table/snapshots/2026-09-02-impact-useOptimisticMutation.json`)
- **DataTableFilterMenu** — 24 files, 24 symbols (`docs/eval/cohorts/slot-table/snapshots/2026-09-02-impact-DataTableFilterMenu.json`)
- **queueSortForColumnKey** — 7 files, 7 symbols (`docs/eval/cohorts/slot-table/snapshots/2026-09-02-impact-queueSortForColumnKey.json`)
- **LedgerGridColumnHeader** — 24 files, 24 symbols (`docs/eval/cohorts/slot-table/snapshots/2026-09-02-impact-LedgerGridColumnHeader.json`)
- **isSlotTableChromeTrack** — 15 files, 26 symbols (`docs/eval/cohorts/slot-table/snapshots/2026-09-02-impact-isSlotTableChromeTrack.json`)
- **AssigneeCombobox** — 3 files, 3 symbols (`docs/eval/cohorts/slot-table/snapshots/2026-09-02-impact-AssigneeCombobox.json`)
<!-- /eval-ledger:auto:graph-impact -->

## Regression tripwires

<!-- eval-ledger:auto:tripwires -->
- `src/lib/tables/slot-table-cohort.test.ts`
- `src/lib/tables/slot-table-discover.test.ts`
- `src/lib/eval/find-freshness.test.ts`
<!-- /eval-ledger:auto:tripwires -->

## graph_stats

<!-- eval-ledger:auto:graph-stats -->
- project: `cycleforge-app`
- status: `ready`
- last_built_at: `2026-09-02T07:55:05.107Z`
- nodes: 38192 · edges: 178443 · embedded: 38192
- snapshot: `docs/eval/cohorts/slot-table/snapshots/2026-09-02-graph-stats.json`
<!-- /eval-ledger:auto:graph-stats -->

---

<!-- eval-ledger:auto:last-run -->
_Updated 2026-09-02T17:11:52.299Z · station `slot-table`_
<!-- /eval-ledger:auto:last-run -->
