/** Per-table column registry — the single source of truth for which columns a staffer may hide on each shared list table. */

/** `meta` / `chip` are the legacy row-primitive slot families (RowMetaColumns / ChipColumns). */
type TableColumnGroup = 'meta' | 'chip' | 'grid';

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

interface TableColumnSpec {
  /** Must equal the ChipColumn.key or RowMetaColumns slot key it controls. */
  key: string;
  /** Label shown in the column-config popover. */
  label: string;
  group: TableColumnGroup;
  /** Data-type → header glyph (optional; grids that render typed headers set it). */
  type?: ColumnType;
  // NO `align` here.
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
  /** Review › Missing item number (`IMPORT_EXCEPTION_COMPOUND_COLUMNS`) — its own bucket, not `catalog-link`'s. */
  | 'import-exception'
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
  /** Reports › Bin utilization (slot-materialized; read-only, no record plane). */
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
  /** Reports › Packer day, one row per PACK of a PST day (slot-materialized; read-only). */
  | 'report-packer-day'
  /** Reports › Tasks, one row per FINISHED follow-up (slot-materialized; read-only). */
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
  /** Admin › per-SKU open allocations — a SIBLING layout DOCUMENT over the `unit-allocations` entity, not a second family: */
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
  /** My Tasks (`staff_todos`) — one staffer's own list. */
  | 'tasks'
  /**
   * Amazon Prep › shipment board. The KEY stays because `TableId`'s runtime
   * vocabulary derives from this record — the display is being rebuilt.
   */
  | 'fba';

/** Canonical meta-slot keys (the left-side qty | condition | rest grid). */
const META_KEYS = {
  qty: 'qty',
  condition: 'condition',
  rest: 'rest',
} as const;

/* The shared `META_*` / `CHIP_*` column specs were DELETED with the wave 1.3 slot port (2026-08-31). */

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
  /** Receiving — **deliberately empty** since the wave 1.3 slot port. */
  receiving: [],
  /** Orders + its station twins — deliberately empty after the hand-modeled column cleanup. */
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
  /** Pickup — **deliberately empty** (Wave-2 hand-model kill, kill-list 07 §4): */
  pickup: [],
  // Keys are the `hideKey`s in `src/components/warranty/grid/warranty-grid-layout.ts`.
  /** Warranty claims — **deliberately empty** since the wave 1.4 slot port. */
  warranty: [],
  /**
   * Amazon Prep board — **deliberately empty**. The KEY stays because
   * `TableId`'s runtime vocabulary derives from this record's keys. The
   * display that materialised catalog facts was torn out 2026-08-30.
   */
  fba: [],
  /** Recently-tested history — **deliberately empty** since the wave 1.1 slot port (`docs/todo/seller-table-program-PLAN.md` §03). */
  ready: [],
  /**
   * Warehouse bins — **deliberately empty** since the wave 1.4 slot port.
   * Hiding a bin fact is now unbinding it from a slot. The KEY stays because
   * `TableId`'s runtime vocabulary derives from this record's keys.
   */
  bins: [],
  /** Inventory ledger activity — **deliberately empty**, slot-born. */
  'inventory-events': [],
  /** Inventory units — **deliberately empty** since the wave 1.4 slot port. */
  'inventory-units': [],
  // Keys are the `hideKey`s in `src/components/outbound/orders/import-staging/csv-import-staging-grid-layout.ts`.
  /** Home → Daily — **deliberately empty** since the wave 1.3 slot port. */
  daily: [],
  /**
   * My Tasks — **deliberately empty**, same port. Kind / Station / Resets /
   * Checked are catalog facts, bindable per organization.
   */
  tasks: [],
  /** Order import staging — **deliberately empty** since the wave 1.4 slot port. */
  'orders-import': [],
  // Keys are the `hideKey`s in
  // `src/components/receiving/unfound/grid/unfound-grid-layout.ts`. The `action`
  // track (Push / Synced) has no `hideKey` — structural, never offered.
  /** Unfound queue — **deliberately empty** since the wave 1.4 slot port. */
  unfound: [],
  // Keys are the `hideKey`s in `src/lib/my-day/my-day-grid-layout.ts`. `select`
  // and `task` are absent — frozen identity, structurally un-hideable. Labels
  // mirror the column SoT so the menu and the header read the same word.
  /** Home · Today — **deliberately empty** since the wave 1.4 slot port, which also made `fieldsMenu: */
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

function tableColumnsFor(tableId: TableId): TableColumnSpec[] {
  return TABLE_COLUMNS[tableId] ?? [];
}
