/**
 * Pure row comparators for Pending grid column sorts (flat list).
 * Ties fall through to soonest deadline.
 */

import type { ShippedOrder } from '@/lib/neon/orders-queries';
import { resolveDisplayCarrier } from '@/lib/carrier-brand';
import { resolveMarketplacePlatformMeta } from '@/lib/marketplace-order-id';
import { shortageCoverageFromWire } from '@/lib/orders/shortage-coverage';
import { getDaysLateNullable } from '@/utils/date';
import type { QueueDisplaySortColumn, QueueDisplaySortDir } from '@/utils/queue-display-sort';
import { queueCarrierPin, queueChannelPin } from '@/utils/queue-display-sort';
import { resolveRowStatus, type OrdersQueueMode, type QueueRowRecord } from './helpers';

function deadlineTime(r: ShippedOrder): number {
  return new Date(r.deadline_at || r.created_at || 0).getTime();
}

function trackingValue(record: QueueRowRecord): string {
  const raw =
    (record.tracking_number as string | undefined) ||
    record.shipping_tracking_number ||
    '';
  return String(raw).trim();
}

function qtyValue(record: QueueRowRecord): number {
  const n = Number(record.quantity);
  return Number.isFinite(n) ? n : 0;
}

/** Queue "nobody" faces — treat as blank so they sort last. */
function personName(record: QueueRowRecord, keys: readonly string[]): string {
  for (const key of keys) {
    const raw = String(record[key] ?? '').trim();
    if (raw && raw !== '---') return raw;
  }
  return '';
}

function pickerName(record: QueueRowRecord): string {
  return personName(record, ['tested_by_name', 'tester_name']);
}

function packerName(record: QueueRowRecord): string {
  return personName(record, ['packed_by_name', 'packer_name']);
}

function amountValue(record: QueueRowRecord): number | null {
  const n = Number(record.sale_amount);
  return Number.isFinite(n) ? n : null;
}

function scannedOutMs(record: QueueRowRecord): number | null {
  const t = Date.parse(String(record.ship_confirmed_at ?? ''));
  return Number.isFinite(t) ? t : null;
}

/**
 * Order-column filled dot — Amazon vs eBay vs Walmart. Independent of the
 * tracking ring so an eBay order with Amazon TBA does not join an Amazon pin.
 */
function channelFace(record: ShippedOrder): { blank: boolean; label: string } {
  const platform = resolveMarketplacePlatformMeta(
    record.order_id,
    (record as QueueRowRecord).account_source,
  );
  if (!platform.value || !platform.label) return { blank: true, label: '' };
  return { blank: false, label: platform.label };
}

/**
 * Tracking-ring face — same ladder the tracking chip paints.
 */
function carrierFace(record: ShippedOrder): { blank: boolean; label: string } {
  const tracking = trackingValue(record as QueueRowRecord);
  const carrier = resolveDisplayCarrier(tracking, record.carrier);
  if (!carrier || carrier === 'Unknown') return { blank: true, label: '' };
  return { blank: false, label: carrier };
}

function compareBlankLast(aBlank: boolean, bBlank: boolean): number | null {
  if (aBlank || bBlank) {
    if (aBlank && bBlank) return 0;
    return aBlank ? 1 : -1;
  }
  return null;
}

/**
 * Same deadline source the Late cell uses (`useOrdersSpreadsheet` → `daysLate`).
 * Missing deadlines sort last in BOTH directions via ±Infinity (not a signed
 * magnitude that would invert under ASC).
 */
function daysLateValue(record: ShippedOrder, dir: QueueDisplaySortDir): number {
  const n = getDaysLateNullable(record.deadline_at || record.ship_by_date);
  if (n === null) return dir === 'asc' ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY;
  return n;
}

/**
 * URGENT rides above every other order (operator 2026-09-04: "make urgent rows
 * sort to the top").
 *
 * `orders.is_urgent` is the operator's expedite toggle, and it is a claim about
 * WHEN this row must be worked — which is the same question every sort on this
 * desk answers, only louder. So it is not one more sort key competing with the
 * others: it is a RANK applied before them, exactly like the carrier / channel
 * pin below, and for the same stated reason — flipping the direction must never
 * bury the rows an operator marked as the ones that cannot wait.
 *
 * The industry pattern this follows is priority ALLOCATION rather than a
 * decoration: a rush order is ranked ahead in picking and packing, not merely
 * tinted (Sellercloud rush services, Zentail / ecomdash warehouse priority).
 *
 * Ties inside the urgent set fall through to the normal comparison, so an
 * urgent block is itself ordered by whatever the operator sorted on.
 */
export function queueUrgentRank(record: QueueRowRecord): number {
  return record.is_urgent ? 0 : 1;
}

/**
 * Compare two queue rows for a column sort. Returns negative if `a` should
 * sort before `b` under the given direction (ASC: smaller first).
 */
export function compareQueueColumnRows(
  a: ShippedOrder,
  b: ShippedOrder,
  column: QueueDisplaySortColumn,
  dir: QueueDisplaySortDir,
  queueMode: OrdersQueueMode = 'fulfillment',
): number {
  const sign = dir === 'asc' ? 1 : -1;
  const ra = a as QueueRowRecord;
  const rb = b as QueueRowRecord;

  // Before the column, and never signed by `dir` — see `queueUrgentRank`.
  // Working queues only: on the Shipped lane the work is done, and pinning
  // there would reorder a history for no one.
  if (queueMode === 'fulfillment') {
    const urgent = queueUrgentRank(ra) - queueUrgentRank(rb);
    if (urgent !== 0) return urgent;
  }

  let primary = 0;

  switch (column) {
    case 'title':
      primary = String(ra.product_title || '').localeCompare(String(rb.product_title || ''), undefined, {
        sensitivity: 'base',
      });
      break;
    case 'age':
      // Sort on the same derived days-late number the Late cell shows.
      primary = daysLateValue(a, dir) - daysLateValue(b, dir);
      break;
    case 'qty':
      primary = qtyValue(ra) - qtyValue(rb);
      break;
    case 'order':
      primary = String(ra.order_id || '').localeCompare(String(rb.order_id || ''), undefined, {
        numeric: true,
        sensitivity: 'base',
      });
      break;
    case 'tracking': {
      const ta = trackingValue(ra);
      const tb = trackingValue(rb);
      // Empty tracking always last (both directions).
      if (!ta && !tb) primary = 0;
      else if (!ta) return 1;
      else if (!tb) return -1;
      else {
        primary = ta.localeCompare(tb, undefined, { numeric: true, sensitivity: 'base' });
      }
      break;
    }
    case 'picked': {
      const na = pickerName(ra);
      const nb = pickerName(rb);
      const blank = compareBlankLast(!na, !nb);
      if (blank !== null) return blank;
      primary = na.localeCompare(nb, undefined, { sensitivity: 'base' });
      break;
    }
    case 'packed': {
      const na = packerName(ra);
      const nb = packerName(rb);
      const blank = compareBlankLast(!na, !nb);
      if (blank !== null) return blank;
      primary = na.localeCompare(nb, undefined, { sensitivity: 'base' });
      break;
    }
    case 'status':
      primary = (resolveRowStatus(ra, queueMode)?.label ?? '').localeCompare(
        resolveRowStatus(rb, queueMode)?.label ?? '',
        undefined,
        { sensitivity: 'base' },
      );
      break;
    case 'amount': {
      const na = amountValue(ra);
      const nb = amountValue(rb);
      const blank = compareBlankLast(na == null, nb == null);
      if (blank !== null) return blank;
      primary = (na as number) - (nb as number);
      break;
    }
    case 'scanned_out': {
      const ta = scannedOutMs(ra);
      const tb = scannedOutMs(rb);
      const blank = compareBlankLast(ta == null, tb == null);
      if (blank !== null) return blank;
      primary = (ta as number) - (tb as number);
      break;
    }
    case 'coverage': {
      const ca = shortageCoverageFromWire(ra.shortage_coverage).label;
      const cb = shortageCoverageFromWire(rb.shortage_coverage).label;
      primary = ca.localeCompare(cb, undefined, { sensitivity: 'base' });
      break;
    }
    case 'carrier': {
      const ca = carrierFace(a);
      const cb = carrierFace(b);
      const blank = compareBlankLast(ca.blank, cb.blank);
      if (blank !== null) return blank;
      primary = ca.label.localeCompare(cb.label, undefined, { sensitivity: 'base' });
      break;
    }
    default: {
      const channelPin = queueChannelPin(column);
      const carrierPin = queueCarrierPin(column);
      const pin = channelPin ?? carrierPin;
      const faceOf = channelPin ? channelFace : carrierFace;
      if (pin) {
        const ca = faceOf(a);
        const cb = faceOf(b);
        const blank = compareBlankLast(ca.blank, cb.blank);
        if (blank !== null) return blank;
        const aPin = ca.label === pin;
        const bPin = cb.label === pin;
        // Pin rank never follows `dir` — flipping would bury the name the
        // operator just chose. Remaining faces still A–Z / Z–A.
        if (aPin !== bPin) return (aPin ? 0 : 1) - (bPin ? 0 : 1);
        primary = ca.label.localeCompare(cb.label, undefined, { sensitivity: 'base' });
        break;
      }
      primary = 0;
    }
  }

  if (primary !== 0) return sign * primary;
  return deadlineTime(a) - deadlineTime(b);
}
