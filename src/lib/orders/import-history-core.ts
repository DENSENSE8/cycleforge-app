/**
 * Import records, per civil day — the PURE half.
 *
 * "What did we import on the 2nd?" is a question about `orders.created_at`, not
 * about a new record type: every ingest path (Google Sheets, Ecwid, eBay, Zoho,
 * CSV, hand entry) already stamps the row and names itself in
 * `orders.account_source`. So this module needs no table of its own — it is day
 * arithmetic plus the grouping the grid's day bands consume.
 *
 * Split from the `tenantQuery` read (`./import-history`) the same way
 * `auto-cage-core` is split from `auto-cage`: the arithmetic is where the bugs
 * live, and it must be testable without a database.
 *
 * Every "day" here is a CIVIL day in `WAREHOUSE_TIME_ZONE` — an import at
 * 17:30 Pacific belongs to that Pacific day, not to whatever UTC calls it.
 */

import { addDaysToDateKey, getCurrentPSTDateKey, parseDateKey } from '@/utils/date';
import type { ShippedOrder } from '@/types/orders';

/** An inclusive civil-day window. `from === to` is a single day. */
export interface ImportDayRange {
  from: string;
  to: string;
}

/**
 * One imported order, as the read returns it.
 *
 * Deliberately narrow: this is the provenance question, so it carries what the
 * grid prints plus WHERE the row came from and WHEN. Facts a fresh import
 * cannot have (tester, packer, bench) are absent rather than nulled here — the
 * adapter below is what states them as null for the queue shape.
 */
export interface ImportedOrderRecord {
  id: number;
  orderNumber: string | null;
  productTitle: string | null;
  sku: string | null;
  itemNumber: string | null;
  condition: string | null;
  quantity: string | null;
  trackingNumber: string | null;
  accountSource: string | null;
  /** Instant. `importDayKey` is its civil day, computed by SQL in the read. */
  createdAt: string | null;
  importDayKey: string;
}

/** Today in the warehouse's civil zone — the anchor every offset counts from. */
export function importHistoryToday(): string {
  return getCurrentPSTDateKey();
}

/**
 * The single day `dayOffset` steps back from `anchor`.
 *
 * Offsets are NEGATIVE-going and clamped at zero, matching the house week
 * steppers (`weekNav` disables forward travel at `weekOffset === 0`): there is
 * no import record for tomorrow, so the control must not offer to look.
 */
export function importDayRangeForOffset(
  dayOffset: number,
  anchor: string = importHistoryToday(),
): ImportDayRange {
  const safeAnchor = parseDateKey(anchor) ? anchor : importHistoryToday();
  const back = Math.max(0, Math.floor(dayOffset));
  const day = addDaysToDateKey(safeAnchor, -back);
  return { from: day, to: day };
}

/**
 * Normalize an operator-picked range: order the ends, clamp the future away,
 * and reject anything that is not a date key.
 *
 * The calendar can hand back `to` before `from` (drag right-to-left) and a
 * `to` in the future (pick a month, click the 31st). Both are honest gestures
 * and neither should reach SQL.
 */
export function normalizeImportDayRange(
  range: { from?: string | null; to?: string | null },
  anchor: string = importHistoryToday(),
): ImportDayRange | null {
  const safeAnchor = parseDateKey(anchor) ? anchor : importHistoryToday();
  const from = range.from && parseDateKey(range.from) ? range.from : null;
  const to = range.to && parseDateKey(range.to) ? range.to : null;
  if (!from && !to) return null;
  // One end picked means a single day — the other end is the same day, never
  // "everything since", which is how a one-click pick turns into a full scan.
  const lo = from ?? to!;
  const hi = to ?? from!;
  const ordered: ImportDayRange = lo <= hi ? { from: lo, to: hi } : { from: hi, to: lo };
  return {
    from: ordered.from > safeAnchor ? safeAnchor : ordered.from,
    to: ordered.to > safeAnchor ? safeAnchor : ordered.to,
  };
}

/** How many days a range covers, inclusive. A single day is 1. */
export function importDayRangeLength(range: ImportDayRange): number {
  const from = parseDateKey(range.from);
  const to = parseDateKey(range.to);
  if (!from || !to) return 0;
  const ms = Date.UTC(to.y, to.m - 1, to.d) - Date.UTC(from.y, from.m - 1, from.d);
  return Math.floor(ms / 86_400_000) + 1;
}

/**
 * Records → the grid's day bands, newest day first, each day newest-first.
 *
 * Shaped for `LedgerGrid`'s `[date, rows][]` banding (`showDayHeaders`), which
 * is the same list shape Unbox / Shipped / FBA / Testing history already band
 * on — so a per-day import record is the house's existing history display, not
 * a report widget.
 *
 * A day the operator asked for but nothing landed on is NOT synthesized here:
 * an empty band would claim "we looked and there were zero" in a list whose
 * other bands mean "here is what happened", and the surface says that once, in
 * its empty state, rather than once per day.
 */
export function groupImportedOrdersByDay(
  records: readonly ImportedOrderRecord[],
): [string, ImportedOrderRecord[]][] {
  const byDay = new Map<string, ImportedOrderRecord[]>();
  for (const record of records) {
    const day = record.importDayKey;
    if (!day) continue;
    const bucket = byDay.get(day);
    if (bucket) bucket.push(record);
    else byDay.set(day, [record]);
  }
  return [...byDay.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([day, rows]) => [day, [...rows].sort((a, b) => b.id - a.id)] as [string, ImportedOrderRecord[]]);
}

/** Per-source tally for a day's band — "11 from Google Sheets, 4 from Ecwid". */
export function importSourceTally(
  records: readonly ImportedOrderRecord[],
): { source: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const record of records) {
    const source = (record.accountSource ?? '').trim() || 'unknown';
    counts.set(source, (counts.get(source) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([source, count]) => ({ source, count }))
    .sort((a, b) => b.count - a.count || a.source.localeCompare(b.source));
}

/**
 * Imported record → the outbound queue grid's row shape.
 *
 * The THIRD adapter of this kind, after `cagedRecordToQueueRow` and
 * `exceptionRowToQueueRow`, and it exists for their reason: the desk has ONE
 * grid, and a queue that asks a different QUESTION over the same orders renders
 * in it rather than in a table of its own. "What arrived on the 2nd" is such a
 * question.
 *
 * Tester / packer / bench / ship-by are null as a STATEMENT OF FACT — this view
 * looks at the moment of arrival, before any of that existed — and the grid
 * prints an em-dash for each, which is the honest reading.
 */
export function importedOrderToQueueRow(record: ImportedOrderRecord): ShippedOrder {
  return {
    id: record.id,
    order_id: record.orderNumber ?? '',
    product_title: record.productTitle ?? '',
    quantity: record.quantity ?? null,
    item_number: record.itemNumber ?? null,
    condition: record.condition ?? '',
    sku: record.sku ?? '',
    serial_number: '',
    shipping_tracking_number: record.trackingNumber,
    tracking_number: record.trackingNumber,
    shipment_id: null,
    deadline_at: null,
    ship_by_date: null,
    tester_id: null,
    tested_by: null,
    test_date_time: null,
    packer_id: null,
    packed_by: null,
    packed_at: null,
    account_source: record.accountSource ?? null,
    created_at: record.createdAt ?? null,
    has_tech_scan: false,
    is_out_of_stock: false,
    is_urgent: false,
  } as unknown as ShippedOrder;
}
