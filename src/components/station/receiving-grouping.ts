/**
 * Pure derivation of the receiving-lines feed — the loaded rows → the rows the
 * list paints, in its order: duplicate unfound placeholders collapsed, lines
 * merged per purchase order, banded by PST day, the day window applied.
 * `useReceivingGrouping` memoizes each step for the table; the sidebar facets
 * (`src/lib/nav/facets/unbox.ts`) run the same steps over the same rows.
 */

import { groupRowsBy } from '@/lib/group-rows';
import { computeWeekRange, toPSTDateKey, type WeekRange } from '@/utils/date';
import type { ReceivingModeDescriptor } from '@/lib/receiving/receiving-modes';
import {
  poGroupAnchorMs,
  receivingRowActivityMs,
  receivingRowActivityTs,
  type ReceivingPoGroup,
} from '@/components/station/receiving-lines-table-helpers';
import type { ReceivingActivityAxis } from '@/lib/receiving/receiving-stage-stamp';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';

/**
 * The client day slice: an explicit activity window (`?dateFrom=`/`?dateTo=`,
 * either end open) when set, else the week `weekOffset` names.
 */
export function receivingDayWindow(
  weekOffset: number,
  dateRange: { from: string; to: string } | null,
): WeekRange {
  const week = computeWeekRange(weekOffset);
  return dateRange
    ? { ...week, startStr: dateRange.from || '0000-01-01', endStr: dateRange.to || '9999-12-31' }
    : week;
}

/** Collapse duplicate "Unfound receiving" cartons — one placeholder per tracking, the latest activity wins. */
export function dedupeUnfoundPlaceholders(rows: readonly ReceivingLineRow[], axis: ReceivingActivityAxis): ReceivingLineRow[] {
  const seenByTracking = new Map<string, number>(); // tracking → index in out
  const out: ReceivingLineRow[] = [];
  for (const row of rows) {
    const isUnfoundPlaceholder = row.id < 0;
    const trackingKey = (row.tracking_number || '').trim().toLowerCase();
    if (!isUnfoundPlaceholder || !trackingKey) {
      out.push(row);
      continue;
    }
    const existingIdx = seenByTracking.get(trackingKey);
    if (existingIdx == null) {
      seenByTracking.set(trackingKey, out.length);
      out.push(row);
    } else if (receivingRowActivityMs(row, axis) > receivingRowActivityMs(out[existingIdx]!, axis)) {
      out[existingIdx] = row;
    }
  }
  return out;
}

/** The carton a line belongs to (`receiving_id`); a carton-less line is its own. */
export function receivingCartonKey(row: ReceivingLineRow): string {
  return row.receiving_id != null ? `carton:${row.receiving_id}` : `line:${row.id}`;
}

/** Collapse the flat lines into one row per purchase order, GLOBALLY — a PO's lines merge into a single group even when scanned across… */
export function groupReceivingPoRows(
  rows: ReceivingLineRow[],
  groupAxis: ReceivingModeDescriptor['groupAxis'],
  axis: ReceivingActivityAxis,
): ReceivingPoGroup[] {
  const grouped = groupRowsBy(rows, (row) => {
    const po = (row.zoho_purchaseorder_number || row.zoho_purchaseorder_id || '').trim();
    if (po) return `po:${po}`;
    // eBay (and other marketplace) buyer purchases have no Zoho PO — group by
    // their external order id so a multi-line purchase collapses into ONE
    // Incoming row (operators think in orders/boxes), same as a Zoho PO.
    const src = (row.inbound_source_type || '').trim().toLowerCase();
    const orderId = (row.source_order_id || '').trim();
    if (src && orderId) return `src:${src}:${orderId}`;
    return `line:${row.id}`;
  });
  return grouped.map(({ key, rows: groupRows }) => {
    let anchorTs: string | null = null;
    if (groupAxis === 'po_date') {
      anchorTs = groupRows.find((r) => r.po_date)?.po_date ?? groupRows[0]?.created_at ?? null;
    } else {
      // History/Receive band + order groups by the active lifecycle axis.
      // Incoming uses po_date above.
      let bestMs = -1;
      for (const r of groupRows) {
        const ms = receivingRowActivityMs(r, axis);
        if (ms > bestMs) {
          bestMs = ms;
          anchorTs = receivingRowActivityTs(r, axis);
        }
      }
    }
    return { key, rows: groupRows, anchorTs };
  });
}

/** PO groups by their anchor's PST day key (`Unknown` when undated). */
export function receivingGroupsByDay(groups: readonly ReceivingPoGroup[]): Record<string, ReceivingPoGroup[]> {
  const byDay: Record<string, ReceivingPoGroup[]> = {};
  for (const group of groups) {
    let date = 'Unknown';
    try {
      date = toPSTDateKey(group.anchorTs) || 'Unknown';
    } catch {
      date = 'Unknown';
    }
    (byDay[date] ??= []).push(group);
  }
  return byDay;
}

/** The days inside the window — every day when the mode skips the week filter. */
export function receivingDaysInWindow(
  byDay: Record<string, ReceivingPoGroup[]>,
  window: Pick<WeekRange, 'startStr' | 'endStr'>,
  skipWeekFilter: boolean,
): Record<string, ReceivingPoGroup[]> {
  if (skipWeekFilter) return byDay;
  return Object.fromEntries(Object.entries(byDay).filter(([date]) => date >= window.startStr && date <= window.endStr));
}

/**
 * Flat list of LINES in render order — newest day → newest group → its lines.
 * Incoming defers to the API's server-side ORDER BY; other modes re-sort
 * groups by activity.
 */
export function orderedReceivingRows(byDay: Record<string, ReceivingPoGroup[]>, serverSorted: boolean): ReceivingLineRow[] {
  return Object.entries(byDay)
    .sort((a, b) => b[0].localeCompare(a[0]))
    .flatMap(([, dayGroups]) => {
      const sorted = serverSorted ? dayGroups : [...dayGroups].sort((a, b) => poGroupAnchorMs(b) - poGroupAnchorMs(a));
      return sorted.flatMap((group) => group.rows);
    });
}

/** Every step above in one pass — the rows a receiving list paints from `rows`. */
export function receivingVisibleRows(args: {
  rows: readonly ReceivingLineRow[];
  mode: ReceivingModeDescriptor;
  historyAxis: ReceivingActivityAxis;
  window: Pick<WeekRange, 'startStr' | 'endStr'>;
  skipWeekFilter: boolean;
}): ReceivingLineRow[] {
  const groups = groupReceivingPoRows(dedupeUnfoundPlaceholders(args.rows, args.historyAxis), args.mode.groupAxis, args.historyAxis);
  return orderedReceivingRows(receivingDaysInWindow(receivingGroupsByDay(groups), args.window, args.skipWeekFilter), args.mode.serverSorted);
}
