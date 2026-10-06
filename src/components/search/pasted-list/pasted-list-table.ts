/**
 * `pasted-list.full` — the located-records sheet's table: one row per record
 * and every fact the house holds about it, one fact per column, a
 * Google-Sheets read (owner 2026-10-04): the identifier frozen, single-line
 * cells, columns the staffer resizes / fits / freezes (`useSheetColumns`).
 * Display method: DataTable, HIGH — hundreds of rows × 10 compared facts at a
 * desk. Two column sets: the pasted list's ({@link PASTED_LIST_COLUMN_SET},
 * also Purchasing's) and Fulfilled's ({@link FULFILLED_COLUMNS}).
 */

import { makeGridSurfaceDescriptor, type GridSurfaceCapabilities, type GridSurfaceDescriptor, type LedgerGridColumnModel } from '@/design-system/components/grid';
import { gridFrozenLeft, gridTemplate } from '@/design-system/components/grid/grid-column-geometry';
import type { TableSurfaceBinding } from '@/components/tables/table-surface-binding';
import { parseTableDefinition } from '@/lib/tables/table-definition';
import type { ColumnType } from '@/lib/tables/table-columns';
import type { BulkListSort, BulkRowView } from '@/components/sidebar/contextual/bulk-list-view';
import type { NavLocateFacts } from '@/lib/nav/context/schema';
import { shortDay } from '@/lib/receiving/pasted-number-facts';
import { FULFILLED_SCAN_LABEL } from '@/lib/outbound/fulfilled-params';
import { journeyClockFace, journeyClockSpanText } from '@/lib/nav/fulfilled/journey-clock';
import { formatMonthDayTimePST } from '@/utils/date';
import { formatCurrency } from '@/utils/_number';

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
  | 'detail'
  // Fulfilled (`FULFILLED_COLUMNS`) — the outbound read of a shipped order.
  | 'order'
  | 'channel'
  // Time in the journey bucket against its threshold (`journeyClockFace`).
  | 'clock'
  | 'scannedOut'
  | 'scannedOutBy'
  | 'carrier'
  | 'lastEvent'
  | 'item'
  | 'qty'
  | 'customer'
  | 'orderTotal'
  | 'ordered'
  | 'packed'
  | 'scanSource'
  | 'firstScan'
  | 'transitDays'
  | 'service'
  | 'labelCreated'
  | 'labelCost'
  | 'eta'
  | 'attempts'
  | 'exceptionCode'
  | 'lastPoll'
  | 'channelStatus'
  | 'shipstationStatus'
  | 'packages'
  | 'returnRef'
  | 'claimBy';

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

/** The columns a sheet can paint, and which of them its list mounts. */
export interface PastedListColumnSet {
  /** Every column the sheet knows — Find matches over all of them. */
  all: readonly PastedListColumn[];
  /** The columns mounted for the WHOLE list (never the filtered rows — a chip or a find never makes columns jump). */
  mount: (rows: readonly PastedListRow[]) => readonly PastedListColumn[];
}

/** The pasted list's (and Purchasing's) columns: the structural five plus every fact some record carries. */
export const PASTED_LIST_COLUMN_SET: PastedListColumnSet = { all: PASTED_LIST_COLUMNS, mount: pastedListMountedColumns };

/**
 * Fulfilled (`/fulfilled`, Phase 1 report COLUMNS): the eleven `core` tracks are
 * the default read — Order · Channel · Status · Clock · Scanned out · By ·
 * Carrier · Tracking · Last event · Delivered · Item; every `optional` track
 * mounts when the staffer shows it (the sheet's Columns menu).
 */
export const FULFILLED_COLUMNS: readonly PastedListColumn[] = [
  { key: 'order', width: 'minmax(8.5rem, 8.5rem)', label: 'Order', gridLabel: 'Order', type: 'id', frozen: true, tier: 'core' },
  { key: 'channel', width: 'minmax(6.5rem, 6.5rem)', label: 'Platform', gridLabel: 'Platform', type: 'text', sortable: false, tier: 'core' },
  { key: 'where', width: 'minmax(9rem, 9rem)', label: 'Status', gridLabel: 'Status', type: 'tag', sortable: false, tier: 'core' },
  // The journey clock: time in the status against its threshold. Not sortable — the sheet's order is the server's.
  { key: 'clock', width: 'minmax(6rem, 6rem)', label: 'Clock', gridLabel: 'Clock', type: 'text', sortable: false, tier: 'core', headerForceLabel: true },
  { key: 'scannedOut', width: 'minmax(10rem, 10rem)', label: 'Scanned out', gridLabel: 'Scanned out', type: 'date', sortable: false, tier: 'core', headerForceLabel: true },
  { key: 'scannedOutBy', width: 'minmax(7.5rem, 7.5rem)', label: 'Scanned out by', gridLabel: 'By', type: 'text', sortable: false, tier: 'core', headerForceLabel: true },
  { key: 'carrier', width: 'minmax(5rem, 5rem)', label: 'Carrier', gridLabel: 'Carrier', type: 'text', sortable: false, tier: 'core' },
  { key: 'tracking', width: 'minmax(7.5rem, 7.5rem)', label: 'Tracking', gridLabel: 'Tracking', type: 'text', sortable: false, tier: 'core' },
  { key: 'lastEvent', width: 'minmax(14rem, 14rem)', label: 'Last carrier event', gridLabel: 'Last event', type: 'text', sortable: false, tier: 'core' },
  { key: 'delivered', width: 'minmax(7.75rem, 7.75rem)', label: 'Delivered', gridLabel: 'Delivered', type: 'date', sortable: false, tier: 'core', headerForceLabel: true },
  // The last default track absorbs the sheet's slack.
  { key: 'item', width: 'minmax(16rem, 1fr)', label: 'Item', gridLabel: 'Item', type: 'text', sortable: false, tier: 'core' },
  { key: 'sku', width: 'minmax(7rem, 7rem)', label: 'SKU', gridLabel: 'SKU', type: 'text', sortable: false, tier: 'optional', headerForceLabel: true },
  { key: 'qty', width: 'minmax(3.5rem, 3.5rem)', label: 'Quantity', gridLabel: 'Qty', type: 'number', align: 'end', sortable: false, tier: 'optional', headerForceLabel: true },
  { key: 'customer', width: 'minmax(9rem, 9rem)', label: 'Customer', gridLabel: 'Customer', type: 'text', sortable: false, tier: 'optional' },
  { key: 'orderTotal', width: 'minmax(6rem, 6rem)', label: 'Order total', gridLabel: 'Total', type: 'number', align: 'end', sortable: false, tier: 'optional', headerForceLabel: true },
  { key: 'ordered', width: 'minmax(7.75rem, 7.75rem)', label: 'Ordered', gridLabel: 'Ordered', type: 'date', sortable: false, tier: 'optional', headerForceLabel: true },
  { key: 'shipBy', width: 'minmax(5.5rem, 5.5rem)', label: 'Ship by', gridLabel: 'Ship by', type: 'date', sortable: false, tier: 'optional', headerForceLabel: true },
  { key: 'packed', width: 'minmax(7.75rem, 7.75rem)', label: 'Packed', gridLabel: 'Packed', type: 'date', sortable: false, tier: 'optional', headerForceLabel: true },
  { key: 'packer', width: 'minmax(7.5rem, 7.5rem)', label: 'Packed by', gridLabel: 'Packer', type: 'text', sortable: false, tier: 'optional' },
  { key: 'scanSource', width: 'minmax(6rem, 6rem)', label: 'Scan source', gridLabel: 'Scan', type: 'text', sortable: false, tier: 'optional', headerForceLabel: true },
  { key: 'firstScan', width: 'minmax(7.75rem, 7.75rem)', label: 'First carrier scan', gridLabel: 'First scan', type: 'date', sortable: false, tier: 'optional', headerForceLabel: true },
  { key: 'transitDays', width: 'minmax(4.5rem, 4.5rem)', label: 'Days in transit', gridLabel: 'Transit', type: 'number', align: 'end', sortable: false, tier: 'optional', headerForceLabel: true },
  { key: 'service', width: 'minmax(8rem, 8rem)', label: 'Carrier service', gridLabel: 'Service', type: 'text', sortable: false, tier: 'optional' },
  { key: 'labelCreated', width: 'minmax(7.75rem, 7.75rem)', label: 'Label created', gridLabel: 'Label created', type: 'date', sortable: false, tier: 'optional', headerForceLabel: true },
  { key: 'labelCost', width: 'minmax(5rem, 5rem)', label: 'Label cost', gridLabel: 'Label $', type: 'number', align: 'end', sortable: false, tier: 'optional', headerForceLabel: true },
  { key: 'eta', width: 'minmax(5.5rem, 5.5rem)', label: 'Estimated delivery', gridLabel: 'ETA', type: 'date', sortable: false, tier: 'optional', headerForceLabel: true },
  { key: 'attempts', width: 'minmax(4.5rem, 4.5rem)', label: 'Delivery attempts', gridLabel: 'Attempts', type: 'number', align: 'end', sortable: false, tier: 'optional', headerForceLabel: true },
  { key: 'exceptionCode', width: 'minmax(7rem, 7rem)', label: 'Exception code', gridLabel: 'Exception', type: 'text', sortable: false, tier: 'optional' },
  { key: 'lastPoll', width: 'minmax(9rem, 9rem)', label: 'Last carrier poll', gridLabel: 'Last poll', type: 'date', sortable: false, tier: 'optional', headerForceLabel: true },
  { key: 'channelStatus', width: 'minmax(7rem, 7rem)', label: 'Channel status', gridLabel: 'Channel status', type: 'text', sortable: false, tier: 'optional' },
  { key: 'shipstationStatus', width: 'minmax(7rem, 7rem)', label: 'ShipStation status', gridLabel: 'ShipStation', type: 'text', sortable: false, tier: 'optional' },
  { key: 'packages', width: 'minmax(4.5rem, 4.5rem)', label: 'Packages', gridLabel: 'Pkgs', type: 'number', align: 'end', sortable: false, tier: 'optional', headerForceLabel: true },
  { key: 'returnRef', width: 'minmax(7rem, 7rem)', label: 'Return', gridLabel: 'Return', type: 'text', sortable: false, tier: 'optional' },
  { key: 'claimBy', width: 'minmax(6rem, 6rem)', label: 'Carrier claim by', gridLabel: 'Claim by', type: 'date', sortable: false, tier: 'optional', headerForceLabel: true },
];

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

/** Every tracking number a record ships under: all of its packages' when it has several, else its one. */
export function trackingsOf(row: PastedListRow): readonly string[] {
  const facts = factsOf(row);
  if (facts?.trackings && facts.trackings.length > 1) return facts.trackings;
  return facts?.tracking ? [facts.tracking] : [];
}

/** Fulfilled's bucket for a tracked carrier the house never polls (USPS today) — its last event reads "Not polled". */
const UNTRACKED_BUCKET = 'untracked';

/** The carrier's last word for a shipped record: its last event + when, or "Not polled" for an unpolled carrier; '' when the source says nothing. */
export function lastCarrierEventText(row: PastedListRow): string {
  const facts = factsOf(row);
  if (facts?.lastEvent === undefined) return '';
  if (row.view.primary?.bucket.id === UNTRACKED_BUCKET) return 'Not polled';
  return [facts.lastEvent?.label, facts.lastEventPlace, instant(facts.lastEvent?.at)].filter(Boolean).join(' · ');
}

const count = (value: number | null | undefined): string => (value != null ? String(value) : '');
const money = (value: number | null | undefined): string => (value != null ? formatCurrency(value) : '');

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
      return trackingsOf(row).join(', ');
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
    case 'order':
      return entry.ref;
    case 'channel':
      return facts?.channel ?? '';
    case 'clock':
      return journeyClockSpanText(journeyClockFace(facts?.clock, Date.now()));
    case 'scannedOut':
      // Fulfilled always says how it left (null = never scanned out); absent = a source that does not know.
      if (facts?.scanSource === undefined) return '';
      if (facts.scanSource === null) return FULFILLED_SCAN_LABEL.none;
      return [instant(facts.shippedAt), facts.scanSource === 'backfill' ? FULFILLED_SCAN_LABEL.backfill : null].filter(Boolean).join(' · ');
    case 'scannedOutBy':
      return facts?.scannedOutBy?.name ?? '';
    case 'carrier':
      return facts?.carrier ?? '';
    case 'lastEvent': {
      const said = lastCarrierEventText(row);
      return said && facts?.lastPoll?.error ? `${said} · Poll failing` : said;
    }
    case 'item':
      if (!facts?.title) return '';
      return facts.lineCount != null && facts.lineCount > 1 ? `${facts.title} +${facts.lineCount - 1}` : facts.title;
    case 'qty':
      return count(facts?.qty);
    case 'customer':
      return facts?.customer ?? '';
    case 'orderTotal':
      return money(facts?.orderTotal);
    case 'ordered':
      return instant(facts?.orderedAt);
    case 'packed':
      return instant(facts?.packedAt);
    case 'scanSource':
      if (facts?.scanSource === undefined) return '';
      return FULFILLED_SCAN_LABEL[facts.scanSource ?? 'none'];
    case 'firstScan':
      return instant(facts?.firstScanAt);
    case 'transitDays':
      return facts?.transitDays != null ? `${Number.isInteger(facts.transitDays) ? facts.transitDays : facts.transitDays.toFixed(1)}d` : '';
    case 'service':
      return facts?.service ?? '';
    case 'labelCreated':
      return instant(facts?.labelCreatedAt);
    case 'labelCost':
      return money(facts?.labelCost);
    case 'eta':
      return day(facts?.eta);
    case 'attempts':
      return count(facts?.attempts);
    case 'exceptionCode':
      return facts?.exceptionCode ?? '';
    case 'lastPoll':
      return facts?.lastPoll ? [instant(facts.lastPoll.at), facts.lastPoll.error ? `Failing: ${facts.lastPoll.error}` : null].filter(Boolean).join(' · ') : '';
    case 'channelStatus':
      return facts?.channelStatus ?? '';
    case 'shipstationStatus':
      return facts?.shipstationStatus ?? '';
    case 'packages':
      return facts?.packages ? String(facts.packages) : '';
    case 'returnRef':
      return facts?.returnRef ?? '';
    case 'claimBy':
      return day(facts?.claim?.closesAt);
    default:
      return '';
  }
}

/**
 * What a cell says on hover — its text, plus what the column keeps off the
 * face: an item's SKU, why a carrier poll is failing, when a claim window
 * opens. The copy stays {@link pastedListCellText}.
 */
export function pastedListCellHint(row: PastedListRow, key: PastedListColumnKey): string {
  const text = pastedListCellText(row, key);
  const facts = factsOf(row);
  switch (key) {
    case 'item':
      return [text, facts?.sku ? `SKU ${facts.sku}` : null].filter(Boolean).join(' · ');
    case 'lastEvent':
      return facts?.lastPoll?.error ? `${text} — ${facts.lastPoll.error}` : text;
    case 'clock':
      return facts?.clock
        ? [text, `in this status since ${instant(facts.clock.since)}`, facts.clock.due ? `over at ${instant(facts.clock.due)}` : null]
            .filter(Boolean)
            .join(' · ')
        : text;
    case 'claimBy':
      return facts?.claim ? `Claim opens ${day(facts.claim.opensAt)}, closes ${day(facts.claim.closesAt)}` : text;
    default:
      return text;
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
