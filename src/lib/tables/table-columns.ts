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
  | 'tracking';

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
  /** Incoming POS spreadsheet — distinct from Unbox/History `receiving`. */
  | 'incoming'
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
  /** Outbound › Ready / recently-tested history (`READY_GRID_COLUMNS`). */
  | 'ready'
  /** Warehouse › Bins overview spreadsheet (`BINS_GRID_COLUMNS`). */
  | 'bins'
  /** Admin › PO Mailbox / Unfound triage (`UNFOUND_GRID_COLUMNS`). */
  | 'unfound'
  /** Home › Today task spreadsheet (`MY_DAY_GRID_COLUMNS`). */
  | 'my-day'
  /** Review › Catalog link chores (`CATALOG_LINK_GRID_COLUMNS`). */
  | 'catalog-link'
  /**
   * Review › Missing item number (`IMPORT_EXCEPTION_GRID_COLUMNS`) — its own
   * bucket, not `catalog-link`'s. The two tabs share a surface but not their
   * identity facts, so one bucket would mean hiding `source` on one tab
   * silently hid it on the other.
   */
  | 'import-exception'
  /** Ops › Tracking Exceptions spreadsheet (`TRACKING_EXCEPTIONS_GRID_COLUMNS`). */
  | 'tracking-exceptions'
  /** Support › Tickets spreadsheet (`SUPPORT_TICKETS_GRID_COLUMNS`). */
  | 'support-tickets';

/** Canonical meta-slot keys (the left-side qty | condition | rest grid). */
export const META_KEYS = {
  qty: 'qty',
  condition: 'condition',
  rest: 'rest',
} as const;

const META_QTY: TableColumnSpec = { key: 'qty', label: 'Quantity', group: 'meta' };
const META_CONDITION: TableColumnSpec = { key: 'condition', label: 'Condition', group: 'meta' };
const META_REST: TableColumnSpec = { key: 'rest', label: 'Details', group: 'meta' };
const META_STATUS: TableColumnSpec = { key: 'status', label: 'Status', group: 'meta', type: 'tag' };
const CHIP_PLATFORM: TableColumnSpec = { key: 'platform', label: 'Platform', group: 'chip' };
const CHIP_ORDERID: TableColumnSpec = { key: 'orderid', label: 'Order ID', group: 'chip' };
const CHIP_TRACKING: TableColumnSpec = { key: 'tracking', label: 'Tracking', group: 'chip' };
const CHIP_SERIAL: TableColumnSpec = { key: 'serial', label: 'Serial', group: 'chip' };

/**
 * Grid-native tables (Catalog · Pickup · Repair). Unlike the five row-primitive
 * tables above, these render real spreadsheet TRACKS from their own
 * `*-grid-layout` SoT, so each key here is that column's `hideKey` (== its grid
 * column key). Labels mirror the column SoT so the Fields menu and the header
 * read the same word. `select` / `title` are absent on purpose — they carry no
 * `hideKey` and are structurally un-hideable.
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
  // `status` = the merged lifecycle track (dot · stage name, 2026-08-02);
  // `date` joined the list when that column absorbed the clock.
  //
  // `rest` no longer maps to a grid TRACK — the `stage` column that carried
  // `hideKey: 'rest'` was deleted 2026-08-02. It stays because it is still the
  // vocabulary for the legacy row primitives under this same tableId: the
  // board-layout `ReceivingLineOrderRow` / `ReceivingPoSummary` pass a `rest`
  // cluster to `RowMetaColumns`, which asks `useIsColumnHidden('rest')`.
  // Dropping the entry would take that toggle away, not clean anything up.
  receiving: [
    META_STATUS,
    GRID_COL('date', 'Date', 'date'),
    META_QTY,
    META_CONDITION,
    META_REST,
    CHIP_PLATFORM,
    CHIP_ORDERID,
    CHIP_TRACKING,
    CHIP_SERIAL,
  ],
  // Incoming POS (`INCOMING_GRID_COLUMNS`) — separate prefs bucket so a Fields
  // toggle on Incoming cannot silently hide tracks on History/Unbox (and vice
  // versa). Status uses meta `rest`; no serial on this surface.
  incoming: [META_QTY, META_CONDITION, META_REST, CHIP_PLATFORM, CHIP_ORDERID, CHIP_TRACKING],
  orders: [META_STATUS, META_QTY, META_CONDITION, META_REST, CHIP_PLATFORM, CHIP_ORDERID, CHIP_TRACKING],
  shipped: [META_QTY, META_CONDITION, META_REST, CHIP_PLATFORM, CHIP_ORDERID, CHIP_TRACKING, CHIP_SERIAL],
  tech: [META_QTY, META_CONDITION, META_REST, CHIP_PLATFORM, CHIP_ORDERID, CHIP_TRACKING, CHIP_SERIAL],
  testing: [META_QTY, META_CONDITION, META_REST, CHIP_PLATFORM, CHIP_ORDERID, CHIP_TRACKING, CHIP_SERIAL],
  packer: [META_QTY, META_CONDITION, META_REST, CHIP_PLATFORM, CHIP_ORDERID, CHIP_TRACKING],
  // Grid-native: keys are the `hideKey`s in `src/lib/products/catalog-grid-layout.ts`.
  catalog: [
    GRID_COL('sku', 'SKU', 'id'),
    GRID_COL('inventory', 'Inventory', 'id'),
    GRID_COL('channels', 'Channels', 'number'),
    GRID_COL('manuals', 'Manuals', 'number'),
    GRID_COL('qc', 'QC', 'number'),
    GRID_COL('orders', 'Orders', 'number'),
    GRID_COL('status', 'Status', 'tag'),
  ],
  // Keys are the `hideKey`s in `src/components/receiving/pickup/grid/pickup-grid-layout.ts`.
  pickup: [
    GRID_COL('sku', 'SKU', 'id'),
    GRID_COL('order', 'Order', 'id'),
    GRID_COL('date', 'Date', 'date'),
    GRID_COL('qty', 'Qty', 'number'),
    GRID_COL('condition', 'Cond', 'tag'),
    GRID_COL('price', 'Price', 'number'),
    GRID_COL('status', 'Status', 'tag'),
  ],
  // Keys are the `hideKey`s in `src/lib/repair/repair-grid-layout.ts`.
  repair: [
    GRID_COL('date', 'Created', 'date'),
    GRID_COL('customer', 'Customer', 'text'),
    GRID_COL('phone', 'Phone', 'text'),
    GRID_COL('price', 'Price', 'number'),
    GRID_COL('order', 'Walk-in / Order', 'id'),
    GRID_COL('ticket', 'Ticket', 'id'),
  ],
  // Keys are the `hideKey`s in
  // `src/components/warranty/grid/warranty-grid-layout.ts`. The `ticket` action
  // track is deliberately absent — it carries no `hideKey`, so it is structural
  // and the Fields menu must never offer to hide a row control.
  warranty: [
    GRID_COL('claim', 'Claim', 'id'),
    GRID_COL('serial', 'Serial', 'id'),
    GRID_COL('customer', 'Customer', 'text'),
    GRID_COL('status', 'Status', 'tag'),
    GRID_COL('warranty', 'Warranty', 'tag'),
    GRID_COL('logged', 'Logged', 'date'),
  ],
  // Keys are the `hideKey`s in
  // `src/components/outbound/ready/grid/ready-grid-layout.ts`. The `action`
  // track (Stage FBA) has no `hideKey` — structural, never offered.
  ready: [
    GRID_COL('verdict', 'Verdict', 'tag'),
    GRID_COL('destination', 'Destination', 'tag'),
    GRID_COL('reasons', 'Reasons', 'tag'),
    GRID_COL('velocity', 'Velocity', 'tag'),
    GRID_COL('condition', 'Cond', 'tag'),
    GRID_COL('tested', 'Tested', 'date'),
  ],
  // Keys are the `hideKey`s in
  // `src/components/warehouse/bins-grid/bins-grid-layout.ts`. `select` /
  // `barcode` are absent — frozen identity, structurally un-hideable.
  bins: [
    GRID_COL('location', 'Room / Location', 'location'),
    GRID_COL('sku_count', 'SKUs', 'number'),
    GRID_COL('total_qty', 'Qty', 'number'),
    GRID_COL('fill', 'Fill', 'text'),
    GRID_COL('last_counted', 'Counted', 'date'),
    GRID_COL('status', 'Status', 'tag'),
  ],
  // Keys are the `hideKey`s in
  // `src/components/receiving/unfound/grid/unfound-grid-layout.ts`. The `action`
  // track (Push / Synced) has no `hideKey` — structural, never offered.
  unfound: [
    GRID_COL('ticket', 'Ticket', 'id'),
    GRID_COL('usaNote', 'USA Team Note', 'longtext'),
    GRID_COL('vietnamNote', 'Vietnam Team Note', 'longtext'),
    GRID_COL('checked', 'Check', 'tag'),
  ],
  // Keys are the `hideKey`s in `src/lib/my-day/my-day-grid-layout.ts`. `select`
  // and `task` are absent — frozen identity, structurally un-hideable. Labels
  // mirror the column SoT so the menu and the header read the same word.
  'my-day': [
    GRID_COL('lane', 'Lane', 'tag'),
    GRID_COL('queue', 'Queue', 'tag'),
    GRID_COL('record', 'Record', 'id'),
    GRID_COL('due', 'Due', 'date'),
    GRID_COL('status', 'Status', 'tag'),
  ],
  // Keys are the `hideKey`s in
  // `src/features/review/catalog-link/grid/catalog-link-grid-layout.ts`.
  'catalog-link': [
    GRID_COL('item', 'Item number', 'id'),
    GRID_COL('source', 'Account', 'external'),
    GRID_COL('sku', 'SKU', 'id'),
    GRID_COL('orders', 'Orders', 'number'),
    GRID_COL('first', 'First seen', 'date'),
    GRID_COL('last', 'Last seen', 'date'),
  ],
  // Keys are the `hideKey`s in
  // `src/features/review/catalog-link/grid/import-exception-grid-layout.ts`.
  'import-exception': [
    GRID_COL('order', 'Order', 'id'),
    GRID_COL('source', 'Account', 'external'),
    GRID_COL('tracking', 'Tracking', 'tracking'),
    GRID_COL('sheet', 'Sheet row', 'number'),
    GRID_COL('seen', 'Seen', 'number'),
    GRID_COL('first', 'First seen', 'date'),
    GRID_COL('last', 'Last seen', 'date'),
  ],
  // Keys are the `hideKey`s in
  // `src/components/tracking-exceptions/grid/tracking-exceptions-grid-layout.ts`.
  // The `actions` track has no hideKey — structural, never offered.
  'tracking-exceptions': [
    GRID_COL('carrier', 'Carrier', 'text'),
    GRID_COL('source', 'Source', 'text'),
    GRID_COL('staff', 'Staff', 'text'),
    GRID_COL('reason', 'Reason', 'tag'),
    GRID_COL('status', 'Status', 'tag'),
    GRID_COL('retries', 'Retries', 'number'),
    GRID_COL('lastCheck', 'Last check', 'date'),
    GRID_COL('created', 'Created', 'date'),
    GRID_COL('notes', 'Notes', 'longtext'),
  ],
  // Keys are the `hideKey`s in
  // `src/components/support/zendesk/grid/support-tickets-grid-layout.ts`.
  // `select` / `subject` are absent — structurally un-hideable identity.
  'support-tickets': [
    GRID_COL('status', 'Status', 'tag'),
    GRID_COL('priority', 'Priority', 'tag'),
    GRID_COL('ticket', 'Ticket', 'id'),
    GRID_COL('updated', 'Updated', 'date'),
  ],
};

export function tableColumnsFor(tableId: TableId): TableColumnSpec[] {
  return TABLE_COLUMNS[tableId] ?? [];
}
