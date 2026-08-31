'use client';

import { useMemo } from 'react';
import type { ShippedTableFilters } from './useShippedTableFilters';

interface Range {
  startStr: string;
  endStr: string;
}

interface ShippedPeriodControls {
  /** Active explicit (non-week) range, or null when on a week. */
  activeRange: Range | null;
  /** Apply an arbitrary calendar range. */
  onSelectCustomRange: (range: Range) => void;
  /** Reset to the current week (only when off it). */
  onClear?: () => void;
}

/**
 * Maps the shipped table's URL period state onto the {@link DateRangePickerPill}
 * vocabulary: a custom-range handler, the active explicit range, and a reset.
 * Every handler is a single atomic URL write via the filters hook's
 * `setPeriod*` setters.
 */
export function useShippedPeriodControls(filters: ShippedTableFilters): ShippedPeriodControls {
  const { hasDateRange, dateFrom, dateTo, weekOffset, setPeriodRange, clearPeriod } = filters;

  return useMemo(() => {
    const activeRange: Range | null = hasDateRange ? { startStr: dateFrom, endStr: dateTo } : null;

    return {
      activeRange,
      onSelectCustomRange: (range: Range) => setPeriodRange(range.startStr, range.endStr),
      onClear: activeRange || weekOffset > 0 ? () => clearPeriod() : undefined,
    };
  }, [hasDateRange, dateFrom, dateTo, weekOffset, setPeriodRange, clearPeriod]);
}
