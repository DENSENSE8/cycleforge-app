'use client';

import type { DateRange, PropsBase, PropsRange } from 'react-day-picker';
import { Calendar } from '@/components/ui/calendar';

/** The range-select calendar: */
// `mode` is dropped from BOTH halves: PropsBase also declares it (as the wide
// `Mode`), and leaving it in would widen the literal `mode="range"` below back
// to `Mode`, which no longer discriminates DayPicker's props union.
export type CalendarRangeSelectProps = Omit<PropsBase, 'mode'> &
  Omit<PropsRange, 'mode'> & {
    className?: string;
    /** The selected range. `undefined` = nothing picked yet. */
    selected: DateRange | undefined;
    onSelect: (range: DateRange | undefined) => void;
  };

export function CalendarRangeSelect({
  selected,
  onSelect,
  classNames,
  ...props
}: CalendarRangeSelectProps) {
  return (
    <Calendar
      mode="range"
      selected={selected}
      onSelect={onSelect}
      classNames={{
        // The tinted track. Endpoints keep `selected`'s pill and only add the
        // track behind it, which shows in the cell corners the circle leaves.
        range_start: 'rounded-l-full bg-blue-500/20',
        range_end: 'rounded-r-full bg-blue-500/20',
        // The middle number is a THEMED token, not `text-blue-700`.
        range_middle:
          'rounded-none bg-blue-500/20 [&>button]:rounded-none! [&>button]:bg-transparent! [&>button]:text-text-default! [&>button]:hover:bg-blue-500/25!',
        ...classNames,
      }}
      {...props}
    />
  );
}

export default CalendarRangeSelect;
