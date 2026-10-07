/**
 * `pasted-list.full` — the located-records sheet's table: one row per record
 * and every fact the house holds about it, one fact per column, a
 * Google-Sheets read (owner 2026-10-04): the identifier frozen, single-line
 * cells, columns the staffer resizes / fits / freezes (`useSheetColumns`).
 * Display method: DataTable, HIGH — hundreds of rows × 10 compared facts at a
 * desk. Column sets: Records' ({@link RECORDS_COLUMN_SET} — the pasted list
 * and Fulfilled are ways of filling it) and the pasted list's
 * ({@link PASTED_LIST_COLUMN_SET}, also Purchasing's).
 */

import { makeGridSurfaceDescriptor, type GridSurfaceCapabilities, type GridSurfaceDescriptor, type LedgerGridColumnModel } from '@/design-system/components/grid';
import { gridFrozenLeft, gridFrozenRight, gridTemplate } from '@/design-system/components/grid/grid-column-geometry';
import {
  CARRIER_STATUS,
  INBOUND_INTERNAL_STATUS,
  OUTBOUND_INTERNAL_STATUS,
  leadStatus,
  type InboundInternalStatus,
  type OutboundInternalStatus,
  type RecordStatusSpec,
} from '@/lib/status/record-status';
import type { TableSurfaceBinding } from '@/components/tables/table-surface-binding';
import { parseTableDefinition } from '@/lib/tables/table-definition';
import type { ColumnType } from '@/lib/tables/table-columns';
import type { BulkRowView } from '@/components/sidebar/contextual/bulk-list-view';
import type { NavLocateFacts } from '@/lib/nav/context/schema';
import { shortDay } from '@/lib/receiving/pasted-number-facts';
import { FULFILLED_SCAN_LABEL } from '@/lib/outbound/fulfilled-params';
import { FULFILLED_BUCKETS } from '@/lib/nav/locate/bucket-precedence';
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
  // Records (`RECORDS_COLUMNS`) — one line of an inbound or outbound order.
  | 'order'
  | 'channel'
  | 'scannedOutBy'
  | 'carrier'
  | 'lastEvent'
  | 'item'
  | 'qty'
  | 'orderTotal'
  | 'service'
  | 'eta'
  | 'select'
  | 'type'
  | 'unitPrice'
  | 'lineTotal'
  | 'party'
  | 'placed'
  | 'pickedBy'
  | 'unboxedBy'
  | 'receivedBy'
  | 'owner'
  | 'note'
  | 'internal'
  | 'external'
  // The Fulfilled journey (`GET /api/nav/fulfilled` lines carry it): the order's bucket, its clock
  // (time there against its threshold, `journeyClockFace`), how it left, its label, polls and claim.
  | 'journey'
  | 'clock'
  | 'scanSource'
  | 'firstScan'
  | 'transitDays'
  | 'labelCreated'
  | 'labelCost'
  | 'attempts'
  | 'exceptionCode'
  | 'lastPoll'
  | 'shipstationStatus'
  | 'returnRef'
  | 'claimBy'
  // The record's import instant (`facts.importedAt`).
  | 'imported';

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
  /**
   * A condensed grain's HEAD (Records per order / item / product): the group's
   * key, every line it holds (the head paints the first), and whether its
   * lines are open beneath it.
   */
  group?: { key: string; lines: readonly PastedListRow[]; open: boolean };
  /** One line shown under its open head — read-only, never selected on its own. */
  member?: boolean;
}

/**
 * The located-records catalog the table definition (`pasted-list.full`)
 * declares — the old pasted list's tracks. Every live sheet mounts its own
 * set (Records, Purchasing).
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
  // The carrier's side of an outbound package (the locator's `facts`): who carries it, what it last said, where and when, and its ETA.
  { key: 'carrier', width: 'minmax(5rem, 5rem)', label: 'Carrier', gridLabel: 'Carrier', type: 'text', sortable: false, tier: 'optional' },
  { key: 'lastEvent', width: 'minmax(16rem, 16rem)', label: 'Carrier status', gridLabel: 'Carrier status', type: 'text', sortable: false, tier: 'optional' },
  { key: 'eta', width: 'minmax(5.5rem, 5.5rem)', label: 'Estimated delivery', gridLabel: 'ETA', type: 'date', sortable: false, tier: 'optional', headerForceLabel: true },
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
  /** The surface's grid capabilities; default {@link PASTED_LIST_CAPABILITIES} (read-only, no selection). */
  capabilities?: GridSurfaceCapabilities;
}

/** The pasted list's (and Purchasing's) columns: the structural five plus every fact some record carries. */
export const PASTED_LIST_COLUMN_SET: PastedListColumnSet = { all: PASTED_LIST_COLUMNS, mount: pastedListMountedColumns };

/**
 * The Records sheet (`/records`, handoff 2026-10-06 §4; Fulfilled paints it
 * too, operator 2026-10-07): one row per LINE of an inbound or outbound
 * order. Select · Order # · Tracking are the frozen identity pane (left);
 * Internal | External are the trailing pane pinned RIGHT on every row, in
 * that order, whatever the Type filter (operator ruling §2.7). The Fulfilled
 * journey's tracks (Journey, Clock, Scan source, Label …, Check-in) mount
 * only when the loaded lines carry them (`RECORDS_COLUMN_SET.mount`). The
 * carrier's last word absorbs the slack.
 */
export const RECORDS_COLUMNS: readonly PastedListColumn[] = [
  { key: 'select', width: 'minmax(2rem, 2rem)', label: 'Select', type: 'text', sortable: false, frozen: true },
  { key: 'order', width: 'minmax(8.5rem, 8.5rem)', label: 'Order number', gridLabel: 'Order #', type: 'id', frozen: true, headerForceLabel: true },
  { key: 'tracking', width: 'minmax(8rem, 8rem)', label: 'Tracking', gridLabel: 'Tracking', type: 'tracking', frozen: true },
  { key: 'type', width: 'minmax(5.5rem, 5.5rem)', label: 'Type', gridLabel: 'Type', type: 'tag', headerForceLabel: true },
  { key: 'journey', width: 'minmax(8rem, 8rem)', label: 'Journey', gridLabel: 'Journey', type: 'tag', headerForceLabel: true },
  // Time in the journey bucket against its threshold.
  { key: 'clock', width: 'minmax(6rem, 6rem)', label: 'Clock', gridLabel: 'Clock', type: 'text', headerForceLabel: true },
  { key: 'item', width: 'minmax(16rem, 16rem)', label: 'Item', gridLabel: 'Item', type: 'text' },
  { key: 'sku', width: 'minmax(7rem, 7rem)', label: 'SKU', gridLabel: 'SKU', type: 'text', headerForceLabel: true },
  { key: 'qty', width: 'minmax(3.5rem, 3.5rem)', label: 'Quantity', gridLabel: 'Qty', type: 'number', align: 'end', headerForceLabel: true },
  { key: 'unitPrice', width: 'minmax(5.5rem, 5.5rem)', label: 'Unit price', gridLabel: 'Unit', type: 'number', align: 'end', headerForceLabel: true },
  { key: 'lineTotal', width: 'minmax(6rem, 6rem)', label: 'Line total', gridLabel: 'Line total', type: 'number', align: 'end', headerForceLabel: true },
  { key: 'orderTotal', width: 'minmax(6rem, 6rem)', label: 'Order total', gridLabel: 'Order total', type: 'number', align: 'end', headerForceLabel: true },
  { key: 'channel', width: 'minmax(6.5rem, 6.5rem)', label: 'Platform', gridLabel: 'Platform', type: 'text' },
  { key: 'party', width: 'minmax(9rem, 9rem)', label: 'Buyer / vendor', gridLabel: 'Buyer / vendor', type: 'text' },
  { key: 'placed', width: 'minmax(7.75rem, 7.75rem)', label: 'Placed', gridLabel: 'Placed', type: 'date', headerForceLabel: true },
  { key: 'imported', width: 'minmax(7.75rem, 7.75rem)', label: 'Imported', gridLabel: 'Imported', type: 'date', headerForceLabel: true },
  { key: 'shipBy', width: 'minmax(5.5rem, 5.5rem)', label: 'Ship by', gridLabel: 'Ship by', type: 'date', headerForceLabel: true },
  // "… by" = when, then who ("Oct 6, 2:14 PM · (avatar) Kai").
  { key: 'pickedBy', width: 'minmax(12.5rem, 12.5rem)', label: 'Picked by', gridLabel: 'Picked by', type: 'text', headerForceLabel: true },
  { key: 'packer', width: 'minmax(12.5rem, 12.5rem)', label: 'Packed by', gridLabel: 'Packed by', type: 'text', headerForceLabel: true },
  { key: 'scannedOutBy', width: 'minmax(12.5rem, 12.5rem)', label: 'Scanned out by', gridLabel: 'Scanned out by', type: 'text', headerForceLabel: true },
  { key: 'scanSource', width: 'minmax(6rem, 6rem)', label: 'Scan source', gridLabel: 'Scan', type: 'text', headerForceLabel: true },
  { key: 'unboxedBy', width: 'minmax(12.5rem, 12.5rem)', label: 'Unboxed by', gridLabel: 'Unboxed by', type: 'text', headerForceLabel: true },
  { key: 'receivedBy', width: 'minmax(12.5rem, 12.5rem)', label: 'Received by', gridLabel: 'Received by', type: 'text', headerForceLabel: true },
  { key: 'carrier', width: 'minmax(5rem, 5rem)', label: 'Carrier', gridLabel: 'Carrier', type: 'text' },
  { key: 'service', width: 'minmax(8rem, 8rem)', label: 'Carrier service', gridLabel: 'Service', type: 'text' },
  { key: 'labelCreated', width: 'minmax(7.75rem, 7.75rem)', label: 'Label created', gridLabel: 'Label created', type: 'date', headerForceLabel: true },
  { key: 'labelCost', width: 'minmax(5rem, 5rem)', label: 'Label cost', gridLabel: 'Label $', type: 'number', align: 'end', headerForceLabel: true },
  { key: 'firstScan', width: 'minmax(7.75rem, 7.75rem)', label: 'First carrier scan', gridLabel: 'First scan', type: 'date', headerForceLabel: true },
  { key: 'transitDays', width: 'minmax(4.5rem, 4.5rem)', label: 'Days in transit', gridLabel: 'Transit', type: 'number', align: 'end', headerForceLabel: true },
  { key: 'eta', width: 'minmax(5.5rem, 5.5rem)', label: 'Estimated delivery', gridLabel: 'ETA', type: 'date', headerForceLabel: true },
  { key: 'delivered', width: 'minmax(7.75rem, 7.75rem)', label: 'Delivered', gridLabel: 'Delivered', type: 'date', headerForceLabel: true },
  { key: 'attempts', width: 'minmax(4.5rem, 4.5rem)', label: 'Delivery attempts', gridLabel: 'Attempts', type: 'number', align: 'end', headerForceLabel: true },
  { key: 'exceptionCode', width: 'minmax(7rem, 7rem)', label: 'Exception code', gridLabel: 'Exception', type: 'text' },
  { key: 'claimBy', width: 'minmax(6rem, 6rem)', label: 'Carrier claim by', gridLabel: 'Claim by', type: 'date', headerForceLabel: true },
  { key: 'lastPoll', width: 'minmax(9rem, 9rem)', label: 'Last carrier poll', gridLabel: 'Last poll', type: 'date', headerForceLabel: true },
  { key: 'shipstationStatus', width: 'minmax(7rem, 7rem)', label: 'ShipStation status', gridLabel: 'ShipStation', type: 'text' },
  { key: 'returnRef', width: 'minmax(7rem, 7rem)', label: 'Return', gridLabel: 'Return', type: 'text' },
  { key: 'owner', width: 'minmax(8rem, 8rem)', label: 'Owner', gridLabel: 'Owner', type: 'text', headerForceLabel: true },
  { key: 'note', width: 'minmax(14rem, 14rem)', label: 'Last note', gridLabel: 'Last note', type: 'text' },
  { key: 'lastEvent', width: 'minmax(16rem, 1fr)', label: 'Last carrier event', gridLabel: 'Last carrier event', type: 'text' },
  { key: 'internal', width: 'minmax(7.5rem, 7.5rem)', label: 'Internal status', gridLabel: 'Internal', type: 'tag', frozenEnd: true, headerForceLabel: true },
  { key: 'external', width: 'minmax(7.5rem, 7.5rem)', label: 'External status', gridLabel: 'External', type: 'tag', frozenEnd: true, headerForceLabel: true },
];

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
/** A "… by" cell as text — when, then who (the row's face, `StaffAt`); '' when nobody did it. */
const staffAt = (staff: { name: string | null } | null | undefined, at: string | null | undefined): string =>
  staff?.name ? [instant(at), staff.name].filter(Boolean).join(' · ') : '';

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

/** The carrier's last word for a shipped record: its last event + when, or "Not polled" for an unpolled carrier (journey Untracked); '' when the source says nothing. */
export function lastCarrierEventText(row: PastedListRow): string {
  const facts = factsOf(row);
  if (facts?.lastEvent === undefined) return '';
  if (facts.journey === 'untracked') return 'Not polled';
  const label = facts.lastEvent?.label ?? null;
  const status = facts.lastEvent?.status ?? null;
  // The plain word leads ("In transit · We Have Your Package") unless the carrier's own words already say it.
  const word = status && !label?.toLowerCase().includes(status.toLowerCase()) ? status : null;
  return [word, label, facts.lastEventPlace, instant(facts.lastEvent?.at)].filter(Boolean).join(' · ');
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
  // A condensed grain's head sums its lines' quantity and money; every other fact is its first line's.
  if (row.group && (key === 'qty' || key === 'lineTotal')) {
    const values = row.group.lines.map((line) => (key === 'qty' ? line.view.entry.facts?.qty : line.view.entry.facts?.lineTotal));
    if (values.every((value) => value == null)) return '';
    const sum = values.reduce<number>((total, value) => total + (value ?? 0), 0);
    return key === 'qty' ? count(sum) : money(sum);
  }
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
      return staffAt(facts?.packer, facts?.packedAt);
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
    case 'journey':
      return facts?.journey ? (FULFILLED_BUCKETS.find((bucket) => bucket.id === facts.journey)?.label ?? '') : '';
    case 'scannedOutBy':
      return staffAt(facts?.scannedOutBy, facts?.shippedAt);
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
    case 'orderTotal':
      return money(facts?.orderTotal);
    case 'scanSource':
      // A journey line always says how it left (none = never scanned out); a Records line does not know.
      return facts?.journey ? FULFILLED_SCAN_LABEL[facts.scanSource ?? 'none'] : '';
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
      // No attempt is no news: only a carrier that tried says so.
      return facts?.attempts ? String(facts.attempts) : '';
    case 'exceptionCode':
      return facts?.exceptionCode ?? '';
    case 'lastPoll':
      return facts?.lastPoll ? [instant(facts.lastPoll.at), facts.lastPoll.error ? `Failing: ${facts.lastPoll.error}` : null].filter(Boolean).join(' · ') : '';
    case 'shipstationStatus':
      return facts?.shipstationStatus ?? '';
    case 'returnRef':
      return facts?.returnRef ?? '';
    case 'claimBy':
      return day(facts?.claim?.closesAt);
    case 'imported':
      return instant(facts?.importedAt);
    case 'select':
      return '';
    case 'type':
      return facts?.direction ? RECORD_DIRECTION_LABEL[facts.direction] : '';
    case 'unitPrice':
      return money(facts?.unitPrice);
    case 'lineTotal':
      return money(facts?.lineTotal);
    case 'party':
      return (facts?.direction === 'inbound' ? facts.vendor : facts?.customer) ?? '';
    case 'placed':
      return instant(facts?.placedAt);
    case 'pickedBy':
      return staffAt(facts?.pickedBy, facts?.pickedAt);
    case 'unboxedBy':
      return staffAt(facts?.unboxedBy, facts?.unboxedAt);
    case 'receivedBy':
      return staffAt(facts?.receivedBy, facts?.receivedAt);
    case 'owner':
      return facts?.owner ? [facts.owner.name, facts.owner.dueAt ? `due ${instant(facts.owner.dueAt)}` : null].filter(Boolean).join(' · ') : '';
    case 'note':
      return facts?.lastNote ? [facts.lastNote.author, facts.lastNote.text].filter(Boolean).join(': ') : '';
    case 'internal':
      // A pasted number that matched nothing says so here (`detail` = "Not found").
      return recordStatusOf(row, 'internal')?.label ?? (facts ? '' : (entry.detail ?? ''));
    case 'external':
      return recordStatusOf(row, 'external')?.label ?? '';
    default:
      return '';
  }
}

/** A line's Type face (route-tree VOCABULARY `inbound` / `outbound`). */
const RECORD_DIRECTION_LABEL: Readonly<Record<'outbound' | 'inbound', string>> = { outbound: 'Outbound', inbound: 'Inbound' };

/**
 * A Records row's Internal or External status spec (`record-status.ts`), or
 * null for none. Internal reads the line's direction table; a condensed
 * grain's head paints the lead status over its lines of the first line's
 * direction, External the lead carrier status over all its lines
 * (`leadStatus`, several packages → the one that needs a person first).
 */
export function recordStatusOf(row: PastedListRow, axis: 'internal' | 'external'): RecordStatusSpec | null {
  const lines = row.group ? row.group.lines : [row];
  const lead = lines[0]?.view.entry.facts;
  if (!lead?.direction) return null;
  if (axis === 'external') {
    const key = leadStatus(CARRIER_STATUS, lines.flatMap((line) => line.view.entry.facts?.externalStatus ?? []));
    return key ? CARRIER_STATUS[key] : null;
  }
  const same = lines.flatMap((line) => {
    const facts = line.view.entry.facts;
    return facts && facts.direction === lead.direction && facts.internalStatus ? [facts.internalStatus] : [];
  });
  if (lead.direction === 'outbound') {
    const key = leadStatus(OUTBOUND_INTERNAL_STATUS, same.filter((status): status is OutboundInternalStatus => status in OUTBOUND_INTERNAL_STATUS));
    return key ? OUTBOUND_INTERNAL_STATUS[key] : null;
  }
  const key = leadStatus(INBOUND_INTERNAL_STATUS, same.filter((status): status is InboundInternalStatus => status in INBOUND_INTERNAL_STATUS));
  return key ? INBOUND_INTERNAL_STATUS[key] : null;
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
      return [text, facts?.itemNumber ? `Item number ${facts.itemNumber}` : null, facts?.sku ? `SKU ${facts.sku}` : null]
        .filter(Boolean)
        .join(' · ');
    case 'order':
      // A condensed grain's head names how many lines it holds; the copy stays the number.
      return row.group ? `${text} · ${row.group.lines.length} lines` : text;
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

/** Read-only, no selection, no day bands — a list to read and open from. */
export const PASTED_LIST_CAPABILITIES: GridSurfaceCapabilities = {
  rowTriageFlags: false,
  multiSelect: false,
  inCellEdit: false,
  dayBands: false,
};

/** The Records sheet: rows are checked (the selection dock) and Order # / Tracking edit in place. */
export const RECORDS_CAPABILITIES: GridSurfaceCapabilities = { ...PASTED_LIST_CAPABILITIES, multiSelect: true, inCellEdit: true };

/** Always mounted on Records: the check, the identifiers, what the line is, and its two statuses. */
const RECORDS_STRUCTURAL: Readonly<Partial<Record<PastedListColumnKey, true>>> = {
  select: true,
  order: true,
  tracking: true,
  type: true,
  item: true,
  internal: true,
  external: true,
};

/**
 * Records mounts what the LOADED list carries (operator 2026-10-07): an
 * all-inbound list never shows Ship by / Picked by / Packed by / Scanned out
 * by; an all-outbound one never shows Unboxed by / Received by. The rows are
 * the server's answer to the sidebar's filters, so a filter that changes the
 * mix changes the columns; Find (client-side) never does.
 */
export const RECORDS_COLUMN_SET: PastedListColumnSet = {
  all: RECORDS_COLUMNS,
  mount: (rows) =>
    RECORDS_COLUMNS.filter((column) => RECORDS_STRUCTURAL[column.key] || rows.some((row) => pastedListCellText(row, column.key) !== '')),
  capabilities: RECORDS_CAPABILITIES,
};

/** Which header keys sort, and which sort descending on their first press. Default: the pasted list's. */
export interface PastedListHeaderSort {
  isSortable: (key: string) => boolean;
  descFirst: (key: string) => boolean;
}

/** No header sorts unless the source declares its own (`columnSort`). */
const PASTED_LIST_HEADER_SORT: PastedListHeaderSort = { isSortable: () => false, descFirst: () => false };

export function makePastedListDescriptor(
  columns: readonly PastedListColumn[],
  headerSort: PastedListHeaderSort = PASTED_LIST_HEADER_SORT,
  capabilities: GridSurfaceCapabilities = PASTED_LIST_CAPABILITIES,
): GridSurfaceDescriptor<PastedListRow, PastedListColumn> {
  return makeGridSurfaceDescriptor<PastedListRow, PastedListColumn>(
    'pasted-list.full',
    columns,
    {
      isSortable: headerSort.isSortable,
      sortDescFirst: headerSort.descFirst,
      isLocked: (key) => columns.some((c) => c.key === key && (c.frozen === true || c.frozenEnd === true)),
    },
    capabilities,
  );
}

export function pastedListGridTemplate(columns: readonly PastedListColumn[] = PASTED_LIST_COLUMNS): string {
  return gridTemplate(columns);
}

export function pastedListFrozenLeft(columns: readonly PastedListColumn[], key: PastedListColumnKey): string {
  return gridFrozenLeft(columns, key);
}

export function pastedListFrozenRight(columns: readonly PastedListColumn[], key: PastedListColumnKey): string {
  return gridFrozenRight(columns, key);
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
