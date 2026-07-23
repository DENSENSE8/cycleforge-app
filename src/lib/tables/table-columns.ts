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
 *                (see station-chip-columns.tsx / ChipColumns)
 *   meta group → RowMetaColumns slot keys: 'qty' | 'condition' | 'rest'
 *
 * A registry entry whose key isn't present on a given row is harmless — the
 * filter simply never matches it. Alignment is preserved row-to-row because
 * every row in a table hides the SAME keys.
 */

export type TableColumnGroup = 'meta' | 'chip';

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
  /** Horizontal content alignment (e.g. numbers right-align). Optional. */
  align?: 'start' | 'end';
}

/** Stable ids for every shared list table that supports column config. */
export type TableId = 'receiving' | 'orders' | 'shipped' | 'tech' | 'testing' | 'packer';

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
 * Toggleable columns per table. Order here is the order shown in the popover.
 * `rest` is intentionally NOT exposed everywhere — only where its content is a
 * genuinely-optional detail (staff initials / days-late) rather than load-bearing.
 */
export const TABLE_COLUMNS: Record<TableId, TableColumnSpec[]> = {
  receiving: [META_QTY, META_CONDITION, META_REST, CHIP_PLATFORM, CHIP_ORDERID, CHIP_TRACKING, CHIP_SERIAL],
  orders: [META_STATUS, META_QTY, META_CONDITION, META_REST, CHIP_PLATFORM, CHIP_ORDERID, CHIP_TRACKING],
  shipped: [META_QTY, META_CONDITION, META_REST, CHIP_PLATFORM, CHIP_ORDERID, CHIP_TRACKING, CHIP_SERIAL],
  tech: [META_QTY, META_CONDITION, META_REST, CHIP_PLATFORM, CHIP_ORDERID, CHIP_TRACKING, CHIP_SERIAL],
  testing: [META_QTY, META_CONDITION, META_REST, CHIP_PLATFORM, CHIP_ORDERID, CHIP_TRACKING, CHIP_SERIAL],
  packer: [META_QTY, META_CONDITION, META_REST, CHIP_PLATFORM, CHIP_ORDERID, CHIP_TRACKING],
};

export function tableColumnsFor(tableId: TableId): TableColumnSpec[] {
  return TABLE_COLUMNS[tableId] ?? [];
}
