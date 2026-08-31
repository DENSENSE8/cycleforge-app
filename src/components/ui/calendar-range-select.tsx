'use client';

import type { DateRange, PropsBase, PropsRange } from 'react-day-picker';
import { Calendar } from '@/components/ui/calendar';

/**
 * The range-select calendar: a solid blue pill on each endpoint, a flat
 * blue-tinted track through the middle, a ring on today.
 *
 * Only the range-specific keys live here — the day cell, the day button, the
 * `selected` pill and `today` all come from {@link Calendar}, so a single-date
 * picker and this one stay visually identical outside the track.
 *
 * ## Why this looks nothing like the usual shadcn range snippet
 *
 * The upstream pattern for this design targets react-day-picker **v9**, which
 * stamps `data-range-start` / `data-range-end` / `data-range-middle` onto the
 * day *button*, so it can be written as one long `data-[range-start=true]:…`
 * chain on `day_button`.
 *
 * This app is on react-day-picker **v10**, which emits only `data-day`,
 * `data-month`, `data-selected`, `data-disabled`, `data-hidden`,
 * `data-outside`, `data-focused` and `data-today` — and puts them on the day
 * *cell* (`<td>`), never the button. A `data-[range-start=true]:` chain here
 * compiles to valid CSS that matches nothing. v10 instead exposes the range
 * position through the `range_start` / `range_end` / `range_middle`
 * `classNames` keys, which land on the cell — so the endpoints are styled
 * cell-first and reach their button through `[&>button]:`.
 *
 * ## Why `range_middle` needs `!` to win
 *
 * In v10 a middle day is `selected` **and** `range_middle`; both class strings
 * are concatenated onto the same cell. Equal specificity would let stylesheet
 * order decide the winner, so `range_middle` flattens {@link Calendar}'s
 * `selected` pill with Tailwind's `!` important suffix rather than relying on
 * order.
 *
 * That pill has to stay on `selected` rather than move here, because a
 * half-picked range (`from` set, `to` still open) sets *only* `selected` — v10
 * requires both endpoints before it marks `range_start`/`range_end`.
 *
 * Fully controlled; owns no state. Mount it inside a Popover — like
 * {@link Calendar}, it does not own its own visibility.
 */
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
        // The middle number is a THEMED token, not `text-blue-700`. The
        // dark-scheme remap in styles/globals.css rewrites bare `.text-blue-700`
        // to a light blue, but it cannot reach this one: the generated selector
        // is `.[&>button]:text-blue-700! > button`, not `.text-blue-700`, and
        // the `!` would outrank the remap even if it matched. Left raw, the
        // middle days rendered dark blue on the dark track.
        range_middle:
          'rounded-none bg-blue-500/20 [&>button]:rounded-none! [&>button]:bg-transparent! [&>button]:text-text-default! [&>button]:hover:bg-blue-500/25!',
        ...classNames,
      }}
      {...props}
    />
  );
}

export default CalendarRangeSelect;
