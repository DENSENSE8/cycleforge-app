'use client';

/** Pure derivation of the receiving-lines feed: */

import { useMemo } from 'react';
import { groupRowsBy } from '@/lib/group-rows';
import { toPSTDateKey } from '@/utils/date';
import type { WeekRange } from '@/utils/date';
import type { ReceivingModeDescriptor } from '@/lib/receiving/receiving-modes';
import {
  poGroupAnchorMs,
  receivingRowActivityMs,
  receivingRowActivityTs,
  type ReceivingActivityAxis,
  type ReceivingPoGroup,
} from '@/components/station/receiving-lines-table-helpers';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';

interface UseReceivingGroupingArgs {
  localRows: ReceivingLineRow[];
  mode: ReceivingModeDescriptor;
  historyAxis: ReceivingActivityAxis;
  weekRange: WeekRange;
  skipWeekFilter: boolean;
}

interface ReceivingGrouping {
  groupedRecords: Record<string, ReceivingPoGroup[]>;
  filteredGroupedRecords: Record<string, ReceivingPoGroup[]>;
  orderedVisibleRows: ReceivingLineRow[];
  getWeekCount: () => number;
}

export function useReceivingGrouping({
  localRows,
  mode,
  historyAxis,
  weekRange,
  skipWeekFilter,
}: UseReceivingGroupingArgs): ReceivingGrouping {
  // Collapse duplicate "Unfound receiving" cartons.
  const dedupedRows = useMemo(() => {
    const seenByTracking = new Map<string, number>(); // tracking → index in out
    const out: ReceivingLineRow[] = [];
    for (const row of localRows) {
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
      } else if (
        receivingRowActivityMs(row, historyAxis) > receivingRowActivityMs(out[existingIdx], historyAxis)
      ) {
        out[existingIdx] = row;
      }
    }
    return out;
  }, [localRows, historyAxis]);

  // Collapse the flat lines into one row per purchase order, GLOBALLY — a PO's lines merge into a single group even when scanned across…
  const poGroups = useMemo<ReceivingPoGroup[]>(() => {
    const grouped = groupRowsBy(dedupedRows, (row) => {
      const po = (
        row.zoho_purchaseorder_number ||
        row.zoho_purchaseorder_id ||
        ''
      ).trim();
      if (po) return `po:${po}`;
      // eBay (and other marketplace) buyer purchases have no Zoho PO — group by
      // their external order id so a multi-line purchase collapses into ONE
      // Incoming row (operators think in orders/boxes), same as a Zoho PO.
      const src = (row.inbound_source_type || '').trim().toLowerCase();
      const orderId = (row.source_order_id || '').trim();
      if (src && orderId) return `src:${src}:${orderId}`;
      return `line:${row.id}`;
    });
    return grouped.map(({ key, rows }) => {
      let anchorTs: string | null = null;
      if (mode.groupAxis === 'po_date') {
        anchorTs = rows.find((r) => r.po_date)?.po_date ?? rows[0]?.created_at ?? null;
      } else {
        // History/Receive band + order groups by the active lifecycle axis.
        // Incoming uses po_date above.
        let bestMs = -1;
        for (const r of rows) {
          const ms = receivingRowActivityMs(r, historyAxis);
          if (ms > bestMs) {
            bestMs = ms;
            anchorTs = receivingRowActivityTs(r, historyAxis);
          }
        }
      }
      return { key, rows, anchorTs };
    });
  }, [dedupedRows, mode.groupAxis, historyAxis]);

  const groupedRecords = useMemo(() => {
    const groups: Record<string, ReceivingPoGroup[]> = {};
    for (const group of poGroups) {
      let date = 'Unknown';
      try {
        date = toPSTDateKey(group.anchorTs) || 'Unknown';
      } catch {
        date = 'Unknown';
      }
      if (!groups[date]) groups[date] = [];
      groups[date].push(group);
    }
    return groups;
  }, [poGroups]);

  const filteredGroupedRecords = useMemo(() => {
    if (skipWeekFilter) return groupedRecords;
    return Object.fromEntries(
      Object.entries(groupedRecords).filter(
        ([date]) => date >= weekRange.startStr && date <= weekRange.endStr,
      ),
    );
  }, [groupedRecords, weekRange.startStr, weekRange.endStr, skipWeekFilter]);

  /** Flat list of LINES in render order — newest day → newest group → its lines.
   *  Drives selection broadcast, arrow-nav and scroll-into-view. Incoming defers
   *  to the API's server-side ORDER BY; other modes re-sort groups by activity. */
  const orderedVisibleRows = useMemo(
    () =>
      Object.entries(filteredGroupedRecords)
        .sort((a, b) => b[0].localeCompare(a[0]))
        .flatMap(([, dayGroups]) => {
          const sorted = mode.serverSorted
            ? dayGroups
            : [...dayGroups].sort((a, b) => poGroupAnchorMs(b) - poGroupAnchorMs(a));
          return sorted.flatMap((group) => group.rows);
        }),
    [filteredGroupedRecords, mode.serverSorted],
  );

  const getWeekCount = () =>
    Object.values(filteredGroupedRecords).reduce((sum, rows) => sum + rows.length, 0);

  return { groupedRecords, filteredGroupedRecords, orderedVisibleRows, getWeekCount };
}
