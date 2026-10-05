/**
 * `pasted-list.full` — the Pasted list page's table: one row per pasted
 * identifier and every fact the house holds about it, one fact per column, a
 * Google-Sheets read (owner 2026-10-04): # · Number frozen, single-line cells,
 * columns the staffer resizes / fits / freezes (`useSheetColumns`). Display
 * method: DataTable, HIGH — 250 rows × 10 compared facts at a desk.
 */

import { makeGridSurfaceDescriptor, type GridSurfaceCapabilities, type GridSurfaceDescriptor, type LedgerGridColumnModel } from '@/design-system/components/grid';
import { gridFrozenLeft, gridTemplate } from '@/design-system/components/grid/grid-column-geometry';
import type { TableSurfaceBinding } from '@/components/tables/table-surface-binding';
import { parseTableDefinition } from '@/lib/tables/table-definition';
import type { ColumnType } from '@/lib/tables/table-columns';
import type { BulkListSort, BulkRowView } from '@/components/sidebar/contextual/bulk-list-view';
import type { NavLocateFacts } from '@/lib/nav/context/schema';
import { shortDay } from '@/lib/receiving/pasted-number-facts';
import { formatMonthDayTimePST } from '@/utils/date';

export type PastedListColumnKey =
  | 'pos'
  | 'ref'
  | 'where'
  | 'product'
  | 'sku'
  | 'po'
  | 'vendor'
  | 'tracking'
  | 'delivered'
  | 'shipBy'
  | 'shipped'
  | 'packer'
  | 'unboxed'
  | 'units'
  | 'detail';

export interface PastedListColumn extends LedgerGridColumnModel {
  key: PastedListColumnKey;
  type?: ColumnType;
  sortable?: boolean;
  tier?: 'core' | 'optional';
}

/** One row: the bar's view of the number — its facts ride the locate answer (`entry.facts`). */
export interface PastedListRow {
  view: BulkRowView;
  /** Times the paste carried this number, when more than once (`BulkList.repeats`). */
  repeats?: number;
}

/**
 * Every column the sheet knows. The ten default tracks are the Receiving read
 * (the dense ceiling); the Fulfillment facts are `tier: 'optional'` and mount
 * when a number in the list carries them ({@link pastedListMountedColumns}).
 */
export const PASTED_LIST_COLUMNS: readonly PastedListColumn[] = [
  { key: 'pos', width: 'minmax(2.25rem, 2.25rem)', label: 'Pasted position', gridLabel: '#', type: 'number', align: 'end', frozen: true },
  { key: 'ref', width: 'minmax(11rem, 11rem)', label: 'Number', gridLabel: 'Number', type: 'id', frozen: true },
  { key: 'where', width: 'minmax(9.5rem, 9.5rem)', label: 'Status', gridLabel: 'Status', type: 'tag', sortable: true },
  { key: 'product', width: 'minmax(16rem, 16rem)', label: 'Product title', gridLabel: 'Product title', type: 'text', sortable: false },
  { key: 'sku', width: 'minmax(7rem, 7rem)', label: 'SKU', gridLabel: 'SKU', type: 'text', sortable: false, tier: 'optional', headerForceLabel: true },
  { key: 'po', width: 'minmax(6rem, 6rem)', label: 'PO', gridLabel: 'PO', type: 'text', sortable: false, headerForceLabel: true },
  { key: 'vendor', width: 'minmax(8rem, 8rem)', label: 'Vendor', gridLabel: 'Vendor', type: 'text', sortable: false },
  { key: 'tracking', width: 'minmax(10rem, 10rem)', label: 'Tracking', gridLabel: 'Tracking', type: 'text', sortable: false, tier: 'optional' },
  { key: 'delivered', width: 'minmax(7.75rem, 7.75rem)', label: 'Delivered', gridLabel: 'Delivered', type: 'date', sortable: false, headerForceLabel: true },
  { key: 'shipBy', width: 'minmax(5.5rem, 5.5rem)', label: 'Ship by', gridLabel: 'Ship by', type: 'date', sortable: false, tier: 'optional', headerForceLabel: true },
  { key: 'shipped', width: 'minmax(7.75rem, 7.75rem)', label: 'Shipped', gridLabel: 'Shipped', type: 'date', sortable: false, tier: 'optional', headerForceLabel: true },
  { key: 'packer', width: 'minmax(8rem, 8rem)', label: 'Packed by', gridLabel: 'Packer', type: 'text', sortable: false, tier: 'optional' },
  { key: 'unboxed', width: 'minmax(13rem, 13rem)', label: 'Unboxed', gridLabel: 'Unboxed', type: 'text', sortable: false },
  { key: 'units', width: 'minmax(4rem, 4rem)', label: 'Units counted / bought', gridLabel: 'Units', type: 'number', align: 'end', sortable: false, headerForceLabel: true },
  // The last fact absorbs the sheet's slack (no structural filler: ten default tracks is the dense ceiling).
  { key: 'detail', width: 'minmax(18rem, 1fr)', label: 'Why · carrier · follow-up', gridLabel: 'Detail', type: 'text', sortable: false },
];

/** Always mounted — what every number has, whichever section holds it. */
const STRUCTURAL: ReadonlySet<PastedListColumnKey> = new Set(['pos', 'ref', 'where', 'product', 'detail']);

/**
 * The columns this list mounts: the structural five, plus each fact column
 * some number in the WHOLE list carries (not the filtered rows — a chip or a
 * find never makes columns jump). An inbound list reads PO · Vendor ·
 * Delivered · Unboxed · Units; an outbound one SKU · Tracking · Ship by ·
 * Shipped · Packer.
 */
export function pastedListMountedColumns(rows: readonly PastedListRow[]): PastedListColumn[] {
  return PASTED_LIST_COLUMNS.filter(
    (column) => STRUCTURAL.has(column.key) || rows.some((row) => pastedListCellText(row, column.key) !== ''),
  );
}

/** Where the sheet's column layout (widths, freeze) persists per browser. */
export const PASTED_LIST_LAYOUT_KEY = 'cf:sheet-columns:pasted-list';

function factsOf(row: PastedListRow): NavLocateFacts | null {
  return row.view.entry.facts ?? null;
}

/** The product a number is about: its facts' title (+ how many more receiving lines), else the locate answer's title. */
function productOf(row: PastedListRow): string {
  const facts = factsOf(row);
  if (!facts) return row.view.entry.title ?? '';
  if (!facts.title) return '';
  return facts.section === 'inbound' && facts.lines > 1 ? `${facts.title} +${facts.lines - 1}` : facts.title;
}

const day = (value: string | null | undefined): string => (value ? shortDay(value) : '');
/** An instant as the house's dense ledger face, warehouse time: "Sep 9, 2:14 PM". */
const instant = (value: string | null | undefined): string => (value ? formatMonthDayTimePST(value) : '');

const DAY_MS = 86_400_000;

/** Whole days a number has sat delivered and not unboxed (dock-to-stock), or null when that is not its state. */
export function deliveredWaitDays(row: PastedListRow, now: number = Date.now()): number | null {
  const facts = factsOf(row);
  if (!facts?.deliveredAt || facts.unboxedAt) return null;
  const at = Date.parse(facts.deliveredAt);
  return Number.isFinite(at) ? Math.max(0, Math.floor((now - at) / DAY_MS)) : null;
}

/** How many times the paste carried this number (1 = once; the list keeps one row). */
export function pastedTimes(row: PastedListRow): number {
  return row.repeats ?? 1;
}

/**
 * A cell as plain text — what the CSV export writes, what Find matches, what
 * a cut-off cell shows on hover, and whether a column mounts. One reading per
 * column, so they never disagree with the sheet.
 */
export function pastedListCellText(row: PastedListRow, key: PastedListColumnKey): string {
  const { entry, position, primary } = row.view;
  const facts = factsOf(row);
  switch (key) {
    case 'pos':
      return String(position);
    case 'ref':
      return entry.ref;
    case 'where':
      if (entry.pending) return 'Checking';
      return primary?.bucket.label ?? 'Not found';
    case 'product':
      return productOf(row);
    case 'sku':
      return facts?.sku ?? '';
    case 'po':
      return facts?.po ?? '';
    case 'vendor':
      return facts?.vendor ?? '';
    case 'tracking':
      return facts?.tracking ?? '';
    case 'delivered':
      return instant(facts?.deliveredAt);
    case 'shipBy':
      return day(facts?.shipBy);
    case 'shipped':
      return instant(facts?.shippedAt);
    case 'packer':
      return facts?.packer?.name ?? '';
    case 'unboxed':
      return facts?.unboxedAt ? [instant(facts.unboxedAt), facts.unboxedBy?.name].filter(Boolean).join(' · ') : '';
    case 'units':
      return facts?.units && (facts.units.expected != null || facts.units.received > 0)
        ? `${facts.units.received}/${facts.units.expected ?? '?'}`
        : '';
    case 'detail': {
      const wait = deliveredWaitDays(row);
      return [wait != null ? `${wait}d since delivered` : null, entry.detail].filter(Boolean).join(' · ');
    }
    default:
      return '';
  }
}

/** The header sort ↔ the list's one sort (`BulkListSort`): # = as pasted, Number = order id, Where = status. */
export const PASTED_LIST_SORT_BY: Readonly<Partial<Record<PastedListColumnKey, BulkListSort['by']>>> = {
  pos: 'pasted',
  ref: 'id',
  where: 'status',
};

export function isPastedListColumnSortable(key: string): key is PastedListColumnKey {
  return key in PASTED_LIST_SORT_BY;
}

/** Read-only, no selection, no day bands — a list to read and open from. */
export const PASTED_LIST_CAPABILITIES: GridSurfaceCapabilities = {
  rowTriageFlags: false,
  multiSelect: false,
  inCellEdit: false,
  dayBands: false,
};

export function makePastedListDescriptor(
  columns: readonly PastedListColumn[],
): GridSurfaceDescriptor<PastedListRow, PastedListColumn> {
  return makeGridSurfaceDescriptor<PastedListRow, PastedListColumn>(
    'pasted-list.full',
    columns,
    {
      isSortable: isPastedListColumnSortable,
      isLocked: (key) => columns.some((c) => c.key === key && c.frozen === true),
    },
    PASTED_LIST_CAPABILITIES,
  );
}

export function pastedListGridTemplate(columns: readonly PastedListColumn[] = PASTED_LIST_COLUMNS): string {
  return gridTemplate(columns);
}

export function pastedListFrozenLeft(columns: readonly PastedListColumn[], key: PastedListColumnKey): string {
  return gridFrozenLeft(columns, key);
}

const PASTED_LIST_DEFINITION = parseTableDefinition({
  id: 'pasted-list.full',
  tableId: 'pasted-list',
  entityFamily: 'pasted-list',
  cellMapKey: 'pasted-list',
  ariaLabel: 'Pasted numbers',
  testId: 'pasted-list-grid',
  surface: 'sheet',
  showDayHeaders: false,
  capabilities: PASTED_LIST_CAPABILITIES,
  columns: PASTED_LIST_COLUMNS,
});

export const PASTED_LIST_TABLE_BINDING: TableSurfaceBinding<PastedListRow, PastedListColumn> = {
  definition: PASTED_LIST_DEFINITION,
  columns: PASTED_LIST_COLUMNS,
  makeDescriptor: makePastedListDescriptor,
  recordPlane: { kind: 'navigate', reason: 'A pasted number opens its own record on its own desk (`recordHref`), or the list that holds it.' },
};
