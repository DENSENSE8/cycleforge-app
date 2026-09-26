/**
 * Pure row comparators for Unbox / History / Testing LedgerGrid column sorts.
 * Ties fall through to id for stability.
 */

import { CONDITION_GRADES, resolveConditionGrade } from '@/lib/conditions';
import { displayTrackingNumber } from '@/lib/receiving/fulfillment-mode';
import {
  RECEIVING_SORT_FACT_TYPES,
  receivingSortFactFor,
  type ReceivingGridColumnKey,
} from '@/lib/receiving/receiving-grid-layout';
import {
  isCustomFieldColumnKey,
  parseCustomFieldDefKey,
} from '@/lib/tables/custom-field-keys';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';
import {
  resolveReceivingRowStageStamp,
  type ReceivingActivityAxis,
} from '@/components/station/receiving-lines-table-helpers';
import { resolveReceivingLineSerialsCsv } from '@/components/station/receiving-line-serials';
import type { GridSortDir } from '@/design-system/components/grid/grid-sort-dir';
import { compareGridValues, type GridSortValue } from '@/design-system/components/grid';
import { resolveSkuIdentityTitle } from '@/lib/sku/sku-identity-law';

const CONDITION_RANK = new Map<string, number>(
  CONDITION_GRADES.map((g, i) => [g, i]),
);

function productTitle(row: ReceivingLineRow): string {
  // SKU IDENTITY LAW (src/lib/sku/sku-identity-law.ts): Zoho item title governs.
  return resolveSkuIdentityTitle(row);
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

/** Compare two org custom-field values by their RUNTIME type. */
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

    // Blanks sort LAST in BOTH directions, so this comparison deliberately escapes `sign` (spreadsheet convention — Sheets and Airtable both…
    if (aBlank || bBlank) {
      if (aBlank && bBlank) return a.id - b.id;
      return aBlank ? 1 : -1;
    }

    const customPrimary = compareCustomFieldValues(aValue, bValue);
    return customPrimary !== 0 ? sign * customPrimary : a.id - b.id;
  }

  // Extract, then let the ENGINE compare.
  const fact = receivingSortFactFor(column) ?? column;

  const value = (row: ReceivingLineRow): GridSortValue => {
    switch (fact) {
      case 'title':
        return productTitle(row);
      // `stageMs` already returns `+Infinity` for a missing stamp, and the
      // engine reads a non-finite number as blank — so undated rows now sort
      // LAST in both directions with no change to the extractor.
      case 'date':
        return stageMs(row, activityAxis);
      case 'qty':
        return qtyValue(row);
      case 'price':
        return priceValue(row);
      // A grade ordinal, not the label: `condition` is `type: 'tag'`, but the
      // value is numeric and the engine compares numbers as numbers.
      case 'condition':
        return conditionRank(row);
      case 'location':
        return locationValue(row);
      case 'order':
        return orderValue(row);
      case 'tracking':
        return trackingValue(row);
      case 'serial':
        return serialValue(row);
      default:
        return null;
    }
  };

  // Type off the FACT map, never a `.find()` over a column array — the flat
  // model that lookup read is deleted, and it returned `undefined` for every
  // compound track while it lived.
  const type = RECEIVING_SORT_FACT_TYPES[fact];
  const primary = compareGridValues(value(a), value(b), { type, dir });

  // `compareGridValues` already applied `dir` — re-signing here would
  // re-invert blanks and undo the ruling.
  return primary !== 0 ? primary : a.id - b.id;
}
