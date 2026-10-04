'use client';

/**
 * The Live feed's date range — always present, top-right of the desk header
 * (operator 2026-10-03: the feed always has a date filter; the board's ONE
 * page-chrome control, allowed by the `filter-controls-outside-sidebar`
 * rule), registered into the chrome's action slot. Writes `from` / `to`
 * (warehouse civil days) to the URL the board reads; once a range is set, a
 * time of day at each end (`timeFrom` / `timeTo`, HH:mm warehouse time —
 * "packed at this date and time"). Clearing the range drops the times too.
 */

import { useCallback, useMemo } from 'react';
import type { DateRange } from 'react-day-picker';
import { useSearchParams } from 'next/navigation';
import { Clock } from '@/components/Icons';
import { TimeField } from '@/components/sidebar/contextual/NavFilters';
import { useReplaceSearchParams } from '@/components/sidebar/contextual/useReplaceSearchParams';
import { DeskActionSlotRegistrar } from '@/design-system/components/DeskActionSlot';
import { DateRangePickerField } from '@/design-system/components/DateRangePickerField';
import { LIVE_FEED_PARAMS, LIVE_FEED_TIME_RE } from '@/lib/live-feed/route';
import { dateKeyToLocalDate, localDateToDateKey } from '@/utils/date';

export function LiveFeedDateRange() {
  const searchParams = useSearchParams();
  const replace = useReplaceSearchParams();
  const fromKey = searchParams?.get(LIVE_FEED_PARAMS.from) ?? null;
  const toKey = searchParams?.get(LIVE_FEED_PARAMS.to) ?? null;
  const timeFrom = searchParams?.get(LIVE_FEED_PARAMS.timeFrom) ?? '';
  const timeTo = searchParams?.get(LIVE_FEED_PARAMS.timeTo) ?? '';

  const value = useMemo<DateRange | undefined>(
    () => (fromKey ? { from: dateKeyToLocalDate(fromKey), to: dateKeyToLocalDate(toKey ?? fromKey) } : undefined),
    [fromKey, toKey],
  );
  const onChange = useCallback(
    (next: DateRange | undefined) =>
      replace((params) => {
        const from = localDateToDateKey(next?.from);
        const to = localDateToDateKey(next?.to ?? next?.from);
        if (from && to) {
          params.set(LIVE_FEED_PARAMS.from, from);
          params.set(LIVE_FEED_PARAMS.to, to);
          return;
        }
        // A time of day means nothing without its days.
        for (const param of [LIVE_FEED_PARAMS.from, LIVE_FEED_PARAMS.to, LIVE_FEED_PARAMS.timeFrom, LIVE_FEED_PARAMS.timeTo]) params.delete(param);
      }),
    [replace],
  );
  const setTime = useCallback(
    (param: string, next: string) =>
      replace((params) => {
        if (LIVE_FEED_TIME_RE.test(next)) params.set(param, next);
        else params.delete(param);
      }),
    [replace],
  );

  // Memoized: the slot re-registers whenever its node changes.
  const control = useMemo(
    () => (
      <div className="flex items-center gap-2" data-testid="live-feed-date-range">
        <DateRangePickerField variant="range" value={value} onChange={onChange} placeholder="Today" className="w-60" />
        {fromKey ? (
          <div className="flex w-56 items-center gap-1.5 text-role-micro text-text-muted">
            <Clock aria-hidden className="size-3.5 shrink-0" />
            <TimeField label="From time" value={timeFrom} onCommit={(next) => setTime(LIVE_FEED_PARAMS.timeFrom, next)} />
            <span aria-hidden>to</span>
            <TimeField label="To time" value={timeTo} onCommit={(next) => setTime(LIVE_FEED_PARAMS.timeTo, next)} />
          </div>
        ) : null}
      </div>
    ),
    [value, onChange, fromKey, timeFrom, timeTo, setTime],
  );
  return <DeskActionSlotRegistrar role="overall">{control}</DeskActionSlotRegistrar>;
}