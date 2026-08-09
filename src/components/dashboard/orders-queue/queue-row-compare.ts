/**
 * Pure row comparators for Pending grid column sorts (flat list).
 * Ties fall through to soonest deadline.
 */

import type { ShippedOrder } from '@/lib/neon/orders-queries';
import { getDaysLateNullable } from '@/utils/date';
import type { QueueDisplaySortColumn, QueueDisplaySortDir } from '@/utils/queue-display-sort';
import type { QueueRowRecord } from './helpers';

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

/**
 * Same deadline source the Late cell uses (`OrdersGridHost` → `daysLate`).
 * Missing deadlines sort last in BOTH directions via ±Infinity (not a signed
 * magnitude that would invert under ASC).
 */
function daysLateValue(record: ShippedOrder, dir: QueueDisplaySortDir): number {
  const n = getDaysLateNullable(record.deadline_at || record.ship_by_date);
  if (n === null) return dir === 'asc' ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY;
  return n;
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
): number {
  const sign = dir === 'asc' ? 1 : -1;
  const ra = a as QueueRowRecord;
  const rb = b as QueueRowRecord;
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
    default:
      primary = 0;
  }

  if (primary !== 0) return sign * primary;
  return deadlineTime(a) - deadlineTime(b);
}
