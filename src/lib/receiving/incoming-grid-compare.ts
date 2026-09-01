/**
 * Pure row comparators for Incoming LedgerGrid column sorts (flat list).
 * Ties fall through to id for stability.
 */

import { CONDITION_GRADES, resolveConditionGrade } from '@/lib/conditions';
import {
  displayTrackingNumber,
} from '@/lib/receiving/fulfillment-mode';
import {
  incomingRowDateSource,
  incomingSortFactFor,
  type IncomingGridColumnKey,
} from '@/lib/receiving/receiving-grid-layout';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';
import { getDaysLateNullable } from '@/utils/date';
import type { GridSortDir } from '@/design-system/components/grid/grid-sort-dir';

const CONDITION_RANK = new Map<string, number>(
  CONDITION_GRADES.map((g, i) => [g, i]),
);

/**
 * Client-safe urgency scan order for delivery_state (mirrors
 * `DELIVERY_STATES` in streets/incoming/delivery-state — do NOT import that
 * module here; it pulls server SQL into the client bundle).
 */
const DELIVERY_STATE_ORDER = [
  'RECEIVED',
  'DELIVERED_UNOPENED',
  'DELIVERED_NOT_UNBOXED',
  'ARRIVING_TODAY',
  'STALLED',
  'TRACKING_UNAVAILABLE',
  'IN_TRANSIT',
  'AWAITING_TRACKING',
  'CARRIER_MISMATCH',
  'PENDING_CARRIER',
  'UNKNOWN',
  'WRONG_DESTINATION',
] as const;

const DELIVERY_STATE_RANK = new Map<string, number>(
  DELIVERY_STATE_ORDER.map((s, i) => [s, i]),
);

const CONFIDENCE_RANK: Record<string, number> = {
  seller_reported: 0,
  carrier_confirmed: 1,
};

function productTitle(row: ReceivingLineRow): string {
  return (
    row.catalog_product_title ||
    row.zoho_item_title ||
    row.item_name ||
    row.zoho_item_id ||
    ''
  ).trim();
}

function dateTime(row: ReceivingLineRow): number {
  const src = incomingRowDateSource(row);
  return src ? new Date(src).getTime() : Number.POSITIVE_INFINITY;
}

function ageValue(row: ReceivingLineRow): number {
  const src = incomingRowDateSource(row);
  // Days past expected (null when no date) — desc puts overdue first.
  const days = getDaysLateNullable(src);
  return days ?? -1;
}

function qtyValue(row: ReceivingLineRow): number {
  return Number(row.quantity_expected ?? row.quantity_received ?? 0) || 0;
}

function conditionRank(row: ReceivingLineRow): number {
  const grade = resolveConditionGrade(row.condition_grade);
  return CONDITION_RANK.get(grade) ?? CONDITION_GRADES.length;
}

function platformValue(row: ReceivingLineRow): string {
  return (row.source_platform || row.inbound_source_type || '').trim().toLowerCase();
}

function orderValue(row: ReceivingLineRow): string {
  return (
    row.zoho_purchaseorder_number ||
    row.zoho_purchaseorder_id ||
    row.source_order_id ||
    ''
  ).trim();
}

function trackingValue(row: ReceivingLineRow): string {
  return (displayTrackingNumber(row) || row.tracking_number || '').trim();
}

function statusRank(row: ReceivingLineRow): number {
  const state = (row.delivery_state || '').trim().toUpperCase();
  return DELIVERY_STATE_RANK.get(state) ?? DELIVERY_STATE_ORDER.length;
}

function confidenceRank(row: ReceivingLineRow): number {
  const c = (row.tracking_confidence || '').trim();
  return CONFIDENCE_RANK[c] ?? 2;
}

/**
 * Compare two Incoming rows for a column sort. Negative ⇒ `a` before `b`
 * under the given direction (ASC: smaller first).
 */
export function compareIncomingGridRows(
  a: ReceivingLineRow,
  b: ReceivingLineRow,
  column: IncomingGridColumnKey,
  dir: GridSortDir,
): number {
  const sign = dir === 'asc' ? 1 : -1;
  let primary = 0;

  // The header may speak in COMPOUND track keys (`item`, `fulfillment`,
  // `state`) or in this family's flat words. Normalize once — without it the
  // compound mount fell through to `default` and every row compared equal.
  const fact = incomingSortFactFor(column) ?? column;

  switch (fact) {
    case 'title':
      primary = productTitle(a).localeCompare(productTitle(b), undefined, { sensitivity: 'base' });
      break;
    case 'date':
      primary = dateTime(a) - dateTime(b);
      break;
    case 'age':
      primary = ageValue(a) - ageValue(b);
      break;
    case 'qty':
      primary = qtyValue(a) - qtyValue(b);
      break;
    case 'condition':
      primary = conditionRank(a) - conditionRank(b);
      break;
    case 'status': {
      primary = statusRank(a) - statusRank(b);
      if (primary === 0) primary = confidenceRank(a) - confidenceRank(b);
      break;
    }
    case 'platform':
      primary = platformValue(a).localeCompare(platformValue(b), undefined, { sensitivity: 'base' });
      break;
    case 'order':
      primary = orderValue(a).localeCompare(orderValue(b), undefined, {
        numeric: true,
        sensitivity: 'base',
      });
      break;
    case 'tracking':
      primary = trackingValue(a).localeCompare(trackingValue(b), undefined, {
        numeric: true,
        sensitivity: 'base',
      });
      break;
    case 'select':
    default:
      primary = 0;
      break;
  }

  if (primary !== 0) return sign * primary;
  return a.id - b.id;
}
