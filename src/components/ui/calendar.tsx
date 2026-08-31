'use client';

import { DayPicker, type DayPickerProps } from 'react-day-picker';
import { ChevronLeft, ChevronRight } from '@/components/Icons';
import { cn } from '@/utils/_cn';

/**
 * Tailwind-styled wrapper around react-day-picker (v10) — the single calendar
 * primitive for the app, in every selection mode. For range picking, reach for
 * {@link CalendarRangeSelect} instead; it layers the range track on top of this.
 *
 * Consumers should mount this inside a Popover, Dialog or Sheet — it does not
 * own its own visibility.
 *
 * ## Why `react-day-picker/style.css` is deliberately NOT imported
 *
 * The library's stylesheet targets its own `rdp-*` classes. Because the
 * `classNames` map below names EVERY key in react-day-picker's `UI` enum, no
 * `rdp-*` class is ever emitted and the stylesheet becomes dead weight — with
 * teeth: while it was imported, the keys this component forgot to override
 * (`root`, `weeks`, `chevron`) kept their `rdp-*` class and silently inherited
 * library styling. `.rdp-chevron { fill: var(--rdp-accent-color) }` is the one
 * that showed: it filled the nav chevron's stroked path into a solid blue
 * triangle the size of the whole caption row.
 *
 * Two things the dropped stylesheet used to provide are therefore inlined
 * below and must stay: `relative` on `root` (the nav bar is absolutely
 * positioned against it) and explicit `text-center` on the weekday and day
 * cells (nothing else centres a bare `<th>`/`<td>`).
 *
 * Adding a key here is safe; REMOVING one re-opens the leak.
 */
export type CalendarProps = DayPickerProps & { className?: string };

export function Calendar({ className, classNames, components, ...props }: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays
      // `w-fit` keeps the root shrink-wrapped to the month grid. As a plain
      // block it stretched to whatever the popover was wide, and since `nav`
      // is `absolute inset-x-0` against this element, the chevrons drifted out
      // to the popover's edges while the grid stayed left-aligned — the
      // caption then read as off-centre. Shrink-wrapping re-anchors the nav to
      // the grid and lets the popover size itself from the calendar.
      className={cn('relative w-fit p-3', className)}
      classNames={{
        // ── shell ────────────────────────────────────────────────────────
        root: '',
        months: 'flex flex-col sm:flex-row gap-4',
        month: 'space-y-3',
        month_caption: 'flex h-7 items-center justify-center',
        caption_label: 'text-sm font-semibold text-text-default',

        // ── navigation ───────────────────────────────────────────────────
        // Positioned to land ON the caption row and ON the outer day columns —
        // do not simplify to `inset-x-0 top-0`, which is what made the chevrons
        // sit 12px above the month title and 16px outside the grid.
        //   top-3   = the root's own p-3, so this 28px bar shares the caption
        //             row's box (top 12 → centre 26) instead of starting at 0.
        //   inset-x-4 = p-3 (12px) + half a day cell's spare width
        //             ((36 − 28) / 2 = 4px), putting each 28px chevron's centre
        //             at 30px / −30px — dead centre over the SU and SA columns.
        nav: 'absolute inset-x-4 top-3 flex h-7 items-center justify-between',
        button_previous:
          'inline-flex h-7 w-7 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-surface-sunken hover:text-text-default disabled:pointer-events-none disabled:opacity-30',
        button_next:
          'inline-flex h-7 w-7 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-surface-sunken hover:text-text-default disabled:pointer-events-none disabled:opacity-30',
        chevron: 'h-4 w-4',

        // ── grid ─────────────────────────────────────────────────────────
        month_grid: 'w-full border-collapse',
        weekdays: 'flex',
        weekday:
          'w-9 text-center text-role-eyebrow font-normal uppercase tracking-wider text-text-faint',
        weeks: '',
        week: 'mt-1 flex w-full',
        week_number: 'w-9 text-center text-role-eyebrow text-text-faint',
        week_number_header: 'w-9',

        // ── days ─────────────────────────────────────────────────────────
        // `group/day` backs the focus ring: v10 puts `data-focused` on this
        // cell, never on the button that has to render the ring.
        day: 'group/day relative h-9 w-9 p-0 text-center text-sm focus-within:relative focus-within:z-20',
        // Hover text is a THEMED token, not `text-blue-700`: the dark-scheme
        // remap in styles/globals.css only rewrites the BARE `.text-blue-700`
        // class, never the `hover:` variant's `.hover\:text-blue-700:hover`,
        // so a raw blue here goes dark-on-dark. Same trap as `range_middle`
        // in CalendarRangeSelect.
        day_button:
          'inline-flex h-9 w-9 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-blue-500/10 hover:text-text-default group-data-[focused=true]/day:ring-2 group-data-[focused=true]/day:ring-blue-500/20',

        // v10 marks the CELL, so the fill has to reach the button from here —
        // an `aria-selected:` variant on `day_button` matches nothing.
        selected: '[&>button]:bg-blue-500 [&>button]:text-white [&>button]:hover:bg-blue-600',

        // A ring rather than a fill, so today never fights a range track for
        // the cell background; it steps aside once it is selected.
        today:
          '[&>button]:font-semibold [&>button]:ring-1 [&>button]:ring-inset [&>button]:ring-blue-300 [&[data-selected=true]>button]:ring-0',

        outside: 'opacity-40',
        disabled: 'pointer-events-none opacity-30',
        hidden: 'invisible',

        // ── dropdown navigation (unused today; named so it cannot leak) ───
        dropdowns: 'flex items-center gap-2',
        dropdown: 'absolute inset-0 z-2 cursor-pointer opacity-0',
        dropdown_root: 'relative inline-flex items-center rounded-md',
        months_dropdown: '',
        years_dropdown: '',

        footer: 'pt-2 text-role-caption text-text-muted',

        ...classNames,
      }}
      components={{
        // `className` and `size` are pulled OUT of the spread on purpose: the
        // Icons chevrons accept only `className`, so spreading react-day-picker's
        // own `className` after ours would replace the size instead of adding
        // to it — which is exactly how the blue-triangle bug happened.
        Chevron: ({ orientation, className: chevronClass, size: _size, ...rest }) => {
          const Icon = orientation === 'left' ? ChevronLeft : ChevronRight;
          return <Icon className={cn('h-4 w-4', chevronClass)} {...rest} />;
        },
        ...components,
      }}
      {...props}
    />
  );
}
