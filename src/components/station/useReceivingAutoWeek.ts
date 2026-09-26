'use client';

/** History auto-week jump: */

import { useEffect, useRef } from 'react';
import { diffDaysDateKey, type WeekRange } from '@/utils/date';
import type { ReceivingPoGroup } from '@/components/station/receiving-lines-table-helpers';

interface UseReceivingAutoWeekArgs {
  isHistoryMode: boolean;
  skipWeekFilter: boolean;
  weekOffset: number;
  setWeekOffset: (offset: number) => void;
  filteredGroupedRecords: Record<string, ReceivingPoGroup[]>;
  groupedRecords: Record<string, ReceivingPoGroup[]>;
  weekRange: WeekRange;
}

export function useReceivingAutoWeek({
  isHistoryMode,
  skipWeekFilter,
  weekOffset,
  setWeekOffset,
  filteredGroupedRecords,
  groupedRecords,
  weekRange,
}: UseReceivingAutoWeekArgs): void {
  const autoWeekAppliedRef = useRef(false);

  useEffect(() => {
    if (!isHistoryMode || skipWeekFilter) return;
    if (autoWeekAppliedRef.current || weekOffset !== 0) return;
    // Current week already has rows → nothing to do; lock the one-shot.
    if (Object.keys(filteredGroupedRecords).length > 0) {
      autoWeekAppliedRef.current = true;
      return;
    }
    const latest = Object.keys(groupedRecords)
      .filter((d) => d !== 'Unknown')
      .sort((a, b) => b.localeCompare(a))[0];
    if (!latest) return; // still loading or genuinely empty — keep waiting.
    autoWeekAppliedRef.current = true;
    // Civil-day distance only — never host-local T00:00:00 reparse.
    const diffDays = diffDaysDateKey(latest, weekRange.startStr);
    if (diffDays != null && diffDays > 0) setWeekOffset(Math.ceil(diffDays / 7));
  }, [
    isHistoryMode,
    skipWeekFilter,
    weekOffset,
    filteredGroupedRecords,
    groupedRecords,
    weekRange.startStr,
    setWeekOffset,
  ]);
}
