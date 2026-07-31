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
  /** Geo / tracking destination (map pin). */
  | 'location';

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
  | 'repair';

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
  receiving: [META_QTY, META_CONDITION, META_REST, CHIP_PLATFORM, CHIP_ORDERID, CHIP_TRACKING, CHIP_SERIAL],
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
};

export function tableColumnsFor(tableId: TableId): TableColumnSpec[] {
  return TABLE_COLUMNS[tableId] ?? [];
}
