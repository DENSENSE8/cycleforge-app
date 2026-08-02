/**
 * Pure row comparators for Unbox / History / Testing LedgerGrid column sorts.
 * Ties fall through to id for stability.
 */

import { CONDITION_GRADES, resolveConditionGrade } from '@/lib/conditions';
import { displayTrackingNumber } from '@/lib/receiving/fulfillment-mode';
import {
  type ReceivingGridColumnKey,
} from '@/lib/receiving/receiving-grid-layout';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';
import {
  resolveReceivingRowStageStamp,
  type ReceivingActivityAxis,
} from '@/components/station/receiving-lines-table-helpers';
import { resolveReceivingLineSerialsCsv } from '@/components/station/receiving-line-serials';
import type { GridSortDir } from '@/design-system/components/grid/grid-sort-dir';

const CONDITION_RANK = new Map<string, number>(
  CONDITION_GRADES.map((g, i) => [g, i]),
);

function productTitle(row: ReceivingLineRow): string {
  return (
    row.catalog_product_title ||
    row.zoho_item_title ||
    row.item_name ||
    row.zoho_item_id ||
    ''
  ).trim();
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

function locationValue(row: ReceivingLineRow): string {
  return (row.staging_location_label || '').trim();
}

function stageMs(row: ReceivingLineRow, axis: ReceivingActivityAxis): number {
  const stamp = resolveReceivingRowStageStamp(row, axis);
  if (!stamp?.instant) return Number.POSITIVE_INFINITY;
  const t = new Date(stamp.instant).getTime();
  return Number.isFinite(t) ? t : Number.POSITIVE_INFINITY;
}

function serialValue(row: ReceivingLineRow): string {
  return resolveReceivingLineSerialsCsv(row);
}

/**
 * Compare two receiving-line rows for a column sort. Negative ⇒ `a` before `b`
 * under the given direction (ASC: smaller first).
 */
export function compareReceivingGridRows(
  a: ReceivingLineRow,
  b: ReceivingLineRow,
  column: ReceivingGridColumnKey,
  dir: GridSortDir,
  activityAxis: ReceivingActivityAxis = 'unboxed',
): number {
  const sign = dir === 'asc' ? 1 : -1;
  let primary = 0;

  switch (column) {
    case 'title':
      primary = productTitle(a).localeCompare(productTitle(b), undefined, { sensitivity: 'base' });
      break;
    case 'date':
      primary = stageMs(a, activityAxis) - stageMs(b, activityAxis);
      break;
    case 'qty':
      primary = qtyValue(a) - qtyValue(b);
      break;
    case 'condition':
      primary = conditionRank(a) - conditionRank(b);
      break;
    case 'stage':
      primary = stageMs(a, activityAxis) - stageMs(b, activityAxis);
      break;
    case 'location':
      primary = locationValue(a).localeCompare(locationValue(b), undefined, {
        numeric: true,
        sensitivity: 'base',
      });
      break;
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
    case 'serial':
      primary = serialValue(a).localeCompare(serialValue(b), undefined, {
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
