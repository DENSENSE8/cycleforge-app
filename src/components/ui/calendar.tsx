'use client';

import { DayPicker, type DayPickerProps } from 'react-day-picker';
import { ChevronLeft, ChevronRight } from '@/components/Icons';
import { cn } from '@/utils/_cn';

/** Tailwind-styled wrapper around react-day-picker (v10) — the single calendar primitive for the app, in every selection mode. */
type CalendarProps = DayPickerProps & { className?: string };

export function Calendar({ className, classNames, components, ...props }: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays
      // `w-fit` keeps the root shrink-wrapped to the month grid.
      className={cn('relative w-fit p-3', className)}
      classNames={{
        // ── shell ────────────────────────────────────────────────────────
        root: '',
        months: 'flex flex-col sm:flex-row gap-4',
        month: 'space-y-3',
        month_caption: 'flex h-7 items-center justify-center',
        caption_label: 'text-sm font-semibold text-text-default',

        // ── navigation ─────────────────────────────────────────────────── Positioned to land ON the caption row and ON the outer day columns —…
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
        // Hover text is a THEMED token, not `text-blue-700`:
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
        // `className` and `size` are pulled OUT of the spread on purpose:
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
