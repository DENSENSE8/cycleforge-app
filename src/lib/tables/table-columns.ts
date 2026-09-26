/**
 * Per-table column registry — the single source of truth for which columns a
 * staffer may hide on each shared list table.
 *
 * The five desktop tables (receiving / orders queue / shipped / tech / packer)
 * all render the SAME base row primitives — `ChipColumns` (right-side identity
 * chips, keyed) and `RowMetaColumns` (left-side qty | condition | rest grid).
 * Those primitives now read a per-staff hidden-key set from
 * `TableColumnConfigProvider` and drop matching columns. This registry declares,
 * per table, the toggleable columns + their human labels for a future Fields /
 * columns menu — instead of any table hardcoding which columns exist.
 *
 * Keys MUST match the real column keys the rows emit:
 *   chip group → ChipColumn.key: 'platform' | 'orderid' | 'tracking' | 'serial'
 *                (see ChipColumns)
 *   meta group → RowMetaColumns slot keys: 'qty' | 'condition' | 'rest'
 *
 * A registry entry whose key isn't present on a given row is harmless — the
 * filter simply never matches it. Alignment is preserved row-to-row because
 * every row in a table hides the SAME keys.
 */

/**
 * `meta` / `chip` are the legacy row-primitive slot families (RowMetaColumns /
 * ChipColumns). `grid` marks a table whose columns ARE real spreadsheet tracks
 * declared in a `*-grid-layout` SoT — those never route through the row
 * primitives, so their keys are the grid column keys themselves.
 */
export type TableColumnGroup = 'meta' | 'chip' | 'grid';

/**
 * Presentation data-type of a column — drives the header type glyph (Airtable-
 * style). Resolved to an icon in ONE place (`column-type-glyph.tsx`); views never
 * inline per-column icon choices.
 */
export type ColumnType =
  | 'text'
  | 'number'
  | 'id'
  | 'tag'
  | 'longtext'
  | 'date'
  /** External / marketplace link (platform). */
  | 'external'
  /** Geo / bin / staging place (folded map header glyph). */
  | 'location'
  /** Carrier tracking number (MapPin header glyph — distinct from bin `location`). */
  | 'tracking'
  /** Money / unit cost (Receipt header glyph — distinct from qty `number` Hash). */
  | 'price'
  /** Photo / thumbnail track (Image header glyph — never a blank square). */
  | 'image';

export interface TableColumnSpec {
  /** Must equal the ChipColumn.key or RowMetaColumns slot key it controls. */
  key: string;
  /** Label shown in the column-config popover. */
  label: string;
  group: TableColumnGroup;
  /** Data-type → header glyph (optional; grids that render typed headers set it). */
  type?: ColumnType;
  // NO `align` here. It existed on this registry, was never set by any entry and
  // never read by any consumer — a field that looked like the alignment SoT while
  // the real decision was being re-typed as a ternary in five headers. Alignment
  // now lives on `LedgerGridColumnModel.align`, derived from `type` by
  // `resolveGridColumnAlign`. This registry is the Fields-menu vocabulary only.
}

/** Stable ids for every shared list table that supports column config. */
export type TableId =
  | 'receiving'
  | 'orders'
  | 'shipped'
  | 'tech'
  | 'testing'
  | 'packer'
  | 'catalog'
  | 'pickup'
  | 'repair'
  /** Support › Warranty claims spreadsheet (`WARRANTY_GRID_COLUMNS`). */
  | 'warranty'
  /** Outbound › Ready / recently-tested history (slot-materialized). */
  | 'ready'
  /** Warehouse › Bins overview spreadsheet (`BINS_GRID_COLUMNS`). */
  | 'bins'
  /** Inventory › Ledger activity feed (slot-materialized). */
  | 'inventory-events'
  /** Admin › PO Mailbox / Unfound triage (`UNFOUND_GRID_COLUMNS`). */
  | 'unfound'
  /** Home › Today task spreadsheet (`MY_DAY_GRID_COLUMNS`). */
  | 'my-day'
  /** Tech / Unbox All triage spreadsheet (`TECH_ALL_GRID_COLUMNS`). */
  | 'tech-all'
  /** Review › Catalog link chores (`CATALOG_LINK_GRID_COLUMNS`). */
  | 'catalog-link'
  /**
   * Review › Missing item number (`IMPORT_EXCEPTION_COMPOUND_COLUMNS`) — its own
   * bucket, not `catalog-link`'s. The two tabs share a surface but not their
   * identity facts, so one bucket would mean hiding `source` on one tab
   * silently hid it on the other.
   */
  | 'import-exception'
  /** Ops › Tracking Exceptions spreadsheet (`TRACKING_EXCEPTIONS_GRID_COLUMNS`). */
  | 'tracking-exceptions'
  /** Support › Tickets spreadsheet (`SUPPORT_TICKETS_GRID_COLUMNS`). */
  | 'support-tickets'
  /** Inventory › Units browse spreadsheet (`UNITS_GRID_COLUMNS`). */
  | 'inventory-units'
  /** Settings › Kiosk devices (slot-materialized). */
  | 'kiosk-devices'
  /** Settings › Kiosk slot history (slot-materialized; filter/export only). */
  | 'kiosk-slot-events'
  /** Dashboard › Sales completed visits (slot-materialized; KEEP catalog). */
  | 'walk-in-sales'
  /** Settings › Active staff sessions (slot-materialized). */
  | 'auth-sessions'
  /** Admin › Inventory cycle-count campaigns (slot-materialized). */
  | 'cycle-counts'
  /** Admin › Returns dock (slot-materialized; sibling document of the Ledger). */
  | 'admin-returns'
  /** Admin › Sourcing compatibility edges (slot-materialized). */
  | 'part-compatibility'
  /**
   * Unit detail › Order allocations (slot-materialized). ONE family for the
   * entity: `/inventory?unit=` mounts it now and `/inventory/health/sku/[sku]`
   * mounts the same catalog in a later pass.
   */
  | 'unit-allocations'
  /** Unit detail › v1 tech_serial_numbers cross-refs (slot-materialized; read-only). */
  | 'unit-tsn-links'
  /** Settings › Audit log (slot-materialized; read-only, no record plane). */
  | 'audit-log'
  /** Admin › Inventory holds — the quarantine queue (slot-materialized). */
  | 'admin-holds'
  /** Admin › Inventory bulk-allocate candidates (slot-materialized). */
  | 'admin-bulk-allocate'
  /** Admin › Inventory cycle-count LINES, per campaign (slot-materialized). */
  | 'cycle-count-lines'
  /** Admin › Inventory open DRIFT alerts (slot-materialized; read-only, cron-owned). */
  | 'admin-drift-alerts'
  /** Admin › Inventory sku_stock ↔ ledger drift (slot-materialized; read-only). */
  | 'admin-sku-drift'
  /** Settings › Team directory (slot-materialized). */
  | 'staff-directory'
  /**
   * Reports › Bin utilization (slot-materialized; read-only, no record plane).
   * Its OWN bucket, never `bins`: the report row is an `mv_bin_utilization`
   * projection and the Warehouse family's row is a `BinsOverviewRow` with
   * count stamps and four flags this projection does not carry.
   */
  | 'report-bin-utilization'
  /** Reports › SKU velocity, last 30 days (slot-materialized; read-only). */
  | 'report-velocity'
  /**
   * Reports › Dead stock, 90d+ (slot-materialized; read-only). A SIBLING of
   * `report-velocity`, never a merge: both rows are keyed by SKU but answer
   * different questions over different windows.
   */
  | 'report-dead-stock'
  /**
   * Reports › Staff day, one row per (staffer × task) of a day's checklist
   * report (slot-materialized; read-only — "view only in a manager").
   */
  | 'report-staff-day'
  /**
   * Reports › Packer day, one row per PACK of a PST day (slot-materialized;
   * read-only). A sibling of `report-staff-day`, never a merge: both are
   * day-scoped shift reports, but a pack scan and a checklist tick answer
   * different questions and share no facts.
   */
  | 'report-packer-day'
  /**
   * Reports › Tasks, one row per FINISHED follow-up (slot-materialized;
   * read-only). Its OWN bucket, never `tasks`: the working checklist and the
   * record of finished work are read for different facts, and hiding
   * `Deadline` on the record must not densify the queue.
   */
  | 'report-tasks'
  /** Admin › per-SKU bin distribution (slot-materialized; read-only). */
  | 'sku-bins'
  /** Admin › per-SKU stock ledger (slot-materialized; read-only). */
  | 'sku-ledger'
  /**
   * `/search` cross-entity find plane (slot-materialized; read-only). Its OWN
   * bucket: the rows are six entity families flattened onto one wire shape,
   * so binding a column here must not densify any desk those records live on.
   */
  | 'search-hits'
  /**
   * Admin › per-SKU open allocations — a SIBLING layout DOCUMENT over the
   * `unit-allocations` entity, not a second family: this feed filters
   * `state <> 'RELEASED'` and is the only one that selects `allocated_by`,
   * while the unit desk selects the two release facts and never binds the
   * actor. One document would leave a permanently dashed track on one of the
   * two mounts, which is the dead-header failure. `unit-allocations.ts` names
   * this sibling itself.
   */
  | 'sku-allocations'
  /**
   * To-Ship CSV import staging (`CSV_IMPORT_STAGING_GRID_COLUMNS`) — its OWN
   * bucket, never `orders`: hiding a column while triaging a file must not
   * change the density of the live queue those rows are about to land in.
   */
  | 'orders-import'
  /**
   * Home → Daily shift checklist. Its OWN bucket: hiding `team` on a personal
   * checklist must not touch any operator queue's density, and no queue shares
   * these keys.
   */
  | 'daily'
  /**
   * My Tasks (`staff_todos`) — one staffer's own list. Its OWN bucket, never
   * `daily`'s: the two tables answer different questions over different stores
   * (personal list vs the org's shift checklist with a roster), and they share
   * only the word "task".
   */
  | 'tasks'
  /**
   * Amazon Prep › shipment board. The KEY stays because `TableId`'s runtime
   * vocabulary derives from this record — the display is being rebuilt.
   */
  | 'fba';

/** Canonical meta-slot keys (the left-side qty | condition | rest grid). */
export const META_KEYS = {
  qty: 'qty',
  condition: 'condition',
  rest: 'rest',
} as const;

/*
 * The shared `META_*` / `CHIP_*` column specs were DELETED with the wave 1.3
 * slot port (2026-08-31).
 *
 * They existed so the receiving-family buckets below could name the same
 * hide-keys without copying them. Every one of those buckets is `[]` now —
 * hiding a fact is unbinding it from a slot — so the specs had no readers left.
 * A shared constant with no consumer is not a SoT, it is a suggestion that the
 * next porter will re-populate a bucket rather than add a catalog field.
 */

const GRID_COL = (key: string, label: string, type?: ColumnType): TableColumnSpec => ({
  key,
  label,
  group: 'grid',
  type,
});

/**
 * Toggleable columns per table. Order here is the order shown in the popover.
 * `rest` is intentionally NOT exposed everywhere — only where its content is a
 * genuinely-optional detail (staff initials / days-late) rather than load-bearing.
 */
export const TABLE_COLUMNS: Record<TableId, TableColumnSpec[]> = {
  // Unbox / History / Testing receiving-line grids (`RECEIVING_GRID_COLUMNS`).
  // `status` = the merged lifecycle track (dot · stage name, 2026-08-02).
  // `order` is frozen identity (`select · order`) — no hideKey, absent here.
  // `date` scrolls with facts (always-on, no hideKey). Platform column removed
  // from the Unbox spreadsheet SoT (2026-08-05); board-layout chips still use
  // other surfaces' platform toggles.
  //
  // `rest` no longer maps to a grid TRACK — the `stage` column that carried
  // `hideKey: 'rest'` was deleted 2026-08-02. It stays because it is still the
  /**
   * Receiving — **deliberately empty** since the wave 1.3 slot port.
   *
   * This bucket kept its hide-keys on a justification that had gone stale: the
   * comment said `ReceivingLineOrderRow` passes a `rest` cluster to
   * `RowMetaColumns`, "which asks `useIsColumnHidden('rest')`". **There is no
   * `useIsColumnHidden`** — no definition, no call site, anywhere in `src`.
   * `RowMetaColumns` is alive and reads no hide-key at all; the two facts had
   * been conflated, and the prose was defending a consumer that had already
   * been deleted. Same class of error as the surface count `band3-find-only`
   * caught, and the same fix: the empty bucket is now the claim.
   *
   * Hiding a receiving fact is unbinding it from a slot. The KEY stays because
   * `TableId`'s runtime vocabulary derives from this record's keys (the
   * `fba: []` precedent) and the kept binding parses `tableId: 'receiving'` at
   * module scope.
   */
  receiving: [],
  /**
   * Orders + its station twins — **deliberately empty** (Wave-1 hand-model
   * kill, `docs/kill-list/07-slot-table-hand-models.md` §3). Hide-by-field-id
   * is the deleted `useGridColumnVisibility` feature living in a hashmap; on
   * the slot-materialized Orders desk "hide Pick" is "unbind `orders.picked`"
   * in the Fields + popover. The KEYS stay because `TableId`'s runtime
   * vocabulary derives from this record (the `fba: []` precedent) and the
   * kept Orders binding parses `tableId: 'orders'` at module scope.
   */
  orders: [],
  shipped: [],
  tech: [],
  testing: [],
  packer: [],
  // Grid-native: keys are the `hideKey`s in `src/lib/products/catalog-grid-layout.ts`.
  /**
   * Products catalog — **deliberately empty** since the wave 1.4 slot port.
   * Hiding a product fact is now unbinding it from a slot. The KEY stays
   * because `TableId`'s runtime vocabulary derives from this record's keys.
   */
  catalog: [],
  /**
   * Pickup — **deliberately empty** (Wave-2 hand-model kill, kill-list 07 §4):
   * the columns are a slot materialization now, so "hide SKU" is "unbind
   * `pickup.sku`" in the Fields + popover. The KEY stays (fba/orders
   * precedent — `TableId`'s runtime vocabulary derives from this record).
   */
  pickup: [],
  // Keys are the `hideKey`s in `src/lib/repair/repair-grid-layout.ts`.
  /**
   * Repair queue — **deliberately empty** since the wave 1.4 slot port. Hiding
   * a repair fact is now unbinding it from a slot. The KEY stays because
   * `TableId`'s runtime vocabulary derives from this record's keys.
   */
  repair: [],
  // Keys are the `hideKey`s in
  // `src/components/warranty/grid/warranty-grid-layout.ts`. The `ticket` action
  // track is deliberately absent — it carries no `hideKey`, so it is structural
  // and the Fields menu must never offer to hide a row control.
  /**
   * Warranty claims — **deliberately empty** since the wave 1.4 slot port.
   * Hiding a claim fact is now unbinding it from a slot; the ticket CONTROL was
   * never here (it is structural). The KEY stays because `TableId`'s runtime
   * vocabulary derives from this record's keys.
   */
  warranty: [],
  /**
   * Amazon Prep board — **deliberately empty**. The KEY stays because
   * `TableId`'s runtime vocabulary derives from this record's keys. The
   * display that materialised catalog facts was torn out 2026-08-30.
   */
  fba: [],
  /**
   * Recently-tested history — **deliberately empty** since the wave 1.1 slot
   * port (`docs/todo/seller-table-program-PLAN.md` §03). Hiding a Ready fact is
   * now unbinding it from a slot, not a per-staff `hideKey` in this third
   * registry. The KEY stays because `TableId`'s runtime vocabulary derives from
   * this record's keys (the `fba: []` precedent).
   */
  ready: [],
  /**
   * Warehouse bins — **deliberately empty** since the wave 1.4 slot port.
   * Hiding a bin fact is now unbinding it from a slot. The KEY stays because
   * `TableId`'s runtime vocabulary derives from this record's keys.
   */
  bins: [],
  /**
   * Inventory ledger activity — **deliberately empty**, slot-born. The Ledger
   * feed never had a hide-key registry to inherit: it was a hand-rolled card
   * list until the slot port, so hiding an event fact is unbinding it from a
   * slot and always was. The KEY stays because `TableId`'s runtime vocabulary
   * derives from this record's keys.
   */
  'inventory-events': [],
  /**
   * Inventory units — **deliberately empty** since the wave 1.4 slot port.
   * Hiding a unit fact is now unbinding it from a slot, not a per-staff
   * `hideKey` in this third registry. The KEY stays because `TableId`'s runtime
   * vocabulary derives from this record's keys (the `fba: []` precedent).
   */
  'inventory-units': [],
  // Keys are the `hideKey`s in
  // `src/components/outbound/orders/import-staging/csv-import-staging-grid-layout.ts`.
  // `select` / `order` are frozen identity and `status` is the triage state —
  // all three are structural, so none of them is offered here.
  /**
   * Home → Daily — **deliberately empty** since the wave 1.3 slot port. Hiding
   * a checklist fact is unbinding it from a slot; Team and Checked are catalog
   * facts (`daily.team`, `daily.marked`), unbound on the product layout. The
   * KEY stays for the `TableId` union.
   */
  daily: [],
  /**
   * My Tasks — **deliberately empty**, same port. Kind / Station / Resets /
   * Checked are catalog facts, bindable per organization.
   */
  tasks: [],
  /**
   * Order import staging — **deliberately empty** since the wave 1.4 slot port.
   * The separate bucket was always the point (hiding a staging column must not
   * densify live To-ship); it is now a separate LAYOUT DOCUMENT, which is what
   * a separate tableId buys. The KEY stays because `TableId`'s runtime
   * vocabulary derives from this record's keys.
   */
  'orders-import': [],
  // Keys are the `hideKey`s in
  // `src/components/receiving/unfound/grid/unfound-grid-layout.ts`. The `action`
  // track (Push / Synced) has no `hideKey` — structural, never offered.
  /**
   * Unfound queue — **deliberately empty** since the wave 1.4 slot port. Hiding
   * a triage fact is now unbinding it from a slot; the Push CONTROL was never
   * here (it is structural). The KEY stays because `TableId`'s runtime
   * vocabulary derives from this record's keys.
   */
  unfound: [],
  // Keys are the `hideKey`s in `src/lib/my-day/my-day-grid-layout.ts`. `select`
  // and `task` are absent — frozen identity, structurally un-hideable. Labels
  // mirror the column SoT so the menu and the header read the same word.
  /**
   * Home · Today — **deliberately empty** since the wave 1.4 slot port, which
   * also made `fieldsMenu: true` honest here for the first time (it was
   * leftover column-display lip copy over no catalog). The KEY stays because
   * `TableId`'s runtime vocabulary derives from this record's keys.
   */
  'my-day': [],
  // Keys are the `hideKey`s in `src/lib/tech/tech-all-grid-layout.ts`. `select`
  // and `identity` are absent — frozen identity, structurally un-hideable.
  /**
   * Tech · All triage — **deliberately empty** since the wave 1.4 slot port.
   * Hiding a triage fact is now unbinding it from a slot. The KEY stays because
   * `TableId`'s runtime vocabulary derives from this record's keys.
   */
  'tech-all': [],
  /**
   * Review › Catalog link — **deliberately empty** since the wave 1.3 slot
   * port. Every entry here is now a catalog fact (`catalog-link.*`) bindable
   * from the Fields menu. The KEY stays for the `TableId` union.
   */
  'catalog-link': [],
  /**
   * Review › Missing item number — **deliberately empty**, same port. Its own
   * key (rather than sharing `catalog-link`'s) is what keeps the two queues'
   * layouts independent.
   */
  'import-exception': [],
  // Keys are the `hideKey`s in
  // `src/components/tracking-exceptions/grid/tracking-exceptions-grid-layout.ts`.
  // The `actions` track has no hideKey — structural, never offered.
  /**
   * Tracking exceptions — **deliberately empty** since the wave 1.4 slot port.
   * Hiding an exception fact is now unbinding it from a slot; the retry/edit
   * CONTROL was never here (it is structural). The KEY stays because
   * `TableId`'s runtime vocabulary derives from this record's keys.
   */
  'tracking-exceptions': [],
  // Keys are the `hideKey`s in
  // `src/components/support/zendesk/grid/support-tickets-grid-layout.ts`.
  // `select` / `subject` are absent — structurally un-hideable identity.
  'support-tickets': [
    GRID_COL('status', 'Status', 'tag'),
    GRID_COL('priority', 'Priority', 'tag'),
    GRID_COL('ticket', 'Ticket', 'id'),
    GRID_COL('updated', 'Updated', 'date'),
  ],
  /**
   * Kiosk devices — **deliberately empty**, slot-born. Hiding a device fact is
   * unbinding it from a slot. The KEY stays for the `TableId` union.
   */
  'kiosk-devices': [],
  /**
   * Kiosk slot history — **deliberately empty**, slot-born. Same rule as
   * kiosk-devices: hide by unbinding, never by a hideKey list here.
   */
  'kiosk-slot-events': [],
  /**
   * Walk-in sales history — **deliberately empty**, slot-born. Hide by
   * unbinding a catalog fact. The KEY stays for the `TableId` union.
   */
  'walk-in-sales': [],
  /**
   * Active sessions — **deliberately empty**, slot-born. Hiding a session fact
   * is unbinding it from a slot. The KEY stays for the `TableId` union.
   */
  'auth-sessions': [],
  /**
   * Cycle-count campaigns — **deliberately empty**, slot-born. Same rule as
   * kiosk-devices: hide by unbinding, never by a hideKey list here.
   */
  'cycle-counts': [],
  /**
   * Returns dock — **deliberately empty**, slot-born. Hiding a returns fact is
   * unbinding it from a slot. The KEY stays for the `TableId` union.
   */
  'admin-returns': [],
  /**
   * Compatibility edges — **deliberately empty**, slot-born. Hiding an edge
   * fact is unbinding it from a slot. The KEY stays for the `TableId` union.
   */
  'part-compatibility': [],
  /**
   * Order allocations — **deliberately empty**, slot-born. Hiding an
   * allocation fact is unbinding it from a slot. The KEY stays for the
   * `TableId` union.
   */
  'unit-allocations': [],
  /**
   * v1 TSN cross-refs — **deliberately empty**, slot-born. Same rule. The KEY
   * stays for the `TableId` union.
   */
  'unit-tsn-links': [],
  /**
   * Audit log — **deliberately empty**, slot-born. Hiding an audit fact is
   * unbinding it from a slot. The KEY stays for the `TableId` union.
   */
  'audit-log': [],
  /**
   * Held units — **deliberately empty**, slot-born. Hiding a hold fact is
   * unbinding it from a slot. The KEY stays for the `TableId` union.
   */
  'admin-holds': [],
  /**
   * Allocation candidates — **deliberately empty**, slot-born. Hiding a
   * candidate fact is unbinding it from a slot. The KEY stays for the
   * `TableId` union.
   */
  'admin-bulk-allocate': [],
  /**
   * Cycle-count lines — **deliberately empty**, slot-born. Same rule as
   * `cycle-counts`: hide by unbinding, never by a hideKey list here.
   */
  'cycle-count-lines': [],
  /**
   * Open DRIFT alerts — **deliberately empty**, slot-born. Hiding an alert
   * fact is unbinding it from a slot. The KEY stays for the `TableId` union.
   */
  'admin-drift-alerts': [],
  /**
   * SKU stock drift — **deliberately empty**, slot-born. Same rule. The KEY
   * stays for the `TableId` union.
   */
  'admin-sku-drift': [],
  /**
   * Team directory — **deliberately empty**, slot-born. Hiding a staff fact is
   * unbinding it from a slot. The KEY stays for the `TableId` union.
   */
  'staff-directory': [],
  /**
   * Bin utilization — **deliberately empty**, slot-born. Hiding a bin fact is
   * unbinding it from a slot. The KEY stays for the `TableId` union.
   */
  'report-bin-utilization': [],
  /**
   * SKU velocity — **deliberately empty**, slot-born. Same rule. The KEY stays
   * for the `TableId` union.
   */
  'report-velocity': [],
  /**
   * Dead stock — **deliberately empty**, slot-born. Same rule. The KEY stays
   * for the `TableId` union.
   */
  'report-dead-stock': [],
  /**
   * Staff day — **deliberately empty**, slot-born. Same rule. The KEY stays
   * for the `TableId` union.
   */
  'report-staff-day': [],
  /**
   * Packer day — **deliberately empty**, slot-born. Same rule. The KEY stays
   * for the `TableId` union.
   */
  'report-packer-day': [],
  /**
   * Completed tasks — **deliberately empty**, slot-born. Same rule. The KEY
   * stays for the `TableId` union.
   */
  'report-tasks': [],
  /**
   * Per-SKU bin distribution — **deliberately empty**, slot-born. Hiding a bin
   * fact is unbinding it from a slot. The KEY stays for the `TableId` union.
   */
  'sku-bins': [],
  /**
   * Per-SKU stock ledger — **deliberately empty**, slot-born. Same rule. The
   * KEY stays for the `TableId` union.
   */
  'sku-ledger': [],
  /**
   * `/search` find plane — **deliberately empty**, slot-born. Hiding a result
   * fact is unbinding it from a slot. The KEY stays for the `TableId` union.
   */
  'search-hits': [],
  /**
   * Per-SKU open allocations — **deliberately empty**, slot-born. A sibling
   * DOCUMENT over the `unit-allocations` entity, so this bucket exists to keep
   * the two mounts' Fields prefs from fighting, nothing more.
   */
  'sku-allocations': [],
};

export function tableColumnsFor(tableId: TableId): TableColumnSpec[] {
  return TABLE_COLUMNS[tableId] ?? [];
}
