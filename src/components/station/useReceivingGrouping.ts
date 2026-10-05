'use client';

/** Pure derivation of the receiving-lines feed (`receiving-grouping.ts`), memoized step by step for the table. */

import { useMemo } from 'react';
import type { WeekRange } from '@/utils/date';
import type { ReceivingModeDescriptor } from '@/lib/receiving/receiving-modes';
import type { ReceivingPoGroup } from '@/components/station/receiving-lines-table-helpers';
import {
  dedupeUnfoundPlaceholders,
  groupReceivingPoRows,
  orderedReceivingRows,
  receivingDaysInWindow,
  receivingGroupsByDay,
} from '@/components/station/receiving-grouping';
import type { ReceivingActivityAxis } from '@/lib/receiving/receiving-stage-stamp';
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
  const dedupedRows = useMemo(() => dedupeUnfoundPlaceholders(localRows, historyAxis), [localRows, historyAxis]);

  const poGroups = useMemo(
    () => groupReceivingPoRows(dedupedRows, mode.groupAxis, historyAxis),
    [dedupedRows, mode.groupAxis, historyAxis],
  );

  const groupedRecords = useMemo(() => receivingGroupsByDay(poGroups), [poGroups]);

  const filteredGroupedRecords = useMemo(
    () => receivingDaysInWindow(groupedRecords, { startStr: weekRange.startStr, endStr: weekRange.endStr }, skipWeekFilter),
    [groupedRecords, weekRange.startStr, weekRange.endStr, skipWeekFilter],
  );

  const orderedVisibleRows = useMemo(
    () => orderedReceivingRows(filteredGroupedRecords, mode.serverSorted),
    [filteredGroupedRecords, mode.serverSorted],
  );

  const getWeekCount = () =>
    Object.values(filteredGroupedRecords).reduce((sum, rows) => sum + rows.length, 0);

  return { groupedRecords, filteredGroupedRecords, orderedVisibleRows, getWeekCount };
}
