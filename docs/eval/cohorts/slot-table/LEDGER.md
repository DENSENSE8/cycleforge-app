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
- Multi-line fold parent: the select MARK is pinned to the TOP of the gutter (COMPOUND_GUTTER_MARK_TOP_PIN_CLASS) and the fold chevron paints BELOW it in COMPOUND_GUTTER_CHEVRON_BAND_CLASS — the bottom half of the cell, absolutely positioned, so the mark plane stays the whole cell and the checkbox keeps its hit plane. Same 16px column for both glyphs. Never re-box the check inside a COMPOUND_TWO_LINE_CLASS track (that stack is for TEXT), never float the mark to the middle of the row (operator 2026-09-15 correction: the checklist icon is pinned to the top, the drop-down sits below it), never flex-col justify-center the gutter. Since 2026-09-15 the parent CHECK is the same contextual face as a leaf (`chrome="hover"` + the group's rolled-up `statuses`) and the FOLD CHEVRON is hover-ONLY in every state — collapsed AND expanded (operator: "it should not display any collapse state it should only display on hover"), stricter than the leaf detail chevron which stands once open. The band already says it is a fold in words: the identity line counts the boxes ("2 boxes"). The BUTTON keeps its full hit plane and aria-expanded label at every opacity. The band's STATUS pill rolls up the same resolver its leaves paint (`resolveRowStatus(row, queueMode)` → statusWordRollup, e.g. "5 OUT OF STOCK") — never a raw `shipment_status` column, which is blank on a shortage and left the band silent under five OUT OF STOCK children. Engine: SlotTableGroupParentRow — To-ship QueueGroupRow and Unbox ReceivingGridGroupRow both mount it. Operator 2026-09-10, revised 2026-09-15.
- Compound leaf select gutter: when view.detail is present the top-pinned mark (COMPOUND_GUTTER_MARK_TOP_PIN_CLASS) keeps the whole cell as its plane and the detail chevron paints under it in COMPOUND_GUTTER_CHEVRON_BAND_CLASS (data-row-detail — not data-group-fold). EVERY leaf carries it, group CHILD rows included (operator 2026-09-15) — the child drop-down is where child-level detail grows. The chevron is a REACH affordance: closed it paints nothing until row hover / keyboard focus / a no-hover pointer, open it stands (an open leaf detail band is state the glyph is pointing at). The BUTTON keeps its full hit plane and aria-expanded label at every opacity — never gate the control, only the glyph. Chevron expands a second COMPOUND_ROW_PX detail band (serial / location / view unit) under the leaf — never grow the 48px CompoundItem cell, never a third CompoundFulfillment chip. The PARENT fold chevron is stricter — hover-only in both states (see groupParentSelect). Mobile /m uses BottomSheet with the same facts. Virtualizer first-paint uses compoundRowDetailEstimatePx (48 vs 96) + measureElement. Operator 2026-09-11, chevron reveal 2026-09-15.
- Engine paint for every PRODUCT_TABLES peer — not To-ship alone.
<!-- /eval-ledger:auto:paint-law -->

---

## Locked wins

- Title idle `text-text-default`; accent + underline on hover/focus
- Listing subtitle: ExternalLink glyph (never the word Listing / item # face); copy = item #
- Layout hooks wrap `useSlotTableLayout`
- Ship-by delay: `DateRangePickerField variant="compact"` (no X, no year, click commits; `useOptimisticMutation`)
- Tripwire: `src/lib/tables/slot-table-cohort.test.ts`
- Column model + sort law: the ENGINE's (`slot-table-columns.ts`), read from a
  `SlotTableFamily` record — `location-stock` and `sku-bins` own no
  `*-grid-layout.ts` at all (2026-09-15). `SLOT_TABLE_COLUMN_MODULE_DEBT` is
  shrink-only; a new `*-grid-layout.ts` fails the tripwire.
- Chrome headers BIND catalog facts, so the header's word and the fact its
  click sorts by cannot drift. Measured before the port: 25 canonical peers,
  every delta against the engine was DATA; 35 byte-identical copies of
  `is{Family}ColumnSortable`.
- A chrome `dates` header bound to a date fact opens **desc** (newest first) on
  every engine family — the law, uniform, instead of the six families that
  remembered to special-case their own key. Verified on `/inventory/stock`:
  Counted → `aria-sort=descending`, Room → `ascending`.

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
**pass** — snapshot `docs/eval/cohorts/slot-table/snapshots/2026-09-22-tripwire.log`
<!-- /eval-ledger:auto:tripwire-result -->

## Peer matrix (PRODUCT_TABLES × engine opt-in)

<!-- eval-ledger:auto:peer-matrix -->
| tableId | on_engine | layout_hook |
|---|---|---|
| receiving | yes | `src/components/station/receiving-grid/useReceivingTableLayout.ts` |
| incoming | yes | `src/components/station/incoming-grid/useIncomingTableLayout.ts` |
| orders | yes | `src/components/dashboard/orders-queue/useOrdersTableLayout.ts` |
| daily | yes | — |
| tasks | yes | — |
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
| walk-in-sales | yes | `src/components/walk-in/grid/useWalkInSalesTableLayout.ts` |
| tech | yes | `src/components/station/bench-grid/useTechTableLayout.ts` |
| packer | yes | `src/components/station/bench-grid/usePackerTableLayout.ts` |
| auth-sessions | yes | `src/components/settings/sessions/useAuthSessionsTableLayout.ts` |
| cycle-counts | yes | `src/components/inventory/cycle-counts/useCycleCountsTableLayout.ts` |
| admin-returns | yes | `src/components/inventory/returns-grid/useAdminReturnsTableLayout.ts` |
| part-compatibility | yes | `src/components/admin/sourcing/usePartCompatibilityTableLayout.ts` |
| unit-allocations | yes | `src/components/inventory/allocations-grid/useUnitAllocationsTableLayout.ts` |
| unit-tsn-links | yes | `src/components/inventory/tsn-links-grid/useUnitTsnLinksTableLayout.ts` |
| audit-log | yes | `src/components/settings/audit-log/useAuditLogTableLayout.ts` |
| admin-holds | yes | `src/components/inventory/holds-grid/useAdminHoldsTableLayout.ts` |
| admin-bulk-allocate | yes | `src/components/inventory/bulk-allocate-grid/useAdminBulkAllocateTableLayout.ts` |
| cycle-count-lines | yes | `src/components/inventory/cycle-count-lines/useCycleCountLinesTableLayout.ts` |
| admin-drift-alerts | yes | `src/components/inventory/drift-grid/useAdminDriftAlertsTableLayout.ts` |
| admin-sku-drift | yes | `src/components/inventory/drift-grid/useAdminSkuDriftTableLayout.ts` |
| staff-directory | yes | `src/components/settings/staff-directory/useStaffDirectoryTableLayout.ts` |
| report-bin-utilization | yes | `src/components/reports/report-bin-utilization-grid/useReportBinUtilizationTableLayout.ts` |
| report-velocity | yes | `src/components/reports/report-velocity-grid/useReportVelocityTableLayout.ts` |
| report-dead-stock | yes | `src/components/reports/report-dead-stock-grid/useReportDeadStockTableLayout.ts` |
| report-staff-day | yes | `src/components/reports/report-staff-day-grid/useReportStaffDayTableLayout.ts` |
| report-packer-day | yes | `src/components/reports/report-packer-day-grid/useReportPackerDayTableLayout.ts` |
| report-tasks | yes | `src/components/reports/report-tasks-grid/useReportTasksSpreadsheet.ts` |
| sku-bins | yes | `src/components/inventory/sku-bins-grid/useSkuBinsSpreadsheet.ts` |
| sku-ledger | yes | `src/components/inventory/sku-ledger-grid/useSkuLedgerTableLayout.ts` |
| sku-allocations | yes | `src/components/inventory/sku-allocations-grid/useSkuAllocationsTableLayout.ts` |
| search-hits | yes | `src/components/search/hits-grid/useSearchHitsTableLayout.ts` |
| location-stock | yes | `src/components/inventory/location-stock-grid/useLocationStockSpreadsheet.ts` |
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
| groupParentSelectChevronBand | `src/components/tables/compound/SlotTableGroupParentRow.tsx` | pass |
| leafDetailSelectStack | `src/components/tables/compound/CompoundGridCell.tsx` | pass |
| leafDetailBand | `src/components/tables/compound/CompoundRowDetailBand.tsx` | pass |
| compoundTwoLineClass | `src/components/tables/compound/CompoundCell.tsx` | pass |
| headerActionRow | `src/design-system/components/grid/LedgerGrid.tsx` | pass |
| headerActionRowGuest | `src/design-system/components/grid/LedgerGrid.tsx` | pass |
| selectStatusFace | `src/components/tables/compound/CompoundSelectStatusFace.tsx` | pass |
| selectStatusHandsBoxBack | `src/components/tables/compound/CompoundSelectStatusFace.tsx` | pass |
| selectStatusSharedClock | `src/components/tables/compound/CompoundSelectStatusFace.tsx` | pass |
| selectStatusKindFromRail | `src/components/tables/compound/compound-select-status.ts` | pass |
| railCellOwned | `src/components/tables/compound/CompoundGridCell.tsx` | pass |
| railFullHeight | `src/components/tables/compound/CompoundEdgeRail.tsx` | pass |
| leafDetailChevronOnReach | `src/components/tables/compound/CompoundGridCell.tsx` | pass |
| selectStatusRotates | `src/components/tables/compound/CompoundSelectStatusFace.tsx` | pass |
| parentSelectRestingStatus | `src/components/tables/compound/SlotTableGroupParentRow.tsx` | pass |
| parentFoldChevronOnReach | `src/components/tables/compound/SlotTableGroupParentRow.tsx` | pass |
| parentBandStatusRollup | `src/components/dashboard/orders-queue/QueueGroupRow.tsx` | pass |
| gutterContentCentred | `src/components/tables/compound/compound-row-chrome.ts` | pass |
| gutterMarkTopPin | `src/components/tables/compound/compound-row-chrome.ts` | pass |
| gutterChevronBandDecl | `src/components/tables/compound/compound-row-chrome.ts` | pass |
| gutterFaceTopPin | `src/components/tables/compound/CompoundCells.tsx` | pass |
| leafDetailChevronBand | `src/components/tables/compound/CompoundGridCell.tsx` | pass |
| groupChildRailDecl | `src/components/tables/compound/compound-row-chrome.ts` | pass |
| groupFoldCloseSoftInk | `src/components/tables/compound/compound-row-chrome.ts` | pass |
| groupChildRailMount | `src/components/tables/compound/CompoundGridCell.tsx` | pass |
| rowHoverGroupOnEveryPeer | `src/design-system/components/grid/LedgerGridLeafRow.tsx` | pass |
<!-- /eval-ledger:auto:engine-contract -->

## Industrial cohesion verdict

<!-- eval-ledger:auto:industrial-cohesion -->
**pass** — deterministic source verdict; snapshot `docs/eval/cohorts/slot-table/snapshots/2026-09-22-data-table-industrial.json`
<!-- /eval-ledger:auto:industrial-cohesion -->

## Discover — next gap

<!-- eval-ledger:auto:discover-next -->
_No unblocked mechanical deletes._

_Snapshot:_ `docs/eval/cohorts/slot-table/snapshots/2026-09-22-discover.json`
<!-- /eval-ledger:auto:discover-next -->

## Discover — DELETE (mechanical)

<!-- eval-ledger:auto:discover-delete -->
_No mechanical deletes. Dual-SoT hand models are gone._
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
| `hook:my-day` | `src/features/my-day/grid/useMyDayTableLayout.ts` | Engine opt-in for my-day. Keep the hook; it is not a second Item cell. |
| `hook:kiosk-devices` | `src/components/settings/kiosk-devices/useKioskDevicesTableLayout.ts` | Engine opt-in for kiosk-devices. Keep the hook; it is not a second Item cell. |
| `hook:kiosk-slot-events` | `src/components/settings/kiosk-slot-events/useKioskSlotEventsTableLayout.ts` | Engine opt-in for kiosk-slot-events. Keep the hook; it is not a second Item cell. |
| `hook:walk-in-sales` | `src/components/walk-in/grid/useWalkInSalesTableLayout.ts` | Engine opt-in for walk-in-sales. Keep the hook; it is not a second Item cell. |
| `hook:tech` | `src/components/station/bench-grid/useTechTableLayout.ts` | Engine opt-in for tech. Keep the hook; it is not a second Item cell. |
| `hook:packer` | `src/components/station/bench-grid/usePackerTableLayout.ts` | Engine opt-in for packer. Keep the hook; it is not a second Item cell. |
| `hook:auth-sessions` | `src/components/settings/sessions/useAuthSessionsTableLayout.ts` | Engine opt-in for auth-sessions. Keep the hook; it is not a second Item cell. |
| `hook:cycle-counts` | `src/components/inventory/cycle-counts/useCycleCountsTableLayout.ts` | Engine opt-in for cycle-counts. Keep the hook; it is not a second Item cell. |
| `hook:admin-returns` | `src/components/inventory/returns-grid/useAdminReturnsTableLayout.ts` | Engine opt-in for admin-returns. Keep the hook; it is not a second Item cell. |
| `hook:part-compatibility` | `src/components/admin/sourcing/usePartCompatibilityTableLayout.ts` | Engine opt-in for part-compatibility. Keep the hook; it is not a second Item cell. |
| `hook:unit-allocations` | `src/components/inventory/allocations-grid/useUnitAllocationsTableLayout.ts` | Engine opt-in for unit-allocations. Keep the hook; it is not a second Item cell. |
| `hook:unit-tsn-links` | `src/components/inventory/tsn-links-grid/useUnitTsnLinksTableLayout.ts` | Engine opt-in for unit-tsn-links. Keep the hook; it is not a second Item cell. |
| `hook:audit-log` | `src/components/settings/audit-log/useAuditLogTableLayout.ts` | Engine opt-in for audit-log. Keep the hook; it is not a second Item cell. |
| `hook:admin-holds` | `src/components/inventory/holds-grid/useAdminHoldsTableLayout.ts` | Engine opt-in for admin-holds. Keep the hook; it is not a second Item cell. |
| `hook:admin-bulk-allocate` | `src/components/inventory/bulk-allocate-grid/useAdminBulkAllocateTableLayout.ts` | Engine opt-in for admin-bulk-allocate. Keep the hook; it is not a second Item cell. |
| `hook:cycle-count-lines` | `src/components/inventory/cycle-count-lines/useCycleCountLinesTableLayout.ts` | Engine opt-in for cycle-count-lines. Keep the hook; it is not a second Item cell. |
| `hook:admin-drift-alerts` | `src/components/inventory/drift-grid/useAdminDriftAlertsTableLayout.ts` | Engine opt-in for admin-drift-alerts. Keep the hook; it is not a second Item cell. |
| `hook:admin-sku-drift` | `src/components/inventory/drift-grid/useAdminSkuDriftTableLayout.ts` | Engine opt-in for admin-sku-drift. Keep the hook; it is not a second Item cell. |
| `hook:staff-directory` | `src/components/settings/staff-directory/useStaffDirectoryTableLayout.ts` | Engine opt-in for staff-directory. Keep the hook; it is not a second Item cell. |
| `hook:report-bin-utilization` | `src/components/reports/report-bin-utilization-grid/useReportBinUtilizationTableLayout.ts` | Engine opt-in for report-bin-utilization. Keep the hook; it is not a second Item cell. |
| `hook:report-velocity` | `src/components/reports/report-velocity-grid/useReportVelocityTableLayout.ts` | Engine opt-in for report-velocity. Keep the hook; it is not a second Item cell. |
| `hook:report-dead-stock` | `src/components/reports/report-dead-stock-grid/useReportDeadStockTableLayout.ts` | Engine opt-in for report-dead-stock. Keep the hook; it is not a second Item cell. |
| `hook:report-staff-day` | `src/components/reports/report-staff-day-grid/useReportStaffDayTableLayout.ts` | Engine opt-in for report-staff-day. Keep the hook; it is not a second Item cell. |
| `hook:report-packer-day` | `src/components/reports/report-packer-day-grid/useReportPackerDayTableLayout.ts` | Engine opt-in for report-packer-day. Keep the hook; it is not a second Item cell. |
| `hook:report-tasks` | `src/components/reports/report-tasks-grid/useReportTasksSpreadsheet.ts` | Engine opt-in for report-tasks. Keep the hook; it is not a second Item cell. |
| `hook:sku-bins` | `src/components/inventory/sku-bins-grid/useSkuBinsSpreadsheet.ts` | Engine opt-in for sku-bins. Keep the hook; it is not a second Item cell. |
| `hook:location-stock` | `src/components/inventory/location-stock-grid/useLocationStockSpreadsheet.ts` | Engine opt-in for location-stock. Keep the hook; it is not a second Item cell. |
| `hook:sku-ledger` | `src/components/inventory/sku-ledger-grid/useSkuLedgerTableLayout.ts` | Engine opt-in for sku-ledger. Keep the hook; it is not a second Item cell. |
| `hook:sku-allocations` | `src/components/inventory/sku-allocations-grid/useSkuAllocationsTableLayout.ts` | Engine opt-in for sku-allocations. Keep the hook; it is not a second Item cell. |
| `hook:search-hits` | `src/components/search/hits-grid/useSearchHitsTableLayout.ts` | Engine opt-in for search-hits. Keep the hook; it is not a second Item cell. |
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
| `catalog:tech` | `src/lib/tables/field-catalog` | Registered field catalog for tech. Data only. |
| `catalog:packer` | `src/lib/tables/field-catalog` | Registered field catalog for packer. Data only. |
| `catalog:auth-sessions` | `src/lib/tables/field-catalog` | Registered field catalog for auth-sessions. Data only. |
| `catalog:cycle-counts` | `src/lib/tables/field-catalog` | Registered field catalog for cycle-counts. Data only. |
| `catalog:admin-returns` | `src/lib/tables/field-catalog` | Registered field catalog for admin-returns. Data only. |
| `catalog:part-compatibility` | `src/lib/tables/field-catalog` | Registered field catalog for part-compatibility. Data only. |
| `catalog:unit-allocations` | `src/lib/tables/field-catalog` | Registered field catalog for unit-allocations. Data only. |
| `catalog:unit-tsn-links` | `src/lib/tables/field-catalog` | Registered field catalog for unit-tsn-links. Data only. |
| `catalog:audit-log` | `src/lib/tables/field-catalog` | Registered field catalog for audit-log. Data only. |
| `catalog:admin-holds` | `src/lib/tables/field-catalog` | Registered field catalog for admin-holds. Data only. |
| `catalog:admin-bulk-allocate` | `src/lib/tables/field-catalog` | Registered field catalog for admin-bulk-allocate. Data only. |
| `catalog:cycle-count-lines` | `src/lib/tables/field-catalog` | Registered field catalog for cycle-count-lines. Data only. |
| `catalog:admin-drift-alerts` | `src/lib/tables/field-catalog` | Registered field catalog for admin-drift-alerts. Data only. |
| `catalog:admin-sku-drift` | `src/lib/tables/field-catalog` | Registered field catalog for admin-sku-drift. Data only. |
| `catalog:staff-directory` | `src/lib/tables/field-catalog` | Registered field catalog for staff-directory. Data only. |
| `catalog:report-bin-utilization` | `src/lib/tables/field-catalog` | Registered field catalog for report-bin-utilization. Data only. |
| `catalog:report-velocity` | `src/lib/tables/field-catalog` | Registered field catalog for report-velocity. Data only. |
| `catalog:report-dead-stock` | `src/lib/tables/field-catalog` | Registered field catalog for report-dead-stock. Data only. |
| `catalog:report-staff-day` | `src/lib/tables/field-catalog` | Registered field catalog for report-staff-day. Data only. |
| `catalog:report-packer-day` | `src/lib/tables/field-catalog` | Registered field catalog for report-packer-day. Data only. |
| `catalog:report-tasks` | `src/lib/tables/field-catalog` | Registered field catalog for report-tasks. Data only. |
| `catalog:sku-bins` | `src/lib/tables/field-catalog` | Registered field catalog for sku-bins. Data only. |
| `catalog:location-stock` | `src/lib/tables/field-catalog` | Registered field catalog for location-stock. Data only. |
| `catalog:sku-ledger` | `src/lib/tables/field-catalog` | Registered field catalog for sku-ledger. Data only. |
| `catalog:sku-allocations` | `src/lib/tables/field-catalog` | Registered field catalog for sku-allocations. Data only. |
| `catalog:search-hits` | `src/lib/tables/field-catalog` | Registered field catalog for search-hits. Data only. |
| `materialization:PART_COMPATIBILITY_COMPOUND_COLUMNS` | `src/components/admin/sourcing/part-compatibility-grid-layout.ts` | PART_COMPATIBILITY_COMPOUND_COLUMNS is the product-default materialization (not a hand GRID array). Keep; this is what mounts. |
| `materialization:UNIT_ALLOCATIONS_COMPOUND_COLUMNS` | `src/components/inventory/allocations-grid/unit-allocations-grid-layout.ts` | UNIT_ALLOCATIONS_COMPOUND_COLUMNS is the product-default materialization (not a hand GRID array). Keep; this is what mounts. |
| `materialization:ADMIN_BULK_ALLOCATE_COMPOUND_COLUMNS` | `src/components/inventory/bulk-allocate-grid/admin-bulk-allocate-grid-layout.ts` | ADMIN_BULK_ALLOCATE_COMPOUND_COLUMNS is the product-default materialization (not a hand GRID array). Keep; this is what mounts. |
| `materialization:CYCLECOUNTLINES_COMPOUND_COLUMNS` | `src/components/inventory/cycle-count-lines/cycle-count-lines-grid-layout.ts` | CYCLECOUNTLINES_COMPOUND_COLUMNS is the product-default materialization (not a hand GRID array). Keep; this is what mounts. |
| `materialization:CYCLECOUNTS_COMPOUND_COLUMNS` | `src/components/inventory/cycle-counts/cycle-counts-grid-layout.ts` | CYCLECOUNTS_COMPOUND_COLUMNS is the product-default materialization (not a hand GRID array). Keep; this is what mounts. |
| `materialization:ADMIN_DRIFT_ALERTS_COMPOUND_COLUMNS` | `src/components/inventory/drift-grid/admin-drift-alerts-grid-layout.ts` | ADMIN_DRIFT_ALERTS_COMPOUND_COLUMNS is the product-default materialization (not a hand GRID array). Keep; this is what mounts. |
| `materialization:ADMIN_SKU_DRIFT_COMPOUND_COLUMNS` | `src/components/inventory/drift-grid/admin-sku-drift-grid-layout.ts` | ADMIN_SKU_DRIFT_COMPOUND_COLUMNS is the product-default materialization (not a hand GRID array). Keep; this is what mounts. |
| `materialization:INVENTORY_EVENTS_COMPOUND_COLUMNS` | `src/components/inventory/events-grid/inventory-events-grid-layout.ts` | INVENTORY_EVENTS_COMPOUND_COLUMNS is the product-default materialization (not a hand GRID array). Keep; this is what mounts. |
| `materialization:ADMINHOLDS_COMPOUND_COLUMNS` | `src/components/inventory/holds-grid/admin-holds-grid-layout.ts` | ADMINHOLDS_COMPOUND_COLUMNS is the product-default materialization (not a hand GRID array). Keep; this is what mounts. |
| `materialization:LOCATION_STOCK_COMPOUND_COLUMNS` | `src/components/inventory/location-stock-grid/location-stock-table-definition.ts` | LOCATION_STOCK_COMPOUND_COLUMNS is the product-default materialization (not a hand GRID array). Keep; this is what mounts. |
| `materialization:ADMIN_RETURNS_COMPOUND_COLUMNS` | `src/components/inventory/returns-grid/admin-returns-grid-layout.ts` | ADMIN_RETURNS_COMPOUND_COLUMNS is the product-default materialization (not a hand GRID array). Keep; this is what mounts. |
| `materialization:SKU_ALLOCATIONS_COMPOUND_COLUMNS` | `src/components/inventory/sku-allocations-grid/sku-allocations-table-definition.ts` | SKU_ALLOCATIONS_COMPOUND_COLUMNS is the product-default materialization (not a hand GRID array). Keep; this is what mounts. |
| `materialization:SKU_BINS_COMPOUND_COLUMNS` | `src/components/inventory/sku-bins-grid/sku-bins-table-definition.ts` | SKU_BINS_COMPOUND_COLUMNS is the product-default materialization (not a hand GRID array). Keep; this is what mounts. |
| `materialization:SKU_LEDGER_COMPOUND_COLUMNS` | `src/components/inventory/sku-ledger-grid/sku-ledger-grid-layout.ts` | SKU_LEDGER_COMPOUND_COLUMNS is the product-default materialization (not a hand GRID array). Keep; this is what mounts. |
| `materialization:UNIT_TSN_LINKS_COMPOUND_COLUMNS` | `src/components/inventory/tsn-links-grid/unit-tsn-links-grid-layout.ts` | UNIT_TSN_LINKS_COMPOUND_COLUMNS is the product-default materialization (not a hand GRID array). Keep; this is what mounts. |
| `materialization:UNITS_SHEET_COLUMNS` | `src/components/inventory/units-grid/units-grid-layout.ts` | UNITS_SHEET_COLUMNS is the product-default materialization (not a hand GRID array). Keep; this is what mounts. |
| `materialization:CSV_IMPORT_STAGING_SHEET_COLUMNS` | `src/components/outbound/orders/import-staging/csv-import-staging-grid-layout.ts` | CSV_IMPORT_STAGING_SHEET_COLUMNS is the product-default materialization (not a hand GRID array). Keep; this is what mounts. |
| `materialization:READY_SHEET_COLUMNS` | `src/components/outbound/ready/grid/ready-grid-layout.ts` | READY_SHEET_COLUMNS is the product-default materialization (not a hand GRID array). Keep; this is what mounts. |
| `materialization:PICKUP_SHEET_COLUMNS` | `src/components/receiving/pickup/grid/pickup-grid-layout.ts` | PICKUP_SHEET_COLUMNS is the product-default materialization (not a hand GRID array). Keep; this is what mounts. |
| `materialization:UNFOUND_SHEET_COLUMNS` | `src/components/receiving/unfound/grid/unfound-grid-layout.ts` | UNFOUND_SHEET_COLUMNS is the product-default materialization (not a hand GRID array). Keep; this is what mounts. |
| `materialization:REPORT_BIN_UTILIZATION_COMPOUND_COLUMNS` | `src/components/reports/report-bin-utilization-grid/report-bin-utilization-grid-layout.ts` | REPORT_BIN_UTILIZATION_COMPOUND_COLUMNS is the product-default materialization (not a hand GRID array). Keep; this is what mounts. |
| `materialization:REPORT_DEAD_STOCK_COMPOUND_COLUMNS` | `src/components/reports/report-dead-stock-grid/report-dead-stock-grid-layout.ts` | REPORT_DEAD_STOCK_COMPOUND_COLUMNS is the product-default materialization (not a hand GRID array). Keep; this is what mounts. |
| `materialization:REPORT_PACKER_DAY_COMPOUND_COLUMNS` | `src/components/reports/report-packer-day-grid/report-packer-day-grid-layout.ts` | REPORT_PACKER_DAY_COMPOUND_COLUMNS is the product-default materialization (not a hand GRID array). Keep; this is what mounts. |
| `materialization:REPORT_STAFF_DAY_COMPOUND_COLUMNS` | `src/components/reports/report-staff-day-grid/report-staff-day-grid-layout.ts` | REPORT_STAFF_DAY_COMPOUND_COLUMNS is the product-default materialization (not a hand GRID array). Keep; this is what mounts. |
| `materialization:REPORT_TASKS_COMPOUND_COLUMNS` | `src/components/reports/report-tasks-grid/report-tasks-table-definition.ts` | REPORT_TASKS_COMPOUND_COLUMNS is the product-default materialization (not a hand GRID array). Keep; this is what mounts. |
| `materialization:REPORT_VELOCITY_COMPOUND_COLUMNS` | `src/components/reports/report-velocity-grid/report-velocity-grid-layout.ts` | REPORT_VELOCITY_COMPOUND_COLUMNS is the product-default materialization (not a hand GRID array). Keep; this is what mounts. |
| `materialization:SEARCH_HITS_COMPOUND_COLUMNS` | `src/components/search/hits-grid/search-hits-grid-layout.ts` | SEARCH_HITS_COMPOUND_COLUMNS is the product-default materialization (not a hand GRID array). Keep; this is what mounts. |
| `materialization:AUDITLOG_COMPOUND_COLUMNS` | `src/components/settings/audit-log/audit-log-grid-layout.ts` | AUDITLOG_COMPOUND_COLUMNS is the product-default materialization (not a hand GRID array). Keep; this is what mounts. |
| `materialization:KIOSKDEVICES_COMPOUND_COLUMNS` | `src/components/settings/kiosk-devices/kiosk-devices-grid-layout.ts` | KIOSKDEVICES_COMPOUND_COLUMNS is the product-default materialization (not a hand GRID array). Keep; this is what mounts. |
| `materialization:KIOSKSLOTEVENTS_COMPOUND_COLUMNS` | `src/components/settings/kiosk-slot-events/kiosk-slot-events-grid-layout.ts` | KIOSKSLOTEVENTS_COMPOUND_COLUMNS is the product-default materialization (not a hand GRID array). Keep; this is what mounts. |
| `materialization:AUTHSESSIONS_COMPOUND_COLUMNS` | `src/components/settings/sessions/auth-sessions-grid-layout.ts` | AUTHSESSIONS_COMPOUND_COLUMNS is the product-default materialization (not a hand GRID array). Keep; this is what mounts. |
| `materialization:STAFF_DIRECTORY_COMPOUND_COLUMNS` | `src/components/settings/staff-directory/staff-directory-grid-layout.ts` | STAFF_DIRECTORY_COMPOUND_COLUMNS is the product-default materialization (not a hand GRID array). Keep; this is what mounts. |
| `materialization:TECH_COMPOUND_COLUMNS` | `src/components/station/bench-grid/bench-grid-layout.ts` | TECH_COMPOUND_COLUMNS is the product-default materialization (not a hand GRID array). Keep; this is what mounts. |
| `materialization:PACKER_COMPOUND_COLUMNS` | `src/components/station/bench-grid/bench-grid-layout.ts` | PACKER_COMPOUND_COLUMNS is the product-default materialization (not a hand GRID array). Keep; this is what mounts. |
| `materialization:TRACKING_EXCEPTIONS_SHEET_COLUMNS` | `src/components/tracking-exceptions/grid/tracking-exceptions-grid-layout.ts` | TRACKING_EXCEPTIONS_SHEET_COLUMNS is the product-default materialization (not a hand GRID array). Keep; this is what mounts. |
| `materialization:WALKINSALES_COMPOUND_COLUMNS` | `src/components/walk-in/grid/walk-in-sales-grid-layout.ts` | WALKINSALES_COMPOUND_COLUMNS is the product-default materialization (not a hand GRID array). Keep; this is what mounts. |
| `materialization:BINS_SHEET_COLUMNS` | `src/components/warehouse/bins-grid/bins-grid-layout.ts` | BINS_SHEET_COLUMNS is the product-default materialization (not a hand GRID array). Keep; this is what mounts. |
| `materialization:WARRANTY_SHEET_COLUMNS` | `src/components/warranty/grid/warranty-grid-layout.ts` | WARRANTY_SHEET_COLUMNS is the product-default materialization (not a hand GRID array). Keep; this is what mounts. |
| `materialization:DAILY_COMPOUND_COLUMNS` | `src/features/home/grid/daily-table-definition.ts` | DAILY_COMPOUND_COLUMNS is the product-default materialization (not a hand GRID array). Keep; this is what mounts. |
| `materialization:CATALOG_LINK_COMPOUND_COLUMNS` | `src/features/review/catalog-link/grid/catalog-link-grid-layout.ts` | CATALOG_LINK_COMPOUND_COLUMNS is the product-default materialization (not a hand GRID array). Keep; this is what mounts. |
| `materialization:IMPORT_EXCEPTION_COMPOUND_COLUMNS` | `src/features/review/catalog-link/grid/import-exception-grid-layout.ts` | IMPORT_EXCEPTION_COMPOUND_COLUMNS is the product-default materialization (not a hand GRID array). Keep; this is what mounts. |
| `materialization:TASKS_COMPOUND_COLUMNS` | `src/features/tasks/grid/tasks-table-definition.ts` | TASKS_COMPOUND_COLUMNS is the product-default materialization (not a hand GRID array). Keep; this is what mounts. |
| `materialization:ORDERS_COMPOUND_COLUMNS` | `src/lib/dashboard-order-row-layout.ts` | ORDERS_COMPOUND_COLUMNS is the product-default materialization (not a hand GRID array). Keep; this is what mounts. |
| `materialization:MY_DAY_SHEET_COLUMNS` | `src/lib/my-day/my-day-grid-layout.ts` | MY_DAY_SHEET_COLUMNS is the product-default materialization (not a hand GRID array). Keep; this is what mounts. |
| `materialization:CATALOG_SHEET_COLUMNS` | `src/lib/products/catalog-grid-layout.ts` | CATALOG_SHEET_COLUMNS is the product-default materialization (not a hand GRID array). Keep; this is what mounts. |
| `materialization:RECEIVING_COMPOUND_COLUMNS` | `src/lib/receiving/receiving-grid-layout.ts` | RECEIVING_COMPOUND_COLUMNS is the product-default materialization (not a hand GRID array). Keep; this is what mounts. |
| `materialization:INCOMING_COMPOUND_COLUMNS` | `src/lib/receiving/receiving-grid-layout.ts` | INCOMING_COMPOUND_COLUMNS is the product-default materialization (not a hand GRID array). Keep; this is what mounts. |
| `materialization:REPAIR_SHEET_COLUMNS` | `src/lib/repair/repair-grid-layout.ts` | REPAIR_SHEET_COLUMNS is the product-default materialization (not a hand GRID array). Keep; this is what mounts. |
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
| CompoundItem | `component:src/components/tables/compound/CompoundCells.tsx:CompoundItem` | 6 | `docs/eval/cohorts/slot-table/snapshots/2026-09-22-impact-CompoundItem.json` |
| CompoundState | `component:src/components/tables/compound/CompoundCells.tsx:CompoundState` | 6 | `docs/eval/cohorts/slot-table/snapshots/2026-09-22-impact-CompoundState.json` |
| useSlotTableLayout | `function:src/components/tables/useSlotTableLayout.ts:useSlotTableLayout` | 58 | `docs/eval/cohorts/slot-table/snapshots/2026-09-22-impact-useSlotTableLayout.json` |
| materializeTracks | `function:src/lib/tables/materialize-tracks.ts:materializeTracks` | 81 | `docs/eval/cohorts/slot-table/snapshots/2026-09-22-impact-materializeTracks.json` |
| getExternalUrlByItemNumber | `function:src/utils/external-item-url.ts:getExternalUrlByItemNumber` | 26 | `docs/eval/cohorts/slot-table/snapshots/2026-09-22-impact-getExternalUrlByItemNumber.json` |
| DateRangePickerField | `component:src/design-system/components/DateRangePickerField.tsx:DateRangePickerField` | 18 | `docs/eval/cohorts/slot-table/snapshots/2026-09-22-impact-DateRangePickerField.json` |
| useOptimisticMutation | `function:src/lib/optimistic/useOptimisticMutation.ts:useOptimisticMutation` | 12 | `docs/eval/cohorts/slot-table/snapshots/2026-09-22-impact-useOptimisticMutation.json` |
| DataTableFilterMenu | `component:src/components/tables/DataTable.tsx:DataTableFilterMenu` | 37 | `docs/eval/cohorts/slot-table/snapshots/2026-09-22-impact-DataTableFilterMenu.json` |
| queueSortForColumnKey | `function:src/utils/queue-display-sort.ts:queueSortForColumnKey` | 8 | `docs/eval/cohorts/slot-table/snapshots/2026-09-22-impact-queueSortForColumnKey.json` |
| LedgerGridColumnHeader | `component:src/design-system/components/grid/LedgerGridColumnHeader.tsx:LedgerGridColumnHeader` | 35 | `docs/eval/cohorts/slot-table/snapshots/2026-09-22-impact-LedgerGridColumnHeader.json` |
| isSlotTableChromeTrack | `function:src/lib/tables/slot-table-header-sort.ts:isSlotTableChromeTrack` | 27 | `docs/eval/cohorts/slot-table/snapshots/2026-09-22-impact-isSlotTableChromeTrack.json` |
| AssigneeCombobox | `component:src/design-system/components/AssigneeCombobox.tsx:AssigneeCombobox` | 3 | `docs/eval/cohorts/slot-table/snapshots/2026-09-22-impact-AssigneeCombobox.json` |
| ensureLineQtySubtitle | `function:src/lib/tables/slot-table-line-qty.ts:ensureLineQtySubtitle` | 8 | `docs/eval/cohorts/slot-table/snapshots/2026-09-22-impact-ensureLineQtySubtitle.json` |
| pinLineQtyFirst | `function:src/lib/tables/slot-table-line-qty.ts:pinLineQtyFirst` | 8 | `docs/eval/cohorts/slot-table/snapshots/2026-09-22-impact-pinLineQtyFirst.json` |
| ensureLineMoneySubtitle | `function:src/lib/tables/slot-table-line-money.ts:ensureLineMoneySubtitle` | 8 | `docs/eval/cohorts/slot-table/snapshots/2026-09-22-impact-ensureLineMoneySubtitle.json` |
| pinLineMoneyAfterQty | `function:src/lib/tables/slot-table-line-money.ts:pinLineMoneyAfterQty` | 9 | `docs/eval/cohorts/slot-table/snapshots/2026-09-22-impact-pinLineMoneyAfterQty.json` |
| ordersCompoundColumnsFor | `function:src/lib/dashboard-order-row-layout.ts:ordersCompoundColumnsFor` | 19 | `docs/eval/cohorts/slot-table/snapshots/2026-09-22-impact-ordersCompoundColumnsFor.json` |
| COMPOUND_COLUMN_KEYS | `variable:src/components/tables/compound/compound-columns.ts:COMPOUND_COLUMN_KEYS` | 0 | `docs/eval/cohorts/slot-table/snapshots/2026-09-22-impact-COMPOUND_COLUMN_KEYS.json` |
| MorphingRowActionMenu | `component:src/components/outbound/orders/to-ship/MorphingRowActionMenu.tsx:MorphingRowActionMenu` | 4 | `docs/eval/cohorts/slot-table/snapshots/2026-09-22-impact-MorphingRowActionMenu.json` |
| StockStripInput | — | no match | `docs/eval/cohorts/slot-table/snapshots/2026-09-22-find-StockStripInput.json` |
| useFixedBandHeight | — | no match | `docs/eval/cohorts/slot-table/snapshots/2026-09-22-find-useFixedBandHeight.json` |
| SLOT_TABLE_ID_HEADER_WORD | — | no match | `docs/eval/cohorts/slot-table/snapshots/2026-09-22-find-SLOT_TABLE_ID_HEADER_WORD.json` |
| SLOT_TABLE_IDENTITY_PURITY_LAW | — | no match | `docs/eval/cohorts/slot-table/snapshots/2026-09-22-find-SLOT_TABLE_IDENTITY_PURITY_LAW.json` |
<!-- /eval-ledger:auto:graph-matrix -->

## Design critique

<!-- eval-ledger:auto:design-critique -->
- `src/components/tables/compound/CompoundCells.tsx` — `docs/eval/cohorts/slot-table/snapshots/2026-09-22-critique-CompoundCells.txt`
```
{
  "file": "src/components/tables/compound/CompoundCells.tsx",
  "summary": "1 problem, worst first: 3 arbitrary type size where the typography axis exists",
  "problems": [
    {
```
- `src/components/tables/compound/CompoundRow.tsx` — `docs/eval/cohorts/slot-table/snapshots/2026-09-22-critique-CompoundRow.txt`
```
{
  "file": "src/components/tables/compound/CompoundRow.tsx",
  "summary": "1 problem, worst first: 1 inline style object where the token axis exists",
  "problems": [
    {
```
- `src/components/tables/compound/StageStaffAssignPopover.tsx` — `docs/eval/cohorts/slot-table/snapshots/2026-09-22-critique-StageStaffAssignPopover.txt`
```
{
  "file": "src/components/tables/compound/StageStaffAssignPopover.tsx",
  "summary": "No design-system problems found. That is not a claim the component is GOOD — only that it does not fork or drift.",
  "problems": [],
  "design_system_used": [
```
- `src/components/inventory/location-stock-grid/StockActionBar.tsx` — `docs/eval/cohorts/slot-table/snapshots/2026-09-22-critique-StockActionBar.txt`
```
{
  "file": "src/components/inventory/location-stock-grid/StockActionBar.tsx",
  "summary": "1 problem, worst first: Renders components but imports none from the design system",
  "problems": [
    {
```
- `src/design-system/components/AssigneeCombobox.tsx` — `docs/eval/cohorts/slot-table/snapshots/2026-09-22-critique-AssigneeCombobox.txt`
```
{
  "file": "src/design-system/components/AssigneeCombobox.tsx",
  "summary": "No design-system problems found. That is not a claim the component is GOOD — only that it does not fork or drift.",
  "problems": [],
  "design_system_used": [
```
- `src/components/tables/compound/CompoundStaffRosterButton.tsx` — `docs/eval/cohorts/slot-table/snapshots/2026-09-22-critique-CompoundStaffRosterButton.txt`
```
{
  "file": "src/components/tables/compound/CompoundStaffRosterButton.tsx",
  "summary": "No design-system problems found. That is not a claim the component is GOOD — only that it does not fork or drift.",
  "problems": [],
  "design_system_used": [
```
- `src/design-system/components/DateRangePickerField.tsx` — `docs/eval/cohorts/slot-table/snapshots/2026-09-22-critique-DateRangePickerField.txt`
```
{
  "file": "src/design-system/components/DateRangePickerField.tsx",
  "summary": "No design-system problems found. That is not a claim the component is GOOD — only that it does not fork or drift.",
  "problems": [],
  "design_system_used": [
```
- `src/components/tables/useSlotTableLayout.ts` — `docs/eval/cohorts/slot-table/snapshots/2026-09-22-critique-useSlotTableLayout.txt`
```
{
  "file": "src/components/tables/useSlotTableLayout.ts",
  "summary": "No design-system problems found. That is not a claim the component is GOOD — only that it does not fork or drift.",
  "problems": [],
  "design_system_used": [
```
- `src/utils/external-item-url.ts` — `docs/eval/cohorts/slot-table/snapshots/2026-09-22-critique-external-item-url.txt`
```
{
  "file": "src/utils/external-item-url.ts",
  "summary": "No design-system problems found. That is not a claim the component is GOOD — only that it does not fork or drift.",
  "problems": [],
  "design_system_used": [],
```
- `src/components/tables/DataTable.tsx` — `docs/eval/cohorts/slot-table/snapshots/2026-09-22-critique-DataTable.txt`
```
{
  "file": "src/components/tables/DataTable.tsx",
  "summary": "No design-system problems found. That is not a claim the component is GOOD — only that it does not fork or drift.",
  "problems": [],
  "design_system_used": [
```
- `src/design-system/components/grid/LedgerGridColumnHeader.tsx` — `docs/eval/cohorts/slot-table/snapshots/2026-09-22-critique-LedgerGridColumnHeader.txt`
```
{
  "file": "src/design-system/components/grid/LedgerGridColumnHeader.tsx",
  "summary": "1 problem, worst first: 2 inline style object where the token axis exists",
  "problems": [
    {
```
- `src/components/tables/compound/CompoundCell.tsx` — `docs/eval/cohorts/slot-table/snapshots/2026-09-22-critique-CompoundCell.txt`
```
{
  "file": "src/components/tables/compound/CompoundCell.tsx",
  "summary": "No design-system problems found. That is not a claim the component is GOOD — only that it does not fork or drift.",
  "problems": [],
  "design_system_used": [],
```
- `src/components/tables/compound/CompoundGridCell.tsx` — `docs/eval/cohorts/slot-table/snapshots/2026-09-22-critique-CompoundGridCell.txt`
```
{
  "file": "src/components/tables/compound/CompoundGridCell.tsx",
  "summary": "No design-system problems found. That is not a claim the component is GOOD — only that it does not fork or drift.",
  "problems": [],
  "design_system_used": [
```
- `src/components/tables/compound/CompoundRowDetailBand.tsx` — `docs/eval/cohorts/slot-table/snapshots/2026-09-22-critique-CompoundRowDetailBand.txt`
```
{
  "file": "src/components/tables/compound/CompoundRowDetailBand.tsx",
  "summary": "1 problem, worst first: 1 inline style object where the token axis exists",
  "problems": [
    {
```
- `src/components/tables/compound/SlotTableGroupParentRow.tsx` — `docs/eval/cohorts/slot-table/snapshots/2026-09-22-critique-SlotTableGroupParentRow.txt`
```
{
  "file": "src/components/tables/compound/SlotTableGroupParentRow.tsx",
  "summary": "1 problem, worst first: 1 inline style object where the token axis exists",
  "problems": [
    {
```
- `src/components/tables/compound/CompoundEdgeRail.tsx` — `docs/eval/cohorts/slot-table/snapshots/2026-09-22-critique-CompoundEdgeRail.txt`
```
{
  "file": "src/components/tables/compound/CompoundEdgeRail.tsx",
  "summary": "1 problem, worst first: 1 inline style object where the token axis exists",
  "problems": [
    {
```
- `src/components/tables/compound/CompoundSelectStatusFace.tsx` — `docs/eval/cohorts/slot-table/snapshots/2026-09-22-critique-CompoundSelectStatusFace.txt`
```
{
  "file": "src/components/tables/compound/CompoundSelectStatusFace.tsx",
  "summary": "No design-system problems found. That is not a claim the component is GOOD — only that it does not fork or drift.",
  "problems": [],
  "design_system_used": [],
```
- `src/components/outbound/orders/to-ship/MorphingRowActionMenu.tsx` — `docs/eval/cohorts/slot-table/snapshots/2026-09-22-critique-MorphingRowActionMenu.txt`
```
{
  "file": "src/components/outbound/orders/to-ship/MorphingRowActionMenu.tsx",
  "summary": "1 problem, worst first: a raw <input> where the system has TextField",
  "problems": [
    {
```
- `src/design-system/components/grid/LedgerGrid.tsx` — `docs/eval/cohorts/slot-table/snapshots/2026-09-22-critique-LedgerGrid.txt`
```
{
  "file": "src/design-system/components/grid/LedgerGrid.tsx",
  "summary": "No design-system problems found. That is not a claim the component is GOOD — only that it does not fork or drift.",
  "problems": [],
  "design_system_used": [],
```
<!-- /eval-ledger:auto:design-critique -->

## Graph impact (shared symbols)

<!-- eval-ledger:auto:graph-impact -->
- **CompoundItem** — 6 files, 9 symbols (`docs/eval/cohorts/slot-table/snapshots/2026-09-22-impact-CompoundItem.json`)
- **CompoundState** — 6 files, 9 symbols (`docs/eval/cohorts/slot-table/snapshots/2026-09-22-impact-CompoundState.json`)
- **useSlotTableLayout** — 58 files, 58 symbols (`docs/eval/cohorts/slot-table/snapshots/2026-09-22-impact-useSlotTableLayout.json`)
- **materializeTracks** — 81 files, 111 symbols (`docs/eval/cohorts/slot-table/snapshots/2026-09-22-impact-materializeTracks.json`)
- **getExternalUrlByItemNumber** — 26 files, 29 symbols (`docs/eval/cohorts/slot-table/snapshots/2026-09-22-impact-getExternalUrlByItemNumber.json`)
- **DateRangePickerField** — 18 files, 22 symbols (`docs/eval/cohorts/slot-table/snapshots/2026-09-22-impact-DateRangePickerField.json`)
- **useOptimisticMutation** — 12 files, 12 symbols (`docs/eval/cohorts/slot-table/snapshots/2026-09-22-impact-useOptimisticMutation.json`)
- **DataTableFilterMenu** — 37 files, 37 symbols (`docs/eval/cohorts/slot-table/snapshots/2026-09-22-impact-DataTableFilterMenu.json`)
- **queueSortForColumnKey** — 8 files, 8 symbols (`docs/eval/cohorts/slot-table/snapshots/2026-09-22-impact-queueSortForColumnKey.json`)
- **LedgerGridColumnHeader** — 35 files, 35 symbols (`docs/eval/cohorts/slot-table/snapshots/2026-09-22-impact-LedgerGridColumnHeader.json`)
- **isSlotTableChromeTrack** — 27 files, 43 symbols (`docs/eval/cohorts/slot-table/snapshots/2026-09-22-impact-isSlotTableChromeTrack.json`)
- **AssigneeCombobox** — 3 files, 3 symbols (`docs/eval/cohorts/slot-table/snapshots/2026-09-22-impact-AssigneeCombobox.json`)
- **ensureLineQtySubtitle** — 8 files, 8 symbols (`docs/eval/cohorts/slot-table/snapshots/2026-09-22-impact-ensureLineQtySubtitle.json`)
- **pinLineQtyFirst** — 8 files, 8 symbols (`docs/eval/cohorts/slot-table/snapshots/2026-09-22-impact-pinLineQtyFirst.json`)
- **ensureLineMoneySubtitle** — 8 files, 8 symbols (`docs/eval/cohorts/slot-table/snapshots/2026-09-22-impact-ensureLineMoneySubtitle.json`)
- **pinLineMoneyAfterQty** — 9 files, 9 symbols (`docs/eval/cohorts/slot-table/snapshots/2026-09-22-impact-pinLineMoneyAfterQty.json`)
- **ordersCompoundColumnsFor** — 19 files, 21 symbols (`docs/eval/cohorts/slot-table/snapshots/2026-09-22-impact-ordersCompoundColumnsFor.json`)
- **COMPOUND_COLUMN_KEYS** — 0 files, 0 symbols (`docs/eval/cohorts/slot-table/snapshots/2026-09-22-impact-COMPOUND_COLUMN_KEYS.json`)
- **MorphingRowActionMenu** — 4 files, 6 symbols (`docs/eval/cohorts/slot-table/snapshots/2026-09-22-impact-MorphingRowActionMenu.json`)
- **StockStripInput** — no match (`docs/eval/cohorts/slot-table/snapshots/2026-09-22-find-StockStripInput.json`)
- **useFixedBandHeight** — no match (`docs/eval/cohorts/slot-table/snapshots/2026-09-22-find-useFixedBandHeight.json`)
- **SLOT_TABLE_ID_HEADER_WORD** — no match (`docs/eval/cohorts/slot-table/snapshots/2026-09-22-find-SLOT_TABLE_ID_HEADER_WORD.json`)
- **SLOT_TABLE_IDENTITY_PURITY_LAW** — no match (`docs/eval/cohorts/slot-table/snapshots/2026-09-22-find-SLOT_TABLE_IDENTITY_PURITY_LAW.json`)
<!-- /eval-ledger:auto:graph-impact -->

## Regression tripwires

<!-- eval-ledger:auto:tripwires -->
- `src/lib/tables/slot-table-cohort.test.ts`
- `src/lib/tables/slot-table-line-qty.test.ts`
- `src/lib/tables/slot-table-line-money.test.ts`
- `src/lib/tables/slot-table-session-laws.test.ts`
- `src/lib/tables/slot-table-discover.test.ts`
- `src/components/tables/compound/compound-select-gutter-context.test.ts`
- `src/components/tables/compound/compound-gutter-flush.test.ts`
- `src/components/station/receiving-grid/cells/receiving-group-child-rail.test.tsx`
- `src/lib/tables/table-engine-law.test.ts`
- `src/lib/tables/data-table-industrial-law.test.ts`
- `src/lib/tables/slot-table-identity-purity-law.test.ts`
<!-- /eval-ledger:auto:tripwires -->

## graph_stats

<!-- eval-ledger:auto:graph-stats -->
- project: `cycleforge-app`
- status: `ready`
- last_built_at: `2026-09-06T22:48:33.312Z`
- nodes: 41038 · edges: 191462 · embedded: 41038
- snapshot: `docs/eval/cohorts/slot-table/snapshots/2026-09-22-graph-stats.json`
<!-- /eval-ledger:auto:graph-stats -->

---

<!-- eval-ledger:auto:last-run -->
_Updated 2026-09-22T19:28:27.883Z · cohort `slot-table` · run id `2026-09-22T19-26-41-205Z`_
<!-- /eval-ledger:auto:last-run -->
