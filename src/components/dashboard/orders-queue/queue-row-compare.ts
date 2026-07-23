/**
 * Pure row comparators for Pending grid column sorts (flat list).
 * Ties fall through to soonest deadline.
 */

import { CONDITION_GRADES, resolveConditionGrade } from '@/lib/conditions';
import { deriveFulfillmentState } from '@/lib/unshipped-state';
import { FULFILLMENT_STAGE_RANK } from '@/lib/order-lifecycle';
import type { ShippedOrder } from '@/lib/neon/orders-queries';
import { getDaysLateNullable } from '@/utils/date';
import { getOrderPlatformLabel } from '@/utils/order-platform';
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

function ageValue(record: ShippedOrder): number {
  const days = getDaysLateNullable(record.deadline_at as string | null | undefined);
  // No deadline → treat as least late (-1) so they sink under overdue rows on desc.
  return days ?? -1;
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
    case 'date':
      primary = shipByTime(a) - shipByTime(b);
      break;
    case 'age':
      primary = ageValue(a) - ageValue(b);
      break;
    case 'status': {
      const sa = deriveFulfillmentState({
        shipmentId: ra.shipment_id,
        hasTechScan: Boolean(ra.has_tech_scan),
        outOfStock: ra.out_of_stock as string | null | undefined,
      });
      const sb = deriveFulfillmentState({
        shipmentId: rb.shipment_id,
        hasTechScan: Boolean(rb.has_tech_scan),
        outOfStock: rb.out_of_stock as string | null | undefined,
      });
      primary = FULFILLMENT_STAGE_RANK[sa] - FULFILLMENT_STAGE_RANK[sb];
      break;
    }
    case 'qty':
      primary = qtyValue(ra) - qtyValue(rb);
      break;
    case 'condition':
      primary = conditionRank(String(ra.condition ?? '')) - conditionRank(String(rb.condition ?? ''));
      break;
    case 'platform':
      primary = getOrderPlatformLabel(ra.order_id, ra.account_source).localeCompare(
        getOrderPlatformLabel(rb.order_id, rb.account_source),
        undefined,
        { sensitivity: 'base' },
      );
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
