/**
 * Pure row comparators for Unbox / History / Testing LedgerGrid column sorts.
 * Ties fall through to id for stability.
 */

import { CONDITION_GRADES, resolveConditionGrade } from '@/lib/conditions';
import { displayTrackingNumber } from '@/lib/receiving/fulfillment-mode';
import {
  type ReceivingGridColumnKey,
} from '@/lib/receiving/receiving-grid-layout';
import {
  isCustomFieldColumnKey,
  parseCustomFieldDefKey,
} from '@/lib/tables/custom-field-keys';
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

function priceValue(row: ReceivingLineRow): number {
  return Number(row.unit_price) || 0;
}

function conditionRank(row: ReceivingLineRow): number {
  const grade = resolveConditionGrade(row.condition_grade);
  return CONDITION_RANK.get(grade) ?? CONDITION_GRADES.length;
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

type CustomFieldValue = string | number | boolean | null | undefined;

function customFieldValue(row: ReceivingLineRow, defKey: string): CustomFieldValue {
  return row.customFields?.[defKey];
}

function isBlankCustomValue(value: CustomFieldValue): boolean {
  return value == null || value === '';
}

/**
 * Compare two org custom-field values by their RUNTIME type.
 *
 * `hydrateCustomFieldMaps` already emits each value typed per its def —
 * `to_jsonb(value_number)` → number, `to_jsonb(value_date)` → `YYYY-MM-DD`,
 * boolean → boolean, everything else → text. So this reads the value's own
 * type and never needs the def loaded, which is what keeps the comparator pure
 * and synchronous (it runs inside a `useMemo` on every sorted render).
 *
 * That typing is exactly what the TYPED value columns buy: had custom fields
 * been stored as one JSON blob, a number would compare lexically and `10`
 * would sort between `1` and `2` — sortability down a column being the entire
 * point of a column.
 *
 * Dates need no `Date` parse: Postgres emits zero-padded ISO `YYYY-MM-DD`, so
 * string collation already orders them correctly.
 */
function compareCustomFieldValues(a: CustomFieldValue, b: CustomFieldValue): number {
  // Numbers MUST take this branch, never the string fallback below: `numeric`
  // collation treats `.` as a separator, so "2.5" vs "2.25" compares 5 against
  // 25 and orders them backwards. Pinned by the decimal test.
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (typeof a === 'boolean' && typeof b === 'boolean') return Number(a) - Number(b);
  return String(a).localeCompare(String(b), undefined, {
    numeric: true,
    sensitivity: 'base',
  });
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

  // Org custom columns are merged into the model at RUNTIME, so they cannot be
  // a `switch` case — they are matched by key shape and handled first.
  if (isCustomFieldColumnKey(column)) {
    const defKey = parseCustomFieldDefKey(column);
    const aValue = defKey ? customFieldValue(a, defKey) : undefined;
    const bValue = defKey ? customFieldValue(b, defKey) : undefined;
    const aBlank = isBlankCustomValue(aValue);
    const bBlank = isBlankCustomValue(bValue);

    // Blanks sort LAST in BOTH directions, so this comparison deliberately
    // escapes `sign` (spreadsheet convention — Sheets and Airtable both do it).
    // It differs on purpose from `date`'s `+Infinity` above, which floats
    // undated rows to the TOP under `desc`: that is tolerable for a column
    // every row fills, and wrong for a custom column that is empty on most rows
    // until an operator backfills it — otherwise the first click opens on a
    // screen of `—`.
    if (aBlank || bBlank) {
      if (aBlank && bBlank) return a.id - b.id;
      return aBlank ? 1 : -1;
    }

    const customPrimary = compareCustomFieldValues(aValue, bValue);
    return customPrimary !== 0 ? sign * customPrimary : a.id - b.id;
  }

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
    case 'price':
      primary = priceValue(a) - priceValue(b);
      break;
    case 'condition':
      primary = conditionRank(a) - conditionRank(b);
      break;
    case 'location':
      primary = locationValue(a).localeCompare(locationValue(b), undefined, {
        numeric: true,
        sensitivity: 'base',
      });
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
