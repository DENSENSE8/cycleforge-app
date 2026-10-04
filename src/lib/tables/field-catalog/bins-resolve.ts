/** Bins slot resolvers — row + fieldId → the resolved fact a slot cell paints. */

import type { SlotValue } from '@/lib/tables/field-catalog/slot-value';
import type { BinsOverviewRow } from '@/hooks/useBinsOverview';
import { formatDateKeyShort } from '@/utils/date';

function str(value: string | null | undefined): string | null {
  const s = String(value ?? '').trim();
  return s || null;
}

/** Room, with its zone letter and grid coordinates when the bin has them. */
function locationText(row: BinsOverviewRow): string | null {
  const room = str(row.room);
  const zone = str(row.zone_letter);
  const head = room ? (zone ? `${room} [${zone}]` : room) : null;
  const coords =
    row.row_label != null && row.col_label != null
      ? `${row.row_label} · ${row.col_label}`
      : str(row.name);
  if (head && coords) return `${head} · ${coords}`;
  return head ?? coords;
}

/** The percentage the bar draws — null when the bin has no capacity to fill. */
function fillText(row: BinsOverviewRow): string | null {
  return row.fill_pct == null ? null : `${Math.round(row.fill_pct)}%`;
}

/** The flags that are TRUE, in the chip row's order. Nothing set reads null. */
function statusText(row: BinsOverviewRow): string | null {
  const flags: string[] = [];
  if (row.is_empty) flags.push('Empty');
  if (row.has_low_stock) flags.push('Low');
  if (row.is_over_capacity) flags.push('Over');
  if (row.is_stale) flags.push('Stale');
  return flags.length ? flags.join(' · ') : null;
}

/**
 * Resolve one bound field for one row. Unknown field id → null (the cell
 * dashes); the layout resolver has already dropped stale bindings.
 */
export function resolveBinsSlotValue(
  row: BinsOverviewRow,
  fieldId: string,
): SlotValue | null {
  switch (fieldId) {
    case 'bins.barcode':
      return { kind: 'value', text: str(row.barcode) };
    case 'bins.location':
      return { kind: 'value', text: locationText(row) };
    case 'bins.sku_count':
      return { kind: 'value', text: String(row.sku_count) };
    case 'bins.total_qty':
      return { kind: 'value', text: String(row.total_qty) };
    case 'bins.fill':
      return { kind: 'value', text: fillText(row) };
    case 'bins.last_counted': {
      const raw = str(row.last_counted);
      return { kind: 'value', text: raw ? formatDateKeyShort(raw.slice(0, 10)) : null };
    }
    case 'bins.status':
      return { kind: 'value', text: statusText(row) };
    default:
      return null;
  }
}
