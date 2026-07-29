/**
 * Pure row comparators for Pending grid column sorts (flat list).
 * Ties fall through to soonest deadline.
 */

import { CONDITION_GRADES, resolveConditionGrade } from '@/lib/conditions';
import type { ShippedOrder } from '@/lib/neon/orders-queries';
import type { QueueDisplaySortColumn, QueueDisplaySortDir } from '@/utils/queue-display-sort';
import {
  queueRowShipBySource,
  type QueueRowRecord,
} from './helpers';

const CONDITION_RANK = new Map<string, number>(
  CONDITION_GRADES.map((g, i) => [g, i]),
);

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

function conditionRank(raw: string | null | undefined): number {
  const grade = resolveConditionGrade(raw);
  const idx = CONDITION_RANK.get(grade);
  // Unknown grades sort after the known ladder.
  return idx ?? CONDITION_GRADES.length;
}

function qtyValue(record: QueueRowRecord): number {
  const n = Number(record.quantity);
  return Number.isFinite(n) ? n : 0;
}

function shipByTime(record: ShippedOrder): number {
  const src = queueRowShipBySource(record);
  return src ? new Date(src).getTime() : Number.POSITIVE_INFINITY;
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
    case 'sla':
      // Sort on the ABSOLUTE ship-by, not on derived lateness — ascending
      // already IS most-overdue-first (an overdue row has an earlier ship-by),
      // and it keeps the sort key identical to the value the cell displays,
      // including the `created_at` fallback. Sorting on `getDaysLateNullable`
      // instead would rank a fallback row as "never late" while the cell shows
      // it a date, so the column would order by something it doesn't show.
      primary = shipByTime(a) - shipByTime(b);
      break;
    case 'qty':
      primary = qtyValue(ra) - qtyValue(rb);
      break;
    case 'condition':
      primary = conditionRank(String(ra.condition ?? '')) - conditionRank(String(rb.condition ?? ''));
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
