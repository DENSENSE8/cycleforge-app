/**
 * Pure row comparators for the repair queue LedgerGrid column sorts (flat list).
 * Ties fall through to id for a stable order. Every column sorts by exactly the
 * value its cell shows (via the shared field-source helpers).
 */

import type { RSRecord } from '@/lib/neon/repair-service-queries';
import {
  repairCreatedAtSource,
  repairCustomerName,
  repairCustomerPhone,
  repairOrderValue,
  repairPriceSortValue,
  repairTicketValue,
  type RepairGridColumnKey,
  type RepairGridSortDir,
} from '@/lib/repair/repair-grid-layout';

function titleValue(repair: RSRecord): string {
  return String(repair.product_title || '').trim();
}

function createdTime(repair: RSRecord): number {
  const src = repairCreatedAtSource(repair);
  return src ? new Date(src).getTime() : 0;
}

/**
 * Compare two repair rows for a column sort. Negative ⇒ `a` before `b` under
 * the given direction (ASC: smaller first). Empty identifier values (walk-in
 * order, missing ticket) always sort last in BOTH directions.
 */
export function compareRepairGridRows(
  a: RSRecord,
  b: RSRecord,
  column: RepairGridColumnKey,
  dir: RepairGridSortDir,
): number {
  const sign = dir === 'asc' ? 1 : -1;
  let primary = 0;

  switch (column) {
    case 'title':
      primary = titleValue(a).localeCompare(titleValue(b), undefined, { sensitivity: 'base' });
      break;
    case 'date':
      primary = createdTime(a) - createdTime(b);
      break;
    case 'customer':
      primary = repairCustomerName(a).localeCompare(repairCustomerName(b), undefined, {
        sensitivity: 'base',
      });
      break;
    case 'phone':
      primary = repairCustomerPhone(a).localeCompare(repairCustomerPhone(b), undefined, {
        numeric: true,
        sensitivity: 'base',
      });
      break;
    case 'price':
      primary = repairPriceSortValue(a) - repairPriceSortValue(b);
      break;
    case 'order': {
      const oa = repairOrderValue(a);
      const ob = repairOrderValue(b);
      // Walk-in (no order) always sorts last, regardless of direction.
      if (!oa && !ob) primary = 0;
      else if (!oa) return 1;
      else if (!ob) return -1;
      else primary = oa.localeCompare(ob, undefined, { numeric: true, sensitivity: 'base' });
      break;
    }
    case 'ticket': {
      const ta = repairTicketValue(a);
      const tb = repairTicketValue(b);
      if (!ta && !tb) primary = 0;
      else if (!ta) return 1;
      else if (!tb) return -1;
      else primary = ta.localeCompare(tb, undefined, { numeric: true, sensitivity: 'base' });
      break;
    }
    case 'select':
    default:
      primary = 0;
      break;
  }

  if (primary !== 0) return sign * primary;
  return a.id - b.id;
}
